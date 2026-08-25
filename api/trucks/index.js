import { getPool, ensureSchema, sendJson, sendError } from '../_db.js';

const TRUCK_FIELDS = ['unit', 'company', 'status', 'status_date', 'notes', 'assigned_driver'];

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const pool = getPool();

    if (req.method === 'GET') {
      const { rows } = await pool.query(`
        SELECT id, unit, company, status,
               to_char(status_date, 'YYYY-MM-DD') AS status_date,
               notes, assigned_driver
        FROM trucks
        ORDER BY id ASC
      `);
      await sendJson(res, 200, { trucks: rows });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const values = TRUCK_FIELDS.map((f) => (f in body ? body[f] : null));
      const { rows } = await pool.query(
        `INSERT INTO trucks (unit, company, status, status_date, notes, assigned_driver)
         VALUES (COALESCE($1, ''), COALESCE($2, ''), COALESCE($3, 'Active'), $4, COALESCE($5, ''), COALESCE($6, ''))
         RETURNING id, unit, company, status,
                   to_char(status_date, 'YYYY-MM-DD') AS status_date,
                   notes, assigned_driver`,
        values
      );
      await sendJson(res, 201, { truck: rows[0] });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    await sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    await sendError(res, 500, err);
  }
}
