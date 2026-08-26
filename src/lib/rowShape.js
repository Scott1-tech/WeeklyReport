// FleetPulseDashboard (src/components/FleetPulseDashboard.jsx) was built against a
// spreadsheet-shaped data source: an array of `{ index_, row }` envelopes where
// `row` is a fixed-width array and specific column indices hold specific fields
// (see DRIVER_COLS / TRUCK_COLS inside that component). We kept that component
// untouched and instead translate our real driver/truck database records into
// that same shape here, so the dashboard's rendering and CRUD logic never had to
// change when the storage backend moved from a spreadsheet to Postgres.

export const ROW_WIDTH = 60;

export const DRIVER_COLS = {
  NAME: 0,
  COMPANY: 1,
  STATUS: 2,
  HIRE_DATE: 3,
  TENURE_DAYS: 4,
  TERM_DATE: 5,
  NOTES: 6
};

export const TRUCK_COLS = {
  UNIT: 7,
  COMPANY: 8,
  STATUS: 9,
  STATUS_DATE: 10,
  NOTES: 11,
  ASSIGNED_DRIVER: 12
};

const DRIVER_COL_SET = new Set(Object.values(DRIVER_COLS));
const TRUCK_COL_SET = new Set(Object.values(TRUCK_COLS));

const DRIVER_FIELD_BY_COL = {
  [DRIVER_COLS.NAME]: 'name',
  [DRIVER_COLS.COMPANY]: 'company',
  [DRIVER_COLS.STATUS]: 'status',
  [DRIVER_COLS.HIRE_DATE]: 'hire_date',
  [DRIVER_COLS.TENURE_DAYS]: 'tenure_days',
  [DRIVER_COLS.TERM_DATE]: 'term_date',
  [DRIVER_COLS.NOTES]: 'notes'
};

const TRUCK_FIELD_BY_COL = {
  [TRUCK_COLS.UNIT]: 'unit',
  [TRUCK_COLS.COMPANY]: 'company',
  [TRUCK_COLS.STATUS]: 'status',
  [TRUCK_COLS.STATUS_DATE]: 'status_date',
  [TRUCK_COLS.NOTES]: 'notes',
  [TRUCK_COLS.ASSIGNED_DRIVER]: 'assigned_driver'
};

// Fields backed by a typed (non-text) Postgres column: clearing these must send
// SQL NULL, not '', or the write fails type coercion (or silently corrupts a
// date/number column with an empty string).
const NULLABLE_TYPED_FIELDS = new Set(['hire_date', 'term_date', 'status_date', 'tenure_days']);

// The dashboard's own "add at the top, shift everything else down one slot"
// logic (see handleSaveDriver/handleSaveTruck) assumes drivers and trucks
// share ONE row-number space — exactly like the original spreadsheet, where
// a single physical row could carry driver columns (A-G), truck columns
// (H-M), both, or neither, and "row 6" means the same thing for both. Pairing
// driver[i] and truck[i] under the same index_ here reproduces that, so both
// entity types' shift logic lands on the row numbers it expects instead of
// on a row that turns out to belong to the other entity type.
//
// A few leading blank rows mirror the real sheet's title rows, so the
// dashboard's own header-row auto-detection (which falls back to skipping
// index 2 when it can't find literal "Driver Name" / "Unit" header text)
// never skips real data.
const LEADING_BLANK_ROWS = 5;

// Build the flat {index_, row} envelope array the dashboard expects, from real
// driver/truck rows. indexMap tracks, per index_, which driver and/or truck
// record (if any) lives there — a shared index can hold one of each, exactly
// like a spreadsheet row can.
export function driversAndTrucksToRows(drivers, trucks) {
  const rows = [];
  const indexMap = new Map(); // index_ -> { driver?: { id }, truck?: { id } }

  for (let i = 0; i < LEADING_BLANK_ROWS; i++) {
    rows.push({ index_: i, row: new Array(ROW_WIDTH).fill(null) });
  }

  const count = Math.max(drivers.length, trucks.length);
  for (let i = 0; i < count; i++) {
    const index_ = LEADING_BLANK_ROWS + i;
    const row = new Array(ROW_WIDTH).fill(null);
    const entry = {};

    const d = drivers[i];
    if (d) {
      row[DRIVER_COLS.NAME] = d.name ?? '';
      row[DRIVER_COLS.COMPANY] = d.company ?? '';
      row[DRIVER_COLS.STATUS] = d.status ?? '';
      row[DRIVER_COLS.HIRE_DATE] = d.hire_date ?? '';
      row[DRIVER_COLS.TENURE_DAYS] = d.tenure_days ?? '';
      row[DRIVER_COLS.TERM_DATE] = d.term_date ?? '';
      row[DRIVER_COLS.NOTES] = d.notes ?? '';
      entry.driver = { id: d.id };
    }

    const t = trucks[i];
    if (t) {
      row[TRUCK_COLS.UNIT] = t.unit ?? '';
      row[TRUCK_COLS.COMPANY] = t.company ?? '';
      row[TRUCK_COLS.STATUS] = t.status ?? '';
      row[TRUCK_COLS.STATUS_DATE] = t.status_date ?? '';
      row[TRUCK_COLS.NOTES] = t.notes ?? '';
      row[TRUCK_COLS.ASSIGNED_DRIVER] = t.assigned_driver ?? '';
      entry.truck = { id: t.id };
    }

    rows.push({ index_, row });
    if (entry.driver || entry.truck) indexMap.set(index_, entry);
  }

  return { rows, indexMap };
}

// A sparse row array (as the dashboard builds it) becomes an object patch:
// only defined entries survive, so 'skip this column' vs 'clear this column'
// (null) stays distinguishable once it crosses JSON (JSON.stringify turns an
// `undefined` array element into `null`, which would otherwise collide with
// an intentional clear).
export function sparseRowToPatch(row) {
  const patch = {};
  if (Array.isArray(row)) {
    row.forEach((v, i) => {
      if (v !== undefined) patch[i] = v;
    });
  }
  return patch;
}

// Decide whether a column-indexed patch touches driver fields, truck fields,
// or neither (weekly/report columns >= 13, which the live dashboard
// recomputes on every load and doesn't need persisted).
export function classifyPatch(patch) {
  const cols = Object.keys(patch).map(Number);
  const touchesDriver = cols.some((c) => DRIVER_COL_SET.has(c));
  const touchesTruck = cols.some((c) => TRUCK_COL_SET.has(c));
  if (touchesDriver && !touchesTruck) return 'driver';
  if (touchesTruck && !touchesDriver) return 'truck';
  return null;
}

function toFieldPatch(patch, fieldByCol) {
  const fields = {};
  Object.entries(patch).forEach(([colStr, value]) => {
    const field = fieldByCol[Number(colStr)];
    if (!field) return;
    if (value === null) {
      fields[field] = NULLABLE_TYPED_FIELDS.has(field) ? null : '';
    } else if (field === 'tenure_days') {
      const n = Number(value);
      fields[field] = Number.isFinite(n) ? n : null;
    } else {
      fields[field] = value;
    }
  });
  return fields;
}

export function driverPatchToFields(patch) {
  return toFieldPatch(patch, DRIVER_FIELD_BY_COL);
}

export function truckPatchToFields(patch) {
  return toFieldPatch(patch, TRUCK_FIELD_BY_COL);
}

export function hasMeaningfulDriverFields(fields) {
  return Boolean(fields.name);
}

export function hasMeaningfulTruckFields(fields) {
  return Boolean(fields.unit);
}
