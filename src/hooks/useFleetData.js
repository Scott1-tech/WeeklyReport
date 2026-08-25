import { useState, useEffect, useCallback, useRef } from 'react';
import {
  driversAndTrucksToRows,
  sparseRowToPatch,
  classifyPatch,
  driverPatchToFields,
  truckPatchToFields,
  hasMeaningfulDriverFields,
  hasMeaningfulTruckFields
} from '../lib/rowShape';

const POLL_INTERVAL_MS = 30000;
const WRITE_DEBOUNCE_MS = 250;

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${options?.method || 'GET'} ${url} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Wires the FleetPulseDashboard component (unchanged from its original
// spreadsheet-shaped design) up to the real drivers/trucks tables in Postgres.
// It fetches both tables, reshapes them into the {index_, row} envelope array
// the dashboard expects, and translates the dashboard's updateItem/insertItem/
// deleteItem calls back into REST writes against /api/drivers and /api/trucks.
//
// Writes made in the same synchronous burst (the dashboard's own "shift rows
// down" logic when adding a driver/truck at the top of the list fires several
// updateItem/insertItem calls back to back) are queued and resolved against a
// single stable index_->id snapshot, then flushed together — never against a
// snapshot that changed mid-burst. That is what keeps the shift logic correct
// against real database rows instead of spreadsheet cells (see the comment in
// src/lib/rowShape.js for the full reasoning).
export function useFleetData() {
  const [data, setData] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);

  const indexMapRef = useRef(new Map());
  const fetchingRef = useRef(false);
  const queueRef = useRef([]);
  const flushTimerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [driversRes, trucksRes] = await Promise.all([
        fetchJson('/api/drivers'),
        fetchJson('/api/trucks')
      ]);
      const { rows, indexMap } = driversAndTrucksToRows(driversRes.drivers || [], trucksRes.trucks || []);
      indexMapRef.current = indexMap;
      setData(rows);
      setStatus('ready');
      setError(null);
      setLastSynced(new Date());
    } catch (err) {
      console.error('[useFleetData] refresh failed', err);
      setError(err.message);
      setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const flushQueue = useCallback(async () => {
    const ops = queueRef.current;
    queueRef.current = [];
    if (ops.length === 0) return;

    const indexMap = indexMapRef.current;
    const requests = [];

    for (const op of ops) {
      if (op.kind === 'delete') {
        const entity = indexMap.get(op.index_);
        if (!entity) continue;
        requests.push(fetchJson(`/api/${entity.type}s/${entity.id}`, { method: 'DELETE' }));
        continue;
      }

      // update / insert (insert with an index_ already present is an upsert —
      // see the module comment above and src/lib/rowShape.js).
      const entityType = classifyPatch(op.patch);
      if (!entityType) continue; // weekly/report columns — the dashboard recomputes these live, nothing to persist

      const existing = op.index_ !== undefined && op.index_ !== null ? indexMap.get(op.index_) : null;

      if (existing && existing.type === entityType) {
        const fields = entityType === 'driver' ? driverPatchToFields(op.patch) : truckPatchToFields(op.patch);
        if (Object.keys(fields).length === 0) continue;
        requests.push(
          fetchJson(`/api/${entityType}s/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
          })
        );
      } else if (op.kind === 'insert') {
        const fields = entityType === 'driver' ? driverPatchToFields(op.patch) : truckPatchToFields(op.patch);
        const meaningful = entityType === 'driver' ? hasMeaningfulDriverFields(fields) : hasMeaningfulTruckFields(fields);
        if (!meaningful) continue; // blank buffer rows etc. — a real database doesn't need row padding
        requests.push(
          fetchJson(`/api/${entityType}s`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
          })
        );
      }
      // update targeting an index_ with no matching entity: nothing to do safely, skip.
    }

    if (requests.length === 0) return;

    try {
      await Promise.all(requests);
    } catch (err) {
      console.error('[useFleetData] write failed', err);
      setError(err.message);
    } finally {
      await refresh();
    }
  }, [refresh]);

  const enqueue = useCallback(
    (op) => {
      queueRef.current.push(op);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushQueue();
      }, WRITE_DEBOUNCE_MS);
    },
    [flushQueue]
  );

  const updateItem = useCallback(
    (index_, row) => {
      enqueue({ kind: 'update', index_, patch: sparseRowToPatch(row) });
    },
    [enqueue]
  );

  const insertItem = useCallback(
    (index_, row) => {
      enqueue({ kind: 'insert', index_, patch: sparseRowToPatch(row) });
    },
    [enqueue]
  );

  const deleteItem = useCallback(
    (index_) => {
      enqueue({ kind: 'delete', index_ });
    },
    [enqueue]
  );

  // Not used by FleetPulseDashboard today, kept so the prop contract is complete.
  const moveItem = useCallback(() => {
    console.warn('[useFleetData] moveItem is not implemented — row order is derived from the database, not stored.');
  }, []);

  const followLink = useCallback((url) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  return { data, status, error, lastSynced, refresh, updateItem, insertItem, deleteItem, moveItem, followLink };
}
