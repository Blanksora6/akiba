// Throwaway API server for the phone app's sync tests (Akiba.Mobile.Tests):
// the real router on an in-memory database, one seeded user, a random port.
// Prints one JSON line — { port, token, userId } — then serves until killed.
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';

process.env.JWT_SIGNING_KEY = randomBytes(48).toString('base64url');
delete process.env.DATABASE_URL;
delete process.env.PGLITE_DIR;

const { handle } = await import('./app.js');
const { issueToken } = await import('./auth.js');
const { getDb } = await import('./db.js');

const db = await getDb();
const userId = randomUUID();
await db.query(
  `INSERT INTO users (id, google_id, email, display_name) VALUES ($1, $2, $3, $4)`,
  [userId, `test-${userId}`, 'sync-test@example.com', 'Sync Test'],
);
const token = await issueToken(userId);

const server = createServer((req, res) => handle(req, res));
server.listen(0, '127.0.0.1', () => {
  console.log(JSON.stringify({ port: server.address().port, token, userId }));
});
