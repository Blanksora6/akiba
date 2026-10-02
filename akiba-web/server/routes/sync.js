import { ok, badRequest, isUuid, parseDate, toNumber } from '../http.js';

// Wire format is the full row in camelCase (same shape the .NET API used),
// including soft-deleted rows — the phone needs those to know what to remove.
const CLASS_COLUMNS = `id, user_id AS "userId", name, color_hex AS "colorHex",
  monthly_limit::float8 AS "monthlyLimit", updated_at AS "updatedAt", is_deleted AS "isDeleted"`;
const SUBJECT_COLUMNS = `s.id, s.class_id AS "classId", s.name, s.updated_at AS "updatedAt", s.is_deleted AS "isDeleted"`;
const TRANSACTION_COLUMNS = `id, user_id AS "userId", subject_id AS "subjectId", amount::float8 AS amount, note,
  occurred_at AS "occurredAt", updated_at AS "updatedAt", is_deleted AS "isDeleted"`;
const GOAL_COLUMNS = `id, user_id AS "userId", class_id AS "classId", name, price::float8 AS price,
  target_date AS "targetDate", is_recurring AS "isRecurring", interval_months AS "intervalMonths",
  is_purchased AS "isPurchased", updated_at AS "updatedAt", is_deleted AS "isDeleted"`;

// id -> { userId, updatedAt } for whichever of `ids` already exist in `table`.
async function existingRows(db, table, ownerColumn, ids) {
  if (ids.length === 0) return new Map();
  const rows = await db.query(
    `SELECT id, ${ownerColumn} AS owner, updated_at AS "updatedAt" FROM ${table} WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// Normalizes one incoming record; null when it's too malformed to use.
function clean(record, uuidFields) {
  if (!record || typeof record !== 'object') return null;
  for (const f of uuidFields) if (!isUuid(record[f])) return null;
  const out = { ...record };
  for (const f of uuidFields) out[f] = record[f].toLowerCase();
  out.updatedAt = parseDate(record.updatedAt) ?? new Date(0);
  out.isDeleted = record.isDeleted === true;
  return out;
}

const list = (v) => (Array.isArray(v) ? v : []);
const isNewer = (incoming, existing) => incoming.updatedAt.getTime() > new Date(existing.updatedAt).getTime();

export default [
  // GET /api/sync/pull?since={cursor} — everything of YOURS the server has
  // written since the cursor (the serverTime from your previous pull), soft
  // deletes included. Use 1970-01-01T00:00:00Z for a first full sync.
  //
  // serverTime comes from the database clock (the same clock that stamps
  // synced_at) and is set back a minute, so a write committing at the same
  // moment as this read is picked up next time instead of slipping between
  // pulls. The overlap means some rows arrive twice; applying them is idempotent.
  {
    method: 'GET', path: '/sync/pull',
    async handler({ db, userId, query }) {
      const since = parseDate(query.get('since'));
      if (!since) return badRequest('since is required.');
      const [{ serverTime }] = await db.query(`SELECT clock_timestamp() - interval '1 minute' AS "serverTime"`);

      const [classes, subjects, transactions, goals] = await Promise.all([
        db.query(`SELECT ${CLASS_COLUMNS} FROM classes WHERE user_id = $1 AND synced_at > $2`, [userId, since]),
        db.query(
          `SELECT ${SUBJECT_COLUMNS} FROM subjects s JOIN classes c ON c.id = s.class_id
           WHERE c.user_id = $1 AND s.synced_at > $2`,
          [userId, since],
        ),
        db.query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE user_id = $1 AND synced_at > $2`, [userId, since]),
        db.query(`SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = $1 AND synced_at > $2`, [userId, since]),
      ]);

      return ok({ classes, subjects, transactions, goals, serverTime });
    },
  },

  // POST /api/sync/push — last-write-wins by updatedAt, per record. Every
  // record is checked against what the caller actually owns: an id that exists
  // under someone else's account is skipped, and anything pointing at a class
  // or subject the caller doesn't own is skipped. Skipped records are ignored
  // rather than failing the whole batch. All writes commit in one transaction.
  {
    method: 'POST', path: '/sync/push',
    async handler({ db, userId, body }) {
      const classes = list(body?.classes).map((r) => clean(r, ['id'])).filter(Boolean);
      const subjects = list(body?.subjects).map((r) => clean(r, ['id', 'classId'])).filter(Boolean);
      const transactions = list(body?.transactions).map((r) => clean(r, ['id', 'subjectId'])).filter(Boolean);
      const goals = list(body?.goals).map((r) => clean(r, ['id', 'classId'])).filter(Boolean);

      const allowedClassIds = new Set(
        (await db.query(`SELECT id FROM classes WHERE user_id = $1`, [userId])).map((r) => r.id),
      );
      const allowedSubjectIds = new Set(
        (await db.query(
          `SELECT s.id FROM subjects s JOIN classes c ON c.id = s.class_id WHERE c.user_id = $1`,
          [userId],
        )).map((r) => r.id),
      );

      const [existingClasses, existingSubjects, existingTxns, existingGoals] = await Promise.all([
        existingRows(db, 'classes', 'user_id', classes.map((r) => r.id)),
        existingRows(db, 'subjects', 'class_id', subjects.map((r) => r.id)),
        existingRows(db, 'transactions', 'user_id', transactions.map((r) => r.id)),
        existingRows(db, 'goals', 'user_id', goals.map((r) => r.id)),
      ]);

      const writes = [];
      // Records that lost last-write-wins: the server already had a newer
      // version. Their current server rows go back in the response, so the
      // phone replaces its losing edit instead of keeping it forever.
      const stale = { classes: [], subjects: [], transactions: [], goals: [] };

      for (const r of classes) {
        const existing = existingClasses.get(r.id);
        const limit = toNumber(r.monthlyLimit ?? 0) ?? 0;
        const values = [r.id, userId, r.name ?? '', r.colorHex ?? '#4FAE8E', limit, r.updatedAt, r.isDeleted];
        if (!existing) {
          writes.push({
            text: `INSERT INTO classes (id, user_id, name, color_hex, monthly_limit, updated_at, is_deleted)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            params: values,
          });
          allowedClassIds.add(r.id);
        } else if (existing.owner !== userId) {
          continue; // never trust the client's claimed owner
        } else if (isNewer(r, existing)) {
          writes.push({
            text: `UPDATE classes SET name = $3, color_hex = $4, monthly_limit = $5, updated_at = $6, is_deleted = $7
                   WHERE id = $1 AND user_id = $2`,
            params: values,
          });
        } else {
          stale.classes.push(r.id);
        }
      }

      for (const r of subjects) {
        if (!allowedClassIds.has(r.classId)) continue;
        const existing = existingSubjects.get(r.id);
        const values = [r.id, r.classId, r.name ?? '', r.updatedAt, r.isDeleted];
        if (!existing) {
          writes.push({
            text: `INSERT INTO subjects (id, class_id, name, updated_at, is_deleted) VALUES ($1, $2, $3, $4, $5)`,
            params: values,
          });
          allowedSubjectIds.add(r.id);
        } else if (!allowedSubjectIds.has(r.id)) {
          continue;
        } else if (isNewer(r, existing)) {
          writes.push({
            text: `UPDATE subjects SET class_id = $2, name = $3, updated_at = $4, is_deleted = $5 WHERE id = $1`,
            params: values,
          });
        } else {
          stale.subjects.push(r.id);
        }
      }

      for (const r of transactions) {
        if (!allowedSubjectIds.has(r.subjectId)) continue;
        const amount = toNumber(r.amount);
        const occurredAt = parseDate(r.occurredAt);
        if (amount === undefined || !occurredAt) continue;
        const existing = existingTxns.get(r.id);
        const values = [r.id, userId, r.subjectId, amount, typeof r.note === 'string' ? r.note : null,
          occurredAt, r.updatedAt, r.isDeleted];
        if (!existing) {
          writes.push({
            text: `INSERT INTO transactions (id, user_id, subject_id, amount, note, occurred_at, updated_at, is_deleted)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            params: values,
          });
        } else if (existing.owner !== userId) {
          continue;
        } else if (isNewer(r, existing)) {
          writes.push({
            text: `UPDATE transactions SET subject_id = $3, amount = $4, note = $5, occurred_at = $6,
                          updated_at = $7, is_deleted = $8
                   WHERE id = $1 AND user_id = $2`,
            params: values,
          });
        } else {
          stale.transactions.push(r.id);
        }
      }

      for (const r of goals) {
        if (!allowedClassIds.has(r.classId)) continue;
        const price = toNumber(r.price);
        const targetDate = parseDate(r.targetDate);
        if (price === undefined || targetDate === undefined) continue;
        const interval = r.intervalMonths == null ? null : Number.parseInt(r.intervalMonths, 10);
        const existing = existingGoals.get(r.id);
        const values = [r.id, userId, r.classId, r.name ?? '', price, targetDate, r.isRecurring === true,
          Number.isNaN(interval) ? null : interval, r.isPurchased === true, r.updatedAt, r.isDeleted];
        if (!existing) {
          writes.push({
            text: `INSERT INTO goals (id, user_id, class_id, name, price, target_date, is_recurring,
                                      interval_months, is_purchased, updated_at, is_deleted)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            params: values,
          });
        } else if (existing.owner !== userId) {
          continue;
        } else if (isNewer(r, existing)) {
          writes.push({
            text: `UPDATE goals SET class_id = $3, name = $4, price = $5, target_date = $6, is_recurring = $7,
                          interval_months = $8, is_purchased = $9, updated_at = $10, is_deleted = $11
                   WHERE id = $1 AND user_id = $2`,
            params: values,
          });
        } else {
          stale.goals.push(r.id);
        }
      }

      if (writes.length) await db.batch(writes);

      const [rClasses, rSubjects, rTransactions, rGoals] = await Promise.all([
        db.query(`SELECT ${CLASS_COLUMNS} FROM classes WHERE id = ANY($1::uuid[])`, [stale.classes]),
        db.query(`SELECT ${SUBJECT_COLUMNS} FROM subjects s WHERE s.id = ANY($1::uuid[])`, [stale.subjects]),
        db.query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = ANY($1::uuid[])`, [stale.transactions]),
        db.query(`SELECT ${GOAL_COLUMNS} FROM goals WHERE id = ANY($1::uuid[])`, [stale.goals]),
      ]);
      return ok({
        serverTime: new Date(),
        current: { classes: rClasses, subjects: rSubjects, transactions: rTransactions, goals: rGoals },
      });
    },
  },
];
