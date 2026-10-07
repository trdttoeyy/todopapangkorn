# Challenge 3 — Full-stack To-do List

A small full-stack to-do app with username/password authentication, hashed passwords, per-user task ownership, SQLite, and automated tests.

## Run locally

Requires Node.js 22+.

```bash
npm test
npm start
```

Open http://localhost:3000.

The local database is `data/app.db`. It is intentionally ignored by Git.

## Three layers

**Frontend:** `public/index.html`, `public/app.js`, `public/style.css` render the UI and call the API.

**API:** `server/app.js` handles registration, login, sessions, and task CRUD. Authentication is enforced before task queries, and every task query includes the logged-in user's `user_id`.

**Database:** `server/database.js` creates SQLite tables for `users`, `sessions`, and `tasks`. Passwords are stored as salted scrypt hashes, never plain text.

## Request example

A task creation request travels Browser → `POST /api/tasks` → session lookup → authenticated `user_id` → SQLite INSERT → JSON response → UI refresh.

## Vercel note

`api/index.js` uses `/tmp` when `DB_PATH` is not set because Vercel's filesystem is not persistent. This is suitable only for a demo deployment; a real production deployment should use a hosted database (for example a managed PostgreSQL/SQLite-compatible service) and set its connection configuration as environment variables. Never commit credentials or `.db` files.
