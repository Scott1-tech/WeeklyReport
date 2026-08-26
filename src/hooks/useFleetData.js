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
      // allSettled, not all: if one endpoint is having a bad moment, that
      // shouldn't blank out data the other endpoint successfully returned.
      const [driversResult, trucksResult] = await Promise.allSettled([
        fetchJson('/api/drivers'),
        fetchJson('/api/trucks')
      ]);

      const errors = [];
      if (driversResult.status === 'rejected') errors.push(driversResult.reason.message);
      if (trucksResult.status === 'rejected') errors.push(trucksResult.reason.message);

      const drivers = driversResult.status === 'fulfilled' ? driversResult.value.drivers || [] : [];
      const trucks = trucksResult.status === 'fulfilled' ? trucksResult.value.trucks || [] : [];
      const { rows, indexMap } = driversAndTrucksToRows(drivers, trucks);
      indexMapRef.current = indexMap;
      setData(rows);

      if (errors.length > 0) {
        setStatus('error');
        setError(errors.join(' | '));
      } else {
        setStatus('ready');
        setError(null);
        setLastSynced(new Date());
      }
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
        const entry = op.index_ !== undefined && op.index_ !== null ? indexMap.get(op.index_) : null;
        if (!entry) continue;
        // A shared index_ can hold a driver AND a truck at once (see
        // src/lib/rowShape.js), so a bare index alone can't say which one to
        // delete. handleDeleteItem passes an entityType hint derived from
        // which tab the delete was initiated from; without one, fall back to
        // whichever single type is actually present.
        const type = op.entityType && entry[op.entityType] ? op.entityType : entry.driver ? 'driver' : entry.truck ? 'truck' : null;
        if (!type) continue;
        requests.push(fetchJson(`/api/${type}s/${entry[type].id}`, { method: 'DELETE' }));
        continue;
      }

      // update / insert — treated identically here. The dashboard's own
      // "shift rows down" logic (handleSaveDriver/handleSaveTruck) issues a
      // mix of both while it doesn't actually know whether a given target
      // row already holds an entity of this type; what matters is only
      // whether OUR index_->entity map has one there right now.
      const entityType = classifyPatch(op.patch);
      if (!entityType) continue; // weekly/report columns — the dashboard recomputes these live, nothing to persist

      const entry = op.index_ !== undefined && op.index_ !== null ? indexMap.get(op.index_) : null;
      const existing = entry?.[entityType];

      if (existing) {
        const fields = entityType === 'driver' ? driverPatchToFields(op.patch) : truckPatchToFields(op.patch);
        if (Object.keys(fields).length === 0) continue;
        requests.push(
          fetchJson(`/api/${entityType}s/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
          })
        );
      } else {
        // No entity of this type at this index — whether the slot is truly
        // blank or just occupied by the OTHER entity type, writing these
        // columns there means "this row now has a driver/truck," matching
        // what it would mean on the original spreadsheet. That holds
        // regardless of whether the dashboard labeled the call update or
        // insert — it doesn't reliably know which one applies either.
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
    (index_, entityType) => {
      enqueue({ kind: 'delete', index_, entityType });
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
