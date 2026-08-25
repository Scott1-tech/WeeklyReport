import { getPool, ensureSchema, sendJson, sendError } from './_db.js';

// Bulk-imports a weekly export: for each driver/truck record, updates the
// matching existing row (matched by name+company for drivers, unit for
// trucks, case-insensitively) or inserts a new one. Never deletes anything —
// a driver/truck missing from this week's file just isn't touched, so a
// spreadsheet export quirk can never silently erase a real record. Runs as
// one transaction: either the whole import lands, or none of it does.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    await sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let client;
  try {
    await ensureSchema();
    const pool = getPool();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const drivers = Array.isArray(body.drivers) ? body.drivers : [];
    const trucks = Array.isArray(body.trucks) ? body.trucks : [];

    client = await pool.connect();
    await client.query('BEGIN');

    let driversInserted = 0;
    let driversUpdated = 0;
    for (const d of drivers) {
      const name = (d.name || '').trim();
      const company = (d.company || '').trim();
      if (!name) continue;

      const existing = await client.query(
        'SELECT id FROM drivers WHERE lower(name) = lower($1) AND lower(company) = lower($2) LIMIT 1',
        [name, company]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE drivers
           SET status = $1, hire_date = $2, tenure_days = $3, term_date = $4, notes = $5, updated_at = now()
           WHERE id = $6`,
          [d.status || 'Active', d.hire_date || null, d.tenure_days ?? null, d.term_date || null, d.notes || '', existing.rows[0].id]
        );
        driversUpdated++;
      } else {
        await client.query(
          `INSERT INTO drivers (name, company, status, hire_date, tenure_days, term_date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [name, company, d.status || 'Active', d.hire_date || null, d.tenure_days ?? null, d.term_date || null, d.notes || '']
        );
        driversInserted++;
      }
    }

    let trucksInserted = 0;
    let trucksUpdated = 0;
    for (const t of trucks) {
      const unit = (t.unit || '').trim();
      if (!unit) continue;

      const existing = await client.query('SELECT id FROM trucks WHERE lower(unit) = lower($1) LIMIT 1', [unit]);

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE trucks
           SET company = $1, status = $2, status_date = $3, notes = $4, assigned_driver = $5, updated_at = now()
           WHERE id = $6`,
          [t.company || '', t.status || 'Active', t.status_date || null, t.notes || '', t.assigned_driver || '', existing.rows[0].id]
        );
        trucksUpdated++;
      } else {
        await client.query(
          `INSERT INTO trucks (unit, company, status, status_date, notes, assigned_driver)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [unit, t.company || '', t.status || 'Active', t.status_date || null, t.notes || '', t.assigned_driver || '']
        );
        trucksInserted++;
      }
    }

    await client.query('COMMIT');
    await sendJson(res, 200, {
      ok: true,
      drivers: { inserted: driversInserted, updated: driversUpdated },
      trucks: { inserted: trucksInserted, updated: trucksUpdated }
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('rollback failed', rollbackErr);
      }
    }
    await sendError(res, 500, err);
  } finally {
    if (client) client.release();
  }
}
