import { getPool, ensureSchema, sendJson, sendError } from '../_db.js';

const TRUCK_FIELDS = ['unit', 'company', 'status', 'status_date', 'notes', 'assigned_driver'];

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const pool = getPool();
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) {
      await sendJson(res, 400, { error: 'Invalid truck id' });
      return;
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const setClauses = [];
      const values = [];
      let i = 1;
      for (const field of TRUCK_FIELDS) {
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
        `UPDATE trucks SET ${setClauses.join(', ')}, updated_at = now()
         WHERE id = $${i}
         RETURNING id, unit, company, status,
                   to_char(status_date, 'YYYY-MM-DD') AS status_date,
                   notes, assigned_driver`,
        values
      );
      if (rows.length === 0) {
        await sendJson(res, 404, { error: 'Truck not found' });
        return;
      }
      await sendJson(res, 200, { truck: rows[0] });
      return;
    }

    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM trucks WHERE id = $1', [id]);
      await sendJson(res, 200, { ok: true });
      return;
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    await sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    await sendError(res, 500, err);
  }
}
