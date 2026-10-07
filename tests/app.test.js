import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'todo-test-'));
process.env.DB_PATH = join(dir, 'test.db');
const { handler } = await import('../server/app.js');
import http from 'node:http';

let server, base;
before(async () => await new Promise(resolve => { server = http.createServer(handler).listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); }));
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

async function request(path, opts = {}, cookie = '') {
  const res = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  return { res, data: await res.json(), cookie: res.headers.get('set-cookie') };
}
function cookieValue(setCookie) { return setCookie?.split(';')[0] || ''; }

 test('two users only see their own tasks', async () => {
  const a = await request('/api/register', { method: 'POST', body: JSON.stringify({ username: 'alice', password: 'password123' }) });
  const b = await request('/api/register', { method: 'POST', body: JSON.stringify({ username: 'bob', password: 'password123' }) });
  const ca = cookieValue(a.cookie), cb = cookieValue(b.cookie);
  const ta = await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Alice secret' }) }, ca);
  await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Bob secret' }) }, cb);
  const aTasks = await request('/api/tasks', {}, ca);
  const bTasks = await request('/api/tasks', {}, cb);
  assert.equal(aTasks.data.tasks.length, 1);
  assert.equal(aTasks.data.tasks[0].title, 'Alice secret');
  assert.equal(bTasks.data.tasks.length, 1);
  assert.equal(bTasks.data.tasks[0].title, 'Bob secret');
  const cross = await request(`/api/tasks/${ta.data.task.id}`, { method: 'DELETE' }, cb);
  assert.equal(cross.res.status, 404);
 });

 test('wrong password is rejected', async () => {
  const result = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'alice', password: 'wrongwrong' }) });
  assert.equal(result.res.status, 401);
 });

 test('unauthenticated users cannot access tasks', async () => {
  const result = await request('/api/tasks');
  assert.equal(result.res.status, 401);
 });
