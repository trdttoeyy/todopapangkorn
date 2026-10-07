import http from 'node:http';
import { handler } from './app.js';

const port = Number(process.env.PORT || 3000);
const server = http.createServer(handler);
server.listen(port, () => console.log(`Todo app running at http://localhost:${port}`));
