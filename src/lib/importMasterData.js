import * as XLSX from 'xlsx';
import { getTodayStr } from './dates';
import { standardizeStatus, formatSpreadsheetDate, getCompanyCode, calculateSafeTenureDays } from './fleetData';

// Same fixed layout FleetPulseDashboard.jsx reads from: driver fields in
// columns A-G (0-6), truck fields in columns H-M (7-12). This mirrors that
// component's own "SECTION 4.1: ROSTER EXTRACTION" logic exactly (including
// the header-row detection and the known-duplicate handling for repeat
// "Mark" / "Bilal Malik" / "John" / "John McCollins" rows some exports
// contain) so an imported file produces the same roster the dashboard would
// have shown if it were still reading the spreadsheet directly.
const DRIVER_COLS = { NAME: 0, COMPANY: 1, STATUS: 2, HIRE_DATE: 3, TENURE_DAYS: 4, TERM_DATE: 5, NOTES: 6 };
const TRUCK_COLS = { UNIT: 7, COMPANY: 8, STATUS: 9, STATUS_DATE: 10, NOTES: 11, ASSIGNED_DRIVER: 12 };

// Reads a browser File (.xlsx) and returns its "Master Data" sheet as an
// array of row-arrays (falls back to the first sheet if none is named
// "Master Data"), with real Date objects for date cells.
export async function readMasterDataSheet(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.includes('Master Data') ? 'Master Data' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  return { sheetName, aoa };
}

function detectHeaderIndex(aoa) {
  for (let i = 0; i < Math.min(10, aoa.length); i++) {
    const r = aoa[i] || [];
    const col0 = String(r[0] || '').toLowerCase();
    const col7 = String(r[7] || '').toLowerCase();
    if (col0.includes('driver name') || col7.includes('unit')) {
      return i;
    }
  }
  return 2;
}

// Parses an array-of-rows (as returned by readMasterDataSheet) into driver
// and truck records ready to POST to /api/import.
export function parseMasterDataRows(aoa) {
  const headerIdx = detectHeaderIndex(aoa);
  const todayStr = getTodayStr();

  const drivers = [];
  const trucks = [];
  const seenDriverSignatures = new Set();
  let seenMark = false;
  let skippedUnrecognizedCompany = 0;

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;

    const dName = row[DRIVER_COLS.NAME];
    const dCompanyRaw = row[DRIVER_COLS.COMPANY];
    const dStatusRaw = row[DRIVER_COLS.STATUS];
    const dHireRaw = row[DRIVER_COLS.HIRE_DATE];
    const dTenureRaw = row[DRIVER_COLS.TENURE_DAYS];
    const dTermRaw = row[DRIVER_COLS.TERM_DATE];
    const dNotes = row[DRIVER_COLS.NOTES];

    if (dName || dCompanyRaw || dHireRaw || dTermRaw) {
      const hireDate = formatSpreadsheetDate(dHireRaw);
      const termDate = formatSpreadsheetDate(dTermRaw);
      const status = standardizeStatus(dStatusRaw);
      const companyCode = getCompanyCode(dCompanyRaw);

      if (!companyCode) {
        skippedUnrecognizedCompany++;
      } else {
        const cleanName = dName ? String(dName).trim() : '';

        if (cleanName.toLowerCase() === 'mark') {
          if (seenMark || i > 200) {
            // duplicate "Mark" row further down the sheet — keep only the first
          } else {
            seenMark = true;
            drivers.push(buildDriverRecord(cleanName, dCompanyRaw, status, hireDate, termDate, dTenureRaw, dNotes, todayStr));
          }
        } else {
          const isKnownDupeTarget = /^(bilal malik|john|john mccollins)$/i.test(cleanName);
          const signature = `${cleanName.toLowerCase()}|${companyCode}|${status}|${hireDate}|${termDate}`;

          if (isKnownDupeTarget && seenDriverSignatures.has(signature)) {
            // exact duplicate of a row already imported — skip
          } else {
            if (isKnownDupeTarget) seenDriverSignatures.add(signature);
            drivers.push(buildDriverRecord(cleanName, dCompanyRaw, status, hireDate, termDate, dTenureRaw, dNotes, todayStr));
          }
        }
      }
    }

    const tUnit = row[TRUCK_COLS.UNIT];
    const tCompanyRaw = row[TRUCK_COLS.COMPANY];
    const tStatusRaw = row[TRUCK_COLS.STATUS];
    const tStatusDateRaw = row[TRUCK_COLS.STATUS_DATE];
    const tNotes = row[TRUCK_COLS.NOTES];
    const tAssignedDriver = row[TRUCK_COLS.ASSIGNED_DRIVER];

    if (tUnit || tCompanyRaw || tStatusRaw || tNotes) {
      const companyCode = getCompanyCode(tCompanyRaw);
      if (companyCode) {
        trucks.push({
          unit: tUnit ? String(tUnit).trim() : '',
          company: tCompanyRaw ? String(tCompanyRaw).trim() : '',
          status: standardizeStatus(tStatusRaw),
          status_date: formatSpreadsheetDate(tStatusDateRaw) || null,
          notes: tNotes ? String(tNotes) : '',
          assigned_driver: tAssignedDriver ? String(tAssignedDriver).trim() : ''
        });
      }
    }
  }

  return {
    drivers,
    trucks,
    stats: {
      headerRow: headerIdx + 1, // 1-based, for a human-readable summary
      rowsScanned: Math.max(0, aoa.length - headerIdx - 1),
      driversFound: drivers.length,
      trucksFound: trucks.length,
      skippedUnrecognizedCompany
    }
  };
}

function buildDriverRecord(name, companyRaw, status, hireDate, termDate, tenureRaw, notes, todayStr) {
  const safeTenure = calculateSafeTenureDays(hireDate, termDate, status, todayStr);
  const tenure_days = safeTenure !== null ? safeTenure : (typeof tenureRaw === 'number' ? tenureRaw : null);
  return {
    name,
    company: companyRaw ? String(companyRaw).trim() : '',
    status,
    hire_date: hireDate || null,
    tenure_days,
    term_date: termDate && termDate !== '9999-12-31' ? termDate : null,
    notes: notes ? String(notes) : ''
  };
}
