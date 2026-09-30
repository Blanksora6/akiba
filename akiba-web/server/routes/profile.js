import { ok, notFound } from '../http.js';

const PROFILE_COLUMNS = `display_name AS "displayName", email, nickname`;

export default [
  // GET /api/profile
  {
    method: 'GET', path: '/profile',
    async handler({ db, userId }) {
      const [profile] = await db.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = $1`, [userId]);
      return profile ? ok(profile) : notFound();
    },
  },

  // PUT /api/profile/nickname — blank clears it, falling back to displayName
  {
    method: 'PUT', path: '/profile/nickname',
    async handler({ db, userId, body }) {
      const raw = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
      const [profile] = await db.query(
        `UPDATE users SET nickname = $2 WHERE id = $1 RETURNING ${PROFILE_COLUMNS}`,
        [userId, raw || null],
      );
      return profile ? ok(profile) : notFound();
    },
  },
];
