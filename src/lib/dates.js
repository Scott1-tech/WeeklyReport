// Date helpers for the FleetPulse weekly schedule.
//
// The dashboard logic keys everything off "today" (which week is the
// current anchor, which drivers count as active, which preset date-range
// filters mean). The component this was ported from hardcoded that as the
// literal string '2026-08-24'. That's fine for a single demo render, but
// this app is meant to run continuously with live weekly updates, so
// "today" has to track the real calendar date or every calculation goes
// stale the day after deploy. These helpers are the only behavioral change
// made to the original dashboard code.

// Anchor date for "Week 1" of the 52-week reporting schedule (a Monday).
// Keep this fixed — it defines when weekly tracking began, independent of
// whatever today happens to be.
export const SCHEDULE_START = '2026-06-01';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toDateStr(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getTodayStr() {
  return toDateStr(new Date());
}

export function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toDateStr(dt);
}

// 1-based week number within the schedule, clamped to [1, 52].
export function weekNumberFor(dateStr, scheduleStart = SCHEDULE_START) {
  const [sy, sm, sd] = scheduleStart.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const diffDays = Math.floor((target.getTime() - start.getTime()) / 86400000);
  const weekNum = Math.floor(diffDays / 7) + 1;
  return Math.min(52, Math.max(1, weekNum));
}
