const $ = (id) => document.getElementById(id);
let mode = 'login';

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('authSubmit').textContent = mode === 'login' ? 'Login' : 'Create account';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('authError').textContent = '';
}

document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('authError').textContent = '';
  try {
    const data = await api(`/api/${mode}`, { method: 'POST', body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }) });
    showApp(data.user);
  } catch (err) { $('authError').textContent = err.message; }
});

async function showApp(user) {
  $('authView').hidden = true; $('appView').hidden = false; $('hello').textContent = `Hi, ${user.username}`; await loadTasks();
}

async function loadTasks() {
  try {
    const { tasks } = await api('/api/tasks');
    $('count').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
    $('tasks').innerHTML = tasks.length ? tasks.map(t => `<li class="task ${t.completed ? 'done' : ''}"><button class="icon" onclick="toggleTask(${t.id}, ${!t.completed})">${t.completed ? '☑' : '☐'}</button><span>${escapeHtml(t.title)}</span><button class="icon" onclick="deleteTask(${t.id})">×</button></li>`).join('') : '<li class="empty">No tasks yet. Add your first one.</li>';
  } catch (err) { $('taskError').textContent = err.message; }
}

$('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('taskError').textContent = '';
  try { await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: $('taskTitle').value }) }); $('taskTitle').value = ''; await loadTasks(); }
  catch (err) { $('taskError').textContent = err.message; }
});

window.toggleTask = async (id, completed) => { try { await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ completed }) }); await loadTasks(); } catch (err) { $('taskError').textContent = err.message; } };
window.deleteTask = async (id) => { try { await api(`/api/tasks/${id}`, { method: 'DELETE' }); await loadTasks(); } catch (err) { $('taskError').textContent = err.message; } };
$('logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.reload(); });

function escapeHtml(s) { return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

(async () => { try { const { user } = await api('/api/me'); if (user) showApp(user); } catch {} })();
