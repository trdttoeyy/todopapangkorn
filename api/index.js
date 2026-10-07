process.env.DB_PATH ||= '/tmp/papangkorn-challenge3.db';
const { handler } = await import('../server/app.js');
export default handler;
