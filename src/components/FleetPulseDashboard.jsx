import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Truck,
  ShieldAlert,
  Calendar,
  Layers,
  Settings,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  BarChart3,
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Sparkles
} from 'lucide-react';
import { SCHEDULE_START, getTodayStr, addDaysStr, weekNumberFor } from '../lib/dates';
import {
  COMPANIES,
  COMPANY_MAP,
  standardizeStatus,
  formatSpreadsheetDate,
  matchesCompany,
  getCompanyCode,
  calculateSafeTenureDays,
  formatDisplayDate
} from '../lib/fleetData';

/* ==============================================================================
 * SECTION 1: FIXED LAYOUT CONSTANTS & MAPPINGS (No header-text searching)
 * ============================================================================== */

// Driver Data: 0–6 (A–G)
const DRIVER_COLS = {
  NAME: 0,
  COMPANY: 1,
  STATUS: 2,
  HIRE_DATE: 3,
  TENURE_DAYS: 4,
  TERM_DATE: 5,
  NOTES: 6
};

// Truck Data: 7–12 (H–M)
const TRUCK_COLS = {
  UNIT: 7,
  COMPANY: 8,
  STATUS: 9,
  STATUS_DATE: 10,
  NOTES: 11,
  ASSIGNED_DRIVER: 12
};

// Weekly Carrier Columns
const WEEKLY_TAB_COLS = {
  PTG: { week: 13, active: 14, hired: 15, term: 16, change: 17 },
  OSY: { week: 19, active: 20, hired: 21, term: 22, change: 23 },
  CFT: { week: 25, active: 26, hired: 27, term: 28, change: 29 },
  RMR: { week: 40, active: 41, hired: 42, term: 43, change: 44 },
  G1:  { week: 46, active: 47, hired: 48, term: 49, change: 50 }
};

// Overall Weekly: 31–38 (AF–AM)
const OVERALL_COLS = {
  week: 31,
  active: 32,
  hired: 33,
  term: 34,
  change: 35,
  trucks: 36,
  start: 37,
  end: 38
};

// Truck Report: 51–58 (AZ–BG)
const TRUCK_REPORT_COLS = {
  week: 51,
  company: 52,
  trucks: 53,
  added: 54,
  removed: 55,
  change: 56,
  start: 57,
  end: 58
};

const ROW_WIDTH = 60;

/* ==============================================================================
 * MAIN COMPONENT: FleetPulseDashboard
 * ============================================================================== */

function FleetPulseDashboard({
  data = [],
  updateItem = () => {},
  deleteItem = () => {},
  insertItem = () => {},
  moveItem = () => {},
  followLink = () => {}
}) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('dashboard');

  // Reporting bar controls
  const [selectedWeekNum, setSelectedWeekNum] = useState(() => weekNumberFor(getTodayStr()));
  const [periodPreset, setPeriodPreset] = useState('1W'); // '1W', '4W', '8W', '12W', '26W', '52W', 'YTD', 'custom'
  const [customStartDate, setCustomStartDate] = useState(SCHEDULE_START);
  const [customEndDate, setCustomEndDate] = useState(() => getTodayStr());
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState(['PTG', 'OSY', 'CFT', 'RMR', 'G1']);

  // Chart configuration controls
  const [chartScope, setChartScope] = useState('trend'); // 'trend' | 'sideBySide' | 'growth'
  const [chartMetricType, setChartMetricType] = useState('drivers'); // 'drivers' | 'trucks' | 'both'
  const [growthMetric, setGrowthMetric] = useState('active'); // 'active' | 'trucks' | 'hired' | 'terminated' | 'change'
  const [growthCols, setGrowthCols] = useState(2);
  const [chartStylePreset, setChartStylePreset] = useState('original'); // 'original' | 'rounded' | 'zigzag' | 'rainbow'
  const [turnoverCompany, setTurnoverCompany] = useState('ALL'); // 'ALL' | company code
  const [coverageChartMode, setCoverageChartMode] = useState('coveredEmpty'); // 'coveredEmpty' | 'threeLine'
  const [distributionView, setDistributionView] = useState('active'); // 'active' | 'hired' | 'terminated'
  const [distributionWeekNum, setDistributionWeekNum] = useState(() => weekNumberFor(getTodayStr()));
  const [distributionPeriodPreset, setDistributionPeriodPreset] = useState('1W'); // '1W' | '4W' | '12W' | 'YTD'
  const [expandedCarrierList, setExpandedCarrierList] = useState({});
  const [tenureWindowDays, setTenureWindowDays] = useState(90);
  const [isTableViewOpen, setIsTableViewOpen] = useState(false);

  // Persistent visual KPI show/hide state
  const [hiddenKpis, setHiddenKpis] = useState(() => {
    try {
      const saved = sessionStorage.getItem('fleetpulse_hidden_kpis');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const toggleKpiVisibility = (key) => {
    const updated = { ...hiddenKpis, [key]: !hiddenKpis[key] };
    setHiddenKpis(updated);
    try {
      sessionStorage.setItem('fleetpulse_hidden_kpis', JSON.stringify(updated));
    } catch (e) {}
  };

  const showAllKpisInRow = (keys) => {
    const updated = { ...hiddenKpis };
    keys.forEach((k) => {
      updated[k] = false;
    });
    setHiddenKpis(updated);
    try {
      sessionStorage.setItem('fleetpulse_hidden_kpis', JSON.stringify(updated));
    } catch (e) {}
  };

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Modal dialog state
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: null,
    item: null,
    index_: null
  });

  // Reference today date: computed live so weekly math never goes stale
  const TODAY_STR = getTodayStr();
  /* ==============================================================================
   * SECTION 4.1: ROSTER EXTRACTION (Drivers & Trucks)
   * ============================================================================== */

  const { driversList, trucksList, headerRowIndex } = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return { driversList: [], trucksList: [], headerRowIndex: 2 };
    }

    let detectedHeaderIdx = 2;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const r = data[i]?.row || [];
      const col0 = String(r[0] || '').toLowerCase();
      const col7 = String(r[7] || '').toLowerCase();
      if (col0.includes('driver name') || col7.includes('unit')) {
        detectedHeaderIdx = i;
        break;
      }
    }

    const dList = [];
    const tList = [];
    const seenDriverSignatures = new Set();
    let seenMark = false;

    for (let i = detectedHeaderIdx + 1; i < data.length; i++) {
      const envelope = data[i];
      if (!envelope || !Array.isArray(envelope.row)) continue;
      const row = envelope.row;
      const idx = envelope.index_;

      // Driver Columns 0..6
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

        if (companyCode) {
          const cleanName = dName ? String(dName).trim() : '';
          // Safe per-record tenure formula (Fixes #REF! error in Column E)
          const safeTenure = calculateSafeTenureDays(hireDate, termDate, status, TODAY_STR);
          const tenureDays = safeTenure !== null ? safeTenure : (typeof dTenureRaw === 'number' ? dTenureRaw : parseFloat(dTenureRaw) || 0);

          // Preserve Mark at Row 120 (index 117) and remove/ignore duplicate Mark at bottom (Row 2006)
          if (cleanName.toLowerCase() === 'mark') {
            if (seenMark || idx > 200) {
              // Duplicate Mark at the bottom - do not add to active roster
              continue;
            }
            seenMark = true;
          }

          // Exact duplicate driver handling for Bilal Malik, JOHN, John McCollins, and Mark
          const isKnownDupeTarget = /^(bilal malik|john|john mccollins)$/i.test(cleanName);
          const exactSignature = `${cleanName.toLowerCase()}|${companyCode}|${status}|${hireDate}|${termDate}`;

          if (isKnownDupeTarget && seenDriverSignatures.has(exactSignature)) {
            // Keep one verified copy of exact duplicates; ignore redundant clones
            continue;
          }
          if (isKnownDupeTarget) {
            seenDriverSignatures.add(exactSignature);
          }

          dList.push({
            index_: idx,
            name: cleanName,
            companyRaw: dCompanyRaw ? String(dCompanyRaw).trim() : '',
            companyCode,
            status,
            rawStatus: dStatusRaw || '',
            hireDate,
            termDate,
            tenureDaysSheet: tenureDays,
            notes: dNotes ? String(dNotes) : '',
            rowIndexInSheet: idx + 1
          });
        }
      }

      // Truck Columns 7..12
      const tUnit = row[TRUCK_COLS.UNIT];
      const tCompanyRaw = row[TRUCK_COLS.COMPANY];
      const tStatusRaw = row[TRUCK_COLS.STATUS];
      const tStatusDateRaw = row[TRUCK_COLS.STATUS_DATE];
      const tNotes = row[TRUCK_COLS.NOTES];
      const tAssignedDriver = row[TRUCK_COLS.ASSIGNED_DRIVER];

      if (tUnit || tCompanyRaw || tStatusRaw || tNotes) {
        const statusDate = formatSpreadsheetDate(tStatusDateRaw);
        const status = standardizeStatus(tStatusRaw);
        const companyCode = getCompanyCode(tCompanyRaw);

        if (companyCode) {
          tList.push({
            index_: idx,
            unit: tUnit ? String(tUnit).trim() : '',
            companyRaw: tCompanyRaw ? String(tCompanyRaw).trim() : '',
            companyCode,
            status,
            rawStatus: tStatusRaw || '',
            statusDate,
            notes: tNotes ? String(tNotes) : '',
            assignedDriver: tAssignedDriver ? String(tAssignedDriver).trim() : '',
            rowIndexInSheet: idx + 1
          });
        }
      }
    }

    return { driversList: dList, trucksList: tList, headerRowIndex: detectedHeaderIdx };
  }, [data]);

  // List of active drivers with missing hire dates (strictly flagged, never fabricated)
  const missingHireDateDrivers = useMemo(() => {
    return driversList.filter((d) => d.status === 'Active' && (!d.hireDate || d.hireDate === ''));
  }, [driversList]);

  // Capacity monitor: Auto-expand 1,000 blank rows whenever fewer than 100 rows remain
  useEffect(() => {
    if (data.length > 0 && data.length < 3000) {
      // Add 1,000 blank rows buffer if fewer than 100 blank rows remain at bottom
      const currentBlankBuffer = data.filter((d, i) => i > 200 && !d.row?.some((c) => c !== null && c !== '')).length;
      if (currentBlankBuffer < 100) {
        const blankRow = new Array(ROW_WIDTH).fill(null);
        insertItem(undefined, blankRow);
      }
    }
  }, [data, insertItem]);

  /* ==============================================================================
   * SECTION 4.2: 52-WEEK SCHEDULE & METRIC COMPUTATION
   * ============================================================================== */

  const { scheduleWeeks, currentAnchorWeek, auditIssues } = useMemo(() => {
    const weeks = [];
    const [by, bm, bd] = SCHEDULE_START.split('-').map(Number);
    const baseDate = new Date(Date.UTC(by, bm - 1, bd));

    for (let w = 1; w <= 52; w++) {
      const startD = new Date(baseDate.getTime() + (w - 1) * 7 * 86400 * 1000);
      const endD = new Date(startD.getTime() + 6 * 86400 * 1000);

      const y1 = startD.getUTCFullYear();
      const m1 = String(startD.getUTCMonth() + 1).padStart(2, '0');
      const d1 = String(startD.getUTCDate()).padStart(2, '0');
      const startDate = `${y1}-${m1}-${d1}`;

      const y2 = endD.getUTCFullYear();
      const m2 = String(endD.getUTCMonth() + 1).padStart(2, '0');
      const d2 = String(endD.getUTCDate()).padStart(2, '0');
      const endDate = `${y2}-${m2}-${d2}`;

      const weekLabel = `Week ${w}`;
      const status = startDate > TODAY_STR ? 'Future' : endDate < TODAY_STR ? 'Final' : 'In Progress';
      const isPopulated = startDate <= TODAY_STR;

      const weekObj = {
        weekNum: w,
        weekLabel,
        startDate,
        endDate,
        status,
        isPopulated,
        monthName: startD.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
        byCompany: {},
        overall: {}
      };

      if (!isPopulated) {
        COMPANIES.forEach((c) => {
          weekObj.byCompany[c.code] = {
            activeDrivers: null,
            hired: null,
            terminated: null,
            change: null,
            activeTrucks: null,
            addedTrucks: null,
            removedTrucks: null,
            truckChange: null,
            covered: null,
            empty: null,
            uncovered: null,
            gap: null
          };
        });
        weekObj.overall = {
          activeDrivers: null,
          hired: null,
          terminated: null,
          change: null,
          activeTrucks: null,
          addedTrucks: null,
          removedTrucks: null,
          truckChange: null,
          covered: null,
          empty: null,
          uncovered: null,
          gap: null
        };
        weeks.push(weekObj);
        continue;
      }

      let sumActiveDrivers = 0;
      let sumHired = 0;
      let sumTerm = 0;
      let sumActiveTrucks = 0;
      let sumAddedTrucks = 0;
      let sumRemovedTrucks = 0;

      COMPANIES.forEach((c) => {
        const code = c.code;

        // Active drivers formula (Missing-date active drivers count as active)
        const compDrivers = driversList.filter((d) => matchesCompany(d.companyRaw, code));
        const activeDrv = compDrivers.filter((d) => {
          const hireCond = !d.hireDate || d.hireDate === '' || d.hireDate === '1900-01-01' || d.hireDate <= endDate;
          const termCond = !d.termDate || d.termDate === '9999-12-31' || d.termDate > endDate;
          return hireCond && termCond;
        }).length;

        // Hired formula (Missing-date drivers MUST NOT count as weekly hires until real date entered)
        const hiredDrv = compDrivers.filter((d) => {
          return d.hireDate && d.hireDate !== '' && d.hireDate !== '1900-01-01' && d.hireDate >= startDate && d.hireDate <= endDate;
        }).length;

        // Terminated formula
        const termDrv = compDrivers.filter((d) => {
          return d.termDate && d.termDate !== '9999-12-31' && d.termDate >= startDate && d.termDate <= endDate;
        }).length;

        const netChangeDrv = hiredDrv - termDrv;

        // Active trucks formula
        const compTrucks = trucksList.filter((t) => matchesCompany(t.companyRaw, code));
        const actTrk = compTrucks.filter((t) => {
          return t.status === 'Active' && (!t.statusDate || t.statusDate <= endDate);
        }).length;

        // Added trucks formula
        const addTrk = compTrucks.filter((t) => {
          return t.status === 'Active' && t.statusDate && t.statusDate >= startDate && t.statusDate <= endDate;
        }).length;

        // Removed trucks formula
        const remTrk = compTrucks.filter((t) => {
          return t.status === 'Inactive' && t.statusDate && t.statusDate >= startDate && t.statusDate <= endDate;
        }).length;

        const netChangeTrk = addTrk - remTrk;

        // Exact MIN/MAX coverage
        const covered = Math.min(activeDrv, actTrk);
        const empty = Math.max(0, actTrk - activeDrv);
        const uncovered = Math.max(0, activeDrv - actTrk);
        const gap = activeDrv - actTrk;

        weekObj.byCompany[code] = {
          activeDrivers: activeDrv,
          hired: hiredDrv,
          terminated: termDrv,
          change: netChangeDrv,
          activeTrucks: actTrk,
          addedTrucks: addTrk,
          removedTrucks: remTrk,
          truckChange: netChangeTrk,
          covered,
          empty,
          uncovered,
          gap
        };

        sumActiveDrivers += activeDrv;
        sumHired += hiredDrv;
        sumTerm += termDrv;
        sumActiveTrucks += actTrk;
        sumAddedTrucks += addTrk;
        sumRemovedTrucks += remTrk;
      });

      const overallCovered = Math.min(sumActiveDrivers, sumActiveTrucks);
      const overallEmpty = Math.max(0, sumActiveTrucks - sumActiveDrivers);
      const overallUncovered = Math.max(0, sumActiveDrivers - sumActiveTrucks);
      const overallGap = sumActiveDrivers - sumActiveTrucks;

      weekObj.overall = {
        activeDrivers: sumActiveDrivers,
        hired: sumHired,
        terminated: sumTerm,
        change: sumHired - sumTerm,
        activeTrucks: sumActiveTrucks,
        addedTrucks: sumAddedTrucks,
        removedTrucks: sumRemovedTrucks,
        truckChange: sumAddedTrucks - sumRemovedTrucks,
        covered: overallCovered,
        empty: overallEmpty,
        uncovered: overallUncovered,
        gap: overallGap
      };

      weeks.push(weekObj);
    }

    // WoW metrics calculation
    for (let i = 0; i < weeks.length; i++) {
      const cur = weeks[i];
      if (!cur.isPopulated) continue;
      const prev = i > 0 && weeks[i - 1].isPopulated ? weeks[i - 1] : null;

      if (prev) {
        const dDiff = cur.overall.activeDrivers - prev.overall.activeDrivers;
        const dPct = prev.overall.activeDrivers > 0 ? (dDiff / prev.overall.activeDrivers) * 100 : 0;

        const hDiff = cur.overall.hired - prev.overall.hired;
        const hPct = prev.overall.hired > 0 ? (hDiff / prev.overall.hired) * 100 : 0;

        const tDiff = cur.overall.terminated - prev.overall.terminated;
        const tPct = prev.overall.terminated > 0 ? (tDiff / prev.overall.terminated) * 100 : 0;

        const trkDiff = cur.overall.activeTrucks - prev.overall.activeTrucks;
        const trkPct = prev.overall.activeTrucks > 0 ? (trkDiff / prev.overall.activeTrucks) * 100 : 0;

        const addTrkDiff = cur.overall.addedTrucks - prev.overall.addedTrucks;
        const addTrkPct = prev.overall.addedTrucks > 0 ? (addTrkDiff / prev.overall.addedTrucks) * 100 : 0;

        const remTrkDiff = cur.overall.removedTrucks - prev.overall.removedTrucks;
        const remTrkPct = prev.overall.removedTrucks > 0 ? (remTrkDiff / prev.overall.removedTrucks) * 100 : 0;

        cur.wow = {
          activeDrivers: { diff: dDiff, pct: dPct },
          hired: { diff: hDiff, pct: hPct },
          terminated: { diff: tDiff, pct: tPct },
          activeTrucks: { diff: trkDiff, pct: trkPct },
          addedTrucks: { diff: addTrkDiff, pct: addTrkPct },
          removedTrucks: { diff: remTrkDiff, pct: remTrkPct }
        };
      } else {
        cur.wow = {
          activeDrivers: { diff: 0, pct: 0 },
          hired: { diff: 0, pct: 0 },
          terminated: { diff: 0, pct: 0 },
          activeTrucks: { diff: 0, pct: 0 },
          addedTrucks: { diff: 0, pct: 0 },
          removedTrucks: { diff: 0, pct: 0 }
        };
      }
    }

    const anchor = weeks.find((w) => w.weekNum === selectedWeekNum) || weeks[12] || weeks[0];

    // Audit diagnostics
    const issues = [];
    driversList.forEach((d) => {
      if (!d.name) {
        issues.push({ type: 'error', entity: 'driver', id: `Row ${d.rowIndexInSheet}`, message: 'Driver has blank name', row: d.rowIndexInSheet, item: d });
      }
      if (!d.hireDate || d.hireDate === '') {
        issues.push({ type: 'error', entity: 'driver', id: d.name || `Row ${d.rowIndexInSheet}`, message: 'Hire Date Required — Flagged for manual verification (never invent dates)', row: d.rowIndexInSheet, item: d });
      }
      if (d.hireDate === '1900-01-01') {
        issues.push({ type: 'info', entity: 'driver', id: d.name, message: 'Historical default sentinel hire date (1900-01-01)', row: d.rowIndexInSheet, item: d });
      }
      if (d.status === 'Active' && d.termDate && d.termDate !== '9999-12-31' && d.termDate <= TODAY_STR) {
        issues.push({ type: 'error', entity: 'driver', id: d.name, message: `Status marked Active despite past termination date (${d.termDate})`, row: d.rowIndexInSheet, item: d });
      }
    });

    trucksList.forEach((t) => {
      if (String(t.unit).trim() === '103') {
        issues.push({ type: 'warning', entity: 'truck', id: 'Unit 103 Conflict', message: `Duplicate Truck Unit 103 appears under ${t.companyRaw} (Row ${t.rowIndexInSheet}) — Manual verification required`, row: t.rowIndexInSheet, item: t });
      }
      if (t.companyCode === 'REVIEW' || !t.companyRaw || /verify|conflict|unassigned/i.test(t.companyRaw)) {
        issues.push({ type: 'warning', entity: 'truck', id: `Unit ${t.unit || 'Unknown'}`, message: `Carrier conflict / unassigned: "${t.companyRaw || 'Blank'}"`, row: t.rowIndexInSheet, item: t });
      }
      if (!t.statusDate && t.status === 'Inactive') {
        issues.push({ type: 'info', entity: 'truck', id: `Unit ${t.unit}`, message: 'Missing status effective date on Inactive unit', row: t.rowIndexInSheet, item: t });
      }
    });

    return { scheduleWeeks: weeks, currentAnchorWeek: anchor, auditIssues: issues };
  }, [driversList, trucksList, selectedWeekNum]);

  /* ==============================================================================
   * SECTION 4.3: PERIOD WINDOW SELECTION
   * ============================================================================== */

  const activePeriodWeeks = useMemo(() => {
    const anchorIdx = scheduleWeeks.findIndex((w) => w.weekNum === currentAnchorWeek.weekNum);
    if (anchorIdx === -1) return [currentAnchorWeek];

    if (periodPreset === '1W') {
      return [currentAnchorWeek];
    }
    if (periodPreset === '4W') {
      const start = Math.max(0, anchorIdx - 3);
      return scheduleWeeks.slice(start, anchorIdx + 1);
    }
    if (periodPreset === '8W') {
      const start = Math.max(0, anchorIdx - 7);
      return scheduleWeeks.slice(start, anchorIdx + 1);
    }
    if (periodPreset === '12W') {
      const start = Math.max(0, anchorIdx - 11);
      return scheduleWeeks.slice(start, anchorIdx + 1);
    }
    if (periodPreset === '26W') {
      const start = Math.max(0, anchorIdx - 25);
      return scheduleWeeks.slice(start, anchorIdx + 1);
    }
    if (periodPreset === '52W') {
      return scheduleWeeks.filter((w) => w.isPopulated);
    }
    if (periodPreset === 'YTD') {
      return scheduleWeeks.slice(0, anchorIdx + 1).filter((w) => w.isPopulated);
    }
    if (periodPreset === 'custom') {
      return scheduleWeeks.filter(
        (w) => w.endDate >= customStartDate && w.startDate <= customEndDate && w.isPopulated
      );
    }
    return [currentAnchorWeek];
  }, [scheduleWeeks, currentAnchorWeek, periodPreset, customStartDate, customEndDate]);

  // Aggregate metrics across active period
  const periodAggregates = useMemo(() => {
    let hires = 0;
    let terms = 0;
    let addedTrucks = 0;
    let removedTrucks = 0;

    activePeriodWeeks.forEach((w) => {
      if (!w.isPopulated) return;
      selectedCompanies.forEach((code) => {
        const comp = w.byCompany[code];
        if (comp) {
          hires += comp.hired || 0;
          terms += comp.terminated || 0;
          addedTrucks += comp.addedTrucks || 0;
          removedTrucks += comp.removedTrucks || 0;
        }
      });
    });

    return {
      hires,
      terms,
      driverNetGrowth: hires - terms,
      addedTrucks,
      removedTrucks,
      fleetNetGrowth: addedTrucks - removedTrucks
    };
  }, [activePeriodWeeks, selectedCompanies]);

  // Current anchor metrics scoped to selected companies
  const scopedAnchorMetrics = useMemo(() => {
    let activeDrivers = 0;
    let hired = 0;
    let terminated = 0;
    let activeTrucks = 0;
    let addedTrucks = 0;
    let removedTrucks = 0;
    let inHiringDrivers = 0;

    driversList.forEach((d) => {
      if (selectedCompanies.includes(d.companyCode)) {
        if (d.status === 'Hiring / Onboarding') {
          inHiringDrivers++;
        }
      }
    });

    const totalManagedTrucks = trucksList.filter((t) => selectedCompanies.includes(t.companyCode)).length;

    selectedCompanies.forEach((code) => {
      const comp = currentAnchorWeek.byCompany[code];
      if (comp && currentAnchorWeek.isPopulated) {
        activeDrivers += comp.activeDrivers || 0;
        hired += comp.hired || 0;
        terminated += comp.terminated || 0;
        activeTrucks += comp.activeTrucks || 0;
        addedTrucks += comp.addedTrucks || 0;
        removedTrucks += comp.removedTrucks || 0;
      }
    });

    const covered = Math.min(activeDrivers, activeTrucks);
    const empty = Math.max(0, activeTrucks - activeDrivers);
    const uncovered = Math.max(0, activeDrivers - activeTrucks);
    const coverageGap = activeDrivers - activeTrucks;

    const totalDrivers = activeDrivers + inHiringDrivers;
    const utilizationPct = totalManagedTrucks > 0 ? (activeTrucks / totalManagedTrucks) * 100 : 0;
    const ratio = activeTrucks > 0 ? (activeDrivers / activeTrucks).toFixed(2) : '—';

    return {
      activeDrivers,
      inHiringDrivers,
      hired,
      terminated,
      change: hired - terminated,
      activeTrucks,
      addedTrucks,
      removedTrucks,
      truckChange: addedTrucks - removedTrucks,
      covered,
      empty,
      uncovered,
      coverageGap,
      totalDrivers,
      totalManagedTrucks,
      utilizationPct,
      ratio
    };
  }, [currentAnchorWeek, selectedCompanies, driversList, trucksList]);

  // Tenure & Cohort Attrition Analytics
  const tenureAnalytics = useMemo(() => {
    const windowDays = tenureWindowDays;
    let totalEarlyQuitters = 0;
    let earlyQuittersDaysSum = 0;
    let establishedActiveCount = 0;
    let establishedTenureSum = 0;
    let establishedTermCount = 0;
    let allEverEstablishedCount = 0;

    const [tdy, tdm, tdd] = TODAY_STR.split('-').map(Number);
    const todayDate = new Date(Date.UTC(tdy, tdm - 1, tdd));

    driversList.forEach((d) => {
      if (!selectedCompanies.includes(d.companyCode)) return;

      let tenure = d.tenureDaysSheet;
      if (d.hireDate && d.hireDate !== '1900-01-01') {
        const [hy, hm, hd] = d.hireDate.split('-').map(Number);
        const hDate = new Date(Date.UTC(hy, hm - 1, hd));
        let termD = todayDate;
        if (d.termDate && d.termDate !== '9999-12-31') {
          const [ty, tm, td] = d.termDate.split('-').map(Number);
          termD = new Date(Date.UTC(ty, tm - 1, td));
        }
        const diff = Math.max(0, Math.floor((termD.getTime() - hDate.getTime()) / (86400 * 1000)));
        if (diff >= 0) tenure = diff;
      }

      const isNew = tenure < windowDays;

      if (d.status === 'Inactive') {
        if (isNew) {
          totalEarlyQuitters++;
          earlyQuittersDaysSum += tenure;
        } else {
          establishedTermCount++;
        }
      } else {
        if (!isNew) {
          establishedActiveCount++;
          establishedTenureSum += tenure;
        }
      }

      if (!isNew || (d.status === 'Inactive' && !isNew)) {
        allEverEstablishedCount++;
      }
    });

    const hiredInWindow = driversList.filter(
      (d) => selectedCompanies.includes(d.companyCode) && d.hireDate && d.hireDate >= SCHEDULE_START
    ).length;

    const earlyAttritionRate = hiredInWindow > 0 ? (totalEarlyQuitters / hiredInWindow) * 100 : 0;
    const avgDaysToQuit = totalEarlyQuitters > 0 ? Math.round(earlyQuittersDaysSum / totalEarlyQuitters) : 0;
    const establishedAvgTenure = establishedActiveCount > 0 ? Math.round(establishedTenureSum / establishedActiveCount) : 0;
    const establishedAttritionRate = allEverEstablishedCount > 0 ? (establishedTermCount / allEverEstablishedCount) * 100 : 0;

    return {
      earlyAttritionRate,
      totalEarlyQuitters,
      avgDaysToQuit,
      establishedAvgTenure,
      establishedAttritionRate,
      hiredInWindow
    };
  }, [driversList, selectedCompanies, tenureWindowDays, TODAY_STR]);

  /* ==============================================================================
   * SECTION 5: SPREADSHEET AUTO-UPDATE WRITE-BACK
   * ============================================================================== */

  const writtenSignatures = useRef(new Set());

  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) return;

    scheduleWeeks.forEach((weekObj) => {
      if (!weekObj.isPopulated || weekObj.status === 'Future') return;

      const wNum = weekObj.weekNum;
      const expectedLabel = `Week ${wNum}`;

      // Per-Company sync
      Object.entries(WEEKLY_TAB_COLS).forEach(([code, cols]) => {
        const compMetrics = weekObj.byCompany[code];
        if (!compMetrics) return;

        const valActive = compMetrics.activeDrivers ?? 0;
        const valHired = compMetrics.hired ?? 0;
        const valTerm = compMetrics.terminated ?? 0;
        const valChange = compMetrics.change ?? 0;

        const sig = `${code}|${wNum}|${valActive}|${valHired}|${valTerm}|${valChange}`;
        if (writtenSignatures.current.has(sig)) return;

        let existingEnvelope = null;
        for (let i = headerRowIndex + 1; i < data.length; i++) {
          const rowVal = String(data[i]?.row?.[cols.week] || '').trim();
          const match = rowVal.match(/^Week\s+(\d+)/i);
          if (match && Number(match[1]) === wNum) {
            existingEnvelope = data[i];
            break;
          }
        }

        if (existingEnvelope) {
          const curAct = existingEnvelope.row[cols.active];
          const curHir = existingEnvelope.row[cols.hired];
          const curTrm = existingEnvelope.row[cols.term];
          const curChg = existingEnvelope.row[cols.change];

          const isDiff =
            curAct !== valActive ||
            curHir !== valHired ||
            curTrm !== valTerm ||
            curChg !== valChange;

          if (isDiff) {
            const sparsePayload = new Array(ROW_WIDTH).fill(undefined);
            sparsePayload[cols.active] = valActive;
            sparsePayload[cols.hired] = valHired;
            sparsePayload[cols.term] = valTerm;
            sparsePayload[cols.change] = valChange;

            updateItem(existingEnvelope.index_, sparsePayload);
            writtenSignatures.current.add(sig);
          } else {
            writtenSignatures.current.add(sig);
          }
        } else {
          const sparseRow = new Array(ROW_WIDTH).fill(undefined);
          sparseRow[cols.week] = expectedLabel;
          sparseRow[cols.active] = valActive;
          sparseRow[cols.hired] = valHired;
          sparseRow[cols.term] = valTerm;
          sparseRow[cols.change] = valChange;

          insertItem(undefined, sparseRow);
          writtenSignatures.current.add(sig);
        }
      });

      // Overall row sync
      const ov = weekObj.overall;
      if (ov) {
        const ovSig = `OVERALL|${wNum}|${ov.activeDrivers}|${ov.hired}|${ov.terminated}|${ov.change}|${ov.activeTrucks}`;
        if (!writtenSignatures.current.has(ovSig)) {
          let ovEnvelope = null;
          for (let i = headerRowIndex + 1; i < data.length; i++) {
            const rowVal = String(data[i]?.row?.[OVERALL_COLS.week] || '').trim();
            const match = rowVal.match(/^Week\s+(\d+)/i);
            if (match && Number(match[1]) === wNum) {
              ovEnvelope = data[i];
              break;
            }
          }

          if (ovEnvelope) {
            const isDiff =
              ovEnvelope.row[OVERALL_COLS.active] !== ov.activeDrivers ||
              ovEnvelope.row[OVERALL_COLS.hired] !== ov.hired ||
              ovEnvelope.row[OVERALL_COLS.term] !== ov.terminated ||
              ovEnvelope.row[OVERALL_COLS.change] !== ov.change ||
              ovEnvelope.row[OVERALL_COLS.trucks] !== ov.activeTrucks;

            if (isDiff) {
              const sparsePayload = new Array(ROW_WIDTH).fill(undefined);
              sparsePayload[OVERALL_COLS.active] = ov.activeDrivers;
              sparsePayload[OVERALL_COLS.hired] = ov.hired;
              sparsePayload[OVERALL_COLS.term] = ov.terminated;
              sparsePayload[OVERALL_COLS.change] = ov.change;
              sparsePayload[OVERALL_COLS.trucks] = ov.activeTrucks;
              sparsePayload[OVERALL_COLS.start] = weekObj.startDate;
              sparsePayload[OVERALL_COLS.end] = weekObj.endDate;

              updateItem(ovEnvelope.index_, sparsePayload);
              writtenSignatures.current.add(ovSig);
            } else {
              writtenSignatures.current.add(ovSig);
            }
          } else {
            const sparseRow = new Array(ROW_WIDTH).fill(undefined);
            sparseRow[OVERALL_COLS.week] = expectedLabel;
            sparseRow[OVERALL_COLS.active] = ov.activeDrivers;
            sparseRow[OVERALL_COLS.hired] = ov.hired;
            sparseRow[OVERALL_COLS.term] = ov.terminated;
            sparseRow[OVERALL_COLS.change] = ov.change;
            sparseRow[OVERALL_COLS.trucks] = ov.activeTrucks;
            sparseRow[OVERALL_COLS.start] = weekObj.startDate;
            sparseRow[OVERALL_COLS.end] = weekObj.endDate;

            insertItem(undefined, sparseRow);
            writtenSignatures.current.add(ovSig);
          }
        }
      }
    });
  }, [data, scheduleWeeks, headerRowIndex, insertItem, updateItem]);

  /* ==============================================================================
   * SECTION 6: D3 CHARTS IMPLEMENTATION (With No Hard Clipping & Full X/Y Margins)
   * ============================================================================== */

  const trendChartRef = useRef(null);
  const turnoverChartRef = useRef(null);
  const coverageChartRef = useRef(null);

  // Main Trend Chart Effect
  useEffect(() => {
    if (!trendChartRef.current || activePeriodWeeks.length === 0) return;
    const container = d3.select(trendChartRef.current);
    container.selectAll('*').remove();

    const containerWidth = trendChartRef.current.clientWidth || 650;
    const width = Math.max(340, containerWidth);
    const height = 340;
    // Generous margins prevent clipping of labels and axes
    const margin = { top: 25, right: 35, bottom: 50, left: 45 };

    const svg = container
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height)
      .style('overflow', 'visible');

    let tooltip = d3.select('#fleetpulse-chart-tooltip');
    if (tooltip.empty()) {
      tooltip = d3
        .select('body')
        .append('div')
        .attr('id', 'fleetpulse-chart-tooltip')
        .style('position', 'absolute')
        .style('background', '#0f172a')
        .style('color', '#ffffff')
        .style('padding', '8px 12px')
        .style('border-radius', '8px')
        .style('font-size', '11px')
        .style('pointer-events', 'none')
        .style('z-index', '9999')
        .style('box-shadow', '0 10px 25px -5px rgba(0, 0, 0, 0.3)')
        .style('display', 'none');
    }

    if (chartScope === 'sideBySide') {
      const dataForBars = selectedCompanies.map((code) => {
        const comp = COMPANY_MAP[code] || { name: code, color: '#64748b', shortName: code };
        const metrics = currentAnchorWeek.byCompany[code] || {};
        let value = 0;
        if (chartMetricType === 'drivers') value = metrics.activeDrivers || 0;
        else if (chartMetricType === 'trucks') value = metrics.activeTrucks || 0;
        else value = (metrics.activeDrivers || 0) + (metrics.activeTrucks || 0);
        return { code, name: comp.shortName, fullName: comp.name, color: comp.color, value };
      });

      const x = d3
        .scaleBand()
        .domain(dataForBars.map((d) => d.name))
        .range([margin.left, width - margin.right])
        .padding(0.35);

      const maxVal = d3.max(dataForBars, (d) => d.value) || 10;
      const y = d3
        .scaleLinear()
        .domain([0, Math.max(maxVal * 1.2, 10)])
        .nice()
        .range([height - margin.bottom, margin.top]);

      // Gridlines
      svg
        .append('g')
        .attr('stroke', '#e2e8f0')
        .attr('stroke-dasharray', '3,3')
        .call(
          d3
            .axisLeft(y)
            .ticks(5)
            .tickSize(-(width - margin.left - margin.right))
            .tickFormat('')
        )
        .attr('transform', `translate(${margin.left},0)`)
        .select('.domain')
        .remove();

      const isRoundedPreset = chartStylePreset === 'rounded';

      svg
        .selectAll('.bar')
        .data(dataForBars)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', (d) => x(d.name))
        .attr('y', (d) => y(d.value))
        .attr('width', x.bandwidth())
        .attr('height', (d) => height - margin.bottom - y(d.value))
        .attr('rx', isRoundedPreset ? 8 : 4)
        .attr('ry', isRoundedPreset ? 8 : 4)
        .attr('fill', (d) => d.color)
        .attr('opacity', 0.9)
        .on('mousemove', (event, d) => {
          tooltip
            .style('display', 'block')
            .style('left', `${event.pageX + 12}px`)
            .style('top', `${event.pageY - 28}px`).html(`
              <div class="font-semibold text-white">${d.fullName}</div>
              <div class="text-slate-300 capitalize">${chartMetricType}: <span class="font-bold text-white">${d.value}</span></div>
            `);
        })
        .on('mouseleave', () => tooltip.style('display', 'none'));

      svg
        .selectAll('.bar-label')
        .data(dataForBars)
        .enter()
        .append('text')
        .attr('class', 'bar-label')
        .attr('x', (d) => x(d.name) + x.bandwidth() / 2)
        .attr('y', (d) => y(d.value) - 6)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', '#475569')
        .text((d) => d.value);

      svg
        .append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('fill', '#475569');

      svg
        .append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5))
        .selectAll('text')
        .attr('font-size', '11px')
        .attr('fill', '#64748b');

    } else {
      // Multi-Week Trend Chart
      const weeksData = activePeriodWeeks.filter((w) => w.isPopulated);
      if (weeksData.length === 0) return;

      const x = d3
        .scalePoint()
        .domain(weeksData.map((w) => `W${w.weekNum}`))
        .range([margin.left, width - margin.right])
        .padding(0.4);

      let allVals = [];
      selectedCompanies.forEach((code) => {
        weeksData.forEach((w) => {
          const comp = w.byCompany[code];
          if (!comp) return;
          if (chartMetricType === 'drivers') allVals.push(comp.activeDrivers || 0);
          else if (chartMetricType === 'trucks') allVals.push(comp.activeTrucks || 0);
          else {
            allVals.push(comp.activeDrivers || 0);
            allVals.push(comp.activeTrucks || 0);
          }
        });
      });

      if (allVals.length === 0) allVals = [0, 10];
      const minVal = d3.min(allVals) || 0;
      const maxVal = d3.max(allVals) || 10;
      const yMin = Math.max(0, minVal - 2);
      const yMax = maxVal + Math.max(2, Math.ceil(maxVal * 0.15));

      const y = d3
        .scaleLinear()
        .domain([yMin, yMax])
        .nice()
        .range([height - margin.bottom, margin.top]);

      // Gridlines
      svg
        .append('g')
        .attr('stroke', '#e2e0d8')
        .attr('stroke-dasharray', '3,3')
        .call(
          d3
            .axisLeft(y)
            .ticks(5)
            .tickSize(-(width - margin.left - margin.right))
            .tickFormat('')
        )
        .attr('transform', `translate(${margin.left},0)`)
        .select('.domain')
        .remove();

      const rainbowColors = ['#2E7BF6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6', '#F97316'];

      if (chartStylePreset === 'rainbow') {
        const barWidth = Math.min(28, ((width - margin.left - margin.right) / Math.max(weeksData.length, 1)) * 0.5);
        svg
          .selectAll('.rainbow-bar')
          .data(weeksData)
          .enter()
          .append('rect')
          .attr('class', 'rainbow-bar')
          .attr('x', (d) => x(`W${d.weekNum}`) - barWidth / 2)
          .attr('y', (d) => {
            const val = chartMetricType === 'drivers' ? d.overall.activeDrivers : d.overall.activeTrucks;
            return y(val || 0);
          })
          .attr('width', barWidth)
          .attr('height', (d) => {
            const val = chartMetricType === 'drivers' ? d.overall.activeDrivers : d.overall.activeTrucks;
            return height - margin.bottom - y(val || 0);
          })
          .attr('rx', 4)
          .attr('fill', (d, i) => rainbowColors[i % rainbowColors.length])
          .attr('opacity', 0.4);
      }

      const lineGen = d3
        .line()
        .x((d) => x(`W${d.weekNum}`))
        .y((d) => y(d.value))
        .curve(d3.curveMonotoneX);

      const isZigzag = chartStylePreset === 'zigzag' && selectedCompanies.length === 1;

      selectedCompanies.forEach((code) => {
        const comp = COMPANY_MAP[code] || { name: code, color: '#64748b', shortName: code };

        const seriesData = weeksData.map((w) => {
          const m = w.byCompany[code] || {};
          let val = 0;
          if (chartMetricType === 'drivers') val = m.activeDrivers || 0;
          else if (chartMetricType === 'trucks') val = m.activeTrucks || 0;
          else val = m.activeDrivers || 0;
          return { weekNum: w.weekNum, weekLabel: w.weekLabel, value: val, company: comp };
        });

        svg
          .append('path')
          .datum(seriesData)
          .attr('fill', 'none')
          .attr('stroke', isZigzag ? '#1e293b' : comp.color)
          .attr('stroke-width', isZigzag ? 2.75 : 2.5)
          .attr('d', lineGen);

        svg
          .selectAll(`.point-${code}`)
          .data(seriesData)
          .enter()
          .append('circle')
          .attr('class', `point-${code}`)
          .attr('cx', (d) => x(`W${d.weekNum}`))
          .attr('cy', (d) => y(d.value))
          .attr('r', (d) => (d.weekNum === currentAnchorWeek.weekNum ? 5.5 : 3.5))
          .attr('fill', (d) => (isZigzag ? '#ffffff' : d.weekNum === currentAnchorWeek.weekNum ? comp.color : '#ffffff'))
          .attr('stroke', (d, i) => (isZigzag ? rainbowColors[i % rainbowColors.length] : comp.color))
          .attr('stroke-width', 2.5)
          .style('cursor', 'pointer')
          .on('click', (event, d) => {
            setSelectedWeekNum(d.weekNum);
            addToast(`Selected ${d.weekLabel}`, 'info');
          })
          .on('mousemove', (event, d) => {
            tooltip
              .style('display', 'block')
              .style('left', `${event.pageX + 12}px`)
              .style('top', `${event.pageY - 28}px`).html(`
                <div class="font-bold text-white">${d.weekLabel}</div>
                <div class="text-slate-300">${d.company.name}</div>
                <div class="text-blue-400 font-semibold mt-0.5">${chartMetricType.toUpperCase()}: ${d.value}</div>
              `);
          })
          .on('mouseleave', () => tooltip.style('display', 'none'));

        if (isZigzag) {
          const hideSomeLabels = seriesData.length >= 12;
          const minD = d3.min(seriesData, (d) => d.value);
          const maxD = d3.max(seriesData, (d) => d.value);

          seriesData.forEach((d, i) => {
            const shouldShow =
              !hideSomeLabels ||
              i === 0 ||
              i === seriesData.length - 1 ||
              d.value === minD ||
              d.value === maxD;

            if (shouldShow) {
              const isAbove = i % 2 === 0;
              svg
                .append('text')
                .attr('x', x(`W${d.weekNum}`))
                .attr('y', y(d.value) + (isAbove ? -10 : 16))
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('font-weight', '700')
                .attr('fill', rainbowColors[i % rainbowColors.length])
                .text(d.value);
            }
          });
        }
      });

      // Bottom Axis
      svg
        .append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('fill', (d) => (d === `W${currentAnchorWeek.weekNum}` ? '#2563eb' : '#475569'))
        .style('font-weight', (d) => (d === `W${currentAnchorWeek.weekNum}` ? '700' : '500'));

      // Left Axis
      svg
        .append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5))
        .selectAll('text')
        .attr('font-size', '11px')
        .attr('fill', '#475569');
    }
  }, [activePeriodWeeks, currentAnchorWeek, chartScope, chartMetricType, chartStylePreset, selectedCompanies, addToast]);

  // Turnover Grouped Bar Chart Effect
  useEffect(() => {
    if (!turnoverChartRef.current || activePeriodWeeks.length === 0) return;
    const container = d3.select(turnoverChartRef.current);
    container.selectAll('*').remove();

    const weeksData = activePeriodWeeks.filter((w) => w.isPopulated).slice(-12);
    if (weeksData.length === 0) return;

    const width = 480;
    const height = 205;
    const margin = { top: 20, right: 20, bottom: 35, left: 35 };

    let tooltip = d3.select('#fleetpulse-chart-tooltip');

    const svg = container
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);

    const turnoverData = weeksData.map((w) => {
      let hired = 0;
      let terminated = 0;
      if (turnoverCompany === 'ALL') {
        hired = w.overall.hired || 0;
        terminated = w.overall.terminated || 0;
      } else {
        hired = w.byCompany[turnoverCompany]?.hired || 0;
        terminated = w.byCompany[turnoverCompany]?.terminated || 0;
      }
      return { weekNum: w.weekNum, weekLabel: w.weekLabel, hired, terminated };
    });

    const x0 = d3
      .scaleBand()
      .domain(weeksData.map((w) => `W${w.weekNum}`))
      .range([margin.left, width - margin.right])
      .paddingInner(0.25);

    const x1 = d3.scaleBand().domain(['hired', 'terminated']).range([0, x0.bandwidth()]).padding(0.1);

    const maxVal = d3.max(turnoverData, (d) => Math.max(d.hired, d.terminated)) || 5;
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(maxVal * 1.15, 4)])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg
      .append('g')
      .attr('stroke', '#f1f5f9')
      .attr('stroke-dasharray', '2,2')
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat('')
      )
      .attr('transform', `translate(${margin.left},0)`)
      .select('.domain')
      .remove();

    const weekGroups = svg
      .selectAll('.week-group')
      .data(turnoverData)
      .enter()
      .append('g')
      .attr('class', 'week-group')
      .attr('transform', (d) => `translate(${x0(`W${d.weekNum}`)},0)`);

    weekGroups
      .append('rect')
      .attr('x', x1('hired'))
      .attr('y', (d) => y(d.hired))
      .attr('width', x1.bandwidth())
      .attr('height', (d) => height - margin.bottom - y(d.hired))
      .attr('rx', 2)
      .attr('fill', '#11B981')
      .on('mousemove', (event, d) => {
        tooltip
          .style('display', 'block')
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 28}px`).html(`
            <div class="font-bold text-white">${d.weekLabel}</div>
            <div class="text-emerald-300 font-semibold">Hired: ${d.hired}</div>
          `);
      })
      .on('mouseleave', () => tooltip.style('display', 'none'));

    weekGroups
      .append('rect')
      .attr('x', x1('terminated'))
      .attr('y', (d) => y(d.terminated))
      .attr('width', x1.bandwidth())
      .attr('height', (d) => height - margin.bottom - y(d.terminated))
      .attr('rx', 2)
      .attr('fill', '#F2542D')
      .on('mousemove', (event, d) => {
        tooltip
          .style('display', 'block')
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 28}px`).html(`
            <div class="font-bold text-white">${d.weekLabel}</div>
            <div class="text-rose-300 font-semibold">Terminated: ${d.terminated}</div>
          `);
      })
      .on('mouseleave', () => tooltip.style('display', 'none'));

    svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x0))
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', '#475569');

    svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(4))
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', '#475569');
  }, [activePeriodWeeks, turnoverCompany]);

  // Coverage Chart Effect
  useEffect(() => {
    if (!coverageChartRef.current || activePeriodWeeks.length === 0) return;
    const container = d3.select(coverageChartRef.current);
    container.selectAll('*').remove();

    const weeksData = activePeriodWeeks.filter((w) => w.isPopulated);
    if (weeksData.length === 0) return;

    const width = 540;
    const height = 210;
    const margin = { top: 20, right: 30, bottom: 35, left: 40 };

    let tooltip = d3.select('#fleetpulse-chart-tooltip');

    const svg = container
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);

    const x = d3
      .scalePoint()
      .domain(weeksData.map((w) => `W${w.weekNum}`))
      .range([margin.left, width - margin.right])
      .padding(0.4);

    let maxVal = 10;
    weeksData.forEach((w) => {
      maxVal = Math.max(maxVal, w.overall.activeDrivers || 0, w.overall.activeTrucks || 0, w.overall.covered || 0);
    });

    const y = d3
      .scaleLinear()
      .domain([0, Math.max(maxVal * 1.15, 10)])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg
      .append('g')
      .attr('stroke', '#f1f5f9')
      .attr('stroke-dasharray', '3,3')
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat('')
      )
      .attr('transform', `translate(${margin.left},0)`)
      .select('.domain')
      .remove();

    if (coverageChartMode === 'coveredEmpty') {
      const coveredLine = d3
        .line()
        .x((d) => x(`W${d.weekNum}`))
        .y((d) => y(d.overall.covered || 0))
        .curve(d3.curveMonotoneX);

      const emptyLine = d3
        .line()
        .x((d) => x(`W${d.weekNum}`))
        .y((d) => y(d.overall.empty || 0))
        .curve(d3.curveMonotoneX);

      svg
        .append('path')
        .datum(weeksData)
        .attr('fill', 'none')
        .attr('stroke', '#10b981')
        .attr('stroke-width', 2.75)
        .attr('d', coveredLine);

      svg
        .append('path')
        .datum(weeksData)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4')
        .attr('d', emptyLine);

      svg
        .selectAll('.pt-covered')
        .data(weeksData)
        .enter()
        .append('circle')
        .attr('cx', (d) => x(`W${d.weekNum}`))
        .attr('cy', (d) => y(d.overall.covered || 0))
        .attr('r', 4)
        .attr('fill', '#10b981')
        .style('cursor', 'pointer')
        .on('mousemove', (event, d) => {
          tooltip
            .style('display', 'block')
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 28}px`).html(`
              <div class="font-bold text-white">${d.weekLabel}</div>
              <div class="text-emerald-300 font-semibold">Covered Trucks: ${d.overall.covered}</div>
            `);
        })
        .on('mouseleave', () => tooltip.style('display', 'none'));

      svg
        .selectAll('.pt-empty')
        .data(weeksData)
        .enter()
        .append('circle')
        .attr('cx', (d) => x(`W${d.weekNum}`))
        .attr('cy', (d) => y(d.overall.empty || 0))
        .attr('r', 3.5)
        .attr('fill', '#f59e0b')
        .style('cursor', 'pointer')
        .on('mousemove', (event, d) => {
          tooltip
            .style('display', 'block')
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 28}px`).html(`
              <div class="font-bold text-white">${d.weekLabel}</div>
              <div class="text-amber-300 font-semibold">Empty Trucks: ${d.overall.empty}</div>
            `);
        })
        .on('mouseleave', () => tooltip.style('display', 'none'));
    } else {
      const drvLine = d3.line().x((d) => x(`W${d.weekNum}`)).y((d) => y(d.overall.activeDrivers || 0)).curve(d3.curveMonotoneX);
      const trkLine = d3.line().x((d) => x(`W${d.weekNum}`)).y((d) => y(d.overall.activeTrucks || 0)).curve(d3.curveMonotoneX);
      const empLine = d3.line().x((d) => x(`W${d.weekNum}`)).y((d) => y(d.overall.empty || 0)).curve(d3.curveMonotoneX);

      svg.append('path').datum(weeksData).attr('fill', 'none').attr('stroke', '#2563eb').attr('stroke-width', 2.5).attr('d', drvLine);
      svg.append('path').datum(weeksData).attr('fill', 'none').attr('stroke', '#7c3aed').attr('stroke-width', 2.5).attr('d', trkLine);
      svg.append('path').datum(weeksData).attr('fill', 'none').attr('stroke', '#f59e0b').attr('stroke-width', 2).attr('stroke-dasharray', '3,3').attr('d', empLine);

      svg.selectAll('.pt-d').data(weeksData).enter().append('circle').attr('cx', (d) => x(`W${d.weekNum}`)).attr('cy', (d) => y(d.overall.activeDrivers || 0)).attr('r', 3.5).attr('fill', '#2563eb')
        .on('mousemove', (event, d) => {
          tooltip
            .style('display', 'block')
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 28}px`).html(`
              <div class="font-bold text-white">${d.weekLabel}</div>
              <div class="text-blue-300 font-semibold">Active Drivers: ${d.overall.activeDrivers}</div>
            `);
        })
        .on('mouseleave', () => tooltip.style('display', 'none'));

      svg.selectAll('.pt-t').data(weeksData).enter().append('circle').attr('cx', (d) => x(`W${d.weekNum}`)).attr('cy', (d) => y(d.overall.activeTrucks || 0)).attr('r', 3.5).attr('fill', '#7c3aed')
        .on('mousemove', (event, d) => {
          tooltip
            .style('display', 'block')
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 28}px`).html(`
              <div class="font-bold text-white">${d.weekLabel}</div>
              <div class="text-purple-300 font-semibold">Active Trucks: ${d.overall.activeTrucks}</div>
            `);
        })
        .on('mouseleave', () => tooltip.style('display', 'none'));

      svg.selectAll('.pt-e').data(weeksData).enter().append('circle').attr('cx', (d) => x(`W${d.weekNum}`)).attr('cy', (d) => y(d.overall.empty || 0)).attr('r', 3.5).attr('fill', '#f59e0b')
        .on('mousemove', (event, d) => {
          tooltip
            .style('display', 'block')
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 28}px`).html(`
              <div class="font-bold text-white">${d.weekLabel}</div>
              <div class="text-amber-300 font-semibold">Empty Trucks: ${d.overall.empty}</div>
            `);
        })
        .on('mouseleave', () => tooltip.style('display', 'none'));
    }

    svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', '#475569');

    svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', '#475569');
  }, [activePeriodWeeks, coverageChartMode]);

  const coverageTrend = useMemo(() => {
    const populated = activePeriodWeeks.filter((w) => w.isPopulated);
    if (populated.length < 2) return { status: 'flat', label: 'Stable' };
    const first = populated[0].overall;
    const last = populated[populated.length - 1].overall;
    const startRate = first.activeTrucks > 0 ? (first.covered / first.activeTrucks) * 100 : 0;
    const endRate = last.activeTrucks > 0 ? (last.covered / last.activeTrucks) * 100 : 0;
    const diff = endRate - startRate;
    if (diff > 0.5) return { status: 'improving', label: `Improving (+${diff.toFixed(1)}%)` };
    if (diff < -0.5) return { status: 'declining', label: `Declining (${diff.toFixed(1)}%)` };
    return { status: 'flat', label: 'Flat (0.0%)' };
  }, [activePeriodWeeks]);

  // Inline KPI Sparkline helper
  const renderMiniSparkline = (dataArray, color = '#2E7BF6', width = 110, height = 32) => {
    if (!dataArray || dataArray.length < 2) return null;
    const min = d3.min(dataArray) || 0;
    const max = d3.max(dataArray) || 10;
    const pad = 4;
    const xScale = d3.scaleLinear().domain([0, dataArray.length - 1]).range([pad, width - pad]);
    const yScale = d3.scaleLinear().domain([min, Math.max(max, min + 1)]).range([height - pad, pad]);

    const line = d3.line().x((d, i) => xScale(i)).y((d) => yScale(d)).curve(d3.curveMonotoneX);
    const dPath = line(dataArray);

    const lastIdx = dataArray.length - 1;
    const lastX = xScale(lastIdx);
    const lastY = yScale(dataArray[lastIdx]);

    return (
      <svg width={width} height={height} className="overflow-visible">
        <path d={dPath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r="3" fill={color} stroke="#ffffff" strokeWidth="1.5" />
      </svg>
    );
  };

  /* ==============================================================================
   * SECTION 7: ROSTER FILTERING
   * ============================================================================== */

  const [driverSearch, setDriverSearch] = useState('');
  const [driverStatusFilter, setDriverStatusFilter] = useState('ALL');
  const [driverCompanyFilter, setDriverCompanyFilter] = useState('ALL');
  const [driverDateRangePreset, setDriverDateRangePreset] = useState('ALL');
  const [driverFilterType, setDriverFilterType] = useState('BOTH');

  const filteredDrivers = useMemo(() => {
    return driversList.filter((d) => {
      if (driverSearch) {
        const q = driverSearch.toLowerCase();
        const mName = d.name.toLowerCase().includes(q);
        const mComp = d.companyRaw.toLowerCase().includes(q);
        const mNotes = d.notes.toLowerCase().includes(q);
        if (!mName && !mComp && !mNotes) return false;
      }
      if (driverStatusFilter !== 'ALL' && d.status !== driverStatusFilter) return false;
      if (driverCompanyFilter !== 'ALL' && d.companyCode !== driverCompanyFilter) return false;

      if (driverDateRangePreset !== 'ALL') {
        const checkHire = driverFilterType === 'HIRE' || driverFilterType === 'BOTH';
        const checkTerm = driverFilterType === 'TERM' || driverFilterType === 'BOTH';

        let startD = SCHEDULE_START;
        let endD = TODAY_STR;
        if (driverDateRangePreset === '1W') startD = addDaysStr(TODAY_STR, -7);
        if (driverDateRangePreset === '4W') startD = addDaysStr(TODAY_STR, -28);
        if (driverDateRangePreset === '12W') startD = addDaysStr(TODAY_STR, -84);
        if (driverDateRangePreset === 'YTD') startD = `${TODAY_STR.slice(0, 4)}-01-01`;

        const matchesHire = checkHire && d.hireDate && d.hireDate >= startD && d.hireDate <= endD;
        const matchesTerm = checkTerm && d.termDate && d.termDate !== '9999-12-31' && d.termDate >= startD && d.termDate <= endD;

        if (driverFilterType === 'HIRE' && !matchesHire) return false;
        if (driverFilterType === 'TERM') {
          if (!d.termDate || d.termDate === '9999-12-31') return false;
          if (!matchesTerm) return false;
        }
        if (driverFilterType === 'BOTH' && !matchesHire && !matchesTerm) return false;
      }

      return true;
    });
  }, [driversList, driverSearch, driverStatusFilter, driverCompanyFilter, driverDateRangePreset, driverFilterType, TODAY_STR]);

  const [truckSearch, setTruckSearch] = useState('');
  const [truckStatusFilter, setTruckStatusFilter] = useState('ALL');
  const [truckCompanyFilter, setTruckCompanyFilter] = useState('ALL');

  const filteredTrucks = useMemo(() => {
    return trucksList.filter((t) => {
      if (truckSearch) {
        const q = truckSearch.toLowerCase();
        const mUnit = t.unit.toLowerCase().includes(q);
        const mComp = t.companyRaw.toLowerCase().includes(q);
        const mNotes = t.notes.toLowerCase().includes(q);
        const mDriver = t.assignedDriver.toLowerCase().includes(q);
        if (!mUnit && !mComp && !mNotes && !mDriver) return false;
      }
      if (truckStatusFilter !== 'ALL' && t.status !== truckStatusFilter) return false;
      if (truckCompanyFilter !== 'ALL' && t.companyCode !== truckCompanyFilter) return false;
      return true;
    });
  }, [trucksList, truckSearch, truckStatusFilter, truckCompanyFilter]);

  const [matrixDatasetView, setMatrixDatasetView] = useState('ALL');
  const [matrixMonthFilter, setMatrixMonthFilter] = useState('ALL');

  const filteredMatrixWeeks = useMemo(() => {
    return scheduleWeeks.filter((w) => {
      if (matrixMonthFilter === 'Future') return w.status === 'Future';
      if (matrixMonthFilter !== 'ALL' && w.monthName !== matrixMonthFilter) return false;
      return true;
    });
  }, [scheduleWeeks, matrixMonthFilter]);

  /* ==============================================================================
   * SECTION 8: CRUD ACTION HANDLERS
   * ============================================================================== */

  const handleSaveDriver = (formData) => {
    // Strict Validation: Require Driver Name, Company, Status, and Hire Date before saving
    if (!formData.name || !String(formData.name).trim()) {
      addToast('Validation Error: Driver Name is required before saving.', 'error');
      return;
    }
    if (!formData.hireDate || !String(formData.hireDate).trim()) {
      addToast('Validation Error: Hire Date is required before saving (dates must not be blank).', 'error');
      return;
    }
    if (!formData.status || !String(formData.status).trim()) {
      addToast('Validation Error: Driver Status is required.', 'error');
      return;
    }

    const validCarrierNames = [
      'Premier Trucking Group Inc',
      'OSY Group Inc',
      'Cargo Freight Trucking Inc',
      'RMR Transportation LLC',
      'Grand One LLC'
    ];
    const compCode = getCompanyCode(formData.company);
    if (!compCode || !validCarrierNames.some((c) => matchesCompany(formData.company, getCompanyCode(c)))) {
      addToast('Validation Error: Valid carrier must be Premier, OSY, Cargo, RMR, or Grand One.', 'error');
      return;
    }

    const cleanName = String(formData.name).trim();
    const tenureCalc = calculateSafeTenureDays(formData.hireDate, formData.termDate, formData.status, TODAY_STR);

    // Duplicate Prevention Check: normalized Driver Name + Company + Hire Date
    const normalizedTarget = `${cleanName.toLowerCase()}|${compCode}|${formData.hireDate}`;
    const isDuplicate = driversList.some(
      (d) => modalState.type !== 'editDriver' && `${d.name.toLowerCase()}|${d.companyCode}|${d.hireDate}` === normalizedTarget
    );

    if (isDuplicate && modalState.type !== 'editDriver') {
      addToast(`Duplicate Warning: Driver "${cleanName}" under ${formData.company} with hire date ${formData.hireDate} already exists.`, 'error');
      return;
    }

    if (modalState.type === 'editDriver' && modalState.index_ !== null) {
      const existingRow = data.find((d) => d.index_ === modalState.index_)?.row || [];
      const sparsePayload = new Array(ROW_WIDTH).fill(undefined);
      sparsePayload[DRIVER_COLS.NAME] = formData.name;
      sparsePayload[DRIVER_COLS.COMPANY] = formData.company;
      sparsePayload[DRIVER_COLS.STATUS] = formData.status;
      sparsePayload[DRIVER_COLS.HIRE_DATE] = formData.hireDate;
      sparsePayload[DRIVER_COLS.TENURE_DAYS] = tenureCalc;
      sparsePayload[DRIVER_COLS.TERM_DATE] = formData.termDate;
      sparsePayload[DRIVER_COLS.NOTES] = formData.notes;

      updateItem(modalState.index_, sparsePayload);
      addToast(`Updated driver ${cleanName} (Master Data saved successfully)`, 'success');
    } else {
      // Insert driver directly at Master Data!A6:G6 (row 6 / index 5) shifting ONLY A:G downward
      const INSERT_ROW_INDEX = 5;
      const existingDriverRows = [];
      for (let i = INSERT_ROW_INDEX; i < data.length; i++) {
        const r = data[i]?.row;
        if (r && (r[0] || r[1] || r[3])) {
          existingDriverRows.push(r.slice(0, 7));
        }
      }

      // Shift existing driver columns downward
      for (let offset = 0; offset < existingDriverRows.length; offset++) {
        const targetIdx = INSERT_ROW_INDEX + 1 + offset;
        const shiftedCells = existingDriverRows[offset];
        const sparse = new Array(ROW_WIDTH).fill(undefined);
        for (let col = 0; col < 7; col++) {
          sparse[col] = shiftedCells[col];
        }
        if (data.some(d => d.index_ === targetIdx)) {
          updateItem(targetIdx, sparse);
        } else {
          insertItem(undefined, sparse);
        }
      }

      // Place new driver at Master Data!A6:G6 (index 5)
      const newRow = new Array(ROW_WIDTH).fill(undefined);
      newRow[DRIVER_COLS.NAME] = cleanName;
      newRow[DRIVER_COLS.COMPANY] = formData.company;
      newRow[DRIVER_COLS.STATUS] = formData.status || 'Active';
      newRow[DRIVER_COLS.HIRE_DATE] = formData.hireDate;
      newRow[DRIVER_COLS.TENURE_DAYS] = tenureCalc;
      newRow[DRIVER_COLS.TERM_DATE] = formData.termDate || '';
      newRow[DRIVER_COLS.NOTES] = formData.notes || '';

      if (data.some(d => d.index_ === INSERT_ROW_INDEX)) {
        updateItem(INSERT_ROW_INDEX, newRow);
      } else {
        insertItem(INSERT_ROW_INDEX, newRow);
      }

      addToast(`Driver ${cleanName} saved successfully to Master Data!A6:G6 (Top Shuffled)`, 'success');
    }

    setModalState({ isOpen: false, type: null, item: null, index_: null });
  };

  const handleSaveTruck = (formData) => {
    if (!formData.unit) {
      addToast('Validation Error: Truck unit number is required.', 'error');
      return;
    }
    const validCarrierNames = [
      'Premier Trucking Group Inc',
      'OSY Group Inc',
      'Cargo Freight Trucking Inc',
      'RMR Transportation LLC',
      'Grand One LLC'
    ];
    const compCode = getCompanyCode(formData.company);
    if (!compCode || !validCarrierNames.some((c) => matchesCompany(formData.company, getCompanyCode(c)))) {
      addToast('Validation Error: A valid carrier (Premier, OSY, Cargo, RMR, or Grand One) is required.', 'error');
      return;
    }

    const cleanUnit = String(formData.unit).trim();

    // Duplicate Prevention Check: Unit Number
    const isDuplicateTruck = trucksList.some(
      (t) => modalState.type !== 'editTruck' && String(t.unit).trim().toLowerCase() === cleanUnit.toLowerCase()
    );
    if (isDuplicateTruck && modalState.type !== 'editTruck') {
      addToast(`Duplicate Warning: Truck Unit Number "${cleanUnit}" already exists in Master Data.`, 'error');
      return;
    }

    if (modalState.type === 'editTruck' && modalState.index_ !== null) {
      const existingRow = data.find((d) => d.index_ === modalState.index_)?.row || [];
      const sparsePayload = new Array(ROW_WIDTH).fill(undefined);
      sparsePayload[TRUCK_COLS.UNIT] = formData.unit;
      sparsePayload[TRUCK_COLS.COMPANY] = formData.company;
      sparsePayload[TRUCK_COLS.STATUS] = formData.status;
      sparsePayload[TRUCK_COLS.STATUS_DATE] = formData.statusDate;
      sparsePayload[TRUCK_COLS.NOTES] = formData.notes;

      updateItem(modalState.index_, sparsePayload);
      addToast(`Updated truck unit ${cleanUnit} (Master Data saved successfully)`, 'success');
    } else {
      // Insert truck directly at Master Data!H6:L6 (row 6 / index 5) shifting ONLY H:L downward
      const INSERT_ROW_INDEX = 5;
      const existingTruckRows = [];
      for (let i = INSERT_ROW_INDEX; i < data.length; i++) {
        const r = data[i]?.row;
        if (r && (r[7] || r[8] || r[9])) {
          existingTruckRows.push(r.slice(7, 13));
        }
      }

      for (let offset = 0; offset < existingTruckRows.length; offset++) {
        const targetIdx = INSERT_ROW_INDEX + 1 + offset;
        const shiftedCells = existingTruckRows[offset];
        const sparse = new Array(ROW_WIDTH).fill(undefined);
        for (let col = 0; col < 5; col++) {
          sparse[7 + col] = shiftedCells[col];
        }
        if (data.some(d => d.index_ === targetIdx)) {
          updateItem(targetIdx, sparse);
        } else {
          insertItem(undefined, sparse);
        }
      }

      const newRow = new Array(ROW_WIDTH).fill(undefined);
      newRow[TRUCK_COLS.UNIT] = cleanUnit;
      newRow[TRUCK_COLS.COMPANY] = formData.company;
      newRow[TRUCK_COLS.STATUS] = formData.status || 'Active';
      newRow[TRUCK_COLS.STATUS_DATE] = formData.statusDate || TODAY_STR;
      newRow[TRUCK_COLS.NOTES] = formData.notes || '';

      if (data.some(d => d.index_ === INSERT_ROW_INDEX)) {
        updateItem(INSERT_ROW_INDEX, newRow);
      } else {
        insertItem(INSERT_ROW_INDEX, newRow);
      }

      addToast(`Truck Unit ${cleanUnit} saved successfully to Master Data!H6:L6 (Top Shuffled)`, 'success');
    }

    setModalState({ isOpen: false, type: null, item: null, index_: null });
  };

  const handleDeleteItem = () => {
    if (modalState.index_ !== null) {
      deleteItem(modalState.index_);
      addToast('Row successfully deleted from sheet', 'info');
    }
    setModalState({ isOpen: false, type: null, item: null, index_: null });
  };

  // Safe driver cell clearing (clears only columns A:G without deleting entire shared rows)
  const handleClearDriverCells = (index_) => {
    if (index_ !== null && index_ !== undefined) {
      const sparse = new Array(ROW_WIDTH).fill(undefined);
      for (let c = 0; c < 7; c++) sparse[c] = null;
      updateItem(index_, sparse);
      addToast(`Cleared duplicate driver cells at Row ${index_ + 1} (A:G preserved)`, 'success');
      setActiveTab('drivers');
    }
    setModalState({ isOpen: false, type: null, item: null, index_: null });
  };

  /* ==============================================================================
   * SECTION 9: RENDERING
   * ============================================================================== */

  return (
    <div className="min-h-screen bg-[#F4F3EE] text-slate-800 flex flex-col font-sans antialiased selection:bg-blue-100 selection:text-blue-800">
      {/* Dynamic Toasts */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
              toast.type === 'success'
                ? 'bg-emerald-800 text-white'
                : toast.type === 'error'
                ? 'bg-rose-800 text-white'
                : 'bg-slate-900 text-white'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
            {toast.type === 'error' && <ShieldAlert className="w-4 h-4 text-rose-300" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-blue-300" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Main Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-lg tracking-tight text-slate-900">FleetPulse</h1>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                    Master Hub
                  </span>
                </div>
                <p className="text-xs text-[#617083]">Live Weekly Telematics &amp; Workforce Sync</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center space-x-1 bg-stone-100 p-1 rounded-xl border border-stone-200/60 overflow-x-auto">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                KPI Dashboard
              </button>
              <button
                onClick={() => setActiveTab('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'matrix'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                History Matrix
              </button>
              <button
                onClick={() => setActiveTab('drivers')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'drivers'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Drivers ({driversList.length})
              </button>
              <button
                onClick={() => setActiveTab('trucks')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'trucks'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Trucks ({trucksList.length})
              </button>
              <button
                onClick={() => setActiveTab('companies')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'companies'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                Carriers
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'audit'
                    ? 'bg-white text-amber-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Audit
                {auditIssues.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                    {auditIssues.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('sheets')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'sheets'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Sync
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Reporting Control Bar */}
      <section className="bg-stone-50 border-b border-stone-200/80 py-3 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Populated Week Anchor Dropdown */}
            <div className="flex items-center bg-white border border-stone-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <Calendar className="w-4 h-4 text-blue-600 mr-2" />
              <span className="text-xs font-medium text-[#617083] mr-2">Anchor:</span>
              <select
                value={selectedWeekNum}
                onChange={(e) => setSelectedWeekNum(Number(e.target.value))}
                aria-label="Select Anchor Week"
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
              >
                {scheduleWeeks
                  .filter((w) => w.isPopulated)
                  .map((w) => (
                    <option key={w.weekNum} value={w.weekNum}>
                      Week {w.weekNum} ({formatDisplayDate(w.startDate)} – {formatDisplayDate(w.endDate)})
                    </option>
                  ))}
              </select>
            </div>

            {/* Period Selection Popover */}
            <div className="relative">
              <button
                onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                className="flex items-center gap-1.5 bg-white border border-stone-300 hover:border-slate-400 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Period: {periodPreset.toUpperCase()}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isPeriodOpen && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-stone-200 p-4 z-50">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-stone-100">
                    <span className="text-xs font-bold text-slate-800">Reporting Window</span>
                    <button
                      onClick={() => setIsPeriodOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {['1W', '4W', '8W', '12W', '26W', '52W', 'YTD'].map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setPeriodPreset(p);
                          setIsPeriodOpen(false);
                        }}
                        className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-all ${
                          periodPreset === p
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-stone-100 text-slate-700 hover:bg-stone-200'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-stone-100">
                    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                      Custom Date Range
                    </span>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">From Date</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full text-xs p-1.5 border border-stone-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">To Date</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full text-xs p-1.5 border border-stone-300 rounded-lg"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setPeriodPreset('custom');
                          setIsPeriodOpen(false);
                        }}
                        className="w-full mt-1 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800"
                      >
                        Apply Range
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Carrier Filter Popover */}
            <div className="relative">
              <button
                onClick={() => setIsCompanyFilterOpen(!isCompanyFilterOpen)}
                className="flex items-center gap-1.5 bg-white border border-stone-300 hover:border-slate-400 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
              >
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  Carriers ({selectedCompanies.length === 5 ? 'All 5' : `${selectedCompanies.length}/5`})
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isCompanyFilterOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-stone-200 p-4 z-50">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-stone-100">
                    <span className="text-xs font-bold text-slate-800">Filter Carriers</span>
                    <button
                      onClick={() => setIsCompanyFilterOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2 mb-3">
                    {COMPANIES.map((comp) => {
                      const isChecked = selectedCompanies.includes(comp.code);
                      return (
                        <label
                          key={comp.code}
                          className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer hover:bg-stone-50 p-1 rounded-md"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                if (selectedCompanies.length > 1) {
                                  setSelectedCompanies(selectedCompanies.filter((c) => c !== comp.code));
                                }
                              } else {
                                setSelectedCompanies([...selectedCompanies, comp.code]);
                              }
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: comp.color }}
                          />
                          <span>{comp.shortName}</span>
                          <span className="ml-auto text-[10px] text-slate-500">({comp.code})</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-stone-100">
                    <button
                      onClick={() => setSelectedCompanies(COMPANIES.map((c) => c.code))}
                      className="flex-1 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedCompanies(['PTG'])}
                      className="flex-1 py-1 text-[11px] font-bold text-slate-600 bg-stone-100 hover:bg-stone-200 rounded-md"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4 YTD Mini Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
            <div className="bg-white border border-stone-200/80 px-3 py-1.5 rounded-xl shadow-2xs flex flex-col">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-600">
                Period Hires
              </span>
              <span className="text-sm font-bold text-emerald-600">+{periodAggregates.hires}</span>
            </div>
            <div className="bg-white border border-stone-200/80 px-3 py-1.5 rounded-xl shadow-2xs flex flex-col">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-600">
                Period Terms
              </span>
              <span className="text-sm font-bold text-rose-600">-{periodAggregates.terms}</span>
            </div>
            <div className="bg-white border border-stone-200/80 px-3 py-1.5 rounded-xl shadow-2xs flex flex-col">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-600">
                Driver Net Δ
              </span>
              <span
                className={`text-sm font-bold ${
                  periodAggregates.driverNetGrowth >= 0 ? 'text-blue-600' : 'text-rose-600'
                }`}
              >
                {periodAggregates.driverNetGrowth >= 0
                  ? `+${periodAggregates.driverNetGrowth}`
                  : periodAggregates.driverNetGrowth}
              </span>
            </div>
            <div className="bg-white border border-stone-200/80 px-3 py-1.5 rounded-xl shadow-2xs flex flex-col">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-600">
                Fleet Net Δ
              </span>
              <span
                className={`text-sm font-bold ${
                  periodAggregates.fleetNetGrowth >= 0 ? 'text-purple-600' : 'text-rose-600'
                }`}
              >
                {periodAggregates.fleetNetGrowth >= 0
                  ? `+${periodAggregates.fleetNetGrowth}`
                  : periodAggregates.fleetNetGrowth}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* MISSING HIRE DATES WARNING BANNER */}
        {missingHireDateDrivers.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-amber-900 uppercase tracking-wide">
                    Hire Date Required ({missingHireDateDrivers.length} Active Drivers)
                  </h3>
                  <span className="text-[10px] bg-amber-200 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    Data Integrity Guard
                  </span>
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  These drivers count as currently active in workforce totals, but are excluded from weekly hire counts until real dates are entered. Dates are never fabricated.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setActiveTab('drivers');
                setDriverStatusFilter('Active');
              }}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors"
            >
              Review {missingHireDateDrivers.length} Drivers &rarr;
            </button>
          </div>
        )}

        {/* =========================================================================
            TAB 1: WEEKLY KPI DASHBOARD
           ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Summary Metrics Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total Driver Workforce
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {scopedAnchorMetrics.totalDrivers}
                    </span>
                    <span className="text-xs text-[#617083]">
                      ({scopedAnchorMetrics.activeDrivers} Active • {scopedAnchorMetrics.inHiringDrivers} In Hiring)
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Net Driver Change (This Week)
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span
                      className={`text-3xl font-extrabold ${
                        scopedAnchorMetrics.change >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {scopedAnchorMetrics.change >= 0
                        ? `+${scopedAnchorMetrics.change}`
                        : scopedAnchorMetrics.change}
                    </span>
                    <span className="text-xs text-[#617083]">
                      (+{scopedAnchorMetrics.hired} Hired • -{scopedAnchorMetrics.terminated} Term)
                    </span>
                  </div>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    scopedAnchorMetrics.change >= 0
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {scopedAnchorMetrics.change >= 0 ? (
                    <TrendingUp className="w-6 h-6" />
                  ) : (
                    <TrendingDown className="w-6 h-6" />
                  )}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Driver-to-Truck Ratio
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {scopedAnchorMetrics.ratio}
                    </span>
                    <span className="text-xs text-[#617083]">
                      ({scopedAnchorMetrics.activeDrivers} Drv / {scopedAnchorMetrics.activeTrucks} Trk)
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Truck className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* DRIVER KPIS ROW */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">Driver KPIs</h2>
                  <span className="text-xs text-[#617083] font-medium">
                    • Scoped to Week {currentAnchorWeek.weekNum}
                  </span>
                </div>
                <button
                  onClick={() =>
                    showAllKpisInRow(['drv_active', 'drv_hiring', 'drv_newHires', 'drv_term'])
                  }
                  className="text-blue-600 font-semibold text-xs hover:underline"
                >
                  Show All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {!hiddenKpis['drv_active'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('drv_active')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Active Drivers</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">
                          {scopedAnchorMetrics.activeDrivers}
                        </div>
                      </div>
                      {renderMiniSparkline(
                        scheduleWeeks.slice(0, 13).map((w) => w.overall.activeDrivers || 0),
                        '#2E7BF6'
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      {currentAnchorWeek.wow?.activeDrivers?.diff >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span
                        className={
                          currentAnchorWeek.wow?.activeDrivers?.diff >= 0
                            ? 'text-emerald-600 font-bold'
                            : 'text-rose-600 font-bold'
                        }
                      >
                        {currentAnchorWeek.wow?.activeDrivers?.diff >= 0 ? '+' : ''}
                        {currentAnchorWeek.wow?.activeDrivers?.diff} (
                        {currentAnchorWeek.wow?.activeDrivers?.pct.toFixed(1)}%)
                      </span>
                      <span>vs prior week</span>
                    </div>
                  </div>
                )}

                {!hiddenKpis['drv_hiring'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('drv_hiring')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">
                          In Hiring / Onboarding
                        </span>
                        <div className="text-2xl font-bold text-amber-600 mt-1">
                          {scopedAnchorMetrics.inHiringDrivers}
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      <span>Pipeline ready for dispatch</span>
                    </div>
                  </div>
                )}

                {!hiddenKpis['drv_newHires'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('drv_newHires')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Newly Hired</span>
                        <div className="text-2xl font-bold text-emerald-600 mt-1">
                          +{scopedAnchorMetrics.hired}
                        </div>
                      </div>
                      {renderMiniSparkline(
                        scheduleWeeks.slice(0, 13).map((w) => w.overall.hired || 0),
                        '#10B981'
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      {currentAnchorWeek.wow?.hired?.diff >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span
                        className={
                          currentAnchorWeek.wow?.hired?.diff >= 0
                            ? 'text-emerald-600 font-bold'
                            : 'text-rose-600 font-bold'
                        }
                      >
                        {currentAnchorWeek.wow?.hired?.diff >= 0 ? '+' : ''}
                        {currentAnchorWeek.wow?.hired?.diff} vs prev week
                      </span>
                    </div>
                  </div>
                )}

                {!hiddenKpis['drv_term'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('drv_term')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Terminated</span>
                        <div className="text-2xl font-bold text-rose-600 mt-1">
                          -{scopedAnchorMetrics.terminated}
                        </div>
                      </div>
                      {renderMiniSparkline(
                        scheduleWeeks.slice(0, 13).map((w) => w.overall.terminated || 0),
                        '#EF4444'
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      {currentAnchorWeek.wow?.terminated?.diff <= 0 ? (
                        <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span
                        className={
                          currentAnchorWeek.wow?.terminated?.diff <= 0
                            ? 'text-emerald-600 font-bold'
                            : 'text-rose-600 font-bold'
                        }
                      >
                        {currentAnchorWeek.wow?.terminated?.diff >= 0 ? '+' : ''}
                        {currentAnchorWeek.wow?.terminated?.diff} vs prev week
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FLEET & COVERAGE KPIS ROW */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">Fleet &amp; Coverage KPIs</h2>
                  <span className="text-xs text-[#617083] font-medium">
                    • Real-time Asset Tracking
                  </span>
                </div>
                <button
                  onClick={() =>
                    showAllKpisInRow(['trk_active', 'trk_coverage', 'trk_added', 'trk_removed', 'trk_managed'])
                  }
                  className="text-blue-600 text-xs font-semibold hover:underline"
                >
                  Show All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {!hiddenKpis['trk_active'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('trk_active')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Active Trucks</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">
                          {scopedAnchorMetrics.activeTrucks}
                        </div>
                      </div>
                      {renderMiniSparkline(
                        scheduleWeeks.slice(0, 13).map((w) => w.overall.activeTrucks || 0),
                        '#7C3AED',
                        90,
                        30
                      )}
                    </div>
                    <div className="mt-3 text-xs text-slate-600 font-semibold">
                      {scopedAnchorMetrics.utilizationPct.toFixed(0)}% Fleet Active
                    </div>
                  </div>
                )}

                {!hiddenKpis['trk_coverage'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group bg-linear-to-br from-white to-emerald-50/40">
                    <button
                      onClick={() => toggleKpiVisibility('trk_coverage')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div>
                      <span className="text-xs font-semibold text-slate-500">Truck Coverage</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-bold text-emerald-600">
                          {scopedAnchorMetrics.covered}
                        </span>
                        <span className="text-xs font-bold text-emerald-700">Covered</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                      {scopedAnchorMetrics.empty > 0 ? (
                        <span className="text-amber-800 font-bold">
                          Empty Trucks: <strong>{scopedAnchorMetrics.empty}</strong>
                        </span>
                      ) : (
                        <span className="text-blue-800 font-bold">
                          Uncovered Drivers: <strong>{scopedAnchorMetrics.uncovered}</strong>
                        </span>
                      )}
                      <span className="text-[10px] text-[#617083]">MIN/MAX exact</span>
                    </div>
                  </div>
                )}

                {!hiddenKpis['trk_added'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('trk_added')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Newly Added</span>
                        <div className="text-2xl font-bold text-emerald-600 mt-1">
                          +{scopedAnchorMetrics.addedTrucks}
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      <span>Activated this week</span>
                    </div>
                  </div>
                )}

                {!hiddenKpis['trk_removed'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('trk_removed')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Removed / Idle</span>
                        <div className="text-2xl font-bold text-rose-600 mt-1">
                          -{scopedAnchorMetrics.removedTrucks}
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      <span>Deactivated / Inactive</span>
                    </div>
                  </div>
                )}

                {!hiddenKpis['trk_managed'] && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs relative group">
                    <button
                      onClick={() => toggleKpiVisibility('trk_managed')}
                      className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Total Managed</span>
                        <div className="text-2xl font-bold text-slate-800 mt-1">
                          {scopedAnchorMetrics.totalManagedTrucks}
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-stone-100 text-slate-600 flex items-center justify-center">
                        <Layers className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      <span>All units in master sheet</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Coverage Gap Dynamic Formula Card */}
            <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-600">
                    Coverage Gap Dynamics
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      coverageTrend.status === 'improving'
                        ? 'bg-emerald-100 text-emerald-800'
                        : coverageTrend.status === 'declining'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-stone-200 text-slate-700'
                    }`}
                  >
                    {coverageTrend.label}
                  </span>
                </div>
                <p className="text-xs text-slate-700">
                  Formula:{' '}
                  <code className="bg-stone-100 px-2 py-0.5 rounded text-xs font-mono text-slate-900 border border-stone-200">
                    Gap = Active Drivers ({scopedAnchorMetrics.activeDrivers}) − Active Trucks ({scopedAnchorMetrics.activeTrucks}) = {scopedAnchorMetrics.coverageGap}
                  </code>
                </p>
              </div>

              <div className="flex items-center gap-6 bg-stone-50 px-5 py-3 rounded-xl border border-stone-200/60">
                <div className="text-right">
                  <div className="text-xs text-[#617083] font-medium">Current Gap State</div>
                  <div className="text-sm font-black text-slate-900">
                    {scopedAnchorMetrics.coverageGap < 0
                      ? `${Math.abs(scopedAnchorMetrics.coverageGap)} Empty Trucks`
                      : scopedAnchorMetrics.coverageGap > 0
                      ? `${scopedAnchorMetrics.coverageGap} Uncovered Drivers`
                      : 'Equilibrium (0)'}
                  </div>
                </div>
                <div className="h-8 w-px bg-stone-300" />
                <div>
                  <div className="text-xs text-[#617083] font-medium">Identity Balance Verification</div>
                  <div className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Covered ({scopedAnchorMetrics.covered}) + Empty ({scopedAnchorMetrics.empty}) = {scopedAnchorMetrics.activeTrucks} Trucks
                  </div>
                </div>
              </div>
            </div>

            {/* CHARTS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Fleet Trend & Distribution Chart (2 Cols) */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-100">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">Fleet Trend &amp; Distribution</h3>
                      <p className="text-xs text-[#617083]">
                        {chartScope === 'trend'
                          ? 'Multi-week trajectory across carriers'
                          : chartScope === 'sideBySide'
                          ? `Week ${currentAnchorWeek.weekNum} snapshot by company`
                          : 'Individual company growth curves with independent scaling'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex bg-stone-100 p-1 rounded-xl text-xs font-medium">
                        <button
                          onClick={() => setChartScope('trend')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            chartScope === 'trend'
                              ? 'bg-white text-blue-600 font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Trend
                        </button>
                        <button
                          onClick={() => setChartScope('sideBySide')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            chartScope === 'sideBySide'
                              ? 'bg-white text-blue-600 font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Side-by-Side
                        </button>
                        <button
                          onClick={() => setChartScope('growth')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            chartScope === 'growth'
                              ? 'bg-white text-blue-600 font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Growth Multiples
                        </button>
                      </div>

                      {chartScope !== 'growth' && (
                        <div className="flex bg-stone-100 p-1 rounded-xl text-xs">
                          <button
                            onClick={() => setChartMetricType('drivers')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                              chartMetricType === 'drivers'
                                ? 'bg-white text-slate-900 font-bold shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            Drivers
                          </button>
                          <button
                            onClick={() => setChartMetricType('trucks')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                              chartMetricType === 'trucks'
                                ? 'bg-white text-slate-900 font-bold shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            Trucks
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Carrier chips with high contrast WCAG colors */}
                  {chartScope !== 'growth' && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      <span className="text-xs font-semibold text-slate-600 mr-1">Carriers:</span>
                      {selectedCompanies.map((code) => {
                        const comp = COMPANY_MAP[code];
                        return (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border"
                            style={{
                              borderColor: `${comp.color}50`,
                              backgroundColor: `${comp.color}15`,
                              color: comp.textColor
                            }}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: comp.color }} />
                            {comp.shortName}
                            {selectedCompanies.length > 1 && (
                              <button
                                onClick={() =>
                                  setSelectedCompanies(selectedCompanies.filter((c) => c !== code))
                                }
                                className="hover:opacity-75 cursor-pointer ml-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Style Presets */}
                  <div className="flex flex-wrap items-center justify-between text-xs mb-3 bg-stone-50 p-2 rounded-xl border border-stone-200/50 gap-2">
                    <span className="text-slate-600 font-semibold">Style Presets:</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        onClick={() => setChartStylePreset('original')}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                          chartStylePreset === 'original'
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-700 hover:bg-stone-100 border border-stone-200'
                        }`}
                      >
                        Original
                      </button>

                      <button
                        disabled={chartScope !== 'sideBySide'}
                        onClick={() => setChartStylePreset('rounded')}
                        title={
                          chartScope !== 'sideBySide'
                            ? 'Rounded Column style is only available in Side-by-Side view'
                            : ''
                        }
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                          chartStylePreset === 'rounded'
                            ? 'bg-slate-900 text-white'
                            : chartScope === 'sideBySide'
                            ? 'bg-white text-slate-700 hover:bg-stone-100 border border-stone-200'
                            : 'bg-stone-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Rounded Column
                      </button>

                      <button
                        disabled={selectedCompanies.length !== 1 || chartScope === 'sideBySide'}
                        onClick={() => setChartStylePreset('zigzag')}
                        title={
                          selectedCompanies.length !== 1
                            ? 'Zigzag Labels style is only available when a single carrier is selected'
                            : chartScope === 'sideBySide'
                            ? 'Zigzag is for multi-week trend lines'
                            : ''
                        }
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                          chartStylePreset === 'zigzag'
                            ? 'bg-slate-900 text-white'
                            : selectedCompanies.length === 1 && chartScope !== 'sideBySide'
                            ? 'bg-white text-slate-700 hover:bg-stone-100 border border-stone-200'
                            : 'bg-stone-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Zigzag Labels
                      </button>

                      <button
                        disabled={chartScope === 'sideBySide'}
                        onClick={() => setChartStylePreset('rainbow')}
                        title={chartScope === 'sideBySide' ? 'Rainbow bars is for multi-week timeline' : ''}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                          chartStylePreset === 'rainbow'
                            ? 'bg-slate-900 text-white'
                            : chartScope !== 'sideBySide'
                            ? 'bg-white text-slate-700 hover:bg-stone-100 border border-stone-200'
                            : 'bg-stone-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Rainbow Bars+Line
                      </button>
                    </div>
                  </div>

                  {/* Chart Container / Small Multiples */}
                  {chartScope === 'growth' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-600">Metric:</span>
                          <select
                            value={growthMetric}
                            onChange={(e) => setGrowthMetric(e.target.value)}
                            aria-label="Growth Metric Selector"
                            className="bg-stone-100 border border-stone-300 text-xs font-bold rounded-lg px-2 py-1"
                          >
                            <option value="active">Active Drivers</option>
                            <option value="trucks">Active Trucks</option>
                            <option value="hired">Newly Hired</option>
                            <option value="terminated">Terminated</option>
                            <option value="change">Net Driver Δ</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-slate-500 font-medium">Grid Columns:</span>
                          {[1, 2, 3].map((c) => (
                            <button
                              key={c}
                              onClick={() => setGrowthCols(c)}
                              className={`w-6 h-6 rounded text-xs font-bold ${
                                growthCols === c ? 'bg-blue-600 text-white' : 'bg-stone-100 text-slate-700'
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        className={`grid gap-3 ${
                          growthCols === 1
                            ? 'grid-cols-1'
                            : growthCols === 2
                            ? 'grid-cols-1 sm:grid-cols-2'
                            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                        }`}
                      >
                        {COMPANIES.map((comp) => {
                          const weeksData = activePeriodWeeks.filter((w) => w.isPopulated);
                          const series = weeksData.map((w) => {
                            const m = w.byCompany[comp.code] || {};
                            if (growthMetric === 'active') return m.activeDrivers || 0;
                            if (growthMetric === 'trucks') return m.activeTrucks || 0;
                            if (growthMetric === 'hired') return m.hired || 0;
                            if (growthMetric === 'terminated') return m.terminated || 0;
                            if (growthMetric === 'change') return m.change || 0;
                            return 0;
                          });

                          const curVal = series[series.length - 1] || 0;
                          const firstVal = series[0] || 0;
                          const diff = curVal - firstVal;
                          const pct = firstVal > 0 ? (diff / firstVal) * 100 : 0;
                          const minS = d3.min(series) || 0;
                          const maxS = d3.max(series) || 10;
                          const isGood = growthMetric === 'terminated' ? diff <= 0 : diff >= 0;

                          const svgW = 200;
                          const svgH = 55;
                          const pad = 6;
                          const xS = d3.scaleLinear().domain([0, Math.max(series.length - 1, 1)]).range([pad, svgW - pad]);
                          const yS = d3.scaleLinear().domain([minS, Math.max(maxS, minS + 1)]).range([svgH - pad, pad]);
                          const lineGen = d3.line().x((d, i) => xS(i)).y((d) => yS(d)).curve(d3.curveMonotoneX);
                          const areaGen = d3.area().x((d, i) => xS(i)).y0(svgH - pad).y1((d) => yS(d)).curve(d3.curveMonotoneX);

                          return (
                            <div
                              key={comp.code}
                              className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex flex-col justify-between"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: comp.color }}
                                  />
                                  <span className="text-xs font-bold text-slate-800">{comp.code}</span>
                                  <span className="text-[11px] text-slate-600 truncate max-w-[90px]">
                                    {comp.shortName}
                                  </span>
                                </div>
                                <span className="text-xs font-extrabold text-slate-900">{curVal}</span>
                              </div>

                              <div className="my-2 flex justify-center">
                                <svg width={svgW} height={svgH} className="overflow-visible">
                                  <defs>
                                    <linearGradient id={`grad-${comp.code}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={comp.color} stopOpacity="0.3" />
                                      <stop offset="100%" stopColor={comp.color} stopOpacity="0.0" />
                                    </linearGradient>
                                  </defs>
                                  <path d={areaGen(series)} fill={`url(#grad-${comp.code})`} />
                                  <path d={lineGen(series)} fill="none" stroke={comp.color} strokeWidth="2.2" strokeLinecap="round" />
                                  {series.map((val, i) => (
                                    <circle
                                      key={i}
                                      cx={xS(i)}
                                      cy={yS(val)}
                                      r={i === series.length - 1 ? 3.5 : 2}
                                      fill={i === series.length - 1 ? comp.color : '#ffffff'}
                                      stroke={comp.color}
                                      strokeWidth="1.5"
                                    />
                                  ))}
                                </svg>
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-stone-200/60">
                                <span
                                  className={`font-semibold ${
                                    isGood ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {diff >= 0 ? `+${diff}` : diff} (
                                  {firstVal === 0 ? 'new activity' : `${pct.toFixed(1)}%`})
                                </span>
                                <span className="text-slate-500 font-medium">Range: {minS}–{maxS}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full min-h-[340px] pt-1">
                      <div ref={trendChartRef} className="w-full h-[340px]" />
                    </div>
                  )}
                </div>
              </div>

              {/* Turnover & Tenure Card (1 Col) */}
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Turnover Dynamics</h3>
                      <select
                        value={turnoverCompany}
                        onChange={(e) => setTurnoverCompany(e.target.value)}
                        aria-label="Select Company for Turnover Dynamics"
                        className="mt-1 bg-stone-100 border border-stone-300 rounded-lg text-xs font-bold px-2 py-1 text-slate-800 focus:outline-blue-500"
                      >
                        <option value="ALL">Overall (All Carriers)</option>
                        {COMPANIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.shortName} ({c.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 font-bold text-emerald-700">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Hired
                      </span>
                      <span className="flex items-center gap-1 font-bold text-rose-700">
                        <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Term
                      </span>
                    </div>
                  </div>
                  <div ref={turnoverChartRef} className="w-full h-[205px]" />
                </div>

                <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-sm">Tenure &amp; Early Attrition</h3>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-slate-600 font-medium">Window:</span>
                      <span className="font-bold text-blue-600">{tenureWindowDays}d</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="15"
                    max="365"
                    value={tenureWindowDays}
                    onChange={(e) => setTenureWindowDays(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                      <div className="text-[10px] uppercase font-bold text-[#657488]">
                        Early Attrition Rate
                      </div>
                      <div className="text-lg font-bold text-rose-600">
                        {tenureAnalytics.earlyAttritionRate.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-600 font-medium">
                        {tenureAnalytics.totalEarlyQuitters} quits &lt;{tenureWindowDays}d
                      </div>
                    </div>

                    <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                      <div className="text-[10px] uppercase font-bold text-[#657488]">
                        Avg Days to Quit
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {tenureAnalytics.avgDaysToQuit} <span className="text-xs font-normal">days</span>
                      </div>
                      <div className="text-[10px] text-slate-600 font-medium">Early quit mean</div>
                    </div>

                    <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                      <div className="text-[10px] uppercase font-bold text-[#657488]">
                        Established Tenure
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {tenureAnalytics.establishedAvgTenure} <span className="text-xs font-normal">days</span>
                      </div>
                      <div className="text-[10px] text-slate-600 font-medium">Active &ge;{tenureWindowDays}d mean</div>
                    </div>

                    <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                      <div className="text-[10px] uppercase font-bold text-[#657488]">
                        Established Attrition
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {tenureAnalytics.establishedAttritionRate.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-600 font-medium">Tenured stability</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* COVERAGE TIMELINE & CARRIER PIE/BARS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Asset Coverage Over Time</h3>
                    <p className="text-xs text-[#617083]">Covered assignments vs empty truck capacity</p>
                    {/* Permanent Legend */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold mt-1">
                      {coverageChartMode === 'coveredEmpty' ? (
                        <>
                          <span className="flex items-center gap-1 text-emerald-700 font-bold">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Covered Trucks
                          </span>
                          <span className="flex items-center gap-1 text-amber-700 font-bold">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Empty Trucks
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1 text-blue-700 font-bold"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Active Drivers</span>
                          <span className="flex items-center gap-1 text-purple-700 font-bold"><span className="w-2.5 h-2.5 rounded-full bg-purple-600" /> Active Trucks</span>
                          <span className="flex items-center gap-1 text-amber-700 font-bold"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Empty Trucks</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl text-xs">
                    <button
                      onClick={() => setCoverageChartMode('coveredEmpty')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                        coverageChartMode === 'coveredEmpty'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Covered vs Empty
                    </button>
                    <button
                      onClick={() => setCoverageChartMode('threeLine')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                        coverageChartMode === 'threeLine'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      3-Line (Drivers/Trucks/Empty)
                    </button>
                  </div>
                </div>
                <div ref={coverageChartRef} className="w-full h-[210px]" />
              </div>

              <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 pb-2 border-b border-stone-100">
                    <h3 className="font-bold text-slate-900 text-sm">Carrier Distribution</h3>
                    <div className="flex flex-wrap items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs">
                      <button
                        onClick={() => setDistributionView('active')}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-center font-bold text-[11px] transition-all ${
                          distributionView === 'active' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        onClick={() => setDistributionView('hired')}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-center font-bold text-[11px] transition-all ${
                          distributionView === 'hired' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        New Hires
                      </button>
                      <button
                        onClick={() => setDistributionView('terminated')}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-center font-bold text-[11px] transition-all ${
                          distributionView === 'terminated' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Terminated
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <select
                        value={distributionWeekNum}
                        onChange={(e) => setDistributionWeekNum(Number(e.target.value))}
                        aria-label="Distribution Week"
                        className="bg-stone-50 border border-stone-300 text-xs font-semibold rounded-lg px-2 py-1 text-slate-800"
                      >
                        {scheduleWeeks.filter(w => w.isPopulated).map(w => (
                          <option key={w.weekNum} value={w.weekNum}>Week {w.weekNum}</option>
                        ))}
                      </select>
                      <select
                        value={distributionPeriodPreset}
                        onChange={(e) => setDistributionPeriodPreset(e.target.value)}
                        aria-label="Distribution Period"
                        className="bg-stone-50 border border-stone-300 text-xs font-semibold rounded-lg px-2 py-1 text-slate-800"
                      >
                        <option value="1W">1 Week</option>
                        <option value="4W">4 Weeks</option>
                        <option value="12W">12 Weeks</option>
                        <option value="YTD">YTD</option>
                      </select>
                    </div>
                  </div>

                  {/* Carrier list with matching drivers & percentages */}
                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {COMPANIES.map((comp) => {
                      const targetWeek = scheduleWeeks.find(w => w.weekNum === distributionWeekNum) || currentAnchorWeek;
                      let matchingDrivers = [];
                      
                      if (distributionView === 'active') {
                        matchingDrivers = driversList.filter(d => {
                          if (!matchesCompany(d.companyRaw, comp.code)) return false;
                          const hireCond = !d.hireDate || d.hireDate === '1900-01-01' || d.hireDate <= targetWeek.endDate;
                          const termCond = !d.termDate || d.termDate === '9999-12-31' || d.termDate > targetWeek.endDate;
                          return hireCond && termCond;
                        });
                      } else if (distributionView === 'hired') {
                        matchingDrivers = driversList.filter(d => {
                          if (!matchesCompany(d.companyRaw, comp.code)) return false;
                          return d.hireDate && d.hireDate !== '1900-01-01' && d.hireDate >= targetWeek.startDate && d.hireDate <= targetWeek.endDate;
                        });
                      } else {
                        matchingDrivers = driversList.filter(d => {
                          if (!matchesCompany(d.companyRaw, comp.code)) return false;
                          return d.termDate && d.termDate !== '9999-12-31' && d.termDate >= targetWeek.startDate && d.termDate <= targetWeek.endDate;
                        });
                      }

                      let totalAcrossCompanies = 0;
                      COMPANIES.forEach(c => {
                        if (distributionView === 'active') {
                          totalAcrossCompanies += targetWeek.byCompany[c.code]?.activeDrivers || 0;
                        } else if (distributionView === 'hired') {
                          totalAcrossCompanies += targetWeek.byCompany[c.code]?.hired || 0;
                        } else {
                          totalAcrossCompanies += targetWeek.byCompany[c.code]?.terminated || 0;
                        }
                      });
                      totalAcrossCompanies = Math.max(1, totalAcrossCompanies);

                      const count = matchingDrivers.length;
                      const pct = ((count / totalAcrossCompanies) * 100).toFixed(1);
                      const isExpanded = !!expandedCarrierList[comp.code];

                      return (
                        <div key={comp.code} className="p-2 bg-stone-50 rounded-xl border border-stone-200/60">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span
                              onClick={() => setExpandedCarrierList(prev => ({ ...prev, [comp.code]: !prev[comp.code] }))}
                              className="flex items-center gap-1.5 font-bold cursor-pointer hover:opacity-80"
                              style={{ color: comp.textColor }}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: comp.color }} />
                              {comp.shortName}
                              <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </span>
                            <span className="text-slate-900 font-bold text-xs">
                              {count} <span className="text-slate-500 font-normal">({pct}%)</span>
                            </span>
                          </div>
                          <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden mt-1.5 mb-1">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: comp.color }}
                            />
                          </div>
                          {/* Driver Names List */}
                          {isExpanded && (
                            <div className="mt-2 pt-2 border-t border-stone-200/80 space-y-1 max-h-36 overflow-y-auto">
                              {matchingDrivers.length === 0 ? (
                                <span className="text-[10px] text-slate-400 italic">No matching drivers</span>
                              ) : (
                                matchingDrivers.map((d, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded border border-stone-100">
                                    <span className="font-semibold truncate max-w-[130px]">{d.name || 'Unnamed'}</span>
                                    <span className="text-[10px] text-slate-500">
                                      {distributionView === 'terminated'
                                        ? `Term: ${formatDisplayDate(d.termDate)}`
                                        : `Hired: ${formatDisplayDate(d.hireDate)}`}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">Total Category Count:</span>
                  <span className="font-black text-slate-900">
                    {distributionView === 'active'
                      ? `${scopedAnchorMetrics.activeDrivers} Active Drivers`
                      : distributionView === 'hired'
                      ? `${scopedAnchorMetrics.hired} New Hires`
                      : `${scopedAnchorMetrics.terminated} Terminations`}
                  </span>
                </div>
              </div>
            </div>

            {/* Collapsible Full Table View */}
            <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
              <button
                onClick={() => setIsTableViewOpen(!isTableViewOpen)}
                className="w-full p-4 bg-stone-50 hover:bg-stone-100/80 flex items-center justify-between text-xs font-bold text-slate-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  <span>Consolidated Report Table (Computed Weekly Records)</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500">
                  <span>{isTableViewOpen ? 'Hide Table' : 'View as Table'}</span>
                  {isTableViewOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>

              {isTableViewOpen && (
                <div className="max-h-96 overflow-auto border-t border-stone-200/80">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-900 text-white sticky top-0 z-20">
                      <tr>
                        <th className="p-2.5 font-semibold">Week #</th>
                        <th className="p-2.5 font-semibold">Start</th>
                        <th className="p-2.5 font-semibold">End</th>
                        <th className="p-2.5 font-semibold">Carrier</th>
                        <th className="p-2.5 font-semibold text-right">Active Drv</th>
                        <th className="p-2.5 font-semibold text-right">Hired</th>
                        <th className="p-2.5 font-semibold text-right">Term</th>
                        <th className="p-2.5 font-semibold text-right">Net Δ</th>
                        <th className="p-2.5 font-semibold text-right">Trucks</th>
                        <th className="p-2.5 font-semibold text-right">Added</th>
                        <th className="p-2.5 font-semibold text-right">Removed</th>
                        <th className="p-2.5 font-semibold text-right">Net Trk Δ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {scheduleWeeks
                        .filter((w) => w.isPopulated)
                        .map((w) => (
                          <React.Fragment key={w.weekNum}>
                            {COMPANIES.map((c) => {
                              const m = w.byCompany[c.code] || {};
                              return (
                                <tr key={`${w.weekNum}-${c.code}`} className="hover:bg-stone-50/80 text-slate-700">
                                  <td className="p-2 font-medium">{w.weekLabel}</td>
                                  <td className="p-2 text-slate-500">{w.startDate}</td>
                                  <td className="p-2 text-slate-500">{w.endDate}</td>
                                  <td className="p-2 font-bold" style={{ color: c.textColor }}>
                                    {c.shortName}
                                  </td>
                                  <td className="p-2 text-right font-bold">{m.activeDrivers}</td>
                                  <td className="p-2 text-right text-emerald-600 font-semibold">+{m.hired}</td>
                                  <td className="p-2 text-right text-rose-600 font-semibold">-{m.terminated}</td>
                                  <td className="p-2 text-right font-bold">{m.change}</td>
                                  <td className="p-2 text-right font-bold">{m.activeTrucks}</td>
                                  <td className="p-2 text-right text-emerald-600 font-medium">+{m.addedTrucks}</td>
                                  <td className="p-2 text-right text-rose-600 font-medium">-{m.removedTrucks}</td>
                                  <td className="p-2 text-right font-bold">{m.truckChange}</td>
                                </tr>
                              );
                            })}
                            <tr className="bg-stone-100 font-extrabold text-slate-900 border-b-2 border-stone-300">
                              <td className="p-2 font-black">{w.weekLabel}</td>
                              <td className="p-2 text-slate-600">{w.startDate}</td>
                              <td className="p-2 text-slate-600">{w.endDate}</td>
                              <td className="p-2 text-blue-700 font-black">TOTAL</td>
                              <td className="p-2 text-right font-black">{w.overall.activeDrivers}</td>
                              <td className="p-2 text-right text-emerald-700 font-black">+{w.overall.hired}</td>
                              <td className="p-2 text-right text-rose-700 font-black">-{w.overall.terminated}</td>
                              <td className="p-2 text-right font-black">{w.overall.change}</td>
                              <td className="p-2 text-right font-black">{w.overall.activeTrucks}</td>
                              <td className="p-2 text-right text-emerald-700 font-black">+{w.overall.addedTrucks}</td>
                              <td className="p-2 text-right text-rose-700 font-black">-{w.overall.removedTrucks}</td>
                              <td className="p-2 text-right font-black">{w.overall.truckChange}</td>
                            </tr>
                          </React.Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: WEEKLY HISTORY MATRIX
           ========================================================================= */}
        {activeTab === 'matrix' && (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">52-Week History Matrix</h2>
                <p className="text-xs text-[#617083]">
                  Consolidated multi-carrier ledger &amp; forward scheduling
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={matrixDatasetView}
                  onChange={(e) => setMatrixDatasetView(e.target.value)}
                  aria-label="Dataset View"
                  className="bg-stone-100 border border-stone-300 text-xs font-bold rounded-xl px-3 py-1.5 text-slate-800"
                >
                  <option value="ALL">Consolidated View</option>
                  {COMPANIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.shortName} ({c.code})
                    </option>
                  ))}
                </select>

                <select
                  value={matrixMonthFilter}
                  onChange={(e) => setMatrixMonthFilter(e.target.value)}
                  aria-label="Month Filter"
                  className="bg-stone-100 border border-stone-300 text-xs font-bold rounded-xl px-3 py-1.5 text-slate-800"
                >
                  <option value="ALL">All Months</option>
                  <option value="June">June 2026</option>
                  <option value="July">July 2026</option>
                  <option value="August">August 2026</option>
                  <option value="Future">Future Weeks</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-100 text-slate-700 border-b border-stone-200">
                    <th className="p-3 font-bold">Week</th>
                    <th className="p-3 font-bold">Dates</th>
                    <th className="p-3 font-bold">Status</th>
                    {matrixDatasetView === 'ALL' ? (
                      <>
                        <th className="p-3 font-bold text-blue-700 text-right">PTG Active</th>
                        <th className="p-3 font-bold text-orange-700 text-right">OSY Active</th>
                        <th className="p-3 font-bold text-emerald-700 text-right">CFT Active</th>
                        <th className="p-3 font-bold text-amber-700 text-right">RMR Active</th>
                        <th className="p-3 font-bold text-indigo-700 text-right">G1 Active</th>
                        <th className="p-3 font-black text-slate-900 text-right bg-stone-200/60">
                          Total Drivers
                        </th>
                        <th className="p-3 font-black text-purple-700 text-right bg-purple-50">
                          Active Trucks
                        </th>
                        <th className="p-3 font-bold text-right">Coverage</th>
                      </>
                    ) : (
                      <>
                        <th className="p-3 font-bold text-right">Active Drivers</th>
                        <th className="p-3 font-bold text-right text-emerald-600">Hired</th>
                        <th className="p-3 font-bold text-right text-rose-600">Terminated</th>
                        <th className="p-3 font-bold text-right">Net Δ</th>
                        <th className="p-3 font-bold text-right">Active Trucks</th>
                        <th className="p-3 font-bold text-right text-emerald-600">Trucks Added</th>
                        <th className="p-3 font-bold text-right text-rose-600">Trucks Removed</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredMatrixWeeks.map((w) => {
                    const isSelected = w.weekNum === currentAnchorWeek.weekNum;
                    const isFut = w.status === 'Future';

                    return (
                      <tr
                        key={w.weekNum}
                        onClick={() => {
                          if (w.isPopulated) {
                            setSelectedWeekNum(w.weekNum);
                            addToast(`Anchor set to Week ${w.weekNum}`, 'info');
                          }
                        }}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/80 font-semibold'
                            : isFut
                            ? 'opacity-60 bg-stone-50/50'
                            : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="p-3 font-bold text-slate-900">{w.weekLabel}</td>
                        <td className="p-3 text-slate-500">
                          {formatDisplayDate(w.startDate)} – {formatDisplayDate(w.endDate)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              w.status === 'Final'
                                ? 'bg-slate-200 text-slate-800'
                                : w.status === 'In Progress'
                                ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                                : 'bg-stone-100 text-slate-500'
                            }`}
                          >
                            {w.status}
                          </span>
                        </td>

                        {matrixDatasetView === 'ALL' ? (
                          <>
                            <td className="p-3 text-right font-bold text-blue-700">
                              {isFut ? '—' : w.byCompany['PTG']?.activeDrivers}
                            </td>
                            <td className="p-3 text-right font-bold text-orange-700">
                              {isFut ? '—' : w.byCompany['OSY']?.activeDrivers}
                            </td>
                            <td className="p-3 text-right font-bold text-emerald-700">
                              {isFut ? '—' : w.byCompany['CFT']?.activeDrivers}
                            </td>
                            <td className="p-3 text-right font-bold text-amber-700">
                              {isFut ? '—' : w.byCompany['RMR']?.activeDrivers}
                            </td>
                            <td className="p-3 text-right font-bold text-indigo-700">
                              {isFut ? '—' : w.byCompany['G1']?.activeDrivers}
                            </td>
                            <td className="p-3 text-right font-black text-slate-900 bg-stone-100">
                              {isFut ? '—' : w.overall.activeDrivers}
                            </td>
                            <td className="p-3 text-right font-black text-purple-700 bg-purple-50/50">
                              {isFut ? '—' : w.overall.activeTrucks}
                            </td>
                            <td className="p-3 text-right text-slate-700 font-medium">
                              {isFut
                                ? '—'
                                : `${w.overall.covered} cov / ${w.overall.empty} emp`}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 text-right font-bold">
                              {isFut ? '—' : w.byCompany[matrixDatasetView]?.activeDrivers}
                            </td>
                            <td className="p-3 text-right text-emerald-600 font-semibold">
                              {isFut ? '—' : `+${w.byCompany[matrixDatasetView]?.hired}`}
                            </td>
                            <td className="p-3 text-right text-rose-600 font-semibold">
                              {isFut ? '—' : `-${w.byCompany[matrixDatasetView]?.terminated}`}
                            </td>
                            <td className="p-3 text-right font-bold">
                              {isFut ? '—' : w.byCompany[matrixDatasetView]?.change}
                            </td>
                            <td className="p-3 text-right font-bold">
                              {isFut ? '—' : w.byCompany[matrixDatasetView]?.activeTrucks}
                            </td>
                            <td className="p-3 text-right text-emerald-600 font-medium">
                              {isFut ? '—' : `+${w.byCompany[matrixDatasetView]?.addedTrucks}`}
                            </td>
                            <td className="p-3 text-right text-rose-600 font-medium">
                              {isFut ? '—' : `-${w.byCompany[matrixDatasetView]?.removedTrucks}`}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: DRIVER ROSTER & STATUS
           ========================================================================= */}
        {activeTab === 'drivers' && (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative min-w-[220px] flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    placeholder="Search driver name, carrier, notes..."
                    className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-300 rounded-xl text-xs focus:bg-white focus:outline-blue-500"
                  />
                </div>

                <select
                  value={driverStatusFilter}
                  onChange={(e) => setDriverStatusFilter(e.target.value)}
                  aria-label="Driver Status Filter"
                  className="bg-stone-50 border border-stone-300 text-xs font-semibold rounded-xl px-3 py-1.5"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Hiring / Onboarding">Hiring / Onboarding</option>
                </select>

                <select
                  value={driverCompanyFilter}
                  onChange={(e) => setDriverCompanyFilter(e.target.value)}
                  aria-label="Driver Carrier Filter"
                  className="bg-stone-50 border border-stone-300 text-xs font-semibold rounded-xl px-3 py-1.5"
                >
                  <option value="ALL">All Carriers</option>
                  {COMPANIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.shortName}
                    </option>
                  ))}
                </select>

                <select
                  value={driverDateRangePreset}
                  onChange={(e) => setDriverDateRangePreset(e.target.value)}
                  aria-label="Driver Date Range Preset"
                  className="bg-stone-50 border border-stone-300 text-xs font-semibold rounded-xl px-3 py-1.5"
                >
                  <option value="ALL">All Time</option>
                  <option value="1W">Last 1 Week</option>
                  <option value="4W">Last 4 Weeks</option>
                  <option value="12W">Last 12 Weeks</option>
                  <option value="YTD">This Year (2026)</option>
                </select>

                {driverDateRangePreset !== 'ALL' && (
                  <select
                    value={driverFilterType}
                    onChange={(e) => setDriverFilterType(e.target.value)}
                    aria-label="Driver Filter Date Type"
                    className="bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-xl px-2.5 py-1.5"
                  >
                    <option value="BOTH">Filter Hire &amp; Term</option>
                    <option value="HIRE">Hire Date Only</option>
                    <option value="TERM">Term Date Only</option>
                  </select>
                )}

                {(driverSearch ||
                  driverStatusFilter !== 'ALL' ||
                  driverCompanyFilter !== 'ALL' ||
                  driverDateRangePreset !== 'ALL') && (
                  <button
                    onClick={() => {
                      setDriverSearch('');
                      setDriverStatusFilter('ALL');
                      setDriverCompanyFilter('ALL');
                      setDriverDateRangePreset('ALL');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline"
                  >
                    Reset
                  </button>
                )}
              </div>

              <button
                onClick={() =>
                  setModalState({
                    isOpen: true,
                    type: 'addDriver',
                    item: { name: '', company: 'Premier Trucking Group Inc', status: 'Active', hireDate: TODAY_STR, termDate: '', notes: '' },
                    index_: null
                  })
                }
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Driver</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-100 text-slate-700 border-b border-stone-200">
                    <th className="p-3 font-bold">Driver Name</th>
                    <th className="p-3 font-bold">Carrier</th>
                    <th className="p-3 font-bold">Status</th>
                    <th className="p-3 font-bold">Hire Date</th>
                    <th className="p-3 font-bold">Tenure &amp; Class</th>
                    <th className="p-3 font-bold">Term Date</th>
                    <th className="p-3 font-bold">Driver Notes</th>
                    <th className="p-3 font-bold">Sheet Ref</th>
                    <th className="p-3 font-bold">Audit Flags</th>
                    <th className="p-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredDrivers.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="p-8 text-center text-slate-500 font-medium">
                        No drivers matching active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredDrivers.map((d) => {
                      const comp = COMPANY_MAP[d.companyCode] || { shortName: d.companyRaw, color: '#64748b', textColor: '#475569' };

                      const flags = [];
                      if (!d.name) flags.push('Blank Name');
                      if (d.companyCode === 'REVIEW') flags.push('Verify Carrier');
                      if (d.hireDate === '1900-01-01') flags.push('Default Hire (1900)');
                      if (d.status === 'Active' && d.termDate && d.termDate !== '9999-12-31' && d.termDate <= TODAY_STR) {
                        flags.push('Active w/ Past Term');
                      }

                      const isNewClass = d.tenureDaysSheet < tenureWindowDays;

                      return (
                        <tr key={d.index_} className="hover:bg-stone-50 transition-colors">
                          <td className="p-3 font-bold text-slate-900">
                            {d.name || <em className="text-rose-500 font-normal">Untitled Driver</em>}
                          </td>
                          <td className="p-3">
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 border"
                              style={{
                                borderColor: `${comp.color}40`,
                                backgroundColor: `${comp.color}15`,
                                color: comp.textColor
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: comp.color }} />
                              {comp.shortName}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                d.status === 'Active'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : d.status === 'Hiring / Onboarding'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-stone-200 text-slate-700'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 font-medium">
                            {formatDisplayDate(d.hireDate)}
                          </td>
                          <td className="p-3 font-medium text-slate-700 font-mono">
                            <span>{d.tenureDaysSheet}d</span>{' '}
                            <span className="text-slate-500">({isNewClass ? 'New' : 'Established'})</span>
                          </td>
                          <td className="p-3 text-slate-600">
                            {d.termDate && d.termDate !== '9999-12-31' ? (
                              formatDisplayDate(d.termDate)
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-700 max-w-xs truncate" title={d.notes}>
                            {d.notes ? (
                              <span className="bg-stone-100 px-2 py-0.5 rounded text-[11px] font-medium text-slate-800 border border-stone-200/80">
                                {d.notes}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-500">
                            'Master Data'!A{d.rowIndexInSheet}:G{d.rowIndexInSheet}
                          </td>
                          <td className="p-3">
                            {flags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {flags.map((f, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded text-[10px] font-bold"
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                                <CheckCircle2 className="w-3 h-3" /> Valid
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() =>
                                  setModalState({
                                    isOpen: true,
                                    type: 'editDriver',
                                    item: {
                                      name: d.name,
                                      company: d.companyRaw,
                                      status: d.status,
                                      hireDate: d.hireDate,
                                      termDate: d.termDate,
                                      notes: d.notes
                                    },
                                    index_: d.index_
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                                title="Edit Driver"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setModalState({
                                    isOpen: true,
                                    type: 'deleteConfirm',
                                    item: { title: `driver "${d.name || 'Unnamed'}"` },
                                    index_: d.index_
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                                title="Delete Driver"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: TRUCK FLEET ROSTER
           ========================================================================= */}
        {activeTab === 'trucks' && (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative min-w-[220px] flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={truckSearch}
                    onChange={(e) => setTruckSearch(e.target.value)}
                    placeholder="Search unit #, carrier, notes..."
                    className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-300 rounded-xl text-xs focus:bg-white focus:outline-blue-500"
                  />
                </div>

                <select
                  value={truckStatusFilter}
                  onChange={(e) => setTruckStatusFilter(e.target.value)}
                  aria-label="Truck Status Filter"
                  className="bg-stone-50 border border-stone-300 text-xs font-semibold rounded-xl px-3 py-1.5"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>

                <select
                  value={truckCompanyFilter}
                  onChange={(e) => setTruckCompanyFilter(e.target.value)}
                  aria-label="Truck Carrier Filter"
                  className="bg-stone-50 border border-stone-300 text-xs font-semibold rounded-xl px-3 py-1.5"
                >
                  <option value="ALL">All Carriers</option>
                  {COMPANIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.shortName}
                    </option>
                  ))}
                </select>

                {(truckSearch || truckStatusFilter !== 'ALL' || truckCompanyFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setTruckSearch('');
                      setTruckStatusFilter('ALL');
                      setTruckCompanyFilter('ALL');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline"
                  >
                    Reset
                  </button>
                )}
              </div>

              <button
                onClick={() =>
                  setModalState({
                    isOpen: true,
                    type: 'addTruck',
                    item: { unit: '', company: 'Premier Trucking Group Inc', status: 'Active', statusDate: TODAY_STR, notes: '' },
                    index_: null
                  })
                }
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Truck</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-100 text-slate-700 border-b border-stone-200">
                    <th className="p-3 font-bold">Unit #</th>
                    <th className="p-3 font-bold">Carrier</th>
                    <th className="p-3 font-bold">Status</th>
                    <th className="p-3 font-bold">Status Date</th>
                    <th className="p-3 font-bold">Telematics / Notes</th>
                    <th className="p-3 font-bold">Sheet Ref</th>
                    <th className="p-3 font-bold">Flags</th>
                    <th className="p-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredTrucks.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-500 font-medium">
                        No trucks matching active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTrucks.map((t) => {
                      const comp = COMPANY_MAP[t.companyCode] || { shortName: t.companyRaw, color: '#64748b', textColor: '#475569' };
                      const flags = [];
                      if (!t.statusDate && t.status === 'Inactive') flags.push('Missing Date');
                      if (String(t.unit).trim() === '103') {
                        flags.push('OSY / G1 Conflict');
                      }
                      if (t.companyCode === 'REVIEW') flags.push('Carrier Review');

                      return (
                        <tr key={t.index_} className="hover:bg-stone-50 transition-colors">
                          <td className="p-3 font-mono font-bold text-slate-900">
                            {t.unit || <em className="text-slate-400">Blank</em>}
                          </td>
                          <td className="p-3">
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 border"
                              style={{
                                borderColor: `${comp.color}40`,
                                backgroundColor: `${comp.color}15`,
                                color: comp.textColor
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: comp.color }} />
                              {comp.shortName}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                t.status === 'Active'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-stone-200 text-slate-700'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 font-medium">
                            {formatDisplayDate(t.statusDate)}
                          </td>
                          <td className="p-3 text-slate-600 max-w-xs truncate" title={t.notes}>
                            {t.notes || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-500">
                            'Master Data'!H{t.rowIndexInSheet}:M{t.rowIndexInSheet}
                          </td>
                          <td className="p-3">
                            {flags.length > 0 ? (
                              <div className="flex gap-1">
                                {flags.map((f, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-bold"
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                                <CheckCircle2 className="w-3 h-3" /> OK
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() =>
                                  setModalState({
                                    isOpen: true,
                                    type: 'editTruck',
                                    item: {
                                      unit: t.unit,
                                      company: t.companyRaw,
                                      status: t.status,
                                      statusDate: t.statusDate,
                                      notes: t.notes
                                    },
                                    index_: t.index_
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                                title="Edit Truck"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setModalState({
                                    isOpen: true,
                                    type: 'deleteConfirm',
                                    item: { title: `truck unit "${t.unit || 'Unnamed'}"` },
                                    index_: t.index_
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                                title="Delete Truck"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: COMPANIES SETUP
           ========================================================================= */}
        {activeTab === 'companies' && (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Carrier Registry &amp; Profiles</h2>
              <p className="text-xs text-[#617083]">
                Managed operating authorities and dedicated sheet column mapping
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {COMPANIES.map((comp) => {
                const activeDrivers = driversList.filter((d) => matchesCompany(d.companyRaw, comp.code) && d.status === 'Active').length;
                const activeTrucks = trucksList.filter((t) => matchesCompany(t.companyRaw, comp.code) && t.status === 'Active').length;
                const totalDrivers = driversList.filter((d) => matchesCompany(d.companyRaw, comp.code)).length;
                const totalTrucks = trucksList.filter((t) => matchesCompany(t.companyRaw, comp.code)).length;

                return (
                  <div
                    key={comp.code}
                    className="bg-stone-50 border border-stone-200/80 rounded-2xl p-5 flex flex-col justify-between hover:shadow-md transition-shadow"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full"
                            style={{ backgroundColor: comp.color }}
                          />
                          <span className="font-extrabold text-sm text-slate-900">{comp.shortName}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-white border border-stone-200 text-xs font-mono font-bold text-slate-700">
                          {comp.code}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 mb-4">{comp.name}</p>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-stone-200/60">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">
                            Active Drivers
                          </span>
                          <div className="text-base font-bold text-slate-900 mt-0.5">
                            {activeDrivers} <span className="text-[10px] text-slate-500 font-normal">/ {totalDrivers}</span>
                          </div>
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-stone-200/60">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">
                            Active Trucks
                          </span>
                          <div className="text-base font-bold text-slate-900 mt-0.5">
                            {activeTrucks} <span className="text-[10px] text-slate-500 font-normal">/ {totalTrucks}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-200/60 flex items-center justify-between text-xs text-slate-500">
                      <span>Sheet Section: {WEEKLY_TAB_COLS[comp.code] ? `Cols ${WEEKLY_TAB_COLS[comp.code].week}–${WEEKLY_TAB_COLS[comp.code].change}` : 'Overall Only'}</span>
                      <button
                        onClick={() => {
                          setSelectedCompanies([comp.code]);
                          setActiveTab('dashboard');
                          addToast(`Filtered dashboard to ${comp.shortName}`, 'info');
                        }}
                        className="text-blue-600 font-bold hover:underline"
                      >
                        Isolate &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 6: DATA QUALITY & AUDIT
           ========================================================================= */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Data Integrity &amp; Audit Diagnostics</h2>
                <p className="text-xs text-[#617083]">
                  Automated flag verification across driver &amp; truck rosters
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  {auditIssues.length} Potential Issues Detected
                </span>
              </div>
            </div>

            {auditIssues.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50 rounded-2xl border border-emerald-200/60 text-emerald-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold text-sm">Clean Master Dataset</h3>
                <p className="text-xs mt-1 text-emerald-700">
                  No missing names, anomalous sentinels, or unverified carrier conflicts found.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {auditIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                      issue.type === 'error'
                        ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                        : issue.type === 'warning'
                        ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                        : 'bg-blue-50/70 border-blue-200 text-blue-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {issue.type === 'error' && <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />}
                      {issue.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
                      {issue.type === 'info' && <Info className="w-5 h-5 text-blue-600 shrink-0" />}
                      <div>
                        <div className="font-bold text-xs flex items-center gap-2">
                          <span>{issue.id}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-white/80 rounded font-mono">
                            Row {issue.row}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5 opacity-90">{issue.message}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (issue.entity === 'driver') {
                          setActiveTab('drivers');
                          setDriverSearch(issue.item?.name || '');
                        } else {
                          setActiveTab('trucks');
                          setTruckSearch(issue.item?.unit || '');
                        }
                      }}
                      className="px-3 py-1.5 bg-white text-xs font-bold rounded-lg shadow-2xs hover:bg-stone-50 border border-stone-200"
                    >
                      Locate &rarr;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 7: LIVE DATABASE CONNECTION & SYNC STATUS
           ========================================================================= */}
        {activeTab === 'sheets' && (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Live Database Connection</h2>
              <p className="text-xs text-[#617083]">
                Drivers &amp; trucks are stored in a hosted Postgres database and read/written over a REST API — no spreadsheet involved.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">
                  Drivers Table
                </span>
                <div className="text-lg font-mono font-bold text-slate-900 mt-1">/api/drivers</div>
                <p className="text-[11px] text-slate-500 mt-1">{driversList.length} total drivers loaded</p>
              </div>

              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">
                  Trucks Table
                </span>
                <div className="text-lg font-mono font-bold text-slate-900 mt-1">/api/trucks</div>
                <p className="text-[11px] text-slate-500 mt-1">{trucksList.length} total trucks loaded</p>
              </div>

              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">
                  Weekly Reports
                </span>
                <div className="text-lg font-mono font-bold text-slate-900 mt-1">Computed live</div>
                <p className="text-[11px] text-slate-500 mt-1">52 weeks derived from hire/term/status dates on every load</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-4 text-xs text-blue-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Live Sync Active
              </div>
              <p>
                The dashboard polls the database on an interval and refreshes immediately after every add, edit, or delete.
                Weekly driver and truck counts are never stored twice — they're always recalculated from each record's status and effective date, so the report is guaranteed to match the roster.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          MODALS
         ========================================================================= */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="font-bold text-base text-slate-900">
                {modalState.type === 'addDriver' && 'Add Driver to Master Roster'}
                {modalState.type === 'editDriver' && 'Edit Driver Information'}
                {modalState.type === 'addTruck' && 'Add Truck Unit'}
                {modalState.type === 'editTruck' && 'Edit Truck Unit'}
                {modalState.type === 'deleteConfirm' && 'Confirm Deletion'}
              </h3>
              <button
                onClick={() => setModalState({ isOpen: false, type: null, item: null, index_: null })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DRIVER FORM */}
            {(modalState.type === 'addDriver' || modalState.type === 'editDriver') && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  handleSaveDriver({
                    name: fd.get('name'),
                    company: fd.get('company'),
                    status: fd.get('status'),
                    hireDate: fd.get('hireDate'),
                    termDate: fd.get('termDate'),
                    notes: fd.get('notes')
                  });
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Driver Full Name *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={modalState.item?.name || ''}
                    placeholder="e.g. John Smith"
                    className="w-full p-2 border border-stone-300 rounded-xl focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Assigned Carrier</label>
                  <select
                    name="company"
                    defaultValue={modalState.item?.company || 'Premier Trucking Group Inc'}
                    className="w-full p-2 border border-stone-300 rounded-xl bg-white font-medium"
                  >
                    {COMPANIES.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Status</label>
                    <select
                      name="status"
                      defaultValue={modalState.item?.status || 'Active'}
                      className="w-full p-2 border border-stone-300 rounded-xl bg-white"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Hiring / Onboarding">Hiring / Onboarding</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Hire Date</label>
                    <input
                      type="date"
                      required
                      name="hireDate"
                      defaultValue={modalState.item?.hireDate || TODAY_STR}
                      className="w-full p-2 border border-stone-300 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Termination Date (if inactive)</label>
                  <input
                    type="date"
                    name="termDate"
                    defaultValue={modalState.item?.termDate || ''}
                    className="w-full p-2 border border-stone-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Notes</label>
                  <textarea
                    name="notes"
                    rows="2"
                    defaultValue={modalState.item?.notes || ''}
                    placeholder="e.g. OO / Rehire remarks"
                    className="w-full p-2 border border-stone-300 rounded-xl"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setModalState({ isOpen: false, type: null, item: null, index_: null })}
                    className="flex-1 py-2 font-bold text-slate-600 bg-stone-100 hover:bg-stone-200 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
                  >
                    Save Driver
                  </button>
                </div>
              </form>
            )}

            {/* TRUCK FORM */}
            {(modalState.type === 'addTruck' || modalState.type === 'editTruck') && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  handleSaveTruck({
                    unit: fd.get('unit'),
                    company: fd.get('company'),
                    status: fd.get('status'),
                    statusDate: fd.get('statusDate'),
                    notes: fd.get('notes')
                  });
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unit Number *</label>
                  <input
                    type="text"
                    name="unit"
                    required
                    defaultValue={modalState.item?.unit || ''}
                    placeholder="e.g. 248"
                    className="w-full p-2 border border-stone-300 rounded-xl focus:outline-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Assigned Carrier</label>
                  <select
                    name="company"
                    defaultValue={modalState.item?.company || 'Premier Trucking Group Inc'}
                    className="w-full p-2 border border-stone-300 rounded-xl bg-white font-medium"
                  >
                    {COMPANIES.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Status</label>
                    <select
                      name="status"
                      defaultValue={modalState.item?.status || 'Active'}
                      className="w-full p-2 border border-stone-300 rounded-xl bg-white"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Status Date</label>
                    <input
                      type="date"
                      name="statusDate"
                      defaultValue={modalState.item?.statusDate || TODAY_STR}
                      className="w-full p-2 border border-stone-300 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Notes / Telematics</label>
                  <textarea
                    name="notes"
                    rows="2"
                    defaultValue={modalState.item?.notes || ''}
                    placeholder="Fleet status, shop remarks..."
                    className="w-full p-2 border border-stone-300 rounded-xl"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setModalState({ isOpen: false, type: null, item: null, index_: null })}
                    className="flex-1 py-2 font-bold text-slate-600 bg-stone-100 hover:bg-stone-200 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl"
                  >
                    Save Truck
                  </button>
                </div>
              </form>
            )}

            {/* DELETE CONFIRMATION */}
            {modalState.type === 'deleteConfirm' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  Are you sure you want to delete {modalState.item?.title}? This change will be permanently synced to the live database.
                </p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setModalState({ isOpen: false, type: null, item: null, index_: null })}
                    className="flex-1 py-2 font-bold text-slate-600 bg-stone-100 hover:bg-stone-200 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteItem}
                    className="flex-1 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FleetPulseDashboard;
