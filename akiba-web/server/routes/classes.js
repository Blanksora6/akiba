import { randomUUID } from 'node:crypto';
import { ok, created, noContent, badRequest, notFound, toNumber } from '../http.js';

function readClassFields(body) {
  const name = typeof body?.name === 'string' ? body.name : '';
  const colorHex = typeof body?.colorHex === 'string' ? body.colorHex : '#4FAE8E';
  const monthlyLimit = toNumber(body?.monthlyLimit ?? 0);
  if (monthlyLimit === undefined) return { error: 'monthlyLimit must be a number.' };
  return { name, colorHex, monthlyLimit };
}

export default [
  // GET /api/classes — each class with its (non-deleted) subjects nested
  {
    method: 'GET', path: '/classes',
    async handler({ db, userId }) {
      const classes = await db.query(
        `SELECT id, name, color_hex AS "colorHex", monthly_limit::float8 AS "monthlyLimit"
         FROM classes WHERE user_id = $1 AND NOT is_deleted`,
        [userId],
      );
      const subjects = await db.query(
        `SELECT s.id, s.name, s.class_id AS "classId"
         FROM subjects s JOIN classes c ON c.id = s.class_id
         WHERE c.user_id = $1 AND NOT c.is_deleted AND NOT s.is_deleted`,
        [userId],
      );
      return ok(classes.map((c) => ({
        ...c,
        subjects: subjects.filter((s) => s.classId === c.id).map(({ id, name }) => ({ id, name })),
      })));
    },
  },

  // POST /api/classes — returns the new id
  {
    method: 'POST', path: '/classes',
    async handler({ db, userId, body }) {
      const fields = readClassFields(body);
      if (fields.error) return badRequest(fields.error);
      const id = randomUUID();
      await db.query(
        `INSERT INTO classes (id, user_id, name, color_hex, monthly_limit, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [id, userId, fields.name, fields.colorHex, fields.monthlyLimit],
      );
      return created(id);
    },
  },

  // PUT /api/classes/:id — only the owner can edit; anyone else gets 404
  {
    method: 'PUT', path: '/classes/:id',
    async handler({ db, userId, params, body }) {
      const fields = readClassFields(body);
      if (fields.error) return badRequest(fields.error);
      const rows = await db.query(
        `UPDATE classes SET name = $3, color_hex = $4, monthly_limit = $5, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND NOT is_deleted RETURNING id`,
        [params.id, userId, fields.name, fields.colorHex, fields.monthlyLimit],
      );
      return rows.length ? noContent() : notFound();
    },
  },

  // DELETE /api/classes/:id — soft delete, owner only. Takes everything in the
  // category with it (subjects, transactions, goals), each stamped with a new
  // updated_at so sync pull hands the deletions to the phone too.
  {
    method: 'DELETE', path: '/classes/:id',
    async handler({ db, userId, params }) {
      const [owned] = await db.query(`SELECT 1 FROM classes WHERE id = $1 AND user_id = $2`, [params.id, userId]);
      if (!owned) return notFound();

      const p = [params.id];
      await db.batch([
        { text: `UPDATE classes SET is_deleted = true, updated_at = now() WHERE id = $1`, params: p },
        { text: `UPDATE goals SET is_deleted = true, updated_at = now() WHERE class_id = $1 AND NOT is_deleted`, params: p },
        {
          text: `UPDATE transactions SET is_deleted = true, updated_at = now()
                 WHERE NOT is_deleted AND subject_id IN (SELECT id FROM subjects WHERE class_id = $1)`,
          params: p,
        },
        { text: `UPDATE subjects SET is_deleted = true, updated_at = now() WHERE class_id = $1 AND NOT is_deleted`, params: p },
      ]);
      return noContent();
    },
  },

  // POST /api/classes/:classId/subjects — the parent class must be yours
  {
    method: 'POST', path: '/classes/:classId/subjects',
    async handler({ db, userId, params, body }) {
      const [owned] = await db.query(
        `SELECT 1 FROM classes WHERE id = $1 AND user_id = $2 AND NOT is_deleted`,
        [params.classId, userId],
      );
      if (!owned) return notFound('Class does not exist.');

      const id = randomUUID();
      await db.query(
        `INSERT INTO subjects (id, class_id, name, updated_at) VALUES ($1, $2, $3, now())`,
        [id, params.classId, typeof body?.name === 'string' ? body.name : ''],
      );
      return created(id);
    },
  },

  // Subjects have no user_id of their own — ownership comes from their class,
  // so every subject edit/delete checks the class owner.
  {
    method: 'PUT', path: '/subjects/:id',
    async handler({ db, userId, params, body }) {
      const rows = await db.query(
        `UPDATE subjects s SET name = $3, updated_at = now()
         FROM classes c
         WHERE s.id = $1 AND c.id = s.class_id AND c.user_id = $2 AND NOT s.is_deleted
         RETURNING s.id`,
        [params.id, userId, typeof body?.name === 'string' ? body.name : ''],
      );
      return rows.length ? noContent() : notFound();
    },
  },
  // Same rule as classes: deleting a subject removes its transactions too.
  {
    method: 'DELETE', path: '/subjects/:id',
    async handler({ db, userId, params }) {
      const [owned] = await db.query(
        `SELECT 1 FROM subjects s JOIN classes c ON c.id = s.class_id WHERE s.id = $1 AND c.user_id = $2`,
        [params.id, userId],
      );
      if (!owned) return notFound();

      await db.batch([
        { text: `UPDATE subjects SET is_deleted = true, updated_at = now() WHERE id = $1`, params: [params.id] },
        {
          text: `UPDATE transactions SET is_deleted = true, updated_at = now() WHERE subject_id = $1 AND NOT is_deleted`,
          params: [params.id],
        },
      ]);
      return noContent();
    },
  },
];
