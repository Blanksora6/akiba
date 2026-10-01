// End-to-end tests for the API against an in-memory PGlite database.
// Run with: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

process.env.JWT_SIGNING_KEY = 'test-signing-key-test-signing-key-test-signing-key';
delete process.env.DATABASE_URL;
delete process.env.PGLITE_DIR;

const { handle } = await import('./app.js');
const { issueToken } = await import('./auth.js');
const { getDb } = await import('./db.js');

// Drives handle() with a minimal fake req/res, the way Vite's dev server does.
// Non-JSON responses (the mobile sign-in page) come back as text.
async function call(method, path, { token, body, rawBody, headers = {} } = {}) {
  const payload = rawBody ?? (body === undefined ? '' : JSON.stringify(body));
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  req.method = method;
  req.url = path;
  req.headers = { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) };

  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) {
        const isJson = (this.headers['content-type'] || '').startsWith('application/json');
        resolve({ status: this.statusCode, body: data ? (isJson ? JSON.parse(data) : data) : undefined });
      },
    };
    handle(req, res);
  });
}

async function makeUser(name) {
  const db = await getDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO users (id, google_id, email, display_name) VALUES ($1, $2, $3, $4)`,
    [id, `google-${id}`, `${name}@example.com`, name],
  );
  return { id, token: await issueToken(id) };
}

let alice, bob;
before(async () => {
  alice = await makeUser('Alice');
  bob = await makeUser('Bob');
});

test('health is open, data routes need a token, unknown routes 404', async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
  assert.equal((await call('GET', '/api/classes')).status, 401);
  assert.equal((await call('GET', '/api/classes', { token: 'garbage' })).status, 401);
  assert.equal((await call('GET', '/api/nope', { token: alice.token })).status, 404);
  assert.equal((await call('PUT', '/api/classes/not-a-uuid', { token: alice.token, body: {} })).status, 404);
});

test('bad Google token and bad JSON are rejected', async () => {
  assert.equal((await call('POST', '/api/auth/google', { body: { idToken: 'x' } })).status, 401);
  assert.equal((await call('POST', '/api/classes', { token: alice.token, rawBody: '{oops' })).status, 400);
});

test('classes, subjects, transactions and summaries', async () => {
  const t = alice.token;
  const classRes = await call('POST', '/api/classes', { token: t, body: { name: 'Groceries', colorHex: '#4FAE8E', monthlyLimit: 15000 } });
  assert.equal(classRes.status, 201);
  const classId = classRes.body;

  const subjectRes = await call('POST', `/api/classes/${classId}/subjects`, { token: t, body: { name: 'Naivas' } });
  assert.equal(subjectRes.status, 201);
  const subjectId = subjectRes.body;

  const classes = (await call('GET', '/api/classes', { token: t })).body;
  assert.deepEqual(classes, [{ id: classId, name: 'Groceries', colorHex: '#4FAE8E', monthlyLimit: 15000, subjects: [{ id: subjectId, name: 'Naivas' }] }]);

  const sept = '2026-09-10T00:00:00.000Z';
  assert.equal((await call('POST', '/api/transactions', { token: t, body: { subjectId, amount: -2450.5, note: 'Weekly shop', occurredAt: sept } })).status, 201);
  assert.equal((await call('POST', '/api/transactions', { token: t, body: { subjectId, amount: 10000, note: null, occurredAt: '2026-09-12T00:00:00Z' } })).status, 201);

  const all = (await call('GET', '/api/transactions', { token: t })).body;
  assert.equal(all.length, 2);
  assert.equal(all[0].amount, 10000); // newest first
  assert.equal(all[1].subjectName, 'Naivas');
  assert.equal(all[1].className, 'Groceries');
  assert.equal(all[1].occurredAt, sept);

  assert.equal((await call('GET', '/api/transactions?limit=1', { token: t })).body.length, 1);
  assert.equal((await call('GET', '/api/transactions?fromDate=2026-09-11T00:00:00Z', { token: t })).body.length, 1);

  const spending = (await call('GET', '/api/summary/spending?year=2026&month=9', { token: t })).body;
  assert.deepEqual(spending, [{ classId, className: 'Groceries', colorHex: '#4FAE8E', total: 2450.5 }]);
  assert.deepEqual((await call('GET', '/api/summary/balance', { token: t })).body, { balance: 7549.5 });

  // Edit + soft delete
  const txnId = all[1].id;
  assert.equal((await call('PUT', `/api/transactions/${txnId}`, { token: t, body: { subjectId, amount: -100, note: 'fixed', occurredAt: sept } })).status, 204);
  assert.equal((await call('DELETE', `/api/transactions/${txnId}`, { token: t })).status, 204);
  assert.equal((await call('GET', '/api/transactions', { token: t })).body.length, 1);

  // Update + delete class
  assert.equal((await call('PUT', `/api/classes/${classId}`, { token: t, body: { name: 'Food', colorHex: '#000000', monthlyLimit: 1 } })).status, 204);
  assert.equal((await call('PUT', `/api/subjects/${subjectId}`, { token: t, body: { name: 'Carrefour' } })).status, 204);
  assert.equal((await call('GET', '/api/classes', { token: t })).body[0].subjects[0].name, 'Carrefour');
});

test("users can't see or touch each other's data", async () => {
  const classId = (await call('POST', '/api/classes', { token: alice.token, body: { name: 'Private', colorHex: '#111111', monthlyLimit: 0 } })).body;
  const subjectId = (await call('POST', `/api/classes/${classId}/subjects`, { token: alice.token, body: { name: 'Secret' } })).body;
  const txnId = (await call('POST', '/api/transactions', { token: alice.token, body: { subjectId, amount: -5, occurredAt: '2026-09-01T00:00:00Z' } })).body;

  const b = bob.token;
  assert.deepEqual((await call('GET', '/api/classes', { token: b })).body, []);
  assert.deepEqual((await call('GET', '/api/transactions', { token: b })).body, []);
  assert.equal((await call('PUT', `/api/classes/${classId}`, { token: b, body: { name: 'hacked', colorHex: '#fff', monthlyLimit: 0 } })).status, 404);
  assert.equal((await call('DELETE', `/api/classes/${classId}`, { token: b })).status, 404);
  assert.equal((await call('POST', `/api/classes/${classId}/subjects`, { token: b, body: { name: 'x' } })).status, 404);
  assert.equal((await call('PUT', `/api/subjects/${subjectId}`, { token: b, body: { name: 'x' } })).status, 404);
  assert.equal((await call('POST', '/api/transactions', { token: b, body: { subjectId, amount: -1, occurredAt: '2026-09-01T00:00:00Z' } })).status, 400);
  assert.equal((await call('DELETE', `/api/transactions/${txnId}`, { token: b })).status, 404);
  assert.equal((await call('POST', '/api/goals', { token: b, body: { classId, name: 'x', price: 1, targetDate: '2026-12-01', isRecurring: false } })).status, 400);
});

test('goals: validation, create, purchase toggle', async () => {
  const t = alice.token;
  const classId = (await call('POST', '/api/classes', { token: t, body: { name: 'Room', colorHex: '#C1583D', monthlyLimit: 3000 } })).body;

  assert.equal((await call('POST', '/api/goals', { token: t, body: { classId, name: 'Monitor', price: 48000, targetDate: null, isRecurring: false } })).status, 400);
  assert.equal((await call('POST', '/api/goals', { token: t, body: { classId, name: 'Router', price: 3000, isRecurring: true, intervalMonths: null } })).status, 400);

  const goalId = (await call('POST', '/api/goals', { token: t, body: { classId, name: 'Monitor', price: 48000, targetDate: '2026-10-06T00:00:00.000Z', isRecurring: false, intervalMonths: null } })).body;
  assert.equal((await call('POST', '/api/goals', { token: t, body: { classId, name: 'Boxers', price: 400, targetDate: null, isRecurring: true, intervalMonths: 1 } })).status, 201);

  const goals = (await call('GET', '/api/goals?includePurchased=false', { token: t })).body;
  assert.equal(goals.length, 2);
  const monitor = goals.find((g) => g.id === goalId);
  assert.equal(monitor.className, 'Room');
  assert.equal(monitor.price, 48000);
  assert.equal(monitor.targetDate, '2026-10-06T00:00:00.000Z');

  assert.equal((await call('PUT', `/api/goals/${goalId}`, { token: t, body: { ...monitor, isPurchased: true } })).status, 204);
  assert.equal((await call('GET', '/api/goals', { token: t })).body.length, 1);
  assert.equal((await call('GET', '/api/goals?includePurchased=true', { token: t })).body.length, 2);
  assert.equal((await call('DELETE', `/api/goals/${goalId}`, { token: t })).status, 204);
  assert.equal((await call('GET', '/api/goals?includePurchased=true', { token: t })).body.length, 1);
});

test('profile nickname set and clear', async () => {
  const t = bob.token;
  assert.deepEqual((await call('GET', '/api/profile', { token: t })).body, { displayName: 'Bob', email: 'Bob@example.com', nickname: null });
  assert.equal((await call('PUT', '/api/profile/nickname', { token: t, body: { nickname: '  Bobby ' } })).body.nickname, 'Bobby');
  assert.equal((await call('PUT', '/api/profile/nickname', { token: t, body: { nickname: '' } })).body.nickname, null);
});

test('sync: push new rows, last-write-wins, ownership enforced, pull includes deletes', async () => {
  const carol = await makeUser('Carol');
  const t = carol.token;
  const classId = randomUUID(), subjectId = randomUUID(), txnId = randomUUID();
  const t1 = '2026-09-20T10:00:00.000Z', t0 = '2026-09-20T09:00:00.000Z', t2 = '2026-09-20T11:00:00.000Z';

  // Offline-created class + subject + transaction arrive in one push.
  let res = await call('POST', '/api/sync/push', { token: t, body: {
    classes: [{ id: classId, name: 'Transport', colorHex: '#C9A227', monthlyLimit: 6000, updatedAt: t1, isDeleted: false }],
    subjects: [{ id: subjectId, classId, name: 'Uber', updatedAt: t1, isDeleted: false }],
    transactions: [{ id: txnId, subjectId, amount: -210, note: null, occurredAt: t1, updatedAt: t1, isDeleted: false }],
    goals: [],
  } });
  assert.equal(res.status, 200);
  assert.equal((await call('GET', '/api/transactions', { token: t })).body[0].amount, -210);

  // An older edit loses; a newer one (a soft delete) wins.
  await call('POST', '/api/sync/push', { token: t, body: { classes: [], subjects: [], goals: [],
    transactions: [{ id: txnId, subjectId, amount: -999, occurredAt: t1, updatedAt: t0, isDeleted: false }] } });
  assert.equal((await call('GET', '/api/transactions', { token: t })).body[0].amount, -210);
  await call('POST', '/api/sync/push', { token: t, body: { classes: [], subjects: [], goals: [],
    transactions: [{ id: txnId, subjectId, amount: -210, occurredAt: t1, updatedAt: t2, isDeleted: true }] } });
  assert.equal((await call('GET', '/api/transactions', { token: t })).body.length, 0);

  // Pull still returns the soft-deleted row so the phone can remove it.
  const pulled = (await call('GET', '/api/sync/pull?since=0001-01-01T00:00:00Z', { token: t })).body;
  assert.equal(pulled.classes.length, 1);
  assert.equal(pulled.subjects.length, 1);
  assert.equal(pulled.transactions[0].isDeleted, true);
  assert.ok(pulled.serverTime);
  assert.equal((await call('GET', `/api/sync/pull?since=${t2}`, { token: t })).body.transactions.length, 0);

  // Bob can't overwrite Carol's class, or attach rows to it.
  await call('POST', '/api/sync/push', { token: bob.token, body: {
    classes: [{ id: classId, name: 'stolen', updatedAt: '2030-01-01T00:00:00Z' }],
    subjects: [{ id: randomUUID(), classId, name: 'sneaky', updatedAt: t2 }],
    transactions: [{ id: randomUUID(), subjectId, amount: -1, occurredAt: t2, updatedAt: t2 }],
    goals: [{ id: randomUUID(), classId, name: 'x', price: 1, targetDate: t2, updatedAt: t2 }],
  } });
  const after = (await call('GET', '/api/sync/pull?since=0001-01-01T00:00:00Z', { token: t })).body;
  assert.equal(after.classes[0].name, 'Transport');
  assert.equal(after.subjects.length, 1);
  assert.equal(after.transactions.length, 1);
  assert.equal(after.goals.length, 0);

  assert.equal((await call('GET', '/api/sync/pull', { token: t })).status, 400);
});

test('deleting a category removes its transactions and goals everywhere, and sync sees it', async () => {
  const dan = await makeUser('Dan');
  const t = dan.token;
  const keepClass = (await call('POST', '/api/classes', { token: t, body: { name: 'Keep', colorHex: '#111111', monthlyLimit: 0 } })).body;
  const keepSubject = (await call('POST', `/api/classes/${keepClass}/subjects`, { token: t, body: { name: 'k' } })).body;
  const dropClass = (await call('POST', '/api/classes', { token: t, body: { name: 'Drop', colorHex: '#222222', monthlyLimit: 0 } })).body;
  const dropSubject = (await call('POST', `/api/classes/${dropClass}/subjects`, { token: t, body: { name: 'd' } })).body;

  const when = '2026-09-15T00:00:00Z';
  await call('POST', '/api/transactions', { token: t, body: { subjectId: keepSubject, amount: -100, occurredAt: when } });
  await call('POST', '/api/transactions', { token: t, body: { subjectId: dropSubject, amount: -500, occurredAt: when } });
  await call('POST', '/api/goals', { token: t, body: { classId: dropClass, name: 'g', price: 1, targetDate: when, isRecurring: false } });
  const before = new Date().toISOString();

  assert.equal((await call('DELETE', `/api/classes/${dropClass}`, { token: t })).status, 204);

  assert.deepEqual((await call('GET', '/api/summary/balance', { token: t })).body, { balance: -100 });
  const spending = (await call('GET', '/api/summary/spending?year=2026&month=9', { token: t })).body;
  assert.deepEqual(spending.map((s) => s.className), ['Keep']);
  assert.equal((await call('GET', '/api/transactions', { token: t })).body.length, 1);
  assert.equal((await call('GET', '/api/goals?includePurchased=true', { token: t })).body.length, 0);
  assert.equal((await call('POST', '/api/transactions', { token: t, body: { subjectId: dropSubject, amount: -1, occurredAt: when } })).status, 400);

  // Every cascaded row got a fresh updatedAt, so the phone's next pull deletes them.
  const pulled = (await call('GET', `/api/sync/pull?since=${before}`, { token: t })).body;
  assert.equal(pulled.classes.length, 1);
  assert.ok(pulled.subjects.every((r) => r.isDeleted) && pulled.subjects.length === 1);
  assert.ok(pulled.transactions.every((r) => r.isDeleted) && pulled.transactions.length === 1);
  assert.ok(pulled.goals.every((r) => r.isDeleted) && pulled.goals.length === 1);

  // Deleting a subject takes its transactions with it; other users get 404.
  assert.equal((await call('DELETE', `/api/subjects/${keepSubject}`, { token: bob.token })).status, 404);
  assert.equal((await call('DELETE', `/api/subjects/${keepSubject}`, { token: t })).status, 204);
  assert.deepEqual((await call('GET', '/api/summary/balance', { token: t })).body, { balance: 0 });
});

test('a category deleted before the cascade existed is still hidden (read-side filter)', async () => {
  const eve = await makeUser('Eve');
  const t = eve.token;
  const classId = (await call('POST', '/api/classes', { token: t, body: { name: 'Old', colorHex: '#333333', monthlyLimit: 0 } })).body;
  const subjectId = (await call('POST', `/api/classes/${classId}/subjects`, { token: t, body: { name: 'o' } })).body;
  await call('POST', '/api/transactions', { token: t, body: { subjectId, amount: -40, occurredAt: '2026-09-15T00:00:00Z' } });
  // Simulate the old behavior: only the class row flagged.
  await (await getDb()).query(`UPDATE classes SET is_deleted = true WHERE id = $1`, [classId]);

  assert.deepEqual((await call('GET', '/api/summary/balance', { token: t })).body, { balance: 0 });
  assert.deepEqual((await call('GET', '/api/summary/spending?year=2026&month=9', { token: t })).body, []);
  assert.equal((await call('GET', '/api/transactions', { token: t })).body.length, 0);
});

test('mobile sign-in rejects missing CSRF and bad tokens, handing the error back to the app', async () => {
  const form = { 'content-type': 'application/x-www-form-urlencoded' };

  const noCookie = await call('POST', '/api/auth/google/mobile', { headers: form, rawBody: 'credential=x&g_csrf_token=abc' });
  assert.equal(noCookie.status, 200);
  assert.match(noCookie.body, /akiba:\/\/auth#error=invalid_request/);

  const mismatch = await call('POST', '/api/auth/google/mobile', {
    headers: { ...form, cookie: 'g_csrf_token=other' }, rawBody: 'credential=x&g_csrf_token=abc',
  });
  assert.match(mismatch.body, /error=invalid_request/);

  const badToken = await call('POST', '/api/auth/google/mobile', {
    headers: { ...form, cookie: 'foo=1; g_csrf_token=abc' }, rawBody: 'credential=not-a-jwt&g_csrf_token=abc',
  });
  assert.match(badToken.body, /error=invalid_token/);
  assert.doesNotMatch(badToken.body, /token=ey/);
});
