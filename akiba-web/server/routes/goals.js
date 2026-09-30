import { randomUUID } from 'node:crypto';
import { ok, created, noContent, badRequest, notFound, isUuid, parseDate, toNumber } from '../http.js';

// Shared by create and update. Returns { error } or the clean fields.
function readGoalFields(body) {
  const name = typeof body?.name === 'string' ? body.name : '';
  const price = toNumber(body?.price);
  if (price === undefined) return { error: 'price must be a number.' };
  const targetDate = parseDate(body.targetDate);
  if (targetDate === undefined) return { error: 'targetDate must be a valid date.' };
  const isRecurring = body.isRecurring === true;
  const intervalMonths = body.intervalMonths == null ? null : Number.parseInt(body.intervalMonths, 10);
  if (Number.isNaN(intervalMonths)) return { error: 'intervalMonths must be a whole number.' };
  return { name, price, targetDate, isRecurring, intervalMonths };
}

export default [
  // GET /api/goals?includePurchased=false
  {
    method: 'GET', path: '/goals',
    async handler({ db, userId, query }) {
      const includePurchased = query.get('includePurchased') === 'true';
      const rows = await db.query(
        `SELECT g.id, c.id AS "classId", c.name AS "className", g.name, g.price::float8 AS price,
                g.target_date AS "targetDate", g.is_recurring AS "isRecurring",
                g.interval_months AS "intervalMonths", g.is_purchased AS "isPurchased"
         FROM goals g JOIN classes c ON c.id = g.class_id
         WHERE g.user_id = $1 AND NOT g.is_deleted AND ($2 OR NOT g.is_purchased)`,
        [userId, includePurchased],
      );
      return ok(rows);
    },
  },

  // POST /api/goals — the class must be yours
  {
    method: 'POST', path: '/goals',
    async handler({ db, userId, body }) {
      if (!isUuid(body?.classId)) return badRequest('Class does not exist.');
      const [owned] = await db.query(
        `SELECT 1 FROM classes WHERE id = $1 AND user_id = $2 AND NOT is_deleted`,
        [body.classId, userId],
      );
      if (!owned) return badRequest('Class does not exist.');

      const f = readGoalFields(body);
      if (f.error) return badRequest(f.error);
      if (!f.isRecurring && !f.targetDate)
        return badRequest('Provide either a targetDate or mark it recurring with an interval.');
      if (f.isRecurring && f.intervalMonths === null)
        return badRequest('Recurring goals need intervalMonths set.');

      const id = randomUUID();
      await db.query(
        `INSERT INTO goals (id, user_id, class_id, name, price, target_date, is_recurring, interval_months, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [id, userId, body.classId, f.name, f.price, f.targetDate, f.isRecurring, f.intervalMonths],
      );
      return created(id);
    },
  },

  // PUT /api/goals/:id — owner only; covers editing AND marking as purchased
  {
    method: 'PUT', path: '/goals/:id',
    async handler({ db, userId, params, body }) {
      const f = readGoalFields(body);
      if (f.error) return badRequest(f.error);
      const rows = await db.query(
        `UPDATE goals SET name = $3, price = $4, target_date = $5, is_recurring = $6,
                interval_months = $7, is_purchased = $8, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND NOT is_deleted RETURNING id`,
        [params.id, userId, f.name, f.price, f.targetDate, f.isRecurring, f.intervalMonths, body.isPurchased === true],
      );
      return rows.length ? noContent() : notFound();
    },
  },

  // DELETE /api/goals/:id — soft delete, owner only
  {
    method: 'DELETE', path: '/goals/:id',
    async handler({ db, userId, params }) {
      const rows = await db.query(
        `UPDATE goals SET is_deleted = true, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING id`,
        [params.id, userId],
      );
      return rows.length ? noContent() : notFound();
    },
  },
];
