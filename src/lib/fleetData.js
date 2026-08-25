// Shared parsing/formatting helpers for the fleet roster. Used by both
// FleetPulseDashboard.jsx (rendering) and src/lib/importMasterData.js
// (importing a "Master Data"-shaped worksheet) so the two never drift apart.

export const COMPANIES = [
  { code: 'PTG', name: 'Premier Trucking Group Inc', color: '#2E7BF6', textColor: '#1d4ed8', shortName: 'Premier' },
  { code: 'OSY', name: 'OSY Group Inc', color: '#F2542D', textColor: '#c2410c', shortName: 'OSY' },
  { code: 'CFT', name: 'Cargo Freight Trucking Inc', color: '#11B981', textColor: '#008058', shortName: 'Cargo' },
  { code: 'RMR', name: 'RMR Transportation LLC', color: '#F5A524', textColor: '#9e6600', shortName: 'RMR' },
  { code: 'G1', name: 'Grand One LLC', color: '#4C3FBF', textColor: '#4338ca', shortName: 'Grand One' }
];

export const COMPANY_MAP = COMPANIES.reduce((acc, c) => ({ ...acc, [c.code]: c }), {});

/**
 * Standardizes status strings
 */
export function standardizeStatus(s) {
  if (!s || typeof s !== 'string') return 'Active';
  const lower = s.toLowerCase().trim();
  if (lower.match(/inactive|term|quit|fired|removed|idle|out of service|cancelled/)) {
    return 'Inactive';
  }
  if (lower.match(/hiring|onboard|applicant|pending|contract sent|drug test/)) {
    return 'Hiring / Onboarding';
  }
  if (lower.match(/active|operational|in_transit|available|yard|shop|home|reserved/)) {
    return 'Active';
  }
  return s;
}

/**
 * Formats spreadsheet dates timezone-safely into 'YYYY-MM-DD'
 */
export function formatSpreadsheetDate(v) {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s === '9999-12-31' || s === '2958465') return '9999-12-31';
  if (s === '1900-01-01') return '1900-01-01';
  if (s.includes('#REF!') || s.includes('#VALUE!') || s.includes('#N/A') || s.includes('#DIV/0!')) return '';

  // Excel serial numbers
  if (typeof v === 'number' || (!isNaN(v) && !s.includes('-') && !s.includes('/'))) {
    const num = Number(v);
    if (num >= 30000 && num <= 60000) {
      const utcDays = num - 25569;
      const date = new Date(utcDays * 86400 * 1000);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // Native Date object
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // String YYYY-MM-DD
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  // String MM/DD/YYYY
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  return s;
}

/**
 * SINGLE definition used everywhere for company string matching
 */
export function matchesCompany(str, code) {
  if (!str) return false;
  const s = String(str).toLowerCase().trim();

  switch (code) {
    case 'PTG':
      return /premier|ptg/i.test(s);
    case 'OSY':
      return /osy/i.test(s);
    case 'CFT':
      return /cargo|cft/i.test(s);
    case 'RMR':
      return /rmr/i.test(s);
    case 'G1':
      return /grand|g1/i.test(s);
    default:
      return false;
  }
}

/**
 * Helper to match carrier code
 */
export function getCompanyCode(carrierName) {
  for (const c of COMPANIES) {
    if (matchesCompany(carrierName, c.code)) {
      return c.code;
    }
  }
  return null;
}

/**
 * Safe per-record tenure calculation: hire date to today for active, hire date to term date for inactive
 */
export function calculateSafeTenureDays(hireDateStr, termDateStr, status, asOfDateStr) {
  if (!hireDateStr || hireDateStr === '1900-01-01' || hireDateStr.includes('#')) return null;
  const [hy, hm, hd] = hireDateStr.split('-').map(Number);
  if (!hy || !hm || !hd) return null;
  const hDate = new Date(Date.UTC(hy, hm - 1, hd));
  const endStr = (status === 'Inactive' && termDateStr && termDateStr !== '9999-12-31') ? termDateStr : asOfDateStr;
  const [ey, em, ed] = endStr.split('-').map(Number);
  if (!ey || !em || !ed) return null;
  const eDate = new Date(Date.UTC(ey, em - 1, ed));
  const diff = Math.floor((eDate.getTime() - hDate.getTime()) / (86400 * 1000));
  return Math.max(0, isNaN(diff) ? 0 : diff);
}

/**
 * Helper to display human-friendly dates
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr || dateStr === '9999-12-31' || dateStr === '1900-01-01') return '—';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
  } catch (e) {
    return dateStr;
  }
}
