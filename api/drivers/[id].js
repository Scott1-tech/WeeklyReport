import { getPool, ensureSchema, sendJson, sendError } from '../_db.js';

const DRIVER_FIELDS = ['name', 'company', 'status', 'hire_date', 'tenure_days', 'term_date', 'notes'];

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const pool = getPool();
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) {
      await sendJson(res, 400, { error: 'Invalid driver id' });
      return;
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const setClauses = [];
      const values = [];
      let i = 1;
      for (const field of DRIVER_FIELDS) {
        if (field in body) {
          setClauses.push(`${field} = $${i}`);
          values.push(body[field]);
          i++;
        }
      }
      if (setClauses.length === 0) {
        await sendJson(res, 400, { error: 'No fields to update' });
        return;
      }
      values.push(id);
      const { rows } = await pool.query(
        `UPDATE drivers SET ${setClauses.join(', ')}, updated_at = now()
         WHERE id = $${i}
         RETURNING id, name, company, status,
                   to_char(hire_date, 'YYYY-MM-DD') AS hire_date,
                   tenure_days,
                   to_char(term_date, 'YYYY-MM-DD') AS term_date,
                   notes`,
        values
      );
      if (rows.length === 0) {
        await sendJson(res, 404, { error: 'Driver not found' });
        return;
      }
      await sendJson(res, 200, { driver: rows[0] });
      return;
    }

    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM drivers WHERE id = $1', [id]);
      await sendJson(res, 200, { ok: true });
      return;
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    await sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    await sendError(res, 500, err);
  }
}
