import { getPool, ensureSchema, sendJson, sendError } from '../_db.js';

const DRIVER_FIELDS = ['name', 'company', 'status', 'hire_date', 'tenure_days', 'term_date', 'notes'];

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const pool = getPool();

    if (req.method === 'GET') {
      const { rows } = await pool.query(`
        SELECT id, name, company, status,
               to_char(hire_date, 'YYYY-MM-DD') AS hire_date,
               tenure_days,
               to_char(term_date, 'YYYY-MM-DD') AS term_date,
               notes
        FROM drivers
        ORDER BY id ASC
      `);
      await sendJson(res, 200, { drivers: rows });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const values = DRIVER_FIELDS.map((f) => (f in body ? body[f] : null));
      const { rows } = await pool.query(
        `INSERT INTO drivers (name, company, status, hire_date, tenure_days, term_date, notes)
         VALUES (COALESCE($1, ''), COALESCE($2, ''), COALESCE($3, 'Active'), $4, $5, $6, COALESCE($7, ''))
         RETURNING id, name, company, status,
                   to_char(hire_date, 'YYYY-MM-DD') AS hire_date,
                   tenure_days,
                   to_char(term_date, 'YYYY-MM-DD') AS term_date,
                   notes`,
        values
      );
      await sendJson(res, 201, { driver: rows[0] });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    await sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    await sendError(res, 500, err);
  }
}
