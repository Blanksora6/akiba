import { randomUUID } from 'node:crypto';
import { ok, created, noContent, badRequest, notFound, isUuid, parseDate, toNumber } from '../http.js';

// Validates a create/update body. Returns { error } or the clean fields.
function readTransactionFields(body) {
  if (!isUuid(body?.subjectId)) return { error: 'Subject does not exist.' };
  const amount = toNumber(body.amount);
  if (amount === undefined) return { error: 'amount must be a number.' };
  const occurredAt = parseDate(body.occurredAt);
  if (!occurredAt) return { error: 'occurredAt must be a valid date.' };
  const note = typeof body.note === 'string' ? body.note : null;
  return { subjectId: body.subjectId, amount, note, occurredAt };
}

async function ownsSubject(db, userId, subjectId) {
  const rows = await db.query(
    `SELECT 1 FROM subjects s JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND c.user_id = $2 AND NOT s.is_deleted`,
    [subjectId, userId],
  );
  return rows.length > 0;
}

export default [
  // GET /api/transactions?fromDate=&toDate=&limit= — all optional; newest first
  {
    method: 'GET', path: '/transactions',
    async handler({ db, userId, query }) {
      const fromDate = parseDate(query.get('fromDate'));
      const toDate = parseDate(query.get('toDate'));
      if (fromDate === undefined || toDate === undefined) return badRequest('Invalid date.');
      const limit = Number.parseInt(query.get('limit') ?? '', 10);

      const rows = await db.query(
        `SELECT t.id, s.id AS "subjectId", s.name AS "subjectName", c.id AS "classId", c.name AS "className",
                t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt"
         FROM transactions t
         JOIN subjects s ON s.id = t.subject_id
         JOIN classes c ON c.id = s.class_id
         WHERE t.user_id = $1 AND NOT t.is_deleted
           AND ($2::timestamptz IS NULL OR t.occurred_at >= $2)
           AND ($3::timestamptz IS NULL OR t.occurred_at < $3)
         ORDER BY t.occurred_at DESC
         LIMIT $4`,
        [userId, fromDate, toDate, limit > 0 ? limit : null],
      );
      return ok(rows);
    },
  },

  // POST /api/transactions — the subject must belong to one of YOUR classes
  {
    method: 'POST', path: '/transactions',
    async handler({ db, userId, body }) {
      const f = readTransactionFields(body);
      if (f.error) return badRequest(f.error);
      if (!(await ownsSubject(db, userId, f.subjectId))) return badRequest('Subject does not exist.');

      const id = randomUUID();
      await db.query(
        `INSERT INTO transactions (id, user_id, subject_id, amount, note, occurred_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [id, userId, f.subjectId, f.amount, f.note, f.occurredAt],
      );
      return created(id);
    },
  },

  // PUT /api/transactions/:id — owner only, and the NEW subject must also be yours
  {
    method: 'PUT', path: '/transactions/:id',
    async handler({ db, userId, params, body }) {
      const [existing] = await db.query(
        `SELECT 1 FROM transactions WHERE id = $1 AND user_id = $2 AND NOT is_deleted`,
        [params.id, userId],
      );
      if (!existing) return notFound();

      const f = readTransactionFields(body);
      if (f.error) return badRequest(f.error);
      if (!(await ownsSubject(db, userId, f.subjectId))) return badRequest('Subject does not exist.');

      await db.query(
        `UPDATE transactions SET subject_id = $3, amount = $4, note = $5, occurred_at = $6, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [params.id, userId, f.subjectId, f.amount, f.note, f.occurredAt],
      );
      return noContent();
    },
  },

  // DELETE /api/transactions/:id — soft delete, owner only
  {
    method: 'DELETE', path: '/transactions/:id',
    async handler({ db, userId, params }) {
      const rows = await db.query(
        `UPDATE transactions SET is_deleted = true, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING id`,
        [params.id, userId],
      );
      return rows.length ? noContent() : notFound();
    },
  },

  // GET /api/summary/spending?year=2026&month=9
  // Class-level totals only, expenses only — what the pie chart renders.
  {
    method: 'GET', path: '/summary/spending',
    async handler({ db, userId, query }) {
      const year = Number.parseInt(query.get('year') ?? '', 10);
      const month = Number.parseInt(query.get('month') ?? '', 10);
      if (!(year > 0) || !(month >= 1 && month <= 12)) return badRequest('year and month are required.');
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 1));

      const rows = await db.query(
        `SELECT c.id AS "classId", c.name AS "className", c.color_hex AS "colorHex",
                (-SUM(t.amount))::float8 AS total
         FROM transactions t
         JOIN subjects s ON s.id = t.subject_id
         JOIN classes c ON c.id = s.class_id
         WHERE t.user_id = $1 AND NOT t.is_deleted AND t.amount < 0
           AND t.occurred_at >= $2 AND t.occurred_at < $3
         GROUP BY c.id, c.name, c.color_hex
         ORDER BY total DESC`,
        [userId, monthStart, monthEnd],
      );
      return ok(rows);
    },
  },

  // GET /api/summary/balance — all-time sum, income positive, expenses negative
  {
    method: 'GET', path: '/summary/balance',
    async handler({ db, userId }) {
      const [row] = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::float8 AS balance
         FROM transactions WHERE user_id = $1 AND NOT is_deleted`,
        [userId],
      );
      return ok(row);
    },
  },
];
