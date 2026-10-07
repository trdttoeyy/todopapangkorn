import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
import { db } from './database.js';
import { createSession, deleteSession, getUserFromToken, hashPassword, parseCookies, sessionCookie, verifyPassword } from './auth.js';

const publicDir = join(process.cwd(), 'public');

function json(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(data);
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return getUserFromToken(cookies.session);
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) { json(res, 401, { error: 'You must be logged in.' }); return null; }
  return user;
}

export async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/api/me') {
      const user = currentUser(req);
      return json(res, 200, { user });
    }

    if (req.method === 'POST' && path === '/api/register') {
      const { username, password } = await body(req);
      if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) return json(res, 400, { error: 'Username must be 3-30 letters, numbers, or underscores.' });
      if (typeof password !== 'string' || password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' });
      try {
        const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
        const session = createSession(Number(result.lastInsertRowid));
        return json(res, 201, { user: { id: Number(result.lastInsertRowid), username } }, { 'Set-Cookie': sessionCookie(session.token) });
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) return json(res, 409, { error: 'Username already exists.' });
        throw e;
      }
    }

    if (req.method === 'POST' && path === '/api/login') {
      const { username, password } = await body(req);
      const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
      if (!user || !verifyPassword(password || '', user.password_hash)) return json(res, 401, { error: 'Invalid username or password.' });
      const session = createSession(user.id);
      return json(res, 200, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': sessionCookie(session.token) });
    }

    if (req.method === 'POST' && path === '/api/logout') {
      const cookies = parseCookies(req.headers.cookie || '');
      deleteSession(cookies.session);
      return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }

    if (path === '/api/tasks') {
      const user = requireUser(req, res);
      if (!user) return;
      if (req.method === 'GET') {
        const tasks = db.prepare('SELECT id, title, completed, created_at FROM tasks WHERE user_id = ? ORDER BY id DESC').all(user.id).map(t => ({ ...t, completed: Boolean(t.completed) }));
        return json(res, 200, { tasks });
      }
      if (req.method === 'POST') {
        const { title } = await body(req);
        if (typeof title !== 'string' || !title.trim()) return json(res, 400, { error: 'Task title is required.' });
        const result = db.prepare('INSERT INTO tasks (user_id, title) VALUES (?, ?)').run(user.id, title.trim().slice(0, 200));
        const task = db.prepare('SELECT id, title, completed, created_at FROM tasks WHERE id = ? AND user_id = ?').get(Number(result.lastInsertRowid), user.id);
        return json(res, 201, { task: { ...task, completed: Boolean(task.completed) } });
      }
    }

    const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
    if (taskMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const id = Number(taskMatch[1]);
      const owned = db.prepare('SELECT id, title, completed, created_at FROM tasks WHERE id = ? AND user_id = ?').get(id, user.id);
      if (!owned) return json(res, 404, { error: 'Task not found.' });

      if (req.method === 'PATCH') {
        const { completed, title } = await body(req);
        if (completed !== undefined && typeof completed !== 'boolean') return json(res, 400, { error: 'completed must be boolean.' });
        if (title !== undefined && (typeof title !== 'string' || !title.trim())) return json(res, 400, { error: 'title must be non-empty.' });
        if (completed !== undefined) db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ?').run(completed ? 1 : 0, id, user.id);
        if (title !== undefined) db.prepare('UPDATE tasks SET title = ? WHERE id = ? AND user_id = ?').run(title.trim().slice(0, 200), id, user.id);
        const task = db.prepare('SELECT id, title, completed, created_at FROM tasks WHERE id = ? AND user_id = ?').get(id, user.id);
        return json(res, 200, { task: { ...task, completed: Boolean(task.completed) } });
      }
      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, user.id);
        return json(res, 200, { ok: true });
      }
    }

    if (req.method === 'GET') {
      const file = path === '/' ? 'index.html' : path.slice(1);
      if (!file.includes('..')) {
        try {
          const content = await readFile(join(publicDir, file));
          const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript';
          res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
          res.end(content);
          return;
        } catch {}
      }
    }
    json(res, 404, { error: 'Not found.' });
  } catch (e) {
    console.error(e);
    json(res, e.status || 500, { error: e.status ? e.message : 'Internal server error.' });
  }
}
