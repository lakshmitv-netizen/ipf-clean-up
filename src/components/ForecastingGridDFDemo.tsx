import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MeasureData, ApprovalRequest, GridRow, ParentTotalsRollupMode } from '../types';
import { ApproverState, APPROVER_ROSTER, deriveAggregateStatus } from '../types/approvalRequest';
import { ConditionalFormattingRule } from '../types/conditionalFormatting';
import {
  CellEditHistoryEntry,
  PLAN_WIDE_APPROVAL_BATCH_CELL_KEY,
  editHistoryEntryAffectsCell,
} from '../types/editHistory';
import { AdjustmentNote } from '../types/adjustmentNote';
import { getMockData } from '../data/mockData';
import { ensureDeepChildren } from '../data/deepHierarchyData';
import { useIndustry } from '../contexts/IndustryContext';
import { getDimensionScheme } from '../data/dimensionSchemes';
import { isConfigIndustry, isConfigLevel, getConfigMeasureCategories, getConfigTimeFrame, defaultGranularitiesForDuration } from '../data/planConfigGridData';
import {
  cloneMeasureData,
  reviveEditHistory,
  usePlanningGridSession,
  type PlanningGridCellMapsSnapshot,
} from '../contexts/PlanningGridSessionContext';
import { usePlanWorkflow } from '../contexts/PlanWorkflowContext';
import { useCurrentUser, APPROVER_USER_IDS } from '../contexts/UserContext';
import { adjustmentMeasuresData, getAdjustmentMeasuresData } from '../data/adjustmentMeasuresData';
import { findRowById, getChildren, propagateUpward } from '../utils/valuePropagation';
import { getPlanWideValueCellKeys } from '../utils/planWideCellKeys';
import {
  refreshPassFailBucketAggregates,
  stripFilterSummaryRows,
} from '../utils/filterSummaryRows';
import { mergeRowValuesIntoFullTree } from '../utils/mergeHierarchyValues';
import HierarchicalGrid from './HierarchicalGrid';
import DimensionsTimeGrid from './DimensionsTimeGrid';
import TimeDimensionsGrid from './TimeDimensionsGrid';
import GridToolbar from './GridToolbar';
import SettingsPanel, { CALENDAR_OPTIONS, DEFAULT_CALENDAR_ID } from './SettingsPanel';
import { QuickAccessBar, ConfigureQuickAccessModal } from './QuickAccessToolbar';
import FiltersPanel from './FiltersPanel';
import ChartsPanel from './ChartsPanel';
import ScenarioDrawer from './ScenarioDrawer';
import CellDetailsHistoryPanel from './CellDetailsHistoryPanel';
import CellEditInfoPopover from './CellEditInfoPopover';
import CellContextMenu from './CellContextMenu';
import ConditionalFormattingRuleModal from './ConditionalFormattingRuleModal';
import CellExplainabilityModal, { SourceRecord } from './CellExplainabilityModal';
import EditFrozenColumnsModal, { FrozenColumn } from './EditFrozenColumnsModal';
import EditSubColumnsModal, { SubColumn } from './EditSubColumnsModal';
import ConfigureChartsModal, { ChartConfig } from './ConfigureChartsModal';
import MiniChart from './MiniChart';
import GlobalSortPanel, { GlobalSortConfig } from './GlobalSortPanel';
import AlertsPanel, { FocusGridParams } from './AlertsPanel';
import AgentforcePanel from './AgentforcePanel';
import { hasPredictedBaseline, ARC5_START_PROMPT, ARC3_REVEAL_MEASURE_ID } from '../utils/agentforceEngine';
import type { AgentScenario } from '../utils/agentforceEngine';
import { useAgentforce } from '../contexts/AgentforceContext';
import { ColumnFilter } from './ColumnFilterPopover';
import ScopedNotification, { ScopedNotificationToggle } from './ScopedNotification';
import { getMeasureName, buildHierarchyPath } from '../utils/cellInfoUtils';

// ── Approval review "semantic chunking" ──────────────────────────────────────
// Splits a flat list of approved/edited cell keys into logical chunks so the
// review-approval card can offer one "Focus grid" button per chunk. A chunk is
// a group of cells that share the same measure + top-level dimension branch and
// fall in a contiguous run of months — i.e. the units a reviewer naturally scans
// together in a single grid view (no scrolling / chevron expansion required).
export interface ApprovalFocusChunk {
  id: string;
  label: string;
  focusParams: FocusGridParams;
}

const CHUNK_MONTH_ORDER = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
];

const chunkMonthIndex = (timeKey: string): number =>
  CHUNK_MONTH_ORDER.indexOf(timeKey.toLowerCase());

const formatChunkTime = (timeKey: string): string => {
  const m = timeKey.match(/^([a-z]+)(\d{4})$/i);
  if (m) {
    const month = m[1].charAt(0).toUpperCase() + m[1].slice(1, 3).toLowerCase();
    return `${month} ${m[2]}`;
  }
  return timeKey;
};

const formatChunkRange = (start: string, end: string): string =>
  start === end ? formatChunkTime(start) : `${formatChunkTime(start)} – ${formatChunkTime(end)}`;

// Depth-first path from a measure's children down to `targetId` (inclusive).
const findRowPath = (rows: GridRow[], targetId: string): GridRow[] | null => {
  for (const row of rows) {
    if (row.id === targetId) return [row];
    if (row.children && row.children.length) {
      const sub = findRowPath(row.children, targetId);
      if (sub) return [row, ...sub];
    }
  }
  return null;
};

const buildApprovalFocusChunks = (
  selectedCellKeys: string[] | undefined,
  data: MeasureData[],
): ApprovalFocusChunk[] => {
  if (!selectedCellKeys || selectedCellKeys.length === 0) return [];

  interface Group {
    measureName: string;
    branchName: string;
    keys: string[];
    timeKeys: Set<string>;
  }
  const groups = new Map<string, Group>();

  selectedCellKeys.forEach((cellKey) => {
    const parts = cellKey.split('-');
    if (parts.length < 2) return;
    const timeKey = parts[parts.length - 1];
    const rowId = parts.slice(0, -1).join('-');

    let measureName = '';
    let branchName = '';
    let branchId = '';
    let measureId = '';

    const measure = data.find((m) => m.id === rowId);
    if (measure) {
      measureId = measure.id;
      measureName = measure.name;
      branchName = measure.name;
      branchId = measure.id;
    } else {
      for (const m of data) {
        const path = findRowPath(m.children ?? [], rowId);
        if (path) {
          measureId = m.id;
          measureName = m.name;
          branchName = path[0].name;
          branchId = path[0].id;
          break;
        }
      }
    }
    if (!measureId) return; // could not resolve — skip

    const groupKey = `${measureId}::${branchId}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { measureName, branchName, keys: [], timeKeys: new Set() };
      groups.set(groupKey, group);
    }
    group.keys.push(cellKey);
    group.timeKeys.add(timeKey);
  });

  const chunks: ApprovalFocusChunk[] = [];
  groups.forEach((group, groupKey) => {
    const sortedTimes = [...group.timeKeys].sort((a, b) => {
      const ia = chunkMonthIndex(a);
      const ib = chunkMonthIndex(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    // Split into contiguous month runs (e.g. Jan,Feb,Mar | May,Jun).
    const runs: string[][] = [];
    let current: string[] = [];
    let prevIndex: number | null = null;
    sortedTimes.forEach((t) => {
      const idx = chunkMonthIndex(t);
      if (current.length === 0) {
        current = [t];
        prevIndex = idx;
        return;
      }
      const contiguous = idx !== -1 && prevIndex !== null && prevIndex !== -1 && idx === prevIndex + 1;
      if (contiguous) {
        current.push(t);
        prevIndex = idx;
      } else {
        runs.push(current);
        current = [t];
        prevIndex = idx;
      }
    });
    if (current.length) runs.push(current);

    runs.forEach((run) => {
      const runSet = new Set(run);
      const runKeys = group.keys.filter((k) => runSet.has(k.split('-').pop() || ''));
      const start = run[0];
      const end = run[run.length - 1];
      chunks.push({
        id: `${groupKey}::${start}-${end}`,
        label: `${group.measureName} · ${group.branchName} · ${formatChunkRange(start, end)}`,
        focusParams: {
          searchTerm: group.branchName,
          startPeriod: start,
          endPeriod: end,
          selectedCellKeys: runKeys,
        },
      });
    });
  });

  return chunks;
};

const AVAILABLE_SUB_COLUMNS: SubColumn[] = [
  { id: 'yoy', name: 'YoY' },
  { id: 'mom', name: 'MoM' },
  { id: 'target', name: 'Target' },
  { id: 'targetAchievement', name: 'Target Achievement' },
  { id: 'planned', name: 'Planned' },
  { id: 'achieved', name: 'Achieved' },
  { id: 'variance', name: 'Variance' },
  { id: 'approvalStatus', name: 'Approval Status' },
];

const FIXED_SUB_COLUMNS: SubColumn[] = [
  // No fixed columns - Approval Status is available but not selected by default
];

// Default selected sub-columns: keep empty on initial load
const DEFAULT_SELECTED_SUB_COLUMNS: SubColumn[] = [];

const MEASURES_DIMS_X_TIME_LAYOUT = 'Measures / Dimensions x Time';

const MONTH_SORT_COLUMN_OPTIONS: { key: string; label: string }[] = [
  { key: 'jan2026', label: 'Jan' }, { key: 'feb2026', label: 'Feb' },
  { key: 'mar2026', label: 'Mar' }, { key: 'apr2026', label: 'Apr' },
  { key: 'may2026', label: 'May' }, { key: 'jun2026', label: 'Jun' },
  { key: 'jul2026', label: 'Jul' }, { key: 'aug2026', label: 'Aug' },
  { key: 'sep2026', label: 'Sep' }, { key: 'oct2026', label: 'Oct' },
  { key: 'nov2026', label: 'Nov' }, { key: 'dec2026', label: 'Dec' },
];

/** Find a row (measure or nested dimension row) by id in the measure tree — used by the Charts panel to resolve live values. */
/** Sum numeric value bags (months/quarters/year/…) — used to roll up a parent from its children. */
function sumChartValueBags(bags: GridRow['values'][]): GridRow['values'] {
  const out: Record<string, number> = {};
  for (const bag of bags) {
    for (const key in bag) {
      const v = (bag as unknown as Record<string, unknown>)[key];
      if (typeof v === 'number') out[key] = (out[key] ?? 0) + v;
    }
  }
  return out as unknown as GridRow['values'];
}

/**
 * Rebuild a row's subtree so every parent's values are the recursive sum of its leaf
 * descendants — matching the grid's parent-total rollup (grid never trusts stored parent
 * values). This keeps the Charts panel numbers identical to what the grid displays.
 */
function rollupChartRow(node: GridRow): GridRow {
  if (!node.children || node.children.length === 0) return node;
  const children = node.children.map(rollupChartRow);
  return {
    ...node,
    children,
    values: { ...node.values, ...sumChartValueBags(children.map((c) => c.values)) },
  };
}

/** Name of the top-level measure whose subtree contains `id` (for the Charts panel context). */
function findMeasureAncestorName(measures: MeasureData[], id: string): string | null {
  const inSubtree = (rows: GridRow[]): boolean => {
    for (const r of rows) {
      if (r.id === id) return true;
      if (r.children && r.children.length > 0 && inSubtree(r.children)) return true;
    }
    return false;
  };
  for (const m of measures) {
    if (m.id === id) return m.name;
    if (m.children && m.children.length > 0 && inSubtree(m.children)) return m.name;
  }
  return null;
}

function findChartRowById(measures: MeasureData[], id: string): GridRow | null {
  const searchRows = (rows: GridRow[]): GridRow | null => {
    for (const r of rows) {
      if (r.id === id) return r;
      if (r.children && r.children.length > 0) {
        const found = searchRows(r.children);
        if (found) return found;
      }
    }
    return null;
  };
  for (const m of measures) {
    if (m.id === id) return m as unknown as GridRow;
    if (m.children && m.children.length > 0) {
      const found = searchRows(m.children);
      if (found) return found;
    }
  }
  return null;
}

const ensureFixedSubColumns = (columns: SubColumn[]): SubColumn[] => {
  const seen = new Set<string>();
  const merged = [...FIXED_SUB_COLUMNS, ...columns].filter(col => {
    if (seen.has(col.id)) return false;
    seen.add(col.id);
    return true;
  });
  return merged;
};

const AVAILABLE_FROZEN_COLUMNS: FrozenColumn[] = [
  { id: 'annotatedLevel', name: 'Annotated Level' },
  { id: 'users', name: 'Users' },
  { id: 'region', name: 'Region' },
  { id: 'team', name: 'Team' },
  { id: 'status', name: 'Status' },
  { id: 'condition', name: 'Condition' },
  { id: 'trend', name: 'Trend' },
];

// Default visible measures: show all measures in the selected subset (Showing 10 of 10).
// A measure is only hidden when the user explicitly unchecks it in "Configure Measures".
const DEFAULT_VISIBLE_MEASURE_IDS = new Set([
  'measure-sa-qty',
  'measure-sa-rev',
  'measure-opp-qty',
  'measure-opp-rev',
  'measure-pred-forecast-qty',
  'measure-order-qty',
  'measure-order-rev',
  'measure-ly-order-qty',
  'measure-ly-order-rev',
  'measure-forecast-qty',
  'measure-forecast-rev',
  // NOTE: '✦ Predicted Baseline Quantity' (measure-predicted-baseline-qty) is
  // intentionally NOT visible by default. On the Acme grid it stays hidden until
  // the Forecast & Risk Agent projects it (Arc 3), which reveals + pins it on top.
  // Once revealed it stays revealed for the rest of the session (see the
  // ARC3_BASELINE_REVEALED_KEY flag below) — the row is never auto-removed.
  // Sales Manager Target Quantity — the manual-input measure the seller commits to
  // (Arc 4 650K target) and where the Arc 5 June override / e-motor risk plays out.
  'measure-sm-target-qty',
  // Adjustment Measures — shown by default alongside Revenue & Quantity.
  'measure-baseline-forecast',
  'measure-account-manager-adjusted',
  'measure-sales-manager-adjusted',
  'measure-regional-director-adjusted',
  'measure-final-forecast',
]);

// Arc 5 — the June override on Sales Manager Target Quantity is flagged as a risk that
// cascades DOWN the hierarchy and originates at the E-Motor Housing leaf. Given the current
// grid data, walk the Sales Manager Target Quantity measure to find the "E-Motor Housing"
// node and return the June cell keys for it and every ancestor up to the top account — that
// full lineage is what gets the red warning (and later the green "resolved" check).
const ARC5_RISK_MONTH_KEY = 'jun2026';
// There are several "E-Motor Housing" nodes across regions. The Arc 5 risk is specifically
// the MIDWEST one, so both the warning lineage and the Slack amendment must resolve to the
// SAME node — the E-Motor Housing under Midwest Assembly on Sales Manager Target Quantity.
// (Previously the warning kept the last match while the amendment took the first, so they
// could land on different nodes — editing an unrelated E-Motor Housing on return from Slack.)
function findMidwestEMotorNode(data: any[]): any {
  const measure = (data || []).find((m) => m && m.id === 'measure-sm-target-qty');
  if (!measure) return null;
  const childMatching = (nodes: any[] | undefined, needle: string): any =>
    (nodes || []).find((n) => typeof n.name === 'string' && n.name.toLowerCase().includes(needle)) || null;
  // The tree generates a Midwest Assembly → E-Motor Housing branch under EVERY division of
  // EVERY region, so a plain name search is ambiguous. Follow the exact narrative path so
  // both the warning lineage and the amendment always land on the SAME node:
  //   North America → Light Trucks → Midwest Assembly → E-Motor Housing
  const region = childMatching(measure.children, 'north america');
  const division = childMatching(region?.children, 'light trucks');
  const plant = childMatching(division?.children, 'midwest assembly');
  const emh = childMatching(plant?.children, 'e-motor housing');
  if (emh) return emh;
  // Fallback: first E-Motor Housing anywhere (keeps the flow resilient to data changes).
  const deepFind = (nodes: any[]): any => {
    for (const n of nodes || []) {
      if (typeof n.name === 'string' && n.name.toLowerCase().includes('e-motor housing')) return n;
      if (n.children) { const f = deepFind(n.children); if (f) return f; }
    }
    return null;
  };
  return deepFind(measure.children || []);
}
function computeEMotorRiskLineage(data: any[]): { keys: Set<string>; originKey: string | null } {
  const keys = new Set<string>();
  const measure = (data || []).find((m) => m && m.id === 'measure-sm-target-qty');
  if (!measure) return { keys, originKey: null };
  const nodeById = new Map<string, any>();
  const build = (nodes: any[]) => {
    for (const n of nodes || []) {
      nodeById.set(n.id, n);
      if (n.children && n.children.length) build(n.children);
    }
  };
  build(measure.children || []);
  const emh = findMidwestEMotorNode(data);
  if (!emh) return { keys, originKey: null };
  const originKey = `${emh.id}-${ARC5_RISK_MONTH_KEY}`;
  let cur: any = emh;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    keys.add(`${cur.id}-${ARC5_RISK_MONTH_KEY}`);
    cur = cur.parentId ? nodeById.get(cur.parentId) : null;
  }
  return { keys, originKey };
}

// Arc 3 — once the agent projects ✦ Predicted Baseline onto the grid, the row must
// STAY (it is never auto-removed for the rest of the session). We persist the reveal
// under the session-scoped `cpm_` prefix so it survives client-side navigation /
// remounts, but resets on a hard page refresh (sessionReset wipes `cpm_`) and on a
// freshly created plan (openAcmePlanWorkspace clears it).
const ARC3_BASELINE_REVEALED_KEY = 'cpm_arc3_baseline_revealed';
// Arc 3 — the projected ✦ Predicted Baseline row is inserted directly beneath this
// measure (Forecast Quantity), not at the very top of the grid.
const ARC3_REVEAL_AFTER_MEASURE_ID = 'measure-forecast-qty';
function readBaselineRevealed(): boolean {
  try {
    return sessionStorage.getItem(ARC3_BASELINE_REVEALED_KEY) === '1';
  } catch {
    return false;
  }
}
function writeBaselineRevealed(): void {
  try {
    sessionStorage.setItem(ARC3_BASELINE_REVEALED_KEY, '1');
  } catch {
    /* sessionStorage unavailable — reveal is best-effort persisted */
  }
}

// DF DEMO FORK — project-local copy of ForecastingGrid used only by the "DF demo" plan.
// The shared ForecastingGrid.tsx (synced from upstream) is left untouched. The only
// differences here are the pre-seeded conditional-formatting rules below and the
// design-system-rules default (set to off so these modifyCells rules render on load).
//
// Pre-seeded conditional-formatting rules for the DF demo, all on Order Quantity (No.s),
// "Less than", pink highlight — reproduces the highlighted cells in the demo screenshots.
const INITIAL_CONDITIONAL_FORMATTING_RULES: ConditionalFormattingRule[] = [
  {
    id: 'df-demo-products',
    name: 'Products',
    isActive: true,
    priority: 0,
    mode: 'modifyCells',
    target: { measureIds: ['measure-order-qty'], dimensionLevels: ['product'], timeKeys: ['mar2026'] },
    condition: { type: 'lessThan', value: 9 },
    visualization: { type: 'background', color: '#FFEBEB' },
    createdAt: new Date('2024-01-03T00:00:00'),
    updatedAt: new Date('2024-01-03T00:00:00'),
  },
  {
    id: 'df-demo-categories-low-order',
    name: 'Categories low order',
    isActive: true,
    priority: 1,
    mode: 'modifyCells',
    target: { measureIds: ['measure-order-qty'], dimensionLevels: ['category'], timeKeys: ['mar2026'] },
    condition: { type: 'lessThan', value: 94 },
    visualization: { type: 'background', color: '#FFEBEB' },
    createdAt: new Date('2024-01-02T00:00:00'),
    updatedAt: new Date('2024-01-02T00:00:00'),
  },
  {
    id: 'df-demo-accounts-low-on-orders',
    name: 'Accounts Low on Orders',
    isActive: true,
    priority: 2,
    mode: 'modifyCells',
    target: { measureIds: ['measure-order-qty'], dimensionLevels: ['account'], timeKeys: ['mar2026'] },
    condition: { type: 'lessThan', value: 625 },
    visualization: { type: 'background', color: '#FFEBEB' },
    createdAt: new Date('2024-01-01T00:00:00'),
    updatedAt: new Date('2024-01-01T00:00:00'),
  },
];

// DF demo: the Order Quantity cells that fall below the committed sales agreement. These mirror the
// three pink conditional-formatting rules above (same measure/month/level thresholds), so the set of
// decorated cells is exactly the set of pink cells. Each gets a red left bar + warning icon + hover
// popover (rendered by GridRow); the popover CTA expands the whole hierarchy to reveal the product
// root cause. Thresholds are keyed by hierarchy depth: 0=account, 1=category, 2=product.
const DF_AGREEMENT_MONTH_KEY = 'mar2026';
const DF_AGREEMENT_THRESHOLDS = [625, 94, 9];
function computeAgreementRiskCellKeys(data: MeasureData[]): Set<string> {
  const keys = new Set<string>();
  const measure = (data || []).find((m) => m.id === 'measure-order-qty');
  if (!measure) return keys;
  const walk = (nodes: GridRow[] | undefined, depth: number): void => {
    const threshold = DF_AGREEMENT_THRESHOLDS[depth];
    (nodes || []).forEach((n) => {
      const v = Number((n.values as Record<string, number>)?.[DF_AGREEMENT_MONTH_KEY] ?? Infinity);
      if (threshold !== undefined && v < threshold) keys.add(`${n.id}-${DF_AGREEMENT_MONTH_KEY}`);
      if (n.children && n.children.length) walk(n.children, depth + 1);
    });
  };
  walk(measure.children, 0);
  return keys;
}

// Locate a row anywhere in the measure tree by id.
function findDfRowById(data: MeasureData[], id: string): GridRow | undefined {
  const stack: GridRow[] = [...((data as unknown as GridRow[]) || [])];
  while (stack.length) {
    const n = stack.pop() as GridRow;
    if (n.id === id) return n;
    if (n.children && n.children.length) stack.push(...(n.children as GridRow[]));
  }
  return undefined;
}

// Starting from the clicked red cell's row, expand ONE level to its immediate children, then
// follow only the red-warning children downward — expanding each red parent until the last red
// parent whose child is red. Non-red branches are never opened. Returns the row ids to expand.
function computeRedChainExpandIds(rootId: string, data: MeasureData[], redKeys: Set<string>): string[] {
  const root = findDfRowById(data, rootId);
  if (!root) return [];
  const ids: string[] = [];
  const collect = (node: GridRow): void => {
    if (!node.children || !node.children.length) return;
    ids.push(node.id); // expand this node so its immediate children show
    node.children.forEach((c) => {
      if (redKeys.has(`${c.id}-${DF_AGREEMENT_MONTH_KEY}`)) collect(c); // only follow red children
    });
  };
  collect(root);
  return ids;
}

import '../styles/components/Grid.css';
/* Segmented approver decision control (reused in GridRow edit popover) */
import '../styles/pages/PlanningForecastingPage.css';

// Cell focus types for different layouts
type HierarchicalGridFocus = { rowId: string; monthKey: string } | null;
type DimensionsTimeGridFocus = { rowId: string; measureId: string } | null;
type TimeDimensionsGridFocus = { rowId: string; measureId: string } | null;

const ForecastingGridDFDemo: React.FC = () => {
  const { industry } = useIndustry();
  const { session, saveSession } = usePlanningGridSession();
  const { currentUser } = useCurrentUser();
  const { planStatus, planSubmittedByUserId } = usePlanWorkflow();
  const planReviewGridLock = planStatus === 'Submitted';
  const planReviewRequesterStripes =
    planStatus === 'Submitted' &&
    planSubmittedByUserId != null &&
    planSubmittedByUserId === currentUser.id;
  const [selectedMeasureSubgroup, setSelectedMeasureSubgroup] = useState<Set<string>>(new Set(['Revenue & Quantity Measures', 'Adjustment Measures']));
  const [selectedLayoutState, setSelectedLayoutState] = useState<string>('Measures / Dimensions x Time');
  
  // Get data based on current industry, default to manufacturing if not set
  const currentIndustry = industry || 'manufacturing';
  const industryData = getMockData(currentIndustry);
  // Per-grid dimension scheme (levels + labels + grouping). Existing grids use the
  // default 3-level scheme; the deep grid exposes 5 account + 5 product levels.
  const dimensionScheme = getDimensionScheme(currentIndustry);
  const dimensionSchemeIds = dimensionScheme.map((l) => l.id);
  const sessionMatchesIndustry =
    session != null && session.industryKey === currentIndustry;

  const [data, setData] = useState<MeasureData[]>(() =>
    sessionMatchesIndustry ? cloneMeasureData(session.data) : industryData
  );
  // Store original/unfiltered data separately so filters always work on base data
  const [originalData, setOriginalData] = useState<MeasureData[]>(() =>
    sessionMatchesIndustry ? cloneMeasureData(session.originalData) : industryData
  );

  const [visibleMeasureIds, setVisibleMeasureIds] = useState<Set<string>>(() => {
    const s = new Set(DEFAULT_VISIBLE_MEASURE_IDS);
    if (readBaselineRevealed()) s.add(ARC3_REVEAL_MEASURE_ID);
    return s;
  });
  const visibleMeasureIdsRef = useRef<Set<string>>(visibleMeasureIds);
  useEffect(() => {
    visibleMeasureIdsRef.current = visibleMeasureIds;
  }, [visibleMeasureIds]);
  // Arc 3 — the Forecast & Risk Agent projects the ✦ Predicted Baseline measure.
  // While true, a "Projecting the baseline with Moirai…" overlay masks the grid.
  const [isRevealingBaseline, setIsRevealingBaseline] = useState(false);
  // Sticky: once the agent projects the baseline it stays visible + pinned to the top.
  // Seeded from the session-scoped flag so it survives navigation / remounts.
  const baselineRevealedRef = useRef(readBaselineRevealed());
  // Default visible set for standard grids, keeping the revealed ✦ baseline row if the
  // agent has already projected it (so it is never dropped on an industry/session reset).
  const defaultVisibleWithReveal = useCallback((): Set<string> => {
    const s = new Set(DEFAULT_VISIBLE_MEASURE_IDS);
    if (baselineRevealedRef.current) s.add(ARC3_REVEAL_MEASURE_ID);
    return s;
  }, []);
  const revealTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current); }, []);
  // Measures whose cells auto-lock after an edit (configured in the Reorder Measures modal)
  const [autoLockMeasureIds, setAutoLockMeasureIds] = useState<Set<string>>(new Set());
  const autoLockMeasureIdsRef = useRef<Set<string>>(autoLockMeasureIds);
  useEffect(() => {
    autoLockMeasureIdsRef.current = autoLockMeasureIds;
  }, [autoLockMeasureIds]);
  // Keep latest measure data in a ref so the auto-lock-after-edit hook can map a
  // row id back to its top-level measure without re-creating callbacks.
  const dataForAutoLockRef = useRef<MeasureData[]>(data);
  useEffect(() => {
    dataForAutoLockRef.current = data;
  }, [data]);
  
  // Approval state management
  /** Fresh load: no approval rows until the user requests / edits status in Cell Actions or bulk flows. */
  const seedApprovalData = useCallback((_measures: MeasureData[]): Map<string, ApprovalRequest> => {
    return new Map();
  }, []);
  
  const [approvalRequests, setApprovalRequests] = useState<Map<string, ApprovalRequest>>(new Map());
  /** Set inside handleApprovalAction updater; read after setApprovalRequests to show toast + close panel */
  const pendingApprovalSubmittedToastRef = useRef(false);
  /** History row to append once after approval action — must not live inside setApprovalRequests updater (React Strict Mode runs that twice in dev). */
  const pendingApprovalHistoryEntryRef = useRef<CellEditHistoryEntry | null>(null);
  /** Bulk approval mass-update history rows; assigned inside setApprovalRequests then flushed once. */
  const massApprovalHistoryFlushRef = useRef<CellEditHistoryEntry[] | null>(null);

  // Initialize approval data when data changes
  useEffect(() => {
    const seededApprovals = seedApprovalData(data);
    setApprovalRequests(prev => {
      if (prev.size === 0) return seededApprovals;
      const merged = new Map(seededApprovals);

      // Preserve user-submitted pending approvals and captured focus context
      // so Alerts cards continue to reflect real manual selections.
      prev.forEach((existingReq, cellKey) => {
        if (!merged.has(cellKey)) {
          merged.set(cellKey, existingReq);
          return;
        }
        const seededReq = merged.get(cellKey)!;
        const hasSelectionContext = Boolean(existingReq.focusContext?.selectedCellKeys?.length);
        const preserveRuntimeReq =
          existingReq.status === 'pending' ||
          hasSelectionContext ||
          existingReq.requesterId === currentUser.id;
        if (preserveRuntimeReq) {
          merged.set(cellKey, {
            ...seededReq,
            ...existingReq,
          });
        }
      });
      return merged;
    });
  }, [data, seedApprovalData, currentUser.id]);
  
  // Handle approval actions - wrapper to match HierarchicalGrid signature
  // approverRole is set when acting as a specific approver in the multi-approver flow
  const handleApprovalAction = useCallback((approvalId: string, action: 'submitForApproval' | 'approved' | 'approvedWithCondition' | 'rejected', comment: string, approverRole?: string) => {
    pendingApprovalSubmittedToastRef.current = false;
    setApprovalRequests(prev => {
      pendingApprovalHistoryEntryRef.current = null;
      const updated = new Map(prev);
      const cellKey = approvalId.replace(/^approval-/, '');
      const approval = updated.get(cellKey);
      if (approval) {
        const oldStatus = approval.status;
        const statusLabels: Record<ApprovalRequest['status'], string> = {
          notSubmitted: 'Not Submitted', pending: 'Pending', approved: 'Approved', approvedWithCondition: 'Approved with Condition', rejected: 'Rejected',
        };

        let updatedApproval: ApprovalRequest;
        const isWithdrawAction = action === 'submitForApproval' && comment.startsWith('__withdraw__');
        const withdrawReason = isWithdrawAction
          ? (comment.includes('::') ? comment.split('::').slice(1).join('::').trim() : '')
          : '';
        const selectedApproverNames = action === 'submitForApproval' && approverRole?.startsWith('__selected_names__:')
          ? approverRole.replace('__selected_names__:', '').split('|').map(v => v.trim()).filter(Boolean)
          : [];

        const isDecisionAction =
          action === 'approved' || action === 'rejected' || action === 'approvedWithCondition';

        let effectiveApproverRole =
          approverRole && !approverRole.startsWith('__selected_names__:') ? approverRole : undefined;
        if (isDecisionAction && approval.approvers && approval.approvers.length > 0 && !effectiveApproverRole) {
          const mine = currentUser.name.trim().toLowerCase();
          effectiveApproverRole = approval.approvers.find((a) => a.name.trim().toLowerCase() === mine)?.role;
        }

        const useMultiApproverDecisionPath =
          Boolean(
            effectiveApproverRole &&
              approval.approvers &&
              approval.approvers.length > 0 &&
              isDecisionAction
          );

        if (isDecisionAction && approval.approvers && approval.approvers.length > 0 && !effectiveApproverRole) {
          // GridRow / popover did not pass a role and current user is not in the approver list — do not
          // run legacy path (it would set aggregate status to Approved while others are still pending).
          return prev;
        }

        if (useMultiApproverDecisionPath) {
          // Per-approver update: update just this approver's entry and recompute aggregate (stays Pending until all finish)
          const updatedApprovers: ApproverState[] = approval.approvers!.map((a) =>
            a.role === effectiveApproverRole
              ? { ...a, status: action as ApproverState['status'], comment: comment || undefined, resolvedAt: new Date() }
              : a
          );
          const newAggregate = deriveAggregateStatus(updatedApprovers);
          updatedApproval = {
            ...approval,
            userInitiated: true,
            approvers: updatedApprovers,
            status: newAggregate,
            resolvedAt: newAggregate !== 'pending' ? new Date() : approval.resolvedAt,
          };
        } else {
          // Legacy / single-approver path, submit, withdraw
          const newStatus: ApprovalRequest['status'] = isWithdrawAction
            ? 'notSubmitted'
            : (action === 'submitForApproval' ? 'pending' : action);
          updatedApproval = {
            ...approval,
            userInitiated: true,
            status: newStatus,
            approverComment: action === 'submitForApproval' ? undefined : (comment || undefined),
            requesterNote: isWithdrawAction ? '' : (action === 'submitForApproval' && comment ? comment : approval.requesterNote),
            requesterId: action === 'submitForApproval' ? currentUser.id : approval.requesterId,
            requesterName: action === 'submitForApproval' ? currentUser.name : approval.requesterName,
            approvers: isWithdrawAction
              ? undefined
              : (action === 'submitForApproval' && selectedApproverNames.length > 0
              ? selectedApproverNames.map((name) => ({
                  role: name,
                  name,
                  initials: name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(),
                  status: 'pending' as const,
                }))
              : approval.approvers),
            resolvedAt: action === 'submitForApproval' ? undefined : new Date(),
          };
        }

        updated.set(cellKey, updatedApproval);

        const newStatus = updatedApproval.status;
        const roleKeyForActor = effectiveApproverRole ?? (approverRole && !approverRole.startsWith('__selected_names__:') ? approverRole : undefined);
        const actorName = roleKeyForActor
          ? (APPROVER_ROSTER[roleKeyForActor]?.name ?? approval.approvers?.find((a) => a.role === roleKeyForActor)?.name ?? roleKeyForActor)
          : currentUser.name;

        let note: string;
        if (action === 'submitForApproval') {
          note = isWithdrawAction
            ? `Approval request withdrawn${withdrawReason ? `: ${withdrawReason}` : ''}`
            : `Submitted for ${statusLabels['pending']} approval${comment ? `: ${comment}` : ''}`;
        } else if (useMultiApproverDecisionPath && updatedApproval.approvers && updatedApproval.approvers.length > 0) {
          const list = updatedApproval.approvers;
          const denom = list.length;
          const numer = list.filter(
            (a) => a.status === 'approved' || a.status === 'approvedWithCondition'
          ).length;
          note = `${actorName}: ${statusLabels[action]} (${numer}/${denom} approved; overall ${statusLabels[newStatus]})${comment ? ` — ${comment}` : ''}`;
        } else if (roleKeyForActor) {
          note = `${actorName}: ${statusLabels[oldStatus]} → ${statusLabels[newStatus]}${comment ? `: ${comment}` : ''}`;
        } else {
          note = `${statusLabels[oldStatus]} → ${statusLabels[newStatus]}${comment ? `: ${comment}` : ''}`;
        }

        const parts = cellKey.split('-');
        const timeKey = parts[parts.length - 1];
        const rowId = parts.slice(0, -1).join('-');

        pendingApprovalHistoryEntryRef.current = {
          id: `approval-${cellKey}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          cellKey: cellKey,
          rowId: rowId,
          timeKey: timeKey,
          oldValue: 0,
          newValue: 0,
          note: note,
          timestamp: new Date(),
          userId: roleKeyForActor ?? currentUser.id,
          userName: actorName,
        };

        if (action === 'submitForApproval' && !isWithdrawAction) {
          pendingApprovalSubmittedToastRef.current = true;
        }
      }
      return updated;
    });
    const pendingHist = pendingApprovalHistoryEntryRef.current;
    pendingApprovalHistoryEntryRef.current = null;
    if (pendingHist) {
      setEditHistory((prevHistory) => [pendingHist, ...prevHistory]);
    }
    if (pendingApprovalSubmittedToastRef.current) {
      pendingApprovalSubmittedToastRef.current = false;
      setApprovalSubmittedNotification({ isVisible: true, count: 1 });
      setIsCellDetailsHistoryOpen(false);
    }
  }, [currentUser]);
  
  // Update approval state directly (e.g. from HierarchicalGrid onApprovalUpdate callbacks)
  const handleApprovalUpdate = useCallback((cellKey: string, approval: ApprovalRequest | null) => {
    setApprovalRequests(prev => {
      const updated = new Map(prev);
      if (approval) {
        updated.set(cellKey, { ...approval, userInitiated: true });
      } else {
        updated.delete(cellKey);
      }
      return updated;
    });
  }, []);
  
  // Store focused cell for each layout
  const hierarchicalGridFocusRef = useRef<HierarchicalGridFocus>(null);
  const dimensionsTimeGridFocusRef = useRef<DimensionsTimeGridFocus>(null);
  const timeDimensionsGridFocusRef = useRef<TimeDimensionsGridFocus>(null);
  
  // State to track current focused cell for CellDetailsHistoryPanel (triggers re-render)
  const [currentFocusedCell, setCurrentFocusedCell] = useState<{ rowId: string; monthKey?: string; measureId?: string } | null>(null);
  
  // State to track selected cells for multi-cell operations
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastSelectedCell, setLastSelectedCell] = useState<string | null>(null);
  // Ref to track lastSelectedCell for synchronous access (critical for Shift+Click range selection)
  const lastSelectedCellRef = useRef<string | null>(null);
  // Track the anchor cell for Shift+Click range selection (first cell clicked while holding Shift)
  const shiftAnchorCellRef = useRef<string | null>(null);
  // Ref to track selectedCells for synchronous access
  const selectedCellsRef = useRef<Set<string>>(new Set());
  // Track selection order for mass update (preserve order) - use state so it triggers re-renders
  const [selectedCellsOrder, setSelectedCellsOrder] = useState<string[]>([]);
  const selectedCellsOrderRef = useRef<string[]>([]);
  // Refs to get visible rows and time keys from HierarchicalGrid for range selection
  const getVisibleRowsRef = useRef<(() => Array<{ id: string; [key: string]: any }>) | null>(null);
  const getVisibleTimeKeysRef = useRef<(() => string[]) | null>(null);
  // Ref to scroll to a specific measure in HierarchicalGrid
  const scrollToMeasureRef = useRef<((measureId: string) => void) | null>(null);
  const scrollToMeasureDimensionsTimeRef = useRef<((measureId: string) => void) | null>(null);
  const scrollToMeasureTimeDimensionsRef = useRef<((measureId: string) => void) | null>(null);
  
  // Drag selection state
  const isDraggingRef = useRef(false);
  const dragStartCellRef = useRef<string | null>(null);
  const isDragSelectionRef = useRef(false);
  
  // Track which cell is currently being edited globally
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  // Track cells that were impacted but are now saved (to prevent showing old popovers)
  const [savedImpactedCells, setSavedImpactedCells] = useState<Set<string>>(new Set());
  // Ref to track savedImpactedCells for synchronous access in callbacks
  const savedImpactedCellsRef = useRef<Set<string>>(new Set());
  const contextMenuRef = useRef<{
    isOpen: boolean;
    position: { x: number; y: number };
    cellKey: string;
    cellValue: number;
    isLocked: boolean;
    isEditable: boolean;
  } | null>(null);
  
  // Keep refs in sync with state
  useEffect(() => {
    selectedCellsRef.current = selectedCells;
  }, [selectedCells]);
  
  useEffect(() => {
    savedImpactedCellsRef.current = savedImpactedCells;
  }, [savedImpactedCells]);
  
  // ROOT CAUSE FIX: Keep refs in sync with state for synchronous access
  useEffect(() => {
    selectedCellsOrderRef.current = selectedCellsOrder;
  }, [selectedCellsOrder]);
  
  useEffect(() => {
    lastSelectedCellRef.current = lastSelectedCell;
  }, [lastSelectedCell]);
  
  // Update data and edit history when industry changes (or re-apply persisted planning session for this industry)
  useEffect(() => {
    const ind = industry || 'manufacturing';
    if (session?.industryKey === ind) {
      setData(cloneMeasureData(session.data));
      setOriginalData(cloneMeasureData(session.originalData));
      setEditHistory(reviveEditHistory(session.editHistory));
      setDraftEditHistory(
        new Map(
          session.draftEditHistory.map(([k, e]) => [
            k,
            {
              ...e,
              timestamp:
                e.timestamp instanceof Date ? e.timestamp : new Date(String(e.timestamp)),
            },
          ])
        )
      );
      setVisibleMeasureIds(
        isConfigIndustry(ind)
          ? new Set(session.data.map((m) => m.id))
          : defaultVisibleWithReveal()
      );
      setPlanWideApprovalSubmitted(false);
      return;
    }
    const newData = getMockData(ind);
    setData(newData);
    setOriginalData(newData);
    setVisibleMeasureIds(
      isConfigIndustry(ind)
        ? new Set(newData.map((m) => m.id))
        : defaultVisibleWithReveal()
    );
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const newEditHistory =
      ind === 'consumer-goods'
        ? createConsumerGoodsEditHistory(now, yesterday, twoDaysAgo)
        : createInitialEditHistory();
    setEditHistory(newEditHistory);
    setDraftEditHistory(new Map());
    setPlanWideApprovalSubmitted(false);
  }, [industry, session, defaultVisibleWithReveal]);

  // Default the selected measure categories to match the industry: config grids
  // pre-select all of their subsets; standard grids use Revenue & Quantity Measures.
  useEffect(() => {
    const ind = industry || 'manufacturing';
    if (isConfigIndustry(ind)) {
      const names = getConfigMeasureCategories(ind).map((c) => c.name);
      setSelectedMeasureSubgroup(new Set(names.length > 0 ? names : ['Revenue & Quantity Measures']));
    } else {
      setSelectedMeasureSubgroup(new Set(['Revenue & Quantity Measures', 'Adjustment Measures']));
    }
  }, [industry]);
  
  // Helper function to calculate all cells in a range between two cell keys
  const calculateCellRange = useCallback((startCellKey: string, endCellKey: string): string[] => {
    // Only works for HierarchicalGrid layout (cellKey format: `${rowId}-${monthKey}`)
    if (selectedLayoutState !== 'Measures / Dimensions x Time') {
      return [startCellKey, endCellKey]; // For other layouts, just return endpoints
    }
    
    // Get visible rows and time keys from HierarchicalGrid
    if (!getVisibleRowsRef.current || !getVisibleTimeKeysRef.current) {
      return [startCellKey, endCellKey]; // Fallback if refs not ready
    }
    
    const visibleRows = getVisibleRowsRef.current();
    const visibleTimeKeys = getVisibleTimeKeysRef.current();
    
    if (!visibleRows || !visibleTimeKeys || visibleRows.length === 0 || visibleTimeKeys.length === 0) {
      return [startCellKey, endCellKey];
    }
    
    // Parse cell keys to get rowId and monthKey
    // Handle approval cells (format: `${rowId}-${monthKey}-approval`) and regular cells (format: `${rowId}-${monthKey}`)
    const parseCellKey = (key: string): { rowId: string; monthKey: string } | null => {
      // Check if this is an approval cell key (ends with '-approval')
      const isApprovalCell = key.endsWith('-approval');
      const keyToParse = isApprovalCell ? key.replace(/-approval$/, '') : key;
      
      const parts = keyToParse.split('-');
      if (parts.length < 2) return null;
      const monthKey = parts[parts.length - 1];
      const rowId = parts.slice(0, -1).join('-');
      return { rowId, monthKey };
    };
    
    const start = parseCellKey(startCellKey);
    const end = parseCellKey(endCellKey);
    
    if (!start || !end) {
      return [startCellKey, endCellKey];
    }
    
    // Check if start/end are approval cells to preserve the suffix
    const isStartApproval = startCellKey.endsWith('-approval');
    const isEndApproval = endCellKey.endsWith('-approval');
    // If either is an approval cell, all cells in the range should be approval cells
    const isApprovalRange = isStartApproval || isEndApproval;
    
    // Find indices
    const startRowIndex = visibleRows.findIndex((r: any) => r.id === start.rowId);
    const endRowIndex = visibleRows.findIndex((r: any) => r.id === end.rowId);
    const startColIndex = visibleTimeKeys.findIndex((k: any) => String(k) === start.monthKey);
    const endColIndex = visibleTimeKeys.findIndex((k: any) => String(k) === end.monthKey);
    
    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      return [startCellKey, endCellKey];
    }
    
    // Calculate range bounds
    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);
    
    // Generate all cell keys in the rectangular range
    const rangeCells: string[] = [];
    try {
      for (let rowIdx = minRowIndex; rowIdx <= maxRowIndex; rowIdx++) {
        for (let colIdx = minColIndex; colIdx <= maxColIndex; colIdx++) {
          const row = visibleRows[rowIdx] as any;
          const monthKey = String(visibleTimeKeys[colIdx]);
          if (row && row.id && monthKey) {
            const cellKey = `${row.id}-${monthKey}`;
            // Preserve approval suffix if this is an approval range
            rangeCells.push(isApprovalRange ? `${cellKey}-approval` : cellKey);
          }
        }
      }
    } catch (error) {
      console.error('[ForecastingGrid] Error generating range cells:', error);
      return [startCellKey, endCellKey];
    }
    
    return rangeCells.length > 0 ? rangeCells : [startCellKey, endCellKey];
  }, [selectedLayoutState]);
  
  // Handler for cell selection
  const handleCellSelect = useCallback((cellKey: string, event: React.MouseEvent) => {
    // Don't process selection if we're actively dragging (mouse has moved to a different cell)
    // But allow normal clicks if we just clicked without dragging
    if (isDragSelectionRef.current && isDraggingRef.current) {
      return;
    }
    
    // Prevent selection if this is a double-click (which should enter edit mode)
    // Note: detail is only available on click events, not mousedown
    if (event.type === 'click' && event.detail === 2) {
      return;
    }
    
    // CRITICAL: Check modifier keys directly from the event object
    // Don't rely on any refs or state - always read from the event
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;
    
    // CRITICAL: If Shift is pressed and we have an anchor, preserve it
    // This prevents the anchor from being cleared accidentally
    const hadAnchorBefore = shiftAnchorCellRef.current;
    if (isShift && hadAnchorBefore) {
      // Don't let anything clear the anchor while Shift is held
      // We'll restore it if something tries to clear it
    }
    
    // If clicking a cell while another is editing, ALWAYS clear selection synchronously first
    // This prevents the editing cell from staying selected
    // BUT: Don't do this for Shift or Ctrl/Cmd clicks (they should work normally)
    if (editingCellKey && editingCellKey !== cellKey && !isCtrlOrCmd && !isShift) {
      // Clear selection and select only the new cell in one operation
      setSelectedCells(new Set([cellKey]));
      lastSelectedCellRef.current = cellKey;
      setLastSelectedCell(cellKey);
      shiftAnchorCellRef.current = null; // Clear Shift anchor
      selectedCellsOrderRef.current = [cellKey];
      setSelectedCellsOrder([cellKey]);
      return; // Early return to prevent double-processing
    }
    
    // ROOT CAUSE FIX: Read current order from ref (always synced via useEffect)
    // This ensures we always have the latest order value
    const currentOrder = selectedCellsOrderRef.current;
    let newOrder: string[] = [];
    
    setSelectedCells(prev => {
      const newSelection = new Set<string>();
      newOrder = []; // Reset for this selection
      
      if (isCtrlOrCmd) {
        // Toggle selection - keep previous selection and toggle this cell
        prev.forEach(cell => newSelection.add(cell));
        // Preserve order from ref - only include cells that are still selected
        currentOrder.forEach(cell => {
          if (newSelection.has(cell)) {
            newOrder.push(cell);
          }
        });
        if (prev.has(cellKey)) {
          newSelection.delete(cellKey);
          // Remove from order
          const index = newOrder.indexOf(cellKey);
          if (index > -1) newOrder.splice(index, 1);
        } else {
          newSelection.add(cellKey);
          // Add to end of order
          newOrder.push(cellKey);
        }
        // Clear Shift anchor when using Ctrl/Cmd (different selection mode)
        shiftAnchorCellRef.current = null;
        lastSelectedCellRef.current = cellKey;
        setLastSelectedCell(cellKey);
        // For multi-selection (Ctrl/Cmd), clear focusedCell (panel will show multi-cell view)
        if (newSelection.size !== 1) {
          setCurrentFocusedCell(null);
        } else {
          // Single cell selected via toggle - update focusedCell
          const singleCellKey = Array.from(newSelection)[0];
          if (selectedLayoutState === 'Dimensions / Time x Measures' || selectedLayoutState === 'Time / Dimensions x Measures') {
            const parts = singleCellKey.split('-');
            if (parts.length >= 2) {
              const measureId = parts[parts.length - 1];
              const dimensionId = parts.slice(0, -1).join('-');
              setCurrentFocusedCell({ rowId: dimensionId, measureId: measureId });
            }
          } else {
            const parts = singleCellKey.split('-');
            if (parts.length >= 2) {
              const monthKey = parts[parts.length - 1];
              const rowId = parts.slice(0, -1).join('-');
              setCurrentFocusedCell({ rowId: rowId, monthKey: monthKey });
            }
          }
        }
      } else if (isShift) {
        // Shift key pressed - range selection
        // For Shift+Click, we need to track the "anchor" cell (first cell clicked while holding Shift)
        // CRITICAL: Read anchor at the START of the callback to ensure we have the latest value
        // Also check if any cell from previous selection should become the anchor
        let currentAnchor = shiftAnchorCellRef.current;
        
        // CRITICAL: If no anchor but we have a previous selection, use the first selected cell as anchor
        // This handles the case where the user clicked without Shift first, then started Shift+Click
        // IMPORTANT: `prev` in the callback represents the state BEFORE this update
        // So if user clicked Apr (normal), then Shift+Clicks May, `prev` will have Apr
        // But we also check the ref to be safe (ref is updated synchronously)
        const currentSelectedCells = selectedCellsRef.current;
        const currentOrder = selectedCellsOrderRef.current;
        
        // Check if we have a previous selection - prefer `prev` (it's the state before this update)
        // but also check ref as fallback
        const hasPreviousSelection = prev.size > 0 || currentSelectedCells.size > 0;
        
        if (!currentAnchor && hasPreviousSelection) {
          // Prefer using `prev` (state before this update) - it's more reliable for detecting previous selection
          // But also check ref as fallback
          const previousSelection = prev.size > 0 ? prev : currentSelectedCells;
          
          // Prefer using selectedCellsOrder if available (preserves exact selection order)
          let firstSelected: string | undefined;
          
          if (currentOrder.length > 0) {
            // Use first cell from order array that exists in previous selection
            firstSelected = currentOrder.find(key => previousSelection.has(key));
          }
          
          // Fallback to first cell from Set if order array doesn't have valid cells
          if (!firstSelected) {
            firstSelected = Array.from(previousSelection)[0];
          }
          
          if (firstSelected && previousSelection.has(firstSelected)) {
            currentAnchor = firstSelected;
            shiftAnchorCellRef.current = firstSelected;
            console.log('[handleCellSelect] Using previous selection as anchor:', {
              firstSelected,
              currentOrder,
              currentSelection: Array.from(currentSelectedCells),
              prevSelection: Array.from(prev),
              previousSelection: Array.from(previousSelection),
              'prev.size': prev.size,
              'currentSelectedCells.size': currentSelectedCells.size
            });
          } else {
            console.log('[handleCellSelect] Failed to find anchor from previous selection:', {
              firstSelected,
              currentOrder,
              currentSelection: Array.from(currentSelectedCells),
              prevSelection: Array.from(prev),
              previousSelection: Array.from(previousSelection)
            });
          }
        }
        
        console.log('[handleCellSelect] Shift+Click detected:', {
          cellKey,
          currentAnchor,
          hasAnchor: !!currentAnchor,
          prevSelection: Array.from(prev),
          prevSize: prev.size,
          currentSelection: Array.from(currentSelectedCells),
          currentSelectionSize: currentSelectedCells.size,
          prevOrder: selectedCellsOrderRef.current,
          shiftAnchorRef: shiftAnchorCellRef.current
        });
        
        if (!currentAnchor) {
          // First Shift+Click: Set this cell as the anchor and select it
          console.log('[handleCellSelect] Setting anchor cell:', cellKey);
          shiftAnchorCellRef.current = cellKey;
          newSelection.clear();
          newSelection.add(cellKey);
          newOrder.push(cellKey);
          lastSelectedCellRef.current = cellKey;
          setLastSelectedCell(cellKey);
          // Single cell selected - update focusedCell
          if (selectedLayoutState === 'Dimensions / Time x Measures' || selectedLayoutState === 'Time / Dimensions x Measures') {
            const parts = cellKey.split('-');
            if (parts.length >= 2) {
              const measureId = parts[parts.length - 1];
              const dimensionId = parts.slice(0, -1).join('-');
              setCurrentFocusedCell({ rowId: dimensionId, measureId: measureId });
            }
          } else {
            const parts = cellKey.split('-');
            if (parts.length >= 2) {
              const monthKey = parts[parts.length - 1];
              const rowId = parts.slice(0, -1).join('-');
              setCurrentFocusedCell({ rowId: rowId, monthKey: monthKey });
            }
          }
        } else {
          // Subsequent Shift+Click: Calculate range from anchor to current cell
          // Use the anchor cell that was set on the first Shift+Click (or from previous selection)
          console.log('[handleCellSelect] Calculating range from anchor:', {
            anchor: currentAnchor,
            current: cellKey
          });
          
          const rangeCells = calculateCellRange(currentAnchor, cellKey);
          
          console.log('[handleCellSelect] Range calculation result:', {
            rangeCells,
            rangeCellsCount: rangeCells.length
          });
          
          // Clear previous selection and add only the new range
          // This ensures we replace any previous range with the new one
          newSelection.clear(); // Explicitly clear first
          rangeCells.forEach(cell => {
            newSelection.add(cell);
          });
          
          // Build order: add range cells in order (row by row, column by column)
          newOrder = [];
          rangeCells.forEach(cell => {
            newOrder.push(cell);
          });
          
          console.log('[handleCellSelect] After range selection:', {
            newSelection: Array.from(newSelection),
            newSelectionSize: newSelection.size,
            newOrder
          });
          
          lastSelectedCellRef.current = cellKey;
          setLastSelectedCell(cellKey);
          // For multi-selection (Shift), clear focusedCell (panel will show multi-cell view)
          setCurrentFocusedCell(null);
        }
      } else {
        // Single selection - ALWAYS clear previous and select new
        // This handles: normal click, or clicking same cell
        // This ensures that when clicking a cell while another is editing, we clear the old selection
        // IMPORTANT: When doing a normal click, set the selected cell as the anchor
        // This allows the next Shift+Click to use it as anchor for range selection
        // This is the key fix: preserve the selected cell as anchor for future Shift+Click
        shiftAnchorCellRef.current = cellKey; // Set the clicked cell as anchor for future Shift+Click
        
        newSelection.clear();
        newSelection.add(cellKey);
        newOrder.push(cellKey);
        lastSelectedCellRef.current = cellKey;
        setLastSelectedCell(cellKey);
        
        // Update focusedCell when a single cell is selected (so history panel shows its history)
        // Parse cellKey based on layout to extract rowId and monthKey/measureId
        if (selectedLayoutState === 'Dimensions / Time x Measures' || selectedLayoutState === 'Time / Dimensions x Measures') {
          // For these layouts, cellKey format is `${dimensionId}-${measureId}`
          const parts = cellKey.split('-');
          if (parts.length >= 2) {
            const measureId = parts[parts.length - 1];
            const dimensionId = parts.slice(0, -1).join('-');
            setCurrentFocusedCell({
              rowId: dimensionId,
              measureId: measureId
            });
          }
        } else {
          // For HierarchicalGrid, cellKey format is `${rowId}-${monthKey}`
          const parts = cellKey.split('-');
          if (parts.length >= 2) {
            const monthKey = parts[parts.length - 1];
            const rowId = parts.slice(0, -1).join('-');
            setCurrentFocusedCell({
              rowId: rowId,
              monthKey: monthKey
            });
          }
        }
      }
      
      console.log('[handleCellSelect] New order calculated:', newOrder);
      console.log('[handleCellSelect] Cell key:', cellKey);
      console.log('[handleCellSelect] Is Ctrl/Cmd:', isCtrlOrCmd);
      console.log('[handleCellSelect] Is Shift:', isShift);
      console.log('[handleCellSelect] Previous order (from ref):', currentOrder);
      console.log('[handleCellSelect] New selection size:', newSelection.size);
      console.log('[handleCellSelect] New selection:', Array.from(newSelection));
      
      // Update refs immediately for synchronous access
      selectedCellsRef.current = newSelection;
      selectedCellsOrderRef.current = newOrder;
      
      return newSelection;
    });
    
    // ROOT CAUSE FIX: Update state AFTER setSelectedCells completes
    // This ensures both are updated atomically with the correct order
    setSelectedCellsOrder(newOrder);

    // Auto-open the Cell History panel (single-cell view) when clicking an approval cell directly
    if (!isCtrlOrCmd && !isShift && cellKey.endsWith('-approval')) {
      const baseCellKey = cellKey.replace(/-approval$/, '');
      const parts = baseCellKey.split('-');
      const monthKey = parts[parts.length - 1];
      const rowId = parts.slice(0, -1).join('-');
      setCurrentFocusedCell({ rowId, monthKey });
      setCellDetailsInitialTab('single');
      setPanelKey(prev => prev + 1);
      setIsCellHistoryApprovalView(true);
      setIsCellDetailsHistoryOpen(true);
      setIsSettingsOpen(false);
      setIsFiltersOpen(false);
      setIsAlertsOpen(false);
    } else if (!isCtrlOrCmd && !isShift) {
      // Clicking a regular (numerical) cell — reset to edit history view
      setIsCellHistoryApprovalView(false);
    }
  }, [lastSelectedCell, editingCellKey, selectedLayoutState, calculateCellRange]);
  
  // Keyboard-driven cell selection (for Shift+Arrow and plain Arrow navigation)
  const handleKeyboardSelect = useCallback((cellKey: string, isShift: boolean) => {
    let newOrder: string[] = [];
    
    setSelectedCells(prev => {
      const newSelection = new Set<string>();
      newOrder = [];
      
      if (isShift) {
        // Shift+Arrow: range selection from anchor to cellKey
        let currentAnchor = shiftAnchorCellRef.current;
        
        // If no anchor, use the first cell from previous selection
        if (!currentAnchor && prev.size > 0) {
          const previousOrder = selectedCellsOrderRef.current;
          if (previousOrder.length > 0) {
            currentAnchor = previousOrder.find(key => prev.has(key)) || null;
          }
          if (!currentAnchor) {
            currentAnchor = Array.from(prev)[0] || null;
          }
          if (currentAnchor) {
            shiftAnchorCellRef.current = currentAnchor;
          }
        }
        
        if (!currentAnchor) {
          // No anchor at all: set this cell as anchor and select it
          shiftAnchorCellRef.current = cellKey;
          newSelection.add(cellKey);
          newOrder.push(cellKey);
        } else {
          // Calculate range from anchor to target
          const rangeCells = calculateCellRange(currentAnchor, cellKey);
          rangeCells.forEach(cell => {
            newSelection.add(cell);
            newOrder.push(cell);
          });
        }
        
        lastSelectedCellRef.current = cellKey;
        setLastSelectedCell(cellKey);
        if (newSelection.size > 1) {
          setCurrentFocusedCell(null);
        }
      } else {
        // Plain arrow: single selection, move to this cell
        shiftAnchorCellRef.current = cellKey;
        newSelection.add(cellKey);
        newOrder.push(cellKey);
        lastSelectedCellRef.current = cellKey;
        setLastSelectedCell(cellKey);
        
        // Update focusedCell for the side panel
        if (selectedLayoutState === 'Dimensions / Time x Measures' || selectedLayoutState === 'Time / Dimensions x Measures') {
          const parts = cellKey.split('-');
          if (parts.length >= 2) {
            const measureId = parts[parts.length - 1];
            const dimensionId = parts.slice(0, -1).join('-');
            setCurrentFocusedCell({ rowId: dimensionId, measureId: measureId });
          }
        } else {
          const parts = cellKey.split('-');
          if (parts.length >= 2) {
            const monthKey = parts[parts.length - 1];
            const rowId = parts.slice(0, -1).join('-');
            setCurrentFocusedCell({ rowId: rowId, monthKey: monthKey });
          }
        }
      }
      
      selectedCellsRef.current = newSelection;
      selectedCellsOrderRef.current = newOrder;
      
      return newSelection;
    });
    
    setSelectedCellsOrder(newOrder);
  }, [selectedLayoutState, calculateCellRange]);

  // Drag selection handlers
  const handleCellMouseDown = useCallback((cellKey: string, event: React.MouseEvent) => {
    // Don't start drag if double-clicking
    if (event.detail === 2) {
      return;
    }
    
    // Store the starting cell for potential drag, but don't mark as dragging yet
    // Only mark as dragging when mouse actually moves to a different cell
    dragStartCellRef.current = cellKey;
    isDragSelectionRef.current = false; // Will be set to true on first move to different cell
    isDraggingRef.current = false; // Reset dragging state
    
    // Don't interfere with normal click selection - let onCellSelect handle it
    // We'll only start drag if mouse moves to a different cell before mouseup
  }, []);
  
  const handleCellMouseMove = useCallback((cellKey: string) => {
    // Only start drag if we have a starting cell and mouse has moved
    if (!dragStartCellRef.current) {
      return;
    }
    
    const startCellKey = dragStartCellRef.current;
    
    // Only mark as dragging if mouse moved to a different cell
    if (startCellKey !== cellKey) {
      // If this is the first move to a different cell, mark as dragging
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        isDragSelectionRef.current = true;
        
        // Select the starting cell first
        setSelectedCells(new Set([startCellKey]));
        setSelectedCellsOrder([startCellKey]);
        lastSelectedCellRef.current = startCellKey;
        setLastSelectedCell(startCellKey);
        shiftAnchorCellRef.current = null;
      }
      
      // Calculate range from start to current cell
      const range = calculateCellRange(startCellKey, cellKey);
      
      // Update selection with the range
      setSelectedCells(new Set(range));
      setSelectedCellsOrder(range);
      lastSelectedCellRef.current = cellKey;
      setLastSelectedCell(cellKey);
    }
  }, [calculateCellRange]);

  // Fill handle drag handlers
  const handleFillHandleDragStart = useCallback((cellKey: string) => {
    // Use the current last selected cell as the anchor, or the cellKey if no selection
    const anchorCell = lastSelectedCellRef.current || cellKey;
    dragStartCellRef.current = anchorCell;
    isDragSelectionRef.current = true;
    isDraggingRef.current = true;
  }, []);

  const handleFillHandleDragMove = useCallback((cellKey: string) => {
    if (!dragStartCellRef.current) return;
    
    const startCellKey = dragStartCellRef.current;
    
    // Calculate range from start to current cell
    const range = calculateCellRange(startCellKey, cellKey);
    
    // Update selection with the range
    setSelectedCells(new Set(range));
    setSelectedCellsOrder(range);
    lastSelectedCellRef.current = cellKey;
    setLastSelectedCell(cellKey);
  }, [calculateCellRange]);

  const handleFillHandleDragEnd = useCallback(() => {
    dragStartCellRef.current = null;
    isDragSelectionRef.current = false;
    isDraggingRef.current = false;
  }, []);
  
  const handleCellMouseUp = useCallback(() => {
    // Clear drag state
    if (isDraggingRef.current || dragStartCellRef.current) {
      isDraggingRef.current = false;
      dragStartCellRef.current = null;
      isDragSelectionRef.current = false;
    }
  }, []);
  
  // Global move/up for drag selection — Pointer events cover touch/pen; mouse-only fallback for old engines
  useEffect(() => {
    const cellKeyUnder = (clientX: number, clientY: number): string | null => {
      const el = document.elementFromPoint(clientX, clientY);
      const cellElement = el?.closest('.grid-cell');
      return cellElement?.getAttribute('data-cell-key') ?? null;
    };

    const handleGlobalMove = (e: PointerEvent | MouseEvent) => {
      if (!dragStartCellRef.current) return;
      const key = cellKeyUnder(e.clientX, e.clientY);
      if (key) handleCellMouseMove(key);
    };

    const handleGlobalUp = () => {
      handleCellMouseUp();
    };

    if (typeof window !== 'undefined' && window.PointerEvent) {
      document.addEventListener('pointermove', handleGlobalMove, { capture: true });
      document.addEventListener('pointerup', handleGlobalUp, { capture: true });
      document.addEventListener('pointercancel', handleGlobalUp, { capture: true });
      return () => {
        document.removeEventListener('pointermove', handleGlobalMove, { capture: true });
        document.removeEventListener('pointerup', handleGlobalUp, { capture: true });
        document.removeEventListener('pointercancel', handleGlobalUp, { capture: true });
      };
    }

    document.addEventListener('mousemove', handleGlobalMove, { capture: true });
    document.addEventListener('mouseup', handleGlobalUp, { capture: true });
    return () => {
      document.removeEventListener('mousemove', handleGlobalMove, { capture: true });
      document.removeEventListener('mouseup', handleGlobalUp, { capture: true });
    };
  }, [handleCellMouseMove, handleCellMouseUp]);
  
  // Clear selection handler
  const handleClearSelection = useCallback(() => {
    setSelectedCells(new Set());
    lastSelectedCellRef.current = null;
    setLastSelectedCell(null);
    shiftAnchorCellRef.current = null; // Clear Shift anchor
    selectedCellsOrderRef.current = [];
    setSelectedCellsOrder([]);
    // Clear focusedCell when selection is cleared
    setCurrentFocusedCell(null);
  }, []);
  
  // Clear selection when clicking outside the grid (pointerdown + mousedown for touch vs mouse)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement;
      // Don't clear if clicking on a cell, dropdown, panel, toolbar buttons, or context menu
      if (
        target.closest('.grid-cell') ||
        target.closest('.cell-details-history-panel') ||
        target.closest('.planning-approval-modal-overlay') ||
        target.closest('.settings-panel') ||
        target.closest('.filters-panel') ||
        target.closest('.sort-panel') ||
        target.closest('.cell-details-history-dropdown-list') ||
        target.closest('.multi-cell-dropdown-list') ||
        target.closest('.grid-button-group') ||
        target.closest('.grid-button-group-item') ||
        target.closest('.cell-context-menu') ||
        target.closest('.fill-handle')
      ) {
        return;
      }
      // Clear selection on outside click
      setSelectedCells(new Set());
      lastSelectedCellRef.current = null;
      setLastSelectedCell(null);
      shiftAnchorCellRef.current = null; // Clear Shift anchor
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, []);
  
  // Function to create Consumer Goods specific edit history
  const createConsumerGoodsEditHistory = (_now: Date, yesterday: Date, twoDaysAgo: Date): CellEditHistoryEntry[] => {
    return [
      // Cells with both arrow and note indicators
      {
        id: 'cg-initial-1',
        cellKey: 'account-measure-py-volume-jan2026',
        rowId: 'account-measure-py-volume',
        timeKey: 'jan2026',
        oldValue: 800,
        newValue: 920,
        note: 'Increased Previous Year Volume forecast based on strong Q1 promotional campaigns and new retail partnerships',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3',
        cellKey: 'product-chips-1-measure-forecasted-volume-mar2026',
        rowId: 'product-chips-1-measure-forecasted-volume',
        timeKey: 'mar2026',
        oldValue: 80,
        newValue: 95,
        note: 'Classic Potato Chips demand surged following positive customer reviews and social media buzz',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3a',
        cellKey: 'product-chips-2-measure-target-volume-apr2026',
        rowId: 'product-chips-2-measure-target-volume',
        timeKey: 'apr2026',
        oldValue: 80,
        newValue: 105,
        note: 'Tortilla Chips target volume raised for Q2 based on strong retailer commitments and seasonal trends',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3b',
        cellKey: 'category-candy-measure-revenue-may2026',
        rowId: 'category-candy-measure-revenue',
        timeKey: 'may2026',
        oldValue: 50000,
        newValue: 52000,
        note: 'Candy & Sweets revenue increased following successful Mother\'s Day promotional campaign',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3c',
        cellKey: 'product-candy-1-measure-promo-spend-jun2026',
        rowId: 'product-candy-1-measure-promo-spend',
        timeKey: 'jun2026',
        oldValue: 10.5,
        newValue: 12.5,
        note: 'Chocolate Bars promo spend increased to support summer marketing campaign and competitive positioning',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3d',
        cellKey: 'account-measure-market-share-jul2026',
        rowId: 'account-measure-market-share',
        timeKey: 'jul2026',
        oldValue: 18.5,
        newValue: 19.2,
        note: 'Market share improved following successful product launches and expanded retail presence',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3e',
        cellKey: 'category-chips-measure-days-inventory-aug2026',
        rowId: 'category-chips-measure-days-inventory',
        timeKey: 'aug2026',
        oldValue: 42,
        newValue: 38,
        note: 'Days of Inventory reduced due to improved supply chain efficiency and faster turnover',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3f',
        cellKey: 'product-chips-3-measure-trade-spend-roi-sep2026',
        rowId: 'product-chips-3-measure-trade-spend-roi',
        timeKey: 'sep2026',
        oldValue: 2.8,
        newValue: 3.2,
        note: 'Kettle Cooked Chips trade spend ROI improved following optimized promotional strategy',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3g',
        cellKey: 'product-chips-4-measure-planned-volume-oct2026',
        rowId: 'product-chips-4-measure-planned-volume',
        timeKey: 'oct2026',
        oldValue: 80,
        newValue: 95,
        note: 'Veggie Crisps planned volume increased for Halloween season and health-conscious consumer trend',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3h',
        cellKey: 'category-candy-measure-forecasted-volume-nov2026',
        rowId: 'category-candy-measure-forecasted-volume',
        timeKey: 'nov2026',
        oldValue: 500,
        newValue: 480,
        note: 'Candy & Sweets forecast adjusted downward due to competitive pricing pressure and market saturation',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3i',
        cellKey: 'product-candy-2-measure-revenue-dec2026',
        rowId: 'product-candy-2-measure-revenue',
        timeKey: 'dec2026',
        oldValue: 10000,
        newValue: 9500,
        note: 'Gummy Bears revenue forecast reduced following ingredient cost increases and margin pressure',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3j',
        cellKey: 'product-chips-5-measure-target-volume-jan2026',
        rowId: 'product-chips-5-measure-target-volume',
        timeKey: 'jan2026',
        oldValue: 80,
        newValue: 65,
        note: 'Pita Chips target volume reduced due to slower than expected market adoption',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      // Product-level Planned Volume entries with notes and arrows
      {
        id: 'cg-product-planned-1',
        cellKey: 'product-chips-1-measure-planned-volume-mar2026',
        rowId: 'product-chips-1-measure-planned-volume',
        timeKey: 'mar2026',
        oldValue: 90,
        newValue: 105,
        note: 'Classic Potato Chips planned volume increased for March due to strong consumer demand and expanded retail distribution',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-product-planned-2',
        cellKey: 'product-chips-2-measure-planned-volume-apr2026',
        rowId: 'product-chips-2-measure-planned-volume',
        timeKey: 'apr2026',
        oldValue: 85,
        newValue: 98,
        note: 'Tortilla Chips planned volume raised for April following successful Q1 sales performance and new flavor launch',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-product-planned-3',
        cellKey: 'product-chips-3-measure-planned-volume-may2026',
        rowId: 'product-chips-3-measure-planned-volume',
        timeKey: 'may2026',
        oldValue: 95,
        newValue: 88,
        note: 'Kettle Cooked Chips planned volume adjusted downward for May due to production capacity constraints',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-product-planned-4',
        cellKey: 'product-chips-4-measure-planned-volume-jun2026',
        rowId: 'product-chips-4-measure-planned-volume',
        timeKey: 'jun2026',
        oldValue: 92,
        newValue: 110,
        note: 'Veggie Crisps planned volume increased significantly for June to support summer health-conscious consumer trends',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-product-planned-5',
        cellKey: 'product-candy-1-measure-planned-volume-jul2026',
        rowId: 'product-candy-1-measure-planned-volume',
        timeKey: 'jul2026',
        oldValue: 230,
        newValue: 250,
        note: 'Chocolate Bars planned volume increased for July to capitalize on summer travel and vacation season demand',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-product-planned-6',
        cellKey: 'product-candy-2-measure-planned-volume-aug2026',
        rowId: 'product-candy-2-measure-planned-volume',
        timeKey: 'aug2026',
        oldValue: 240,
        newValue: 220,
        note: 'Gummy Bears planned volume reduced for August due to ingredient supply chain delays and inventory optimization',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3k',
        cellKey: 'category-chips-measure-market-share-feb2026',
        rowId: 'category-chips-measure-market-share',
        timeKey: 'feb2026',
        oldValue: 17.0,
        newValue: 16.2,
        note: 'Market share decreased following aggressive competitor promotions and new product launches',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3l',
        cellKey: 'product-chips-1-measure-days-inventory-mar2026',
        rowId: 'product-chips-1-measure-days-inventory',
        timeKey: 'mar2026',
        oldValue: 40,
        newValue: 45,
        note: 'Days of Inventory increased due to production delays and slower than expected sales velocity',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3m',
        cellKey: 'account-measure-promo-spend-apr2026',
        rowId: 'account-measure-promo-spend',
        timeKey: 'apr2026',
        oldValue: 11.0,
        newValue: 10.2,
        note: 'Promo Spend% reduced following cost optimization initiative and improved pricing strategy',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3n',
        cellKey: 'product-chips-2-measure-trade-spend-roi-may2026',
        rowId: 'product-chips-2-measure-trade-spend-roi',
        timeKey: 'may2026',
        oldValue: 3.0,
        newValue: 2.6,
        note: 'Trade Spend ROI decreased following increased promotional intensity and competitive response',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3p',
        cellKey: 'product-candy-1-measure-forecasted-volume-jul2026',
        rowId: 'product-candy-1-measure-forecasted-volume',
        timeKey: 'jul2026',
        oldValue: 100,
        newValue: 90,
        note: 'Chocolate Bars forecast reduced due to seasonal demand patterns and inventory management',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3q',
        cellKey: 'category-chips-measure-revenue-aug2026',
        rowId: 'category-chips-measure-revenue',
        timeKey: 'aug2026',
        oldValue: 50000,
        newValue: 48000,
        note: 'Chips & Crisps revenue decreased following price competition and margin pressure',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-3r',
        cellKey: 'product-chips-3-measure-target-volume-sep2026',
        rowId: 'product-chips-3-measure-target-volume',
        timeKey: 'sep2026',
        oldValue: 100,
        newValue: 110,
        note: 'Kettle Cooked Chips target volume increased following strong consumer response and retailer support',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      // Cells with just arrow indicators (no notes)
      {
        id: 'cg-initial-4',
        cellKey: 'account-measure-forecasted-volume-apr2026',
        rowId: 'account-measure-forecasted-volume',
        timeKey: 'apr2026',
        oldValue: 1000,
        newValue: 1100,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-5',
        cellKey: 'category-chips-measure-target-volume-may2026',
        rowId: 'category-chips-measure-target-volume',
        timeKey: 'may2026',
        oldValue: 500,
        newValue: 400,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6',
        cellKey: 'product-chips-1-measure-revenue-jun2026',
        rowId: 'product-chips-1-measure-revenue',
        timeKey: 'jun2026',
        oldValue: 10000,
        newValue: 11500,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6a',
        cellKey: 'product-chips-2-measure-planned-volume-jan2026',
        rowId: 'product-chips-2-measure-planned-volume',
        timeKey: 'jan2026',
        oldValue: 80,
        newValue: 95,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6b',
        cellKey: 'category-candy-measure-forecasted-volume-feb2026',
        rowId: 'category-candy-measure-forecasted-volume',
        timeKey: 'feb2026',
        oldValue: 500,
        newValue: 420,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6c',
        cellKey: 'product-candy-1-measure-market-share-mar2026',
        rowId: 'product-candy-1-measure-market-share',
        timeKey: 'mar2026',
        oldValue: 16.5,
        newValue: 17.8,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6d',
        cellKey: 'account-measure-revenue-may2026',
        rowId: 'account-measure-revenue',
        timeKey: 'may2026',
        oldValue: 100000,
        newValue: 108000,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6e',
        cellKey: 'product-chips-3-measure-planned-volume-jul2026',
        rowId: 'product-chips-3-measure-planned-volume',
        timeKey: 'jul2026',
        oldValue: 80,
        newValue: 70,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6f',
        cellKey: 'category-chips-measure-promo-spend-aug2026',
        rowId: 'category-chips-measure-promo-spend',
        timeKey: 'aug2026',
        oldValue: 11.0,
        newValue: 10.0,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6g',
        cellKey: 'product-chips-4-measure-forecasted-volume-sep2026',
        rowId: 'product-chips-4-measure-forecasted-volume',
        timeKey: 'sep2026',
        oldValue: 80,
        newValue: 90,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6h',
        cellKey: 'category-candy-measure-market-share-oct2026',
        rowId: 'category-candy-measure-market-share',
        timeKey: 'oct2026',
        oldValue: 18.5,
        newValue: 19.5,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6i',
        cellKey: 'product-candy-2-measure-revenue-nov2026',
        rowId: 'product-candy-2-measure-revenue',
        timeKey: 'nov2026',
        oldValue: 10000,
        newValue: 9200,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6j',
        cellKey: 'account-measure-target-volume-dec2026',
        rowId: 'account-measure-target-volume',
        timeKey: 'dec2026',
        oldValue: 1100,
        newValue: 1200,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6k',
        cellKey: 'product-chips-1-measure-planned-volume-feb2026',
        rowId: 'product-chips-1-measure-planned-volume',
        timeKey: 'feb2026',
        oldValue: 80,
        newValue: 75,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6l',
        cellKey: 'category-chips-measure-days-inventory-apr2026',
        rowId: 'category-chips-measure-days-inventory',
        timeKey: 'apr2026',
        oldValue: 42,
        newValue: 38,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6m',
        cellKey: 'product-chips-2-measure-trade-spend-roi-may2026',
        rowId: 'product-chips-2-measure-trade-spend-roi',
        timeKey: 'may2026',
        oldValue: 3.0,
        newValue: 3.2,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-6o',
        cellKey: 'product-candy-1-measure-forecasted-volume-jul2026',
        rowId: 'product-candy-1-measure-forecasted-volume',
        timeKey: 'jul2026',
        oldValue: 100,
        newValue: 115,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      // Cells with just note indicators (no value changes)
      {
        id: 'cg-initial-7',
        cellKey: 'account-measure-py-volume-jul2026',
        rowId: 'account-measure-py-volume',
        timeKey: 'jul2026',
        oldValue: 800,
        newValue: 800,
        note: 'Monitoring Q3 promotional performance closely - may adjust Previous Year Volume based on mid-quarter review',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-8',
        cellKey: 'category-chips-measure-planned-volume-aug2026',
        rowId: 'category-chips-measure-planned-volume',
        timeKey: 'aug2026',
        oldValue: 400,
        newValue: 400,
        note: 'Waiting for confirmation on major retail chain promotion before finalizing August forecast',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-9',
        cellKey: 'product-chips-1-measure-revenue-sep2026',
        rowId: 'product-chips-1-measure-revenue',
        timeKey: 'sep2026',
        oldValue: 10000,
        newValue: 10000,
        note: 'Classic Potato Chips showing consistent performance, monitoring competitive landscape',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'cg-initial-10',
        cellKey: 'product-candy-1-measure-market-share-oct2026',
        rowId: 'product-candy-1-measure-market-share',
        timeKey: 'oct2026',
        oldValue: 16.5,
        newValue: 16.5,
        note: 'Chocolate Bars market share review scheduled for next week with marketing team',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
    ];
  };

  // Function to create initial edit history entries with sample data
  const createInitialEditHistory = (): CellEditHistoryEntry[] => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    // Return industry-specific edit history
    if (industry === 'consumer-goods') {
      return createConsumerGoodsEditHistory(now, yesterday, twoDaysAgo);
    }
    
    // Default to manufacturing edit history
    return [
      // Cells with both arrow and note indicators
      {
        id: 'initial-2',
        cellKey: 'category-transmission-measure-sa-rev-feb2026',
        rowId: 'category-transmission-measure-sa-rev',
        timeKey: 'feb2026',
        oldValue: 40000,
        newValue: 35000,
        note: 'Adjusted downward due to supply chain delays affecting transmission assembly',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3',
        cellKey: 'product-trn-a-measure-opp-qty-mar2026',
        rowId: 'product-trn-a-measure-opp-qty',
        timeKey: 'mar2026',
        oldValue: 120,
        newValue: 150,
        note: 'TRN 750 - A demand increased following successful product launch event',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3a',
        cellKey: 'product-trn-b-measure-sa-qty-apr2026',
        rowId: 'product-trn-b-measure-sa-qty',
        timeKey: 'apr2026',
        oldValue: 80,
        newValue: 105,
        note: 'TRN 750 - B showing strong performance in Q2, adjusted forecast upward',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3b',
        cellKey: 'category-chassis-measure-opp-rev-may2026',
        rowId: 'category-chassis-measure-opp-rev',
        timeKey: 'may2026',
        oldValue: 60000,
        newValue: 52000,
        note: 'Chassis components forecast reduced due to material cost increases and supplier delays',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3c',
        cellKey: 'product-chs-a-measure-sa-qty-jun2026',
        rowId: 'product-chs-a-measure-sa-qty',
        timeKey: 'jun2026',
        oldValue: 120,
        newValue: 145,
        note: 'CHS 500 - A demand surge expected in June following new customer onboarding',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3d',
        cellKey: 'account-measure-opp-qty-jul2026',
        rowId: 'account-measure-opp-qty',
        timeKey: 'jul2026',
        oldValue: 1200,
        newValue: 1100,
        note: 'Q3 opportunity quantity adjusted based on revised sales pipeline analysis',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3e',
        cellKey: 'category-engine-measure-sa-rev-aug2026',
        rowId: 'category-engine-measure-sa-rev',
        timeKey: 'aug2026',
        oldValue: 40000,
        newValue: 45000,
        note: 'Engine assembly revenue increased due to higher production capacity and efficiency gains',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3f',
        cellKey: 'product-eng-y-measure-opp-rev-sep2026',
        rowId: 'product-eng-y-measure-opp-rev',
        timeKey: 'sep2026',
        oldValue: 12000,
        newValue: 10000,
        note: 'Engine Y revenue forecast reduced following competitive pricing analysis and market conditions',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3g',
        cellKey: 'product-trn-c-measure-sa-qty-oct2026',
        rowId: 'product-trn-c-measure-sa-qty',
        timeKey: 'oct2026',
        oldValue: 80,
        newValue: 95,
        note: 'TRN 750 - C sales forecast updated based on customer feedback and product improvements',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3h',
        cellKey: 'category-transmission-measure-opp-qty-nov2026',
        rowId: 'category-transmission-measure-opp-qty',
        timeKey: 'nov2026',
        oldValue: 600,
        newValue: 680,
        note: 'Transmission assembly opportunity quantity increased for Q4 based on strong market demand',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3i',
        cellKey: 'product-chs-b-measure-opp-rev-dec2026',
        rowId: 'product-chs-b-measure-opp-rev',
        timeKey: 'dec2026',
        oldValue: 12000,
        newValue: 10500,
        note: 'CHS 500 - B year-end forecast adjusted to reflect conservative Q4 projections',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3j',
        cellKey: 'product-trn-d-measure-sa-qty-jan2026',
        rowId: 'product-trn-d-measure-sa-qty',
        timeKey: 'jan2026',
        oldValue: 80,
        newValue: 65,
        note: 'TRN 750 - D forecast reduced due to component availability constraints',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3k',
        cellKey: 'category-chassis-measure-sa-rev-feb2026',
        rowId: 'category-chassis-measure-sa-rev',
        timeKey: 'feb2026',
        oldValue: 40000,
        newValue: 36000,
        note: 'Chassis components revenue decreased following customer order cancellations',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3l',
        cellKey: 'product-chs-c-measure-opp-qty-mar2026',
        rowId: 'product-chs-c-measure-opp-qty',
        timeKey: 'mar2026',
        oldValue: 120,
        newValue: 95,
        note: 'CHS 500 - C opportunity quantity reduced after competitor pricing analysis',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3m',
        cellKey: 'account-measure-sa-rev-apr2026',
        rowId: 'account-measure-sa-rev',
        timeKey: 'apr2026',
        oldValue: 80000,
        newValue: 72000,
        note: 'Sales agreement revenue adjusted downward due to delayed contract negotiations',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3n',
        cellKey: 'product-eng-z-measure-opp-rev-may2026',
        rowId: 'product-eng-z-measure-opp-rev',
        timeKey: 'may2026',
        oldValue: 12000,
        newValue: 9800,
        note: 'Engine Z opportunity revenue decreased following technical specification changes',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3o',
        cellKey: 'category-engine-measure-opp-qty-jun2026',
        rowId: 'category-engine-measure-opp-qty',
        timeKey: 'jun2026',
        oldValue: 600,
        newValue: 520,
        note: 'Engine assembly opportunity quantity reduced due to market volatility and economic factors',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3p',
        cellKey: 'product-trn-e-measure-sa-rev-jul2026',
        rowId: 'product-trn-e-measure-sa-rev',
        timeKey: 'jul2026',
        oldValue: 8000,
        newValue: 6800,
        note: 'TRN 750 - E sales revenue forecast decreased following quality control review',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3q',
        cellKey: 'category-chassis-measure-sa-qty-aug2026',
        rowId: 'category-chassis-measure-sa-qty',
        timeKey: 'aug2026',
        oldValue: 400,
        newValue: 340,
        note: 'Chassis components quantity reduced due to production capacity limitations',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3r',
        cellKey: 'product-chs-d-measure-opp-rev-sep2026',
        rowId: 'product-chs-d-measure-opp-rev',
        timeKey: 'sep2026',
        oldValue: 12000,
        newValue: 10200,
        note: 'CHS 500 - D opportunity revenue adjusted following customer budget constraints',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3s',
        cellKey: 'account-measure-opp-qty-oct2026',
        rowId: 'account-measure-opp-qty',
        timeKey: 'oct2026',
        oldValue: 1200,
        newValue: 1080,
        note: 'Opportunity quantity decreased due to extended sales cycle and market uncertainty',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-3t',
        cellKey: 'category-transmission-measure-sa-rev-nov2026',
        rowId: 'category-transmission-measure-sa-rev',
        timeKey: 'nov2026',
        oldValue: 40000,
        newValue: 35000,
        note: 'Transmission assembly sales revenue reduced following supplier delivery delays',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      // Cells with just arrow indicators (no notes)
      {
        id: 'initial-4',
        cellKey: 'account-measure-opp-rev-apr2026',
        rowId: 'account-measure-opp-rev',
        timeKey: 'apr2026',
        oldValue: 120000,
        newValue: 135000,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-5',
        cellKey: 'category-engine-measure-sa-qty-may2026',
        rowId: 'category-engine-measure-sa-qty',
        timeKey: 'may2026',
        oldValue: 400,
        newValue: 320,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6',
        cellKey: 'product-eng-x-measure-opp-rev-jun2026',
        rowId: 'product-eng-x-measure-opp-rev',
        timeKey: 'jun2026',
        oldValue: 12000,
        newValue: 14000,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6a',
        cellKey: 'product-trn-c-measure-sa-qty-jan2026',
        rowId: 'product-trn-c-measure-sa-qty',
        timeKey: 'jan2026',
        oldValue: 80,
        newValue: 95,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6b',
        cellKey: 'category-chassis-measure-sa-qty-feb2026',
        rowId: 'category-chassis-measure-sa-qty',
        timeKey: 'feb2026',
        oldValue: 400,
        newValue: 320,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6c',
        cellKey: 'product-chs-b-measure-opp-qty-mar2026',
        rowId: 'product-chs-b-measure-opp-qty',
        timeKey: 'mar2026',
        oldValue: 120,
        newValue: 140,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6d',
        cellKey: 'account-measure-sa-rev-may2026',
        rowId: 'account-measure-sa-rev',
        timeKey: 'may2026',
        oldValue: 80000,
        newValue: 88000,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6e',
        cellKey: 'product-eng-x-measure-sa-qty-jul2026',
        rowId: 'product-eng-x-measure-sa-qty',
        timeKey: 'jul2026',
        oldValue: 80,
        newValue: 70,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6f',
        cellKey: 'category-transmission-measure-opp-rev-aug2026',
        rowId: 'category-transmission-measure-opp-rev',
        timeKey: 'aug2026',
        oldValue: 60000,
        newValue: 55000,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6g',
        cellKey: 'product-trn-e-measure-sa-qty-sep2026',
        rowId: 'product-trn-e-measure-sa-qty',
        timeKey: 'sep2026',
        oldValue: 80,
        newValue: 90,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6h',
        cellKey: 'category-engine-measure-opp-qty-oct2026',
        rowId: 'category-engine-measure-opp-qty',
        timeKey: 'oct2026',
        oldValue: 600,
        newValue: 650,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6i',
        cellKey: 'product-chs-c-measure-sa-rev-nov2026',
        rowId: 'product-chs-c-measure-sa-rev',
        timeKey: 'nov2026',
        oldValue: 8000,
        newValue: 7200,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6j',
        cellKey: 'account-measure-opp-rev-dec2026',
        rowId: 'account-measure-opp-rev',
        timeKey: 'dec2026',
        oldValue: 120000,
        newValue: 132000,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6k',
        cellKey: 'product-trn-a-measure-sa-rev-feb2026',
        rowId: 'product-trn-a-measure-sa-rev',
        timeKey: 'feb2026',
        oldValue: 8000,
        newValue: 7500,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6l',
        cellKey: 'category-chassis-measure-opp-qty-apr2026',
        rowId: 'category-chassis-measure-opp-qty',
        timeKey: 'apr2026',
        oldValue: 600,
        newValue: 540,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6m',
        cellKey: 'product-eng-y-measure-sa-qty-may2026',
        rowId: 'product-eng-y-measure-sa-qty',
        timeKey: 'may2026',
        oldValue: 80,
        newValue: 88,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6n',
        cellKey: 'category-transmission-measure-sa-qty-jun2026',
        rowId: 'category-transmission-measure-sa-qty',
        timeKey: 'jun2026',
        oldValue: 400,
        newValue: 380,
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-6o',
        cellKey: 'product-chs-d-measure-opp-qty-jul2026',
        rowId: 'product-chs-d-measure-opp-qty',
        timeKey: 'jul2026',
        oldValue: 120,
        newValue: 135,
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      // Cells with just note indicators (no value changes)
      {
        id: 'initial-7',
        cellKey: 'account-measure-sa-qty-jul2026',
        rowId: 'account-measure-sa-qty',
        timeKey: 'jul2026',
        oldValue: 800,
        newValue: 800,
        note: 'Monitoring Q3 trends closely - may need adjustment based on mid-quarter review',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-8',
        cellKey: 'category-transmission-measure-opp-qty-aug2026',
        rowId: 'category-transmission-measure-opp-qty',
        timeKey: 'aug2026',
        oldValue: 600,
        newValue: 600,
        note: 'Waiting for confirmation on large enterprise deal before finalizing August forecast',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-9',
        cellKey: 'product-trn-b-measure-sa-rev-sep2026',
        rowId: 'product-trn-b-measure-sa-rev',
        timeKey: 'sep2026',
        oldValue: 8000,
        newValue: 8000,
        note: 'TRN 750 - B showing consistent performance, no changes needed at this time',
        timestamp: yesterday,
        userId: 'john-carter',
        userName: 'David Chen',
      },
      {
        id: 'initial-10',
        cellKey: 'product-eng-y-measure-opp-qty-oct2026',
        rowId: 'product-eng-y-measure-opp-qty',
        timeKey: 'oct2026',
        oldValue: 120,
        newValue: 120,
        note: 'Engine Y production capacity review scheduled for next week',
        timestamp: twoDaysAgo,
        userId: 'john-carter',
        userName: 'David Chen',
      },
    ];
  };

  // State to track edit history for all cells (includes both edits and notes) - SAVED edits only
  const [editHistory, setEditHistory] = useState<CellEditHistoryEntry[]>(() =>
    sessionMatchesIndustry ? reviveEditHistory(session.editHistory) : createInitialEditHistory()
  );

  // State to track DRAFT edit history (unsaved edits) - Map keyed by cellKey for quick lookup/update
  const [draftEditHistory, setDraftEditHistory] = useState<Map<string, CellEditHistoryEntry>>(() => {
    if (!sessionMatchesIndustry) return new Map();
    return new Map(
      session.draftEditHistory.map(([k, e]) => [
        k,
        {
          ...e,
          timestamp:
            e.timestamp instanceof Date ? e.timestamp : new Date(String(e.timestamp)),
        },
      ])
    );
  });

  const cellMapsSnapshotRef = useRef<PlanningGridCellMapsSnapshot | null>(null);
  const handleCellMapsSnapshotChange = useCallback((snap: PlanningGridCellMapsSnapshot) => {
    cellMapsSnapshotRef.current = snap;
  }, []);

  const sessionPersistRef = useRef({
    industryKey: currentIndustry,
    data,
    originalData,
    editHistory,
    draftEditHistory,
  });
  sessionPersistRef.current = {
    industryKey: currentIndustry,
    data,
    originalData,
    editHistory,
    draftEditHistory,
  };

  // State for locked cells - locked cells cannot be edited or impacted by propagation
  const [lockedCells, setLockedCells] = useState<Set<string>>(new Set());
  
  // State for read cells - cells marked as read will not show note indicators
  // Use array instead of Set so React can detect changes more reliably
  const [readCells, setReadCells] = useState<string[]>([]);
  const readCellsRef = useRef<string[]>([]);
  useEffect(() => {
    readCellsRef.current = readCells;
  }, [readCells]);

  /** True after user submits full-grid Request Approval (Bulk Action). */
  const [planWideApprovalSubmitted, setPlanWideApprovalSubmitted] = useState(false);
  
  // State for undo/redo
  const undoHandlerRef = useRef<(() => void) | null>(null);
  const redoHandlerRef = useRef<(() => void) | null>(null);
  // Note: canUndo/canRedo state managed by HierarchicalGrid
  const [_canUndo, setCanUndo] = useState(false);
  const [_canRedo, setCanRedo] = useState(false);
  
  // Ref to store cell change handler for programmatic mass updates
  const cellChangeHandlerRef = useRef<((rowId: string, monthKey: string, newValue: number, note?: string) => void) | null>(null);
  // Ref to get current cell value from grid's internal state
  const getCurrentCellValueRef = useRef<((rowId: string, monthKey: string) => number) | null>(null);

  // Tracks whether the first cell edit has already flipped the grid into the design-system
  // "unsaved edit" view (yellow edited/impacted cells + delta %). Runs once so we never fight
  // a user who later turns design-system rules back off from the Formatting tab.
  const designSystemAutoAppliedRef = useRef(false);

  // Function to add/edit DRAFT edit history entry (unsaved edits)
  // If a draft already exists for this cellKey, update it; otherwise create new
  const addDraftEditHistory = useCallback((entry: Omit<CellEditHistoryEntry, 'id' | 'timestamp' | 'userId' | 'userName'>) => {
    // Arc 5: remember a June override on the Sales Manager Target Quantity measure — on save
    // it becomes the red "above committed agreement" risk cell that launches the flow.
    if (entry.cellKey && entry.timeKey === 'jun2026' && entry.newValue !== undefined && /sm-target-qty/i.test(entry.rowId || '')) {
      pendingRiskCellRef.current = entry.cellKey;
    }
    // Auto-lock: if the edited cell's measure is configured to auto-lock, lock the
    // cell immediately after the value changes (mirrors Parag's deployed behavior).
    if (
      entry.cellKey &&
      entry.newValue !== undefined &&
      entry.newValue !== entry.oldValue &&
      autoLockMeasureIdsRef.current.size > 0
    ) {
      const containsRow = (node: any): boolean =>
        !!node && (node.id === entry.rowId || (Array.isArray(node.children) && node.children.some(containsRow)));
      let measureId: string | null = null;
      for (const measure of dataForAutoLockRef.current) {
        if (measure.id === entry.rowId || containsRow(measure)) {
          measureId = measure.id;
          break;
        }
      }
      if (measureId && autoLockMeasureIdsRef.current.has(measureId)) {
        const cellKey = entry.cellKey;
        setLockedCells(prev => {
          if (prev.has(cellKey)) return prev;
          const next = new Set(prev);
          next.add(cellKey);
          return next;
        });
      }
    }

    // On the first real value edit, drop into the design-system "unsaved edit" view: turn on
    // the yellow edited/impacted highlighting + delta %, which also stands the seeded demo
    // (red modifyCells) rules down, and collapse the right panel so the edit reads clearly.
    // Runs once — if the user later opens the Formatting tab and turns design-system rules off,
    // subsequent edits won't force it back on.
    if (
      entry.newValue !== undefined &&
      entry.newValue !== entry.oldValue &&
      !designSystemAutoAppliedRef.current
    ) {
      designSystemAutoAppliedRef.current = true;
      setIsDesignSystemRulesEnabled(true);
      // Collapse whichever right panel was open (Charts is the common one in this flow,
      // Settings/Formatting the other) so the unsaved-edit view reads clearly.
      setIsSettingsOpen(false);
      setIsChartsOpen(false);
    }

    setDraftEditHistory(prev => {
      const newMap = new Map(prev);
      const existingDraft = newMap.get(entry.cellKey);
      
      if (existingDraft) {
        // Update existing draft - merge value and note changes
        // Keep the original oldValue from first edit, update newValue and note
        // CRITICAL: For note-only entries, preserve the note even if oldValue === newValue
        const updatedDraft = {
          ...existingDraft,
          oldValue: existingDraft.oldValue ?? entry.oldValue,
          newValue: entry.newValue ?? existingDraft.newValue,
          note: entry.note !== undefined ? (entry.note.trim() || undefined) : existingDraft.note,
          timestamp: new Date(), // Update timestamp to latest edit
        };
        newMap.set(entry.cellKey, updatedDraft);
      } else {
        // Create new draft entry
        const newDraft: CellEditHistoryEntry = {
          ...entry,
          id: `draft-${entry.cellKey}-${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
          userId: 'john-carter',
          userName: 'David Chen',
        };
        
        // Ensure note is preserved and trimmed
        if (newDraft.note) {
          newDraft.note = newDraft.note.trim();
        }
        
        newMap.set(entry.cellKey, newDraft);
      }
      
      return newMap;
    });
  }, []);

  // Mass update handler
  const handleMassUpdate = useCallback((cellKeys: string[], rule: string, valueStr: string, note?: string, disaggregationRule?: string, submitToApprovers?: string[]) => {
    if (cellKeys.length === 0) return;
    
    // ROOT CAUSE FIX: Remove duplicates while preserving order
    // This ensures each cell is only updated once, in the correct order
    const seen = new Set<string>();
    const finalOrderedKeys: string[] = [];
    for (const key of cellKeys) {
      if (!seen.has(key)) {
        seen.add(key);
        finalOrderedKeys.push(key);
      }
    }
    
    const approvalStatuses = ['approved', 'approvedWithCondition', 'pending', 'rejected', 'notSubmitted'];
    const isApprovalStatus = approvalStatuses.includes(valueStr.trim());
    
    // Handle approval status update: keys may be value keys (`rowId-timeKey` / `dimension-measure`)
    // or bulk "Edit Approval Status" keys ending in `-approval`.
    if (rule === 'Set to' && isApprovalStatus) {
      const approvalCellKeys = finalOrderedKeys.map((k) => (k.endsWith('-approval') ? k : `${k}-approval`));
      const normalizedValue = valueStr.trim();
      // Only allow valid statuses
      if (!['approved', 'approvedWithCondition', 'pending', 'rejected', 'notSubmitted'].includes(normalizedValue)) {
        console.log('[MassUpdate] Invalid approval status:', normalizedValue);
        return;
      }
      const newStatus = normalizedValue as ApprovalRequest['status'];
      const monthOrder = ['jan2026','feb2026','mar2026','apr2026','may2026','jun2026','jul2026','aug2026','sep2026','oct2026','nov2026','dec2026'];
      const monthIndex = (k: string) => {
        const i = monthOrder.indexOf(k.toLowerCase());
        return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
      };

      const buildFocusContext = (keys: string[]) => {
        const baseKeys = keys.map(k => k.replace(/-approval$/, ''));
        const rowIds = new Set<string>();
        const timeKeys = new Set<string>();
        const measureNames = new Set<string>();
        const dimensionNames = new Set<string>();

        baseKeys.forEach(cellKey => {
          const parts = cellKey.split('-');
          if (parts.length < 2) return;
          const timeKey = parts[parts.length - 1];
          const rowId = parts.slice(0, -1).join('-');
          rowIds.add(rowId);
          timeKeys.add(timeKey);
        });

        rowIds.forEach(rowId => {
          for (const measure of data) {
            if (measure.id === rowId) {
              measureNames.add(measure.name);
              break;
            }
            const found = findRowById(rowId, measure.children ?? []);
            if (found) {
              measureNames.add(measure.name);
              dimensionNames.add(found.name);
              break;
            }
          }
        });

        const sortedTimes = Array.from(timeKeys).sort((a, b) => monthIndex(a) - monthIndex(b));
        const startPeriod = sortedTimes[0];
        const endPeriod = sortedTimes[sortedTimes.length - 1];

        const measureSummary = Array.from(measureNames).slice(0, 2).join(', ');
        const dimensionSummary = Array.from(dimensionNames).slice(0, 2).join(', ');
        const searchTerm = [measureSummary, dimensionSummary].filter(Boolean).join(' ');

        return {
          searchTerm: searchTerm || undefined,
          startPeriod,
          endPeriod,
          measureSummary: measureSummary || undefined,
          dimensionSummary: dimensionSummary || undefined,
          selectedCellKeys: baseKeys,
        };
      };
      const focusContext = buildFocusContext(approvalCellKeys);

      const baseValueKeys = approvalCellKeys.map((k) => k.replace(/-approval$/, ''));
      const baseKeySet = new Set(baseValueKeys);
      const planWideKeySet = new Set(getPlanWideValueCellKeys(data));
      const isPlanWideBulkPending =
        newStatus === 'pending' &&
        planWideKeySet.size > 0 &&
        planWideKeySet.size === baseKeySet.size &&
        [...planWideKeySet].every((k) => baseKeySet.has(k));

      // Build approvers list when submitting for approval
      const buildApprovers = (): ApproverState[] | undefined => {
        if (newStatus !== 'pending' || !submitToApprovers || submitToApprovers.length === 0) return undefined;
        return submitToApprovers.map(role => ({
          role,
          name: APPROVER_ROSTER[role]?.name ?? role,
          initials: APPROVER_ROSTER[role]?.initials ?? role.slice(0, 2).toUpperCase(),
          status: 'pending' as const,
        }));
      };

      setApprovalRequests((prev) => {
        massApprovalHistoryFlushRef.current = null;
        const updated = new Map(prev);
        const perCellPieces: CellEditHistoryEntry[] = [];

        approvalCellKeys.forEach((approvalCellKey) => {
          const cellKey = approvalCellKey.replace(/-approval$/, '');
          const approval = updated.get(cellKey);

          if (approval) {
            const normalizedOldStatus = (approval.status === 'approved' || approval.status === 'approvedWithCondition' || approval.status === 'pending' || approval.status === 'rejected' || approval.status === 'notSubmitted')
              ? approval.status
              : 'notSubmitted';
            const newApprovers = buildApprovers();
            const trimmedNote = note?.trim() || '';
            updated.set(cellKey, {
              ...approval,
              userInitiated: true,
              status: newStatus,
              approvers: newApprovers ?? approval.approvers,
              requesterNote: newStatus === 'pending' ? trimmedNote : approval.requesterNote,
              approverComment: newStatus === 'pending' ? undefined : (trimmedNote || approval.approverComment || ''),
              focusContext: newStatus === 'pending' ? focusContext : approval.focusContext,
              createdAt: newStatus === 'pending' ? new Date() : approval.createdAt,
              resolvedAt: newStatus === 'pending' || newStatus === 'notSubmitted' ? undefined : new Date(),
            });

            const normalizedNewStatusForHistory = (newStatus === 'approved' || newStatus === 'pending' || newStatus === 'rejected' || newStatus === 'notSubmitted')
              ? newStatus
              : 'notSubmitted';
            if (!isPlanWideBulkPending) {
              perCellPieces.push(
                createBulkHistoryEntry(
                  cellKey,
                  normalizedOldStatus as ApprovalRequest['status'] | 'needsMoreInfo' | 'modificationSuggested' | 'inDiscussion',
                  normalizedNewStatusForHistory as ApprovalRequest['status'] | 'needsMoreInfo' | 'modificationSuggested' | 'inDiscussion',
                  note?.trim() || '',
                  currentUser.id,
                  currentUser.name
                )
              );
            }
          } else {
            const parts = cellKey.split('-');
            if (parts.length >= 2) {
              const monthKey = parts[parts.length - 1];
              const rowId = parts.slice(0, -1).join('-');
              const measureId = rowId.split('-').find((part) => part.startsWith('measure-')) || '';

              const newApprovers = buildApprovers();
              updated.set(cellKey, {
                id: `approval-${cellKey}-${Date.now()}`,
                cellKey: cellKey,
                measureId: measureId,
                rowId: rowId,
                timeKey: monthKey,
                oldValue: 0,
                newValue: 0,
                variancePct: 0,
                requesterNote: newStatus === 'pending' ? (note?.trim() || '') : '',
                requesterId: currentUser.id,
                requesterName: currentUser.name,
                approverId: '',
                approverName: '',
                status: newStatus,
                approvers: newApprovers,
                approverComment: newStatus === 'pending' ? undefined : (note?.trim() || ''),
                focusContext: newStatus === 'pending' ? focusContext : undefined,
                userInitiated: true,
                createdAt: new Date(),
                resolvedAt: newStatus !== 'pending' && newStatus !== 'notSubmitted' ? new Date() : undefined,
              });
            }
          }
        });

        if (isPlanWideBulkPending) {
          const trimmedNote = note?.trim() || '';
          massApprovalHistoryFlushRef.current = [
            {
              id: `approval-batch-plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              cellKey: PLAN_WIDE_APPROVAL_BATCH_CELL_KEY,
              rowId: '__plan-wide__',
              timeKey:
                focusContext.startPeriod && focusContext.endPeriod
                  ? `${focusContext.startPeriod}–${focusContext.endPeriod}`
                  : undefined,
              oldValue: 0,
              newValue: 0,
              note: `Submitted for Pending approval (plan-wide, ${baseKeySet.size} cells)${trimmedNote ? `: ${trimmedNote}` : ''}`,
              timestamp: new Date(),
              userId: currentUser.id,
              userName: currentUser.name,
              bulkAffectedCellKeys: [...baseKeySet],
            },
          ];
        } else if (perCellPieces.length > 0) {
          massApprovalHistoryFlushRef.current = perCellPieces;
        }

        return updated;
      });

      const massHist = massApprovalHistoryFlushRef.current;
      massApprovalHistoryFlushRef.current = null;
      if (massHist && massHist.length > 0) {
        setEditHistory((prev) => [...massHist, ...prev]);
      }
      if (newStatus === 'pending') {
        setApprovalSubmittedNotification({
          isVisible: true,
          count: approvalCellKeys.length,
        });
        setIsCellDetailsHistoryOpen(false);
        const planWideKeys = getPlanWideValueCellKeys(data);
        const baseKeys = approvalCellKeys.map((k) => k.replace(/-approval$/, ''));
        const baseSet = new Set(baseKeys);
        const pwSet = new Set(planWideKeys);
        if (
          planWideKeys.length > 0 &&
          baseSet.size === pwSet.size &&
          [...pwSet].every((k) => baseSet.has(k))
        ) {
          setPlanWideApprovalSubmitted(true);
        }
      }
      
      // Clear selection after update
      handleClearSelection();
      return;
    }
    
    // Handle disaggregation rule case - create edit history entries without changing values
    if (disaggregationRule) {
      finalOrderedKeys.forEach(cellKey => {
        const parts = cellKey.split('-');
        if (parts.length < 2) return;
        const monthKey = parts[parts.length - 1];
        const rowId = parts.slice(0, -1).join('-');
        
        if (!rowId || !monthKey) return;
        
        // Get current value
        const currentValue = getCurrentCellValueRef.current ? getCurrentCellValueRef.current(rowId, monthKey) : 0;
        
        // Create edit history entry with disaggregation rule
        addDraftEditHistory({
          cellKey,
          rowId,
          timeKey: monthKey,
          oldValue: currentValue,
          newValue: currentValue, // Same value, just setting disaggregation rule
          note: note?.trim() || undefined,
          disaggregationRule: disaggregationRule,
        });
      });
      
      // Clear selection after update
      handleClearSelection();
      return;
    }
    
    // Parse value - support percentage (e.g., "20%") or absolute number
    const isPercentage = valueStr.trim().endsWith('%');
    const numericValue = parseFloat(valueStr.replace('%', '').trim());
    
    if (isNaN(numericValue)) {
      console.log('[MassUpdate] Invalid numeric value:', valueStr);
      return;
    }
    
    console.log('[MassUpdate] Starting update for', finalOrderedKeys.length, 'cells, rule:', rule, 'value:', numericValue, isPercentage ? '%' : '');
    console.log('[MassUpdate] FINAL ordered cell keys (deduplicated, preserving order):', finalOrderedKeys);
    console.log('[MassUpdate] Input cellKeys (before deduplication):', cellKeys);
    
    // Use the grid's handler directly - it handles edited cells, impacted cells, and propagation
    if (cellChangeHandlerRef.current && getCurrentCellValueRef.current && selectedLayoutState === 'Measures / Dimensions x Time') {
      // Process each cell sequentially to ensure each reads the latest state after previous updates
      const processUpdates = async () => {
        console.log('[MassUpdate] Processing cells in order:', finalOrderedKeys);
        console.log('[MassUpdate] Total cells to process:', finalOrderedKeys.length);
        for (let i = 0; i < finalOrderedKeys.length; i++) {
          const cellKey = finalOrderedKeys[i];
          console.log(`[MassUpdate] Processing cell ${i + 1}/${finalOrderedKeys.length}:`, cellKey);
          
          // Parse cellKey: format is `${rowId}-${monthKey}` where rowId can contain dashes
          // monthKey is always the last part (e.g., 'feb2026', 'jan2026', 'year', 'q1', etc.)
          const parts = cellKey.split('-');
          if (parts.length < 2) {
            console.log('[MassUpdate] Invalid cellKey:', cellKey);
            continue;
          }
          const monthKey = parts[parts.length - 1];
          const rowId = parts.slice(0, -1).join('-');
          
          if (!rowId || !monthKey) {
            console.log('[MassUpdate] Invalid cellKey:', cellKey);
            continue;
          }
          
          // Wait a bit before processing to ensure previous update completed and state synced
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          // Get current value from grid's internal state (reads latest after previous updates)
          if (!getCurrentCellValueRef.current) continue;
          const currentValue = getCurrentCellValueRef.current(rowId, monthKey);
          
          // Calculate new value based on rule
          let newValue: number;
          switch (rule) {
            case 'Increase':
              newValue = isPercentage ? currentValue * (1 + numericValue / 100) : currentValue + numericValue;
              break;
            case 'Decrease':
              newValue = isPercentage ? currentValue * (1 - numericValue / 100) : currentValue - numericValue;
              break;
            case 'Set to':
              newValue = numericValue;
              break;
            case 'Multiply by':
              newValue = currentValue * numericValue;
              break;
            case 'Divide by':
              if (numericValue === 0) continue;
              newValue = currentValue / numericValue;
              break;
            default:
              continue;
          }
          
          // Round to nearest integer
          newValue = Math.round(newValue);
          
          console.log(`[MassUpdate] Updating cell ${cellKey}: ${currentValue} -> ${newValue}`);
          
          // Call the grid's handler - it will:
          // 1. Mark cell as edited
          // 2. Mark impacted cells
          // 3. Trigger propagation
          // 4. Call onEditHistory callback
          // 5. Update gridData and call onDataChange
          if (cellChangeHandlerRef.current) {
            cellChangeHandlerRef.current(rowId, monthKey as any, newValue, note?.trim() || undefined);
            
            // Wait a bit after calling handler to allow state updates to propagate
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        console.log('[MassUpdate] Finished processing all cells');
      };
      
      // Start processing updates (don't await - let it run in background)
      processUpdates();
    } else {
      // Fallback: Update data directly for other layouts
      // IMPORTANT: Use the order from cellKeys directly (it's already ordered from selectedCellsOrder)
      const finalOrderedKeys = cellKeys;
      
      setData(prevData => {
        const updatedData = JSON.parse(JSON.stringify(prevData)) as MeasureData[];
        
        finalOrderedKeys.forEach(cellKey => {
          // Parse cellKey: format is `${rowId}-${monthKey}` where rowId can contain dashes
          const parts = cellKey.split('-');
          if (parts.length < 2) return;
          const monthKey = parts[parts.length - 1];
          const rowId = parts.slice(0, -1).join('-');
          
          if (!rowId || !monthKey) return;
          
          const originalRow = findRowById(rowId, prevData);
          if (!originalRow) return;
          
          const currentValue = originalRow.values[monthKey as keyof typeof originalRow.values] || 0;
          
          let newValue: number;
          switch (rule) {
            case 'Increase':
              newValue = isPercentage ? currentValue * (1 + numericValue / 100) : currentValue + numericValue;
              break;
            case 'Decrease':
              newValue = isPercentage ? currentValue * (1 - numericValue / 100) : currentValue - numericValue;
              break;
            case 'Set to':
              newValue = numericValue;
              break;
            case 'Multiply by':
              newValue = currentValue * numericValue;
              break;
            case 'Divide by':
              if (numericValue === 0) return;
              newValue = currentValue / numericValue;
              break;
            default:
              return;
          }
          
          newValue = Math.round(newValue);
          const row = findRowById(rowId, updatedData);
          if (row) {
            row.values[monthKey as keyof typeof row.values] = newValue;
          }
          
          // Track edit history
          addDraftEditHistory({
            cellKey,
            rowId,
            timeKey: monthKey,
            oldValue: currentValue,
            newValue,
            note: note?.trim() || undefined,
          });
        });
        
        return updatedData;
      });
    }
    
    // Clear selection after update
    handleClearSelection();
  }, [data, addDraftEditHistory, handleClearSelection, selectedLayoutState, currentUser]);

  // Function to commit drafts to saved edit history (called on Save)
  // CRITICAL: Use functional updates to avoid stale closures and ensure correct order
  const commitDraftsToHistory = useCallback(() => {
    setDraftEditHistory(prevDrafts => {
      const draftsArray = Array.from(prevDrafts.values());
      if (draftsArray.length > 0) {
        // CRITICAL: Preserve ALL entries including note-only entries (oldValue === newValue but has note)
        // Update editHistory first, then clear drafts
        setEditHistory(prevHistory => {
          const newHistory = [...draftsArray, ...prevHistory];
          // Force a re-render by returning a new array reference
          return newHistory;
        });
        // After a real save, keep BOTH design-system styling and the seeded CF (red modifyCells)
        // rules on together: allow coexistence and wake the modifyCells rules back up.
        setAllowRulesCoexist(true);
        setConditionalFormattingRules(prev =>
          prev.map(r => (r.mode === 'modifyCells' ? { ...r, isActive: true } : r))
        );
        // Return empty map to clear drafts - this happens after editHistory update
        return new Map();
      }
      return prevDrafts; // No change if no drafts
    });
  }, []);

  // Function to clear draft edits (called on Cancel)
  const clearDrafts = useCallback(() => {
    setDraftEditHistory(new Map());
  }, []);

  // Function to add adjustment note (for notes added separately, not during edit)
  // Now adds to drafts instead of saved history
  const addAdjustmentNote = useCallback((note: Omit<AdjustmentNote, 'id' | 'timestamp' | 'userId' | 'userName'>) => {
    // Add as note-only entry to draft history
    addDraftEditHistory({
      cellKey: note.cellKey,
      rowId: note.rowId,
      timeKey: note.timeKey,
      measureId: note.measureId,
      note: note.note,
    });
  }, [addDraftEditHistory]);

  // Function to add a new note entry (always creates a new thread, never updates existing)
  // Used for notes posted from the panel footer
  // Uses entry ID as Map key to allow multiple entries per cellKey
  const addNewNoteEntry = useCallback((entry: Omit<CellEditHistoryEntry, 'id' | 'timestamp' | 'userId' | 'userName'>) => {
    setDraftEditHistory(prev => {
      const newMap = new Map(prev);
      // Always create a new entry with unique ID, even if one exists for this cellKey
      const uniqueId = `draft-note-${entry.cellKey}-${Date.now()}-${Math.random()}`;
      const newDraft: CellEditHistoryEntry = {
        ...entry,
        id: uniqueId,
        timestamp: new Date(),
        userId: 'john-carter',
        userName: 'David Chen',
      };
      
      // Ensure note is preserved and trimmed
      if (newDraft.note) {
        newDraft.note = newDraft.note.trim();
      }
      
      // Use unique ID as key to allow multiple entries per cellKey
      // This allows multiple note threads for the same cell
      newMap.set(uniqueId, newDraft);
      
      return newMap;
    });
  }, []);

  // Handler for adding note from the panel footer
  // Always creates a new thread entry, never updates existing
  const handlePanelAddNote = useCallback((rowId: string, monthKey: string, note: string) => {
    const cellKey = `${rowId}-${monthKey}`;
    // Use addNewNoteEntry to always create a new thread
    addNewNoteEntry({
      cellKey,
      rowId,
      timeKey: monthKey,
      measureId: undefined,
      note,
    });
  }, [addNewNoteEntry]);

  // Arc 5: the saved June override on Sales Manager Target Quantity — flagged red on the grid with a
  // warning icon (above committed agreement). The flag is not a single cell: it traces the
  // E-Motor Housing lineage in June (Acme Partners → North America → Light Trucks → Midwest Assembly
  // → E-Motor Housing), so the risk visibly cascades down the generations and originates at the
  // E-Motor Housing leaf. Captured when the edit is made, promoted (as the full lineage) on save.
  // Declared here (ahead of handleCellFocusWithHistory) so it exists before that callback's deps run.
  const [riskCellKeys, setRiskCellKeys] = useState<Set<string>>(new Set());

  // DF demo: Order Quantity cells below the committed sales agreement (the pink cells) — decorated
  // by GridRow with a red bar + warning icon + hover popover. Recomputed whenever the data changes.
  const agreementRiskCellKeys = useMemo(() => computeAgreementRiskCellKeys(data), [data]);

  // Handler for showing edit info popover when a cell is focused
  // Check both draft and saved edit history
  const handleCellFocusWithHistory = useCallback((cellKey: string, cellRect: DOMRect | null, cellValue?: number, isLocked?: boolean, isImpacted?: boolean) => {
    if (!cellRect) {
      setEditInfoPopover(null);
      return;
    }
    
    // Don't show hover popover if context menu is open
    // Use ref for synchronous access
    if (contextMenuRef.current && contextMenuRef.current.isOpen) {
      setEditInfoPopover(null);
      return;
    }
    
    // Don't show popover for cells marked as read (use ref for synchronous access)
    if (readCellsRef.current.includes(cellKey)) {
      setEditInfoPopover(null);
      return;
    }

    // Arc 5: cells on the flagged E-Motor Housing June lineage always get a popover (the risk /
    // resolved banner), even though they're impacted / saved-impacted rollups rather than direct
    // edits. Without this they'd be suppressed by the impacted / saved-impacted guards below.
    const isRiskCellForFocus = riskCellKeys.has(cellKey);

    // Check if this cell was impacted but is now saved (shouldn't show popover)
    // These cells were impacted in a previous session but are now saved, so they shouldn't show old popovers
    // Use ref for synchronous access to latest value
    if (savedImpactedCellsRef.current.has(cellKey) && !isRiskCellForFocus) {
      console.log('[handleCellFocusWithHistory] Cell was saved impacted, closing popover:', cellKey, 'savedImpactedCells size:', savedImpactedCellsRef.current.size);
      setEditInfoPopover(null);
      return;
    }
    
    const approvalForCell = approvalRequests.get(cellKey);
    const approvalHasNote = Boolean(
      approvalForCell?.requesterNote?.trim() ||
      approvalForCell?.approverComment?.trim()
    );
    const shouldShowApprovalPopover = Boolean(approvalForCell) && approvalForCell.status !== 'pending' && (
      approvalForCell.status === 'rejected' ||
      approvalForCell.status === 'approvedWithCondition' ||
      approvalHasNote
    );

    // If cell is impacted, don't show old edit history popover - unless resolved approval / notes warrant it (not plan-wide pending).
    // Plan review (record Submitted): approvers need arrows + edit history / notes while cells are read-only.
    if (isImpacted && !shouldShowApprovalPopover && !planReviewGridLock && !isRiskCellForFocus) {
      console.log('[handleCellFocusWithHistory] Cell is impacted, closing popover:', cellKey);
      setEditInfoPopover(null);
      return;
    }
    
    const lastDashIndex = cellKey.lastIndexOf('-');
    const parsedRowId = lastDashIndex > 0 ? cellKey.slice(0, lastDashIndex) : cellKey;
    const parsedTimeKey = lastDashIndex > 0 ? cellKey.slice(lastDashIndex + 1) : undefined;

    // Check draft first (most recent), then saved history
    const draftEntries = Array.from(draftEditHistory.values()).filter(entry => entry.cellKey === cellKey);
    const savedEntry = editHistory.find((entry) =>
      editHistoryEntryAffectsCell(entry, cellKey, parsedRowId, parsedTimeKey)
    );
    const latestEntry = draftEntries.length > 0 ? draftEntries[0] : savedEntry;
    
    // IMPORTANT: If cell is impacted, don't show popover even if it has edit history
    // Impacted cells should not show old edit history indicators
    
    // Show popover if there's edit history OR if cell is locked
    // But don't show if cell was impacted and saved (no direct change in current session)
    if (!latestEntry && !isLocked && !shouldShowApprovalPopover && !isRiskCellForFocus) {
      setEditInfoPopover(null);
      return;
    }
    
    // For locked cells (or flagged risk-lineage cells) without edit history, create a minimal entry
    const entryToShow = latestEntry || ((isLocked || shouldShowApprovalPopover || isRiskCellForFocus) ? {
      id: `${isLocked ? 'locked' : (isRiskCellForFocus ? 'risk' : 'approval')}-${cellKey}`,
      cellKey,
      rowId: parsedRowId,
      timeKey: parsedTimeKey,
      timestamp: new Date(),
      userId: 'current-user',
      userName: 'David Chen',
      oldValue: undefined,
      newValue: cellValue,
      note: approvalForCell?.requesterNote || approvalForCell?.approverComment || undefined,
    } as CellEditHistoryEntry : null);
    
    if (!entryToShow) {
      setEditInfoPopover(null);
      return;
    }
    
    // Position the popover below the cell
    const popoverWidth = 280;
    let leftPos = cellRect.left + window.scrollX;
    
    // Ensure popover doesn't go off the right edge
    if (leftPos + popoverWidth > window.innerWidth - 20) {
      leftPos = window.innerWidth - popoverWidth - 20;
    }
    
    // Get measure name for currency formatting
    const measureName = entryToShow.measureId 
      ? data.find(m => m.id === entryToShow.measureId)?.name 
      : getMeasureName(entryToShow.rowId, data);
    
    setEditInfoPopover({
      entry: entryToShow,
      cellKey,
      cellValue: cellValue ?? 0,
      isLocked: isLocked || false,
      measureName: measureName,
      position: {
        top: cellRect.bottom + window.scrollY + 2,
        left: leftPos
      }
    });
  }, [editHistory, draftEditHistory, data, approvalRequests, planReviewGridLock, riskCellKeys]); // Note: readCellsRef, savedImpactedCellsRef and contextMenuRef are refs

  // Close edit info popover
  const handleCloseEditInfoPopover = useCallback(() => {
    setEditInfoPopover(null);
  }, []);

  
  // Debug: Log when editHistory changes
  useEffect(() => {
    console.log('[ForecastingGrid] editHistory changed, total entries:', editHistory.length);
  }, [editHistory]);

  // Wrapper for onDataChange that tracks edit history
  // Removed unused handleDataChangeWithHistory - using onEditHistory callback in grid components instead
  
  // Function to apply initial edit history to data
  const applyInitialEditHistoryToData = useCallback((baseData: MeasureData[]): MeasureData[] => {
    const initialHistory = createInitialEditHistory();
    const updatedData = JSON.parse(JSON.stringify(baseData)); // Deep clone
    const historyMap = new Map<string, CellEditHistoryEntry>();
    initialHistory.forEach(entry => {
      const key = `${entry.rowId}-${entry.timeKey}`;
      historyMap.set(key, entry);
    });
    
    // Update individual cell values to their final (newValue) state
    initialHistory.forEach(entry => {
      if (entry.oldValue !== undefined && entry.newValue !== undefined && entry.oldValue !== entry.newValue) {
        // Find the row and update its value to the final value
        const row = findRowById(entry.rowId, updatedData);
        if (row && entry.timeKey && row.values[entry.timeKey as keyof typeof row.values] !== undefined) {
          const delta = entry.newValue - entry.oldValue;
          const monthKey = entry.timeKey as keyof typeof row.values;
          
          // Check if this row has children (it's a parent row)
          const children = getChildren(entry.rowId, updatedData);
          
          if (children.length > 0) {
            // This is a parent row - ensure children sum exactly to newValue
            // First, update the parent row value
            row.values[monthKey] = entry.newValue;
            
            // Calculate current children sum (after any child edits have been applied)
            let currentChildrenSum = children.reduce((sum, child) => {
              const childRow = findRowById(child.id, updatedData);
              return sum + (childRow?.values[monthKey] || 0);
            }, 0);
            
            // Calculate the total adjustment needed
            const totalAdjustment = entry.newValue - currentChildrenSum;
            
            // Only adjust if needed - adjust minimally (just the last child)
            if (Math.abs(totalAdjustment) > 0.01 && children.length > 0) {
              // Adjust the last child minimally to make sum exact
              // This preserves existing child values as much as possible
              const lastChild = findRowById(children[children.length - 1].id, updatedData);
              if (lastChild) {
                const currentValue = lastChild.values[monthKey] || 0;
                lastChild.values[monthKey] = currentValue + totalAdjustment;
              }
            }
          } else {
            // This is a leaf row - update directly and propagate upward to parents
            row.values[monthKey] = entry.newValue;
            
            // Propagate upward to update parent rows
            const ancestorUpdates = propagateUpward(entry.rowId, monthKey as any, delta, updatedData);
            ancestorUpdates.forEach(update => {
              const ancestor = findRowById(update.rowId, updatedData);
              if (ancestor) {
                ancestor.values[update.monthKey] = update.newValue;
              }
            });
          }
        }
      }
    });
    
    // Post-process: Ensure parent rows match their children sums exactly
    // This fixes cases where edit history was applied but children don't sum correctly
    // CRITICAL: This must run AFTER all edit history entries are applied
    const fixParentChildSums = (measure: MeasureData): void => {
      if (measure.children) {
        measure.children.forEach(category => {
          if (category.children && category.children.length > 0) {
            // Fix category sum from products
            const monthKeys: (keyof typeof category.values)[] = [
              'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
              'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
            ];
            
            for (const monthKey of monthKeys) {
              // Check if there's an edit history entry for this category/month
              const historyKey = `${category.id}-${monthKey}`;
              const categoryEdit = historyMap.get(historyKey);
              
              if (categoryEdit && categoryEdit.newValue !== undefined) {
                const targetSum = categoryEdit.newValue;
                
                // Calculate current children sum
                let currentSum = category.children.reduce((sum, child) => {
                  return sum + (child.values[monthKey] || 0);
                }, 0);
                
                // Only adjust if sum doesn't match target - adjust minimally
                if (Math.abs(currentSum - targetSum) > 0.01) {
                  const adjustment = targetSum - currentSum;
                  
                  // Simple approach: adjust the last child to make sum exact
                  // This minimizes changes to existing values
                  if (category.children.length > 0) {
                    const lastChild = category.children[category.children.length - 1];
                    if (lastChild) {
                      const currentValue = lastChild.values[monthKey] || 0;
                      lastChild.values[monthKey] = currentValue + adjustment;
                    }
                  }
                }
                
                // CRITICAL: Always set category value to targetSum (don't let grid recalculate)
                category.values[monthKey] = targetSum;
              } else {
                // No edit history - calculate sum from children
                const childrenSum = category.children.reduce((sum, child) => {
                  return sum + (child.values[monthKey] || 0);
                }, 0);
                category.values[monthKey] = childrenSum;
              }
            }
          }
        });
      }
    };
    
    // Apply fixes to all measures
    for (const measure of updatedData) {
      fixParentChildSums(measure);
    }
    
    // Note: HierarchicalGrid will automatically recalculate aggregations (quarters, year) 
    // and parent row sums when it receives this data, but since we've already distributed
    // parent changes to children, the sums will be correct
    
    return updatedData;
  }, []);

  // Track per-measure group context for shared measures (allows switching between groups per measure)
  const [measureGroupContext, setMeasureGroupContext] = useState<Map<string, string>>(new Map());
  
  // IDs of measures that exist in both groups (constant)
  const sharedMeasureIds = useMemo(() => [], []);
  
  // Track previous measure IDs to detect newly added measures
  const prevMeasureIdsRef = useRef<Set<string>>(new Set());
  // Store newly added measure IDs for scrolling and animation
  const [newlyAddedMeasureIds, setNewlyAddedMeasureIds] = useState<string[]>([]);

  // Update data when measure subgroup changes or measure group context changes
  useEffect(() => {
    const combinedData: MeasureData[] = [];
    const allMeasureIds: string[] = [];
    const measureMap = new Map<string, MeasureData>(); // Map to deduplicate by ID
    
    // Shared measures - add first to appear at top
    const sharedMeasures: MeasureData[] = [];

    const currentIndustryKey = industry || 'manufacturing';

    if (isConfigIndustry(currentIndustryKey)) {
      // Config-driven grid: the plan config's subsets act as measure categories.
      // Include measures belonging to any selected subset (default: all subsets).
      const cats = getConfigMeasureCategories(currentIndustryKey);
      const currentData = getMockData(currentIndustryKey);
      const dataWithHistory = applyInitialEditHistoryToData(currentData);
      const byName = new Map<string, MeasureData>();
      dataWithHistory.forEach((m: MeasureData) => {
        if (!byName.has(m.name)) byName.set(m.name, m);
      });

      const selectedCats = cats.filter((c) => selectedMeasureSubgroup.has(c.name));
      const catsToUse = selectedCats.length > 0 ? selectedCats : cats;
      catsToUse.forEach((cat) => {
        cat.measures.forEach((name) => {
          const m = byName.get(name);
          if (m && !measureMap.has(m.id)) {
            measureMap.set(m.id, m);
            allMeasureIds.push(m.id);
          }
        });
      });

      // The "Adjustment Measures" category is synthetic for config grids (its measures
      // aren't in the config's own measure list), so pull those rows from the shared
      // adjustment dataset when that subset is selected.
      if (selectedMeasureSubgroup.has('Adjustment Measures')) {
        getAdjustmentMeasuresData(industry).forEach((measure: MeasureData) => {
          if (!measureMap.has(measure.id)) {
            measureMap.set(measure.id, measure);
            allMeasureIds.push(measure.id);
          }
        });
      }

      // Fallback: config has no subsets, or none matched — show every config measure.
      if (measureMap.size === 0) {
        dataWithHistory.forEach((m: MeasureData) => {
          measureMap.set(m.id, m);
          allMeasureIds.push(m.id);
        });
      }
    } else {
      // Check if both groups are selected
      const bothGroupsSelected = selectedMeasureSubgroup.has('Adjustment Measures') &&
                                 selectedMeasureSubgroup.has('Revenue & Quantity Measures');

      // Process shared measures first when both groups are selected
      if (bothGroupsSelected) {
        sharedMeasureIds.forEach(measureId => {
          // Get the selected context for this measure (default to Adjustment Measures - read-only)
          const selectedContext = measureGroupContext.get(measureId) || 'Adjustment Measures';

          // Get measure data from the appropriate source
          const currentData = getMockData(currentIndustryKey);
          const dataWithHistory = applyInitialEditHistoryToData(currentData);
          const rqMeasure = dataWithHistory.find((m: MeasureData) => m.id === measureId);
          const adjMeasure = getAdjustmentMeasuresData(industry).find((m: MeasureData) => m.id === measureId);

          // Use the selected context version
          const sourceMeasure = selectedContext === 'Adjustment Measures' ? adjMeasure : rqMeasure;
          if (sourceMeasure) {
            const measureWithGroup = {
              ...sourceMeasure,
              groupContext: selectedContext
            };
            sharedMeasures.push(measureWithGroup as MeasureData);
          }
        });
      }

      // Add Revenue & Quantity Measures if selected
      if (selectedMeasureSubgroup.has('Revenue & Quantity Measures')) {
        const currentData = getMockData(currentIndustryKey);
        const dataWithHistory = applyInitialEditHistoryToData(currentData);

        dataWithHistory.forEach((measure: MeasureData) => {
          measureMap.set(measure.id, measure);
          allMeasureIds.push(measure.id);
        });
      }

      // Add Adjustment Measures if selected (use the variant whose hierarchy matches
      // this grid's dimension scheme so the deep grid can expand these measures).
      if (selectedMeasureSubgroup.has('Adjustment Measures')) {
        getAdjustmentMeasuresData(industry).forEach((measure: MeasureData) => {
          // Add if not already present
          if (!measureMap.has(measure.id)) {
            measureMap.set(measure.id, measure);
            allMeasureIds.push(measure.id);
          }
        });
      }
    }

    // Add shared measures first (at the top), then other measures
    combinedData.push(...sharedMeasures);
    combinedData.push(...Array.from(measureMap.values()));
    
    // Update allMeasureIds to include shared measures at the start
    const finalMeasureIds = [...sharedMeasures.map(m => m.id), ...allMeasureIds];

    // Arc 3: once the agent has projected the ✦ Predicted Baseline, keep it positioned
    // directly beneath the Forecast Quantity measure across subgroup rebuilds.
    if (baselineRevealedRef.current) {
      const bi = combinedData.findIndex((m) => m.id === ARC3_REVEAL_MEASURE_ID);
      if (bi >= 0) {
        const [bm] = combinedData.splice(bi, 1);
        const fi = combinedData.findIndex((m) => m.id === ARC3_REVEAL_AFTER_MEASURE_ID);
        combinedData.splice(fi >= 0 ? fi + 1 : 0, 0, bm);
      }
      const idi = finalMeasureIds.indexOf(ARC3_REVEAL_MEASURE_ID);
      if (idi >= 0) {
        finalMeasureIds.splice(idi, 1);
        const fidi = finalMeasureIds.indexOf(ARC3_REVEAL_AFTER_MEASURE_ID);
        finalMeasureIds.splice(fidi >= 0 ? fidi + 1 : 0, 0, ARC3_REVEAL_MEASURE_ID);
      }
    }

      // If no subgroups selected, default to Revenue & Quantity Measures
    if (combinedData.length === 0) {
      const currentIndustry = industry || 'manufacturing';
      const currentData = getMockData(currentIndustry);
      const dataWithHistory = applyInitialEditHistoryToData(currentData);
      combinedData.push(...dataWithHistory);
      finalMeasureIds.push(...currentData.map((m: MeasureData) => m.id));
    }

    // Detect newly added measures
    const currentMeasureIds = new Set(finalMeasureIds);
    const prevMeasureIds = prevMeasureIdsRef.current;
    const newlyAdded = finalMeasureIds.filter(id => !prevMeasureIds.has(id));
    
    setOriginalData(combinedData);
    setData(combinedData);
    // Every measure that belongs to a selected subset shows by default. Measures from a
    // newly-checked subset appear automatically; measures that were already present keep their
    // current visibility, so anything the user explicitly hid via "Configure Measures" stays hidden.
    setVisibleMeasureIds(prev => {
      const next = new Set<string>();
      finalMeasureIds.forEach(id => {
        // Arc 3: the ✦ Predicted Baseline row stays hidden until the agent projects it.
        if (id === ARC3_REVEAL_MEASURE_ID && !baselineRevealedRef.current) return;
        if (!prevMeasureIds.has(id)) {
          // Newly added (a freshly-checked subset, or first load) → visible by default.
          next.add(id);
        } else if (prev.has(id)) {
          // Already-present measure → respect the user's current show/hide choice.
          next.add(id);
        }
      });
      return next.size > 0 ? next : new Set(finalMeasureIds.filter(id => id !== ARC3_REVEAL_MEASURE_ID || baselineRevealedRef.current));
    });
    
    // Update previous measure IDs
    prevMeasureIdsRef.current = currentMeasureIds;
    
    // Set newly added measures for animation
    if (newlyAdded.length > 0) {
      setNewlyAddedMeasureIds(newlyAdded);
      // Clear the animation class after animation completes (1.5s)
      setTimeout(() => {
        setNewlyAddedMeasureIds([]);
      }, 1500);
      
      // Scroll to first newly added measure after a short delay to ensure DOM is updated
      setTimeout(() => {
        // Use the appropriate scroll ref based on the selected layout
        if (selectedLayoutState === 'Dimensions / Time x Measures') {
          scrollToMeasureDimensionsTimeRef.current?.(newlyAdded[0]);
        } else if (selectedLayoutState === 'Time / Dimensions x Measures') {
          scrollToMeasureTimeDimensionsRef.current?.(newlyAdded[0]);
        } else {
          scrollToMeasureRef.current?.(newlyAdded[0]);
        }
      }, 100);
    }
  }, [selectedMeasureSubgroup, applyInitialEditHistoryToData, industry, measureGroupContext, sharedMeasureIds]);

  // Handle measure reordering
  // Arc 3 — the agent projects a hidden measure (✦ Predicted Baseline) onto the grid.
  // Shows a ~3s "Projecting…" overlay, then reveals the row directly beneath the
  // Forecast Quantity measure. Returns the reveal duration (ms) so the panel can hold
  // its reply until the row lands; returns 0 (no delay) if the measure is already visible.
  const REVEAL_DURATION_MS = 3000;
  const handleAgentRevealMeasure = useCallback((measureId: string): number => {
    if (visibleMeasureIdsRef.current.has(measureId)) return 0;
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    setIsRevealingBaseline(true);
    // Place the projected baseline immediately after Forecast Quantity (not at the very
    // top) so the two curves sit side by side. Falls back to the top if not found.
    const moveAfterForecast = (arr: MeasureData[]) => {
      const idx = arr.findIndex((m) => m.id === measureId);
      if (idx < 0) return arr;
      const copy = [...arr];
      const [m] = copy.splice(idx, 1);
      const fIdx = copy.findIndex((mm) => mm.id === ARC3_REVEAL_AFTER_MEASURE_ID);
      copy.splice(fIdx >= 0 ? fIdx + 1 : 0, 0, m);
      return copy;
    };
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      baselineRevealedRef.current = true;
      writeBaselineRevealed();
      setData((prev) => moveAfterForecast(prev));
      setOriginalData((prev) => moveAfterForecast(prev));
      setVisibleMeasureIds((prev) => new Set([measureId, ...prev]));
      setIsRevealingBaseline(false);
      // Open the revealed ✦ Predicted Baseline branch deep (5 tiers) so the seller
      // can see all the way down to the plants/products where growth concentrates.
      window.setTimeout(() => expandMeasureRowRef.current?.(measureId, 5), 60);
    }, REVEAL_DURATION_MS);
    return REVEAL_DURATION_MS;
  }, []);

  const handleMeasuresReorder = useCallback((orderedMeasures: MeasureData[], visibleIds: Set<string>, autoLockIds?: Set<string>) => {
    setData(orderedMeasures);
    setVisibleMeasureIds(new Set(visibleIds)); // Create a new Set to ensure state update
    // Only update auto-lock config when the full Reorder modal provides it; the Quick
    // Access toolbar's quick visibility toggles call this with 2 args and must not clear it.
    if (autoLockIds) {
      setAutoLockMeasureIds(new Set(autoLockIds));
    }
  }, []);

  // Filter data based on visible measures
  const filteredData = useMemo(() => {
    if (visibleMeasureIds.size === 0) {
      // If no visibility set yet, show all
      return data;
    }
    return data.filter(measure => visibleMeasureIds.has(measure.id));
  }, [data, visibleMeasureIds]);

  // After intent-based (Focus grid) filters land in the grid, auto-expand the
  // filtered hierarchy so the categories' products are visible immediately.
  useEffect(() => {
    if (!pendingIntentExpandRef.current) return;
    pendingIntentExpandRef.current = false;
    // Defer so the grid has the freshly filtered data registered before expanding.
    const t = setTimeout(() => {
      if (expandAllRef.current) expandAllRef.current();
    }, 0);
    return () => clearTimeout(t);
  }, [filteredData]);

  // After an Agentforce "Show on grid" filter lands, collapse the hierarchy to a tidy
  // measures-only view (accounts visible but collapsed) so the grid clearly reads as filtered.
  useEffect(() => {
    if (!pendingIntentCollapseRef.current) return;
    pendingIntentCollapseRef.current = false;
    const t = setTimeout(() => {
      if (expandMeasuresOnlyRef.current) expandMeasuresOnlyRef.current();
      else if (collapseAllRef.current) collapseAllRef.current();
    }, 0);
    return () => clearTimeout(t);
  }, [filteredData]);

  // Focus that targets categories (e.g. "3 categories behind"): expand accounts to reveal
  // their categories, but leave categories collapsed so the referenced categories read cleanly.
  useEffect(() => {
    if (!pendingIntentExpandCategoriesRef.current) return;
    pendingIntentExpandCategoriesRef.current = false;
    const t = setTimeout(() => {
      if (expandToCategoriesRef.current) expandToCategoriesRef.current();
      else if (expandAllRef.current) expandAllRef.current();
    }, 0);
    return () => clearTimeout(t);
  }, [filteredData]);

  // Determine which measures are read-only based on selected measure groups and per-measure context
  const readonlyMeasureIds = useMemo(() => {
    const readonlyIds = new Set<string>();
    
    // Check each measure's groupContext
    data.forEach(measure => {
      if (measure.groupContext === 'Adjustment Measures') {
        readonlyIds.add(measure.id);
      }
    });
    
    // Also add original IDs for Adjustment Measures measures when only that category is selected
    if (selectedMeasureSubgroup.has('Adjustment Measures') && !selectedMeasureSubgroup.has('Revenue & Quantity Measures')) {
      adjustmentMeasuresData.forEach(measure => {
        readonlyIds.add(measure.id);
      });
    }
    
    return readonlyIds;
  }, [selectedMeasureSubgroup, data]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Quick Access Toolbar: toggle defaults on, but no actions configured by default
  // (so the bar stays hidden until the user adds actions) — mirrors the deployed grid.
  const [showQuickAccessToolbar, setShowQuickAccessToolbar] = useState(false);
  const [quickAccessActions, setQuickAccessActions] = useState<string[]>([]);
  const [isQuickAccessModalOpen, setIsQuickAccessModalOpen] = useState(false);
  const [isEditFrozenColumnsModalOpen, setIsEditFrozenColumnsModalOpen] = useState(false);
  const [selectedFrozenColumns, setSelectedFrozenColumns] = useState<FrozenColumn[]>([
    { id: 'annotatedLevel', name: 'Annotated Level' },
    { id: 'users', name: 'Users' },
    { id: 'condition', name: 'Condition' },
    { id: 'status', name: 'Status' },
  ]);
  const [showAdditionalFrozenColumns, setShowAdditionalFrozenColumns] = useState(false);
  const [selectedSubColumns, setSelectedSubColumns] = useState<SubColumn[]>(DEFAULT_SELECTED_SUB_COLUMNS);
  const [customSubColumns, setCustomSubColumns] = useState<SubColumn[]>([]);
  const [isEditSubColumnsModalOpen, setIsEditSubColumnsModalOpen] = useState(false);
  const [showSubColumns, setShowSubColumns] = useState(false);
  // "Show chart area on top" (Table Settings → Layout): renders a chart card row above
  // the grid. The configure modal manages which charts appear there.
  const [showChartArea, setShowChartArea] = useState(false);
  const [isConfigureChartsOpen, setIsConfigureChartsOpen] = useState(false);
  const [chartConfigs, setChartConfigs] = useState<ChartConfig[]>([
    { id: 'chart-trend', name: 'Trend', type: 'bar', series: ['Actual'] },
    { id: 'chart-composition', name: 'Share of children', type: 'donut', series: ['Actual'] },
  ]);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  // When the Filters panel is opened via an Agentforce hand-off, force the Advanced tab.
  const [filtersInitialTab, setFiltersInitialTab] = useState<'basic' | 'advanced' | undefined>(undefined);
  const [filtersInitialTabSignal, setFiltersInitialTabSignal] = useState(0);
  // Filter Logic expression the agent derived (e.g. "1 AND 2"), pre-populated into the panel.
  const [externalFilterLogic, setExternalFilterLogic] = useState<string>('');
  const [externalFilterLogicSignal, setExternalFilterLogicSignal] = useState(0);
  const [isSortPanelOpen, setIsSortPanelOpen] = useState(false);
  const [globalSortConfig, setGlobalSortConfig] = useState<GlobalSortConfig>({ criteria: [], preserveHierarchy: true, sortMeasures: false });
  const [isCellDetailsHistoryOpen, setIsCellDetailsHistoryOpen] = useState(false);
  const [cellDetailsInitialTab, setCellDetailsInitialTab] = useState<'single' | 'multi' | 'details'>('multi');
  const [cellDetailsFocusSection, setCellDetailsFocusSection] = useState<'approval' | 'explainability' | null>(null);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  // Arc 5 · Edit with Clarity and Commit — on save, the Next-Best-Action Agent surfaces a
  // Midwest-e-motor amendment alert (red dot on the bell + topmost Alerts card). `arc5Unread`
  // drives the bell dot; `arc5AutoStart` kicks off the scripted Agentforce flow from the CTA.
  const [arc5AlertActive, setArc5AlertActive] = useState(false);
  const [arc5Unread, setArc5Unread] = useState(false);
  const [arc5AutoStart, setArc5AutoStart] = useState<string | null>(null);
  // Scenarios the Agentforce panel proposes ("model the levers") → injected into the bottom drawer.
  const [agentScenarios, setAgentScenarios] = useState<AgentScenario[] | undefined>(undefined);
  // Cell edit popover "Ask Agentforce": a one-off Q&A seeded into the Agentforce panel.
  const [agentCellQA, setAgentCellQA] = useState<{ question: string; answer: string; bullets: string[]; apply?: { label: string; run: () => void } } | null>(null);
  const pendingRiskCellRef = useRef<string | null>(null);
  // Arc 5: once the Slack-approved amendment lands (pre-save), the flagged cell is "resolved" —
  // the red warning flips to a green checkmark until the next Save commits it to a normal cell.
  const [riskResolved, setRiskResolved] = useState(false);
  // Arc 5: set true once the Slack-approved amendment lands on the grid. On the
  // next Save (committing the amendment), the flagged risk is resolved — the
  // upside is now under contract — so we clear the red warning + dismiss the alert.
  const arc5AmendmentPendingRef = useRef(false);
  // Charts panel: opened from the toolbar pie icon, a row's "Show Charts" menu item, or a cell edit.
  const [isChartsOpen, setIsChartsOpen] = useState(false);
  const [chartsFocusRowId, setChartsFocusRowId] = useState<string | null>(null);
  // On a cell edit, the edited time period drives the Charts pie/donut (grid ↔ chart sync).
  const [chartsFocusPeriod, setChartsFocusPeriod] = useState<string | null>(null);
  const [chartsFocusPeriodSignal, setChartsFocusPeriodSignal] = useState(0);
  // Drill trail (origin → current) for the Charts panel breadcrumb; last entry = focused row.
  const [chartsBreadcrumb, setChartsBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  // Rows the user has picked (via the ⋮ menu) to compare side-by-side in the Charts panel.
  // Ordered — the first row acts as the baseline for deltas.
  const [compareRowIds, setCompareRowIds] = useState<string[]>([]);
  // Row the Charts panel was focused on when a comparison was started — lets "Back" restore it.
  const [compareReturnRowId, setCompareReturnRowId] = useState<string | null>(null);
  // Imperative handler exposed by the grid to open + scroll to a row when drilling from a pie slice.
  const drillToRowRef = useRef<((rowId: string, opts?: { scroll?: boolean }) => void) | null>(null);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const [isScopePopoverOpen, setIsScopePopoverOpen] = useState(false);
  const scopePopoverRef = useRef<HTMLDivElement>(null);
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);
  const [scopePopoverPos, setScopePopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [scopeDraftEverything, setScopeDraftEverything] = useState(false);
  /** In-grid column / quick filters (from HierarchicalGrid) that can hide hierarchy rows. */
  const [hierarchyRowHidingFromGrid, setHierarchyRowHidingFromGrid] = useState<{
    hasColumnFilters: boolean;
    hasQuickFilters: boolean;
    columnFilters: Map<string, any>;
  }>({
    hasColumnFilters: false,
    hasQuickFilters: false,
    columnFilters: new Map(),
  });
  // Default: parent totals + edit disaggregation apply to VISIBLE children only.
  // The grid banner's "Include even filtered out children" toggle flips both to full hierarchy.
  const [parentTotalsRollupMode, setParentTotalsRollupMode] = useState<ParentTotalsRollupMode>('visibleOnly');
  const [propagateIntoNoMatchRows, setPropagateIntoNoMatchRows] = useState(false);
  const [measureEditDisaggregateToVisibleChildrenOnly, setMeasureEditDisaggregateToVisibleChildrenOnly] =
    useState(true);
  const [panelKey, setPanelKey] = useState(0); // Key to force panel remount when switching tabs
  const [isCellHistoryApprovalView, setIsCellHistoryApprovalView] = useState(false);
  const [bulkActionPreselect, setBulkActionPreselect] = useState<string | null>(null);
  const [bulkActionPreselectSignal, setBulkActionPreselectSignal] = useState(0);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>(DEFAULT_CALENDAR_ID);
  const selectedCalendar = CALENDAR_OPTIONS.find(c => c.id === selectedCalendarId);
  const calendarStartMonth = selectedCalendar?.startMonth ?? 0;
  const calendarStartYear = selectedCalendar?.startYear ?? 2026;
  const [conditionalFormattingRules, setConditionalFormattingRules] = useState<ConditionalFormattingRule[]>(INITIAL_CONDITIONAL_FORMATTING_RULES);
  const [applyCfRulesAsColorScale, setApplyCfRulesAsColorScale] = useState(false);
  const [previewConditionalFormattingRule, setPreviewConditionalFormattingRule] = useState<ConditionalFormattingRule | null>(null);
  // DF DEMO: default OFF so the seeded modifyCells rules render as pink highlights on load.
  const [isDesignSystemRulesEnabled, setIsDesignSystemRulesEnabled] = useState(false);
  // After the user SAVES an edit, we stop treating design-system styling and the seeded CF
  // (red modifyCells) rules as mutually exclusive — both stay on together. Flipped true in
  // commitDraftsToHistory; suppresses the three exclusion points below.
  const [allowRulesCoexist, setAllowRulesCoexist] = useState(false);
  // Always force the preview rule to isActive:true so it shows on the grid
  // regardless of whether the rule is currently toggled off.
  const activePreviewRule = previewConditionalFormattingRule
    ? { ...previewConditionalFormattingRule, isActive: true }
    : null;
  const effectiveConditionalFormattingRules = useMemo(() => {
    let base: ConditionalFormattingRule[];
    if (activePreviewRule) {
        const exists = conditionalFormattingRules.some(r => r.id === activePreviewRule.id);
      base = exists
        ? conditionalFormattingRules.map(r => (r.id === activePreviewRule.id ? activePreviewRule : r))
          : [...conditionalFormattingRules, activePreviewRule];
    } else {
      base = conditionalFormattingRules;
    }
    // Design-system edited/impacted styling vs user CF (modifyCells) are mutually exclusive.
    // Agent root-cause highlights (`agent-highlight-*`) are exempt: they must show even
    // while design-system styling is on, without waking the other modifyCells rules.
    if (isDesignSystemRulesEnabled && !allowRulesCoexist) {
      return base.map(r =>
        r.mode === 'modifyCells' && !r.id.startsWith('agent-highlight-')
          ? { ...r, isActive: false }
          : r
      );
    }
    return base;
  }, [conditionalFormattingRules, activePreviewRule, isDesignSystemRulesEnabled, allowRulesCoexist]);

  const handleDesignSystemRulesChange = useCallback((enabled: boolean) => {
    setIsDesignSystemRulesEnabled(enabled);
    if (enabled) {
      setConditionalFormattingRules(prev =>
        prev.map(r => (r.mode === 'modifyCells' ? { ...r, isActive: false } : r))
      );
    }
  }, []);

  const handleConditionalFormattingRulesChange = useCallback((rules: ConditionalFormattingRule[]) => {
    setConditionalFormattingRules(rules);
    if (rules.some(r => r.mode === 'modifyCells' && r.isActive)) {
      setIsDesignSystemRulesEnabled(false);
    }
  }, []);

  // If design-system rules are on, user-defined modifyCells rules must be inactive (sync corrupt / external state).
  // Agent root-cause highlights (`agent-highlight-*`) are intentionally kept active and excluded here.
  useEffect(() => {
    if (!isDesignSystemRulesEnabled || allowRulesCoexist) return;
    if (!conditionalFormattingRules.some(r => r.mode === 'modifyCells' && r.isActive && !r.id.startsWith('agent-highlight-'))) return;
    setConditionalFormattingRules(prev =>
      prev.map(r => (r.mode === 'modifyCells' && !r.id.startsWith('agent-highlight-') ? { ...r, isActive: false } : r))
    );
  }, [isDesignSystemRulesEnabled, conditionalFormattingRules, allowRulesCoexist]);

  /** Every built-in + custom + CF “create column” field — sort panel always lists these (independent of sub-columns toggle). */
  const allCalculatedFieldsForSort = useMemo((): SubColumn[] => {
    const out: SubColumn[] = [];
    const seen = new Set<string>();
    const push = (c: SubColumn) => {
      if (seen.has(c.id)) return;
      seen.add(c.id);
      out.push(c);
    };
    for (const c of AVAILABLE_SUB_COLUMNS) push(c);
    for (const c of customSubColumns) push(c);
    for (const r of effectiveConditionalFormattingRules) {
      if (r.mode === 'createColumns' && r.isActive) push({ id: r.id, name: r.name });
    }
    return out;
  }, [customSubColumns, effectiveConditionalFormattingRules]);

  const isHierarchicalLayout = selectedLayoutState === MEASURES_DIMS_X_TIME_LAYOUT;
  const useCalculatedFieldSortUi = isHierarchicalLayout;

  const globalSortAvailableColumns = useMemo(() => {
    if (isHierarchicalLayout) {
      // Only show selected subcolumns in sort dropdown
      return selectedSubColumns.map(sc => ({ key: sc.id, label: sc.name }));
    }
    return MONTH_SORT_COLUMN_OPTIONS;
  }, [isHierarchicalLayout, selectedSubColumns]);

  const hierarchicalGridData = useMemo(() => {
    const stripped = stripFilterSummaryRows(filteredData);
    if (parentTotalsRollupMode === 'columnFilterBuckets') {
      return refreshPassFailBucketAggregates(stripped);
    }
    return stripped;
  }, [filteredData, parentTotalsRollupMode]);

  /** Full hierarchy + current cell values — used so parent totals include branches hidden by the Filters panel. */
  const hierarchicalRollupValueSource = useMemo(
    () => mergeRowValuesIntoFullTree(originalData, data),
    [originalData, data],
  );

  /**
   * Live row for the Charts panel. Resolve from the full-tree rollup source (same values the
   * grid rolls parent totals from) and re-sum descendants so the chart's numbers match the
   * grid exactly. Falls back to the grid/base data when the row isn't in the rollup tree.
   */
  const chartsRow = useMemo(() => {
    if (!chartsFocusRowId) return null;
    const fromRollup = findChartRowById(hierarchicalRollupValueSource, chartsFocusRowId);
    if (fromRollup) return rollupChartRow(fromRollup);
    return findChartRowById(hierarchicalGridData, chartsFocusRowId) ?? findChartRowById(data, chartsFocusRowId);
  }, [chartsFocusRowId, hierarchicalRollupValueSource, hierarchicalGridData, data]);

  /** Measure this charted row belongs to — shown in the panel header for context. */
  const chartsMeasureName = useMemo(
    () =>
      chartsFocusRowId
        ? findMeasureAncestorName(hierarchicalRollupValueSource, chartsFocusRowId) ??
          findMeasureAncestorName(data, chartsFocusRowId)
        : null,
    [chartsFocusRowId, hierarchicalRollupValueSource, data],
  );

  const resolveChartRowName = useCallback(
    (id: string): string =>
      (findChartRowById(hierarchicalGridData, id) ?? findChartRowById(data, id))?.name ?? id,
    [hierarchicalGridData, data],
  );

  /** Visible top-level measure rows, rolled up so their monthly numbers match the grid.
   *  Feeds the Charts panel "overview" (multi-measure trend) shown before a row is focused. */
  const chartsOverviewRows = useMemo(() => {
    return hierarchicalGridData.map((r) => {
      const fromRollup = findChartRowById(hierarchicalRollupValueSource, r.id);
      return (fromRollup ? rollupChartRow(fromRollup) : (r as unknown as GridRow)) as GridRow;
    });
  }, [hierarchicalGridData, hierarchicalRollupValueSource]);

  /** Set form of the compare selection (for O(1) menu-label lookups in the grid rows). */
  const compareRowIdSet = useMemo(() => new Set(compareRowIds), [compareRowIds]);

  /** The picked comparison rows, resolved + rolled up so their numbers match the grid.
   *  Order is preserved (first = baseline). Ids that no longer resolve are dropped. */
  const compareRows = useMemo(() => {
    return compareRowIds
      .map((id) => {
        const fromRollup = findChartRowById(hierarchicalRollupValueSource, id);
        if (fromRollup) return rollupChartRow(fromRollup);
        return findChartRowById(hierarchicalGridData, id) ?? findChartRowById(data, id);
      })
      .filter((r): r is GridRow => !!r);
  }, [compareRowIds, hierarchicalRollupValueSource, hierarchicalGridData, data]);

  /** Flattened list of the currently-visible grid rows, for the in-panel "Compare rows" picker.
   *  Each row carries its top-level measure (`group`, for SLDS listbox grouping so users compare
   *  like-with-like), its `parentId` (so "Compare peers" can seed a row + its siblings), and its
   *  `path` — the dimension ancestors between the measure and this row, rendered as a breadcrumb
   *  subline so rows with duplicate names stay uniquely identifiable (no faux-tree indentation). */
  const compareCandidates = useMemo(() => {
    const out: {
      id: string;
      name: string;
      depth: number;
      type?: string;
      group: string;
      parentId: string | null;
      path: string[];
    }[] = [];
    const walk = (
      rows: readonly unknown[] | undefined,
      depth: number,
      group: string,
      parentId: string | null,
      path: string[],
    ) => {
      if (!rows) return;
      for (const raw of rows) {
        const r = raw as { id?: string; name?: string; type?: string; children?: unknown[] };
        if (!r || !r.id) continue;
        const name = r.name ?? r.id;
        const g = depth === 0 ? name : group;
        out.push({ id: r.id, name, depth, type: r.type, group: g, parentId, path });
        // Children below the measure accumulate dimension ancestors (measure stays as the group).
        const childPath = depth === 0 ? [] : [...path, name];
        if (r.children && r.children.length) walk(r.children, depth + 1, g, r.id, childPath);
      }
    };
    walk(hierarchicalGridData as unknown[], 0, '', null, []);
    return out;
  }, [hierarchicalGridData]);

  /** Toggle a row in/out of the comparison set and reveal the Charts panel in compare mode. */
  const handleToggleCompare = useCallback(
    (row: { id: string }) => {
      // First row of a fresh comparison → remember the current focus so "Back" can restore it.
      if (compareRowIds.length === 0) setCompareReturnRowId(chartsFocusRowId);
      setCompareRowIds((prev) =>
        prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id],
      );
      setChartsFocusRowId(null);
      setChartsBreadcrumb([]);
      setIsChartsOpen(true);
      setIsSettingsOpen(false);
      setIsFiltersOpen(false);
      setIsSortPanelOpen(false);
      setIsCellDetailsHistoryOpen(false);
      setIsAlertsOpen(false);
    },
    [compareRowIds.length, chartsFocusRowId],
  );

  /** Leave compare mode and return to the charts view the comparison was launched from
   *  (the focused row's detail, or the all-measures overview if it started there). */
  const handleExitCompare = useCallback(() => {
    setCompareRowIds([]);
    if (compareReturnRowId) {
      const found =
        findChartRowById(hierarchicalGridData, compareReturnRowId) ??
        findChartRowById(data, compareReturnRowId);
      setChartsFocusRowId(compareReturnRowId);
      setChartsBreadcrumb(found ? [{ id: compareReturnRowId, name: found.name }] : []);
    } else {
      setChartsFocusRowId(null);
      setChartsBreadcrumb([]);
    }
    setCompareReturnRowId(null);
  }, [compareReturnRowId, hierarchicalGridData, data]);

  /** Name of the return row (for the compare "Back to …" label). */
  const compareReturnName = useMemo(() => {
    if (!compareReturnRowId) return null;
    const found =
      findChartRowById(hierarchicalGridData, compareReturnRowId) ??
      findChartRowById(data, compareReturnRowId);
    return found?.name ?? null;
  }, [compareReturnRowId, hierarchicalGridData, data]);

  /** Data row that feeds the on-grid "chart area" mini charts — the focused chart row when
   *  one is open, otherwise the first (top) measure, rolled up so numbers match the grid. */
  const gridChartSourceRow = useMemo(() => {
    if (chartsRow) return chartsRow;
    const first = hierarchicalGridData[0];
    if (!first) return null;
    const fromRollup = findChartRowById(hierarchicalRollupValueSource, first.id);
    return fromRollup ? rollupChartRow(fromRollup) : (first as unknown as GridRow);
  }, [chartsRow, hierarchicalGridData, hierarchicalRollupValueSource]);

  // Expand + (optionally) scroll the grid to a row. Breadcrumb navigation scrolls; chart
  // clicks pass scroll=false so the grid stays put while the row is expanded/selected.
  const drillGridToRow = useCallback((rowId: string, scroll = true) => {
    drillToRowRef.current?.(rowId, { scroll });
  }, []);

  /** Select a specific grid cell (row × month) from a chart click, without scrolling the grid. */
  const handleChartsSelectCell = useCallback(
    (rowId: string, monthKey: string) => {
      // Only month columns map to a single grid cell; quarters/year have no single cell.
      const isMonthKey = /^[a-z]{3}\d{4}$/.test(monthKey);
      drillGridToRow(rowId, false);
      if (!isMonthKey) return;
      const cellKey = `${rowId}-${monthKey}`;
      const single = new Set([cellKey]);
      setSelectedCells(single);
      selectedCellsRef.current = single;
      selectedCellsOrderRef.current = [cellKey];
      setSelectedCellsOrder([cellKey]);
    },
    [drillGridToRow],
  );

  // Drill into a child slice: refocus the Charts panel and extend the breadcrumb trail.
  const handleChartsDrill = useCallback(
    (childId: string) => {
      setChartsFocusRowId(childId);
      setChartsFocusPeriod(null);
      setChartsBreadcrumb((prev) =>
        prev.length && prev[prev.length - 1].id === childId
          ? prev
          : [...prev, { id: childId, name: resolveChartRowName(childId) }],
      );
      // Reveal/expand the drilled row on the grid, but don't scroll it into view.
      drillGridToRow(childId, false);
    },
    [resolveChartRowName, drillGridToRow],
  );

  // Jump back to an earlier level in the breadcrumb trail.
  const handleChartsBreadcrumbNav = useCallback(
    (index: number) => {
      const target = chartsBreadcrumb[index];
      if (!target) return;
      setChartsBreadcrumb((prev) => prev.slice(0, index + 1));
      setChartsFocusRowId(target.id);
      setChartsFocusPeriod(null);
      drillGridToRow(target.id);
    },
    [chartsBreadcrumb, drillGridToRow],
  );

  const handleHierarchicalGridDataChange = useCallback((newData: MeasureData[]) => {
    setData(newData);
  }, []);

  // Lazily materialize deep (8–10-per-level) hierarchies one level ahead of the expanded
  // rows. `ensureDeepChildren` returns null (a no-op) for non-deep datasets and once the
  // needed children already exist, so this settles after a single grow per expand.
  const handleGridExpandedRowsChange = useCallback((expandedIds: Set<string>) => {
    setData((prev) => ensureDeepChildren(prev, expandedIds) ?? prev);
    setOriginalData((prev) => ensureDeepChildren(prev, expandedIds) ?? prev);
  }, []);

  useEffect(() => {
    if (parentTotalsRollupMode !== 'columnFilterBuckets') return;
    setData(prev => stripFilterSummaryRows(prev));
  }, [parentTotalsRollupMode]);

  const [approvalSubmittedNotification, setApprovalSubmittedNotification] = useState<{ isVisible: boolean; count: number }>({
    isVisible: false,
    count: 0,
  });

  useEffect(() => {
    if (!approvalSubmittedNotification.isVisible) return;
    const timer = window.setTimeout(() => {
      setApprovalSubmittedNotification(prev => ({ ...prev, isVisible: false }));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [approvalSubmittedNotification.isVisible]);
  const [cfFromSelectionOpen, setCfFromSelectionOpen] = useState(false);
  const [cfFromSelectionCellKeys, setCfFromSelectionCellKeys] = useState<string[]>([]);
  const [cfLaunchFromSelectionSignal, setCfLaunchFromSelectionSignal] = useState(0);
  // Bumped to jump to the Formatting tab WITHOUT launching the "rule from selection"
  // flow — e.g. when the Agentforce reply's "N conditional formatting rules applied" is clicked.
  const [cfViewFormattingSignal, setCfViewFormattingSignal] = useState(0);
  
  // State for cell edit info popover
  const [editInfoPopover, setEditInfoPopover] = useState<{
    entry: CellEditHistoryEntry | null;
    cellKey: string;
    cellValue: number;
    isLocked?: boolean;
    measureName?: string;
    position: { top: number; left: number };
  } | null>(null);

  const isCurrentUserApprover = APPROVER_USER_IDS.has(currentUser.id);
  const [approverOverrideCellKeys, setApproverOverrideCellKeys] = useState<Set<string>>(() => new Set());
  const [pendingApproverEdit, setPendingApproverEdit] = useState<{
    rowId: string;
    monthKey: string;
  } | null>(null);
  const handlePendingApproverEditConsumed = useCallback(() => setPendingApproverEdit(null), []);
  const handleApproverOverrideForCell = useCallback((cellKey: string) => {
    const lastDash = cellKey.lastIndexOf('-');
    if (lastDash <= 0) return;
    const rowId = cellKey.slice(0, lastDash);
    const monthKey = cellKey.slice(lastDash + 1);
    setApproverOverrideCellKeys((prev) => new Set(prev).add(cellKey));
    setEditInfoPopover(null);
    setPendingApproverEdit({ rowId, monthKey });
  }, []);
  
  // Also check and close popover if currently open cell becomes saved impacted
  // (but keep it open for Arc 5 risk-lineage cells — they intentionally show the risk banner).
  useEffect(() => {
    if (editInfoPopover && savedImpactedCellsRef.current.has(editInfoPopover.cellKey) && !riskCellKeys.has(editInfoPopover.cellKey)) {
      console.log('[ForecastingGrid] Currently open popover cell is now saved impacted, closing:', editInfoPopover.cellKey);
      setEditInfoPopover(null);
    }
  }, [editInfoPopover, savedImpactedCells, riskCellKeys]);

  // State for context menu
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    cellKey: string;
    cellValue: number;
    isLocked: boolean;
    isEditable: boolean;
  } | null>(null);
  
  // Keep contextMenuRef in sync with contextMenu state
  useEffect(() => {
    contextMenuRef.current = contextMenu;
  }, [contextMenu]);

  // DF demo: once the user chooses "Show Associated Cells" on a red agreement-risk cell,
  // the associated red cells are revealed and *their* warning icons are cleared. The clicked
  // (anchor) cell keeps its warning icon. Holds the cell keys whose warning is suppressed.
  const [dismissedAgreementWarningKeys, setDismissedAgreementWarningKeys] = useState<Set<string>>(new Set());
  // Hover text for the associated cells' outline warning icon — names the anchor cell they're affected by.
  const [agreementAssociatedTooltip, setAgreementAssociatedTooltip] = useState<string | undefined>(undefined);

  // Clipboard state for context menu
  const [clipboardValue, setClipboardValue] = useState<number | null>(null);

  // State for explainability modal
  const [explainabilityModal, setExplainabilityModal] = useState<{
    isOpen: boolean;
    cellKey: string;
    cellValue: number;
  } | null>(null);

  // Merge draft and saved edit history for display in grid (so notes show up immediately)
  const mergedEditHistory = useMemo(() => {
    const drafts = Array.from(draftEditHistory.values());
    const merged = [...drafts, ...editHistory];
    // Sort by timestamp descending (most recent first)
    return merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [draftEditHistory, editHistory]);

  const initialHierarchicalCellMaps = useMemo((): PlanningGridCellMapsSnapshot | null => {
    if (!session || session.industryKey !== currentIndustry) return null;
    return session.cellMaps;
  }, [session, currentIndustry]);

  useEffect(() => {
    return () => {
      const s = sessionPersistRef.current;
      saveSession({
        industryKey: s.industryKey,
        data: cloneMeasureData(s.data),
        originalData: cloneMeasureData(s.originalData),
        editHistory: s.editHistory.map((e) => ({ ...e })),
        draftEditHistory: Array.from(s.draftEditHistory.entries()),
        cellMaps: cellMapsSnapshotRef.current ?? {
          editedCells: [],
          savedEditedCells: [],
          impactedCells: [],
          unsavedNotes: [],
          savedImpactedCells: [],
        },
      });
    };
  }, [saveSession]);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, cellKey: string, cellValue: number, isLocked: boolean, isEditable: boolean) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      cellKey,
      cellValue,
      isLocked,
      isEditable
    });
    // Close edit info popover if open
    setEditInfoPopover(null);
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // "Show Associated Cells": reveal the red-warning chain anchored at the right-clicked cell,
  // then clear the warning icons on the *associated* cells only — the clicked (anchor) cell keeps
  // its warning icon. All the red cells stay red so the shortfall is still visible.
  const handleContextShowAssociatedCells = useCallback(() => {
    const cm = contextMenuRef.current;
    if (cm?.cellKey) {
      const parts = cm.cellKey.split('-');
      const monthKey = parts[parts.length - 1];
      const rowId = parts.slice(0, -1).join('-');
      const ids = computeRedChainExpandIds(rowId, data, agreementRiskCellKeys);
      if (ids.length) expandRowsRef.current?.(ids);
      // Suppress the filled warning on every agreement-risk cell except the clicked anchor; those
      // become "associated" cells (outline icon + affected-by tooltip).
      setDismissedAgreementWarningKeys(() => {
        const next = new Set<string>(agreementRiskCellKeys);
        next.delete(cm.cellKey);
        return next;
      });
      // Build the "affected by" descriptor from the anchor cell: row · measure · month.
      const anchorRow = findRowById(rowId, data);
      const anchorMeasure = data.find((m) => !!findRowById(rowId, [m]));
      const monthLabel = MONTH_SORT_COLUMN_OPTIONS.find((c) => c.key === monthKey)?.label ?? monthKey;
      const year = (monthKey.match(/\d{4}/) ?? [''])[0];
      const rowName = anchorRow?.name ?? 'this row';
      const measureName = (anchorMeasure?.name ?? 'Order Quantity').replace(/^✦\s*/, '');
      setAgreementAssociatedTooltip(
        `Affected by ${rowName} — ${measureName}, ${monthLabel}${year ? ' ' + year : ''}`,
      );
    }
    setContextMenu(null);
  }, [data, agreementRiskCellKeys]);

  const handleContextCopy = useCallback(() => {
    if (contextMenu) {
      setClipboardValue(contextMenu.cellValue);
      navigator.clipboard.writeText(String(contextMenu.cellValue));
    }
  }, [contextMenu]);

  const handleContextPaste = useCallback(() => {
    // Paste functionality - would need to trigger cell update
    console.log('Paste:', clipboardValue);
  }, [clipboardValue]);

  const handleContextToggleLock = useCallback(() => {
    if (!contextMenu) return;
    // When multiple cells are selected, lock/unlock the whole selection; otherwise just the
    // right-clicked cell. Toggle direction follows the right-clicked cell's current state so it
    // matches the menu label ("Lock Cell" vs "Unlock Cell").
    const selected = Array.from(selectedCellsRef.current ?? selectedCells);
    const targetKeys =
      selected.length > 1
        ? Array.from(new Set([...selected, contextMenu.cellKey]))
        : [contextMenu.cellKey];
    const shouldUnlock = lockedCells.has(contextMenu.cellKey);
    setLockedCells((prev: Set<string>) => {
      const newSet = new Set(prev);
      targetKeys.forEach((key) => {
        if (shouldUnlock) newSet.delete(key);
        else newSet.add(key);
      });
      return newSet;
    });
    if (!shouldUnlock) {
      // Close side panels when locking cells
      setIsCellDetailsHistoryOpen(false);
      setIsSettingsOpen(false);
      setIsFiltersOpen(false);
    }
  }, [contextMenu, selectedCells, lockedCells]);

  const handleContextMassUpdate = useCallback(() => {
    // Close context menu first
    setContextMenu(null);
    // Open the panel with multi-cell tab active immediately
    setCellDetailsInitialTab('multi');
    setIsCellHistoryApprovalView(false);
    setIsCellDetailsHistoryOpen(true);
    setIsSettingsOpen(false);
    setIsFiltersOpen(false);
    setBulkActionPreselect(null);
    setBulkActionPreselectSignal(prev => prev + 1);
  }, []);

  const handleContextRequestApproval = useCallback(() => {
    const keys = Array.from(selectedCellsRef.current ?? selectedCells);
    if (keys.length === 0 && contextMenu?.cellKey) {
      const single = new Set<string>([contextMenu.cellKey]);
      setSelectedCells(single);
      selectedCellsRef.current = single;
      setSelectedCellsOrder([contextMenu.cellKey]);
      selectedCellsOrderRef.current = [contextMenu.cellKey];
      setLastSelectedCell(contextMenu.cellKey);
      lastSelectedCellRef.current = contextMenu.cellKey;
    }
    setContextMenu(null);
    setCellDetailsInitialTab('multi');
    setIsCellHistoryApprovalView(false);
    setIsCellDetailsHistoryOpen(true);
    setIsSettingsOpen(false);
    setIsFiltersOpen(false);
    setBulkActionPreselect('Request Approval');
    setBulkActionPreselectSignal(prev => prev + 1);
  }, [selectedCells, contextMenu]);

  const handleEnableApprovalStatusSubColumn = useCallback(() => {
    const approvalSubColumn = AVAILABLE_SUB_COLUMNS.find(col => col.id === 'approvalStatus');
    if (!approvalSubColumn) return;
    setSelectedSubColumns(prev => {
      const withoutApproval = prev.filter(col => col.id !== 'approvalStatus');
      return ensureFixedSubColumns([approvalSubColumn, ...withoutApproval]);
    });
    setShowSubColumns(true);
    setApprovalSubmittedNotification(prev => ({ ...prev, isVisible: false }));
  }, []);

  const handleContextAddFormattingRule = useCallback(() => {
    setContextMenu(null);
    // Collect current selected cell keys (use ref for freshest value)
    const keys = Array.from(selectedCellsRef.current ?? selectedCells);
    // If no explicit selection exists, use the right-clicked cell.
    if (keys.length === 0 && contextMenu?.cellKey) {
      keys.push(contextMenu.cellKey);
    }
    setCfFromSelectionCellKeys(keys);
    setCfLaunchFromSelectionSignal(prev => prev + 1);
    setIsSettingsOpen(true);
    setIsFiltersOpen(false);
    setIsSortPanelOpen(false);
    setIsCellDetailsHistoryOpen(false);
    setIsAlertsOpen(false);
  }, [selectedCells, contextMenu]);

  const handleContextMarkAsRead = useCallback(() => {
    // Capture cell keys to mark - use ref for bulk selection (avoids stale closure if click-outside cleared selection)
    const cellsToMark = new Set<string>();
    
    // Include all selected cells (use ref - has latest value even if state was cleared by click-outside)
    const currentSelection = selectedCellsRef.current;
    if (currentSelection && currentSelection.size > 0) {
      currentSelection.forEach(cellKey => cellsToMark.add(cellKey));
    }
    
    // Fallback to state if ref is empty (e.g. single cell selection)
    if (cellsToMark.size === 0 && selectedCells.size > 0) {
      selectedCells.forEach(cellKey => cellsToMark.add(cellKey));
    }
    
    // Also include the context menu cell if it exists (in case it's not in selectedCells)
    if (contextMenu && contextMenu.cellKey) {
      cellsToMark.add(contextMenu.cellKey);
    }
    
    if (cellsToMark.size === 0) return;
    
    // Close hover popover if it's showing for any of the cells being marked as read
    setEditInfoPopover((prev) => {
      if (prev && prev.cellKey && cellsToMark.has(prev.cellKey)) return null;
      return prev;
    });
    
    setReadCells((prev: string[]) => {
      const newSet = new Set(prev);
      cellsToMark.forEach(cellKey => newSet.add(cellKey));
      return [...Array.from(newSet)];
    });
  }, [contextMenu, selectedCells]);

  const APPROVAL_STATUS_LABELS: Record<ApprovalRequest['status'] | 'needsMoreInfo' | 'modificationSuggested' | 'inDiscussion', string> = {
    notSubmitted: 'Not Submitted',
    pending: 'Pending',
    approved: 'Approved',
    approvedWithCondition: 'Approved with Condition',
    rejected: 'Rejected',
    // Legacy statuses - map to Not Submitted
    needsMoreInfo: 'Not Submitted',
    modificationSuggested: 'Not Submitted',
    inDiscussion: 'Not Submitted',
  };

  const createBulkHistoryEntry = (
    cellKey: string,
    oldStatus: ApprovalRequest['status'] | 'needsMoreInfo' | 'modificationSuggested' | 'inDiscussion',
    newStatus: ApprovalRequest['status'] | 'needsMoreInfo' | 'modificationSuggested' | 'inDiscussion',
    comment: string,
    userId?: string,
    userName?: string
  ): CellEditHistoryEntry => {
    const parts = cellKey.split('-');
    const timeKey = parts[parts.length - 1];
    const rowId = parts.slice(0, -1).join('-');
    // Normalize legacy statuses for display (map to notSubmitted)
    const normalizedOldStatus = (oldStatus === 'approved' || oldStatus === 'pending' || oldStatus === 'rejected' || oldStatus === 'notSubmitted') ? oldStatus : 'notSubmitted';
    const normalizedNewStatus = (newStatus === 'approved' || newStatus === 'pending' || newStatus === 'rejected' || newStatus === 'notSubmitted') ? newStatus : 'notSubmitted';
    const note = `${APPROVAL_STATUS_LABELS[normalizedOldStatus]} → ${APPROVAL_STATUS_LABELS[normalizedNewStatus]}${comment ? `: ${comment}` : ''}`;
    return {
      id: `approval-${cellKey}-${Date.now()}-${Math.random()}`,
      cellKey,
      rowId,
      timeKey,
      oldValue: 0,
      newValue: 0,
      note,
      timestamp: new Date(),
      userId: userId ?? 'current-user',
      userName: userName ?? 'You',
    };
  };

  // Bulk approval handlers
  const handleBulkApprove = useCallback(() => {
    const approvalCellKeys = Array.from(selectedCells).filter(key => key.endsWith('-approval'));
    if (approvalCellKeys.length === 0) return;
    const historyEntries: CellEditHistoryEntry[] = [];
    setApprovalRequests(prev => {
      const updated = new Map(prev);
      approvalCellKeys.forEach(approvalCellKey => {
        const cellKey = approvalCellKey.replace(/-approval$/, '');
        const approval = updated.get(cellKey);
        if (approval && approval.status === 'pending') {
          updated.set(cellKey, { ...approval, userInitiated: true, status: 'approved', approverComment: 'Bulk approved', resolvedAt: new Date() });
          historyEntries.push(createBulkHistoryEntry(cellKey, 'pending', 'approved', 'Bulk approved'));
        }
      });
      return updated;
    });
    if (historyEntries.length > 0) setEditHistory(prev => [...historyEntries, ...prev]);
    setContextMenu(null);
  }, [selectedCells]);

  const handleBulkReject = useCallback((comment: string) => {
    const approvalCellKeys = Array.from(selectedCells).filter(key => key.endsWith('-approval'));
    if (approvalCellKeys.length === 0) return;
    const historyEntries: CellEditHistoryEntry[] = [];
    setApprovalRequests(prev => {
      const updated = new Map(prev);
      approvalCellKeys.forEach(approvalCellKey => {
        const cellKey = approvalCellKey.replace(/-approval$/, '');
        const approval = updated.get(cellKey);
        if (approval && approval.status === 'pending') {
          updated.set(cellKey, { ...approval, userInitiated: true, status: 'rejected', approverComment: comment, resolvedAt: new Date() });
          historyEntries.push(createBulkHistoryEntry(cellKey, 'pending', 'rejected', comment));
        }
      });
      return updated;
    });
    if (historyEntries.length > 0) setEditHistory(prev => [...historyEntries, ...prev]);
    setContextMenu(null);
  }, [selectedCells]);

  const handleBulkRequestMoreInfo = useCallback((comment: string) => {
    const approvalCellKeys = Array.from(selectedCells).filter(key => key.endsWith('-approval'));
    if (approvalCellKeys.length === 0) return;
    const historyEntries: CellEditHistoryEntry[] = [];
    setApprovalRequests(prev => {
      const updated = new Map(prev);
      approvalCellKeys.forEach(approvalCellKey => {
        const cellKey = approvalCellKey.replace(/-approval$/, '');
        const approval = updated.get(cellKey);
        if (approval && approval.status === 'pending') {
          updated.set(cellKey, { ...approval, userInitiated: true, status: 'notSubmitted', approverComment: comment, resolvedAt: undefined });
          historyEntries.push(createBulkHistoryEntry(cellKey, 'pending', 'notSubmitted', comment));
        }
      });
      return updated;
    });
    if (historyEntries.length > 0) setEditHistory(prev => [...historyEntries, ...prev]);
    setContextMenu(null);
  }, [selectedCells]);

  // Calculate pending approval count for selected approval cells
  const pendingApprovalCount = useMemo(() => {
    const approvalCellKeys = Array.from(selectedCells).filter(key => key.endsWith('-approval'));
    return approvalCellKeys.reduce((count, approvalCellKey) => {
      const cellKey = approvalCellKey.replace(/-approval$/, '');
      const approval = approvalRequests.get(cellKey);
      return count + (approval && approval.status === 'pending' ? 1 : 0);
    }, 0);
  }, [selectedCells, approvalRequests]);

  const hasApprovalSelection = useMemo(() => {
    return Array.from(selectedCells).some(key => key.endsWith('-approval'));
  }, [selectedCells]);

  // Handler for single cell update from the panel
  // Find the direct children of a row by id (used for disaggregation).
  const findRowChildren = useCallback((rowId: string): any[] => {
    const search = (items: any[]): any[] | null => {
      for (const item of items) {
        if (item.id === rowId) return item.children || [];
        if (item.children) {
          const found = search(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    return search(data) || [];
  }, [data]);

  const handleSingleCellUpdate = useCallback((rowId: string, monthKey: string, newValue: number, adjustmentNote?: string, disaggregationRule?: string) => {
    if (selectedLayoutState !== 'Measures / Dimensions x Time') {
      console.log('[ForecastingGrid] Single cell update:', { rowId, monthKey, newValue, adjustmentNote, disaggregationRule });
      return;
    }
    if (!cellChangeHandlerRef.current) return;

    const rule = (disaggregationRule || 'proportional').toLowerCase();
    const children = findRowChildren(rowId);

    // "Equal"/"Even" → split the new value evenly across (unlocked) children.
    // "Proportional" (or a leaf row) → edit the row directly; the grid already
    // pushes a parent edit down to children by their existing proportions.
    if ((rule === 'equal' || rule === 'even') && children.length > 0) {
      const lockedChildren = children.filter((c: any) => lockedCells.has(`${c.id}-${monthKey}`));
      const unlockedChildren = children.filter((c: any) => !lockedCells.has(`${c.id}-${monthKey}`));

      if (unlockedChildren.length > 0) {
        const lockedSum = lockedChildren.reduce((sum: number, c: any) => sum + (c.values?.[monthKey] || 0), 0);
        const perChild = (newValue - lockedSum) / unlockedChildren.length;

        // Apply sequentially so each child's roll-up reads the latest state
        // (mirrors the mass-update flow), leaving the parent equal to newValue.
        const applyEven = async () => {
          for (let i = 0; i < unlockedChildren.length; i++) {
            if (i > 0) await new Promise(resolve => setTimeout(resolve, 120));
            const child = unlockedChildren[i];
            cellChangeHandlerRef.current?.(child.id, monthKey as any, perChild, adjustmentNote);
            await new Promise(resolve => setTimeout(resolve, 80));
          }
        };
        applyEven();
        return;
      }
    }

    // Proportional / leaf row / all children locked → edit the row directly.
    cellChangeHandlerRef.current(rowId, monthKey as any, newValue, adjustmentNote);
  }, [selectedLayoutState, findRowChildren, lockedCells]);

  // --- Scenario drawer: apply a scenario's driver multipliers to the grid AS EDITS ---
  // Rather than silently rescaling the numbers, we push the scenario through the normal
  // cell-change pipeline so it shows up like any manual edit: modified/impacted cell
  // highlights, per-cell deltas, the "impacted measures" bottom bar, and the ability to
  // Save (or discard) the changes.
  //
  // We edit each visible measure's *year* total once. That single edit disaggregates down
  // through quarters → months → dimension children (and cross-measure dependencies) via the
  // grid's own logic, so one edit per measure produces the full impacted-cell cascade. The
  // brief cascade is masked by an overlay so the user only ever sees the final outcome.
  const scenarioApplyingRef = useRef(false);
  const [isApplyingScenario, setIsApplyingScenario] = useState(false);
  const applyScenarioToGrid = useCallback(
    (mult: { rev: number; qty: number; growth: number }) => {
      if (
        selectedLayoutState !== 'Measures / Dimensions x Time' ||
        !cellChangeHandlerRef.current ||
        scenarioApplyingRef.current
      ) {
        return;
      }

      const factorFor = (name: string): number => {
        const n = name.toLowerCase();
        if (n.includes('quantity') || n.includes('qty') || n.includes('units') || n.includes('no.s')) return mult.qty;
        if (n.includes('revenue') || n.includes('price') || n.includes('cost') || n.includes('$')) return mult.rev;
        return mult.growth;
      };

      // One edit per visible measure: scale its yearly total; the grid distributes downward.
      const edits: { rowId: string; newValue: number }[] = [];
      for (const m of data) {
        if (visibleMeasureIds.size > 0 && !visibleMeasureIds.has(m.id)) continue;
        const f = factorFor(m.name);
        if (Math.abs(f - 1) < 0.001) continue;
        const cur = (m.values as unknown as Record<string, number>).year;
        if (typeof cur !== 'number' || cur === 0) continue;
        const next = Math.round(cur * f);
        if (next !== cur) edits.push({ rowId: m.id, newValue: next });
      }
      if (edits.length === 0) return;

      // Apply sequentially so each edit closes over the latest rolled-up state, but keep the
      // grid hidden behind an overlay until all edits land so only the outcome is shown.
      scenarioApplyingRef.current = true;
      setIsApplyingScenario(true);
      const note = 'Scenario adjustment';
      const run = async () => {
        for (let i = 0; i < edits.length; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, 55));
          const e = edits[i];
          cellChangeHandlerRef.current?.(e.rowId, 'year' as any, e.newValue, note);
        }
        // Let the final state settle for a frame before revealing.
        await new Promise((r) => setTimeout(r, 120));
        scenarioApplyingRef.current = false;
        setIsApplyingScenario(false);
      };
      run();
    },
    [selectedLayoutState, data, visibleMeasureIds],
  );

  // Handler for toggling cell lock from the panel
  const handleToggleCellLock = useCallback((cellKey: string) => {
    setLockedCells((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(cellKey)) {
        newSet.delete(cellKey);
      } else {
        newSet.add(cellKey);
      }
      return newSet;
    });
  }, []);

  // Check if a cell is locked
  const isCellLocked = useCallback((cellKey: string) => {
    return lockedCells.has(cellKey);
  }, [lockedCells]);

  // Get current cell value from data
  const getCellValue = useCallback((rowId: string, monthKey: string): number | undefined => {
    // Find the row in the data structure
    const findRowValue = (items: any[]): number | undefined => {
      for (const item of items) {
        if (item.id === rowId) {
          return item.values?.[monthKey as keyof typeof item.values];
        }
        if (item.children) {
          const found = findRowValue(item.children);
          if (found !== undefined) return found;
        }
      }
      return undefined;
    };
    return findRowValue(data);
  }, [data]);

  // Select a single cell (used by View All Changes in the panel)
  const handleSelectSingleCell = useCallback((cellKey: string) => {
    const newSet = new Set<string>([cellKey]);
    setSelectedCells(newSet);
    selectedCellsRef.current = newSet;
    lastSelectedCellRef.current = cellKey;
    setLastSelectedCell(cellKey);
    shiftAnchorCellRef.current = null; // Clear Shift anchor
    selectedCellsOrderRef.current = [cellKey];
    setSelectedCellsOrder([cellKey]);
  }, []);

  const handleContextViewEditHistory = useCallback(() => {
    if (!contextMenu) return;
    
    // Close context menu first
    setContextMenu(null);
    
    // Parse cellKey to get rowId and monthKey
    const cellKey = contextMenu.cellKey;
    const parts = cellKey.split('-');
    // For hierarchical grid, cellKey format is: rowId-monthKey
    // But rowId itself might contain dashes, so we need to be smarter
    // The last part is always the monthKey (e.g., jan2026, feb2026)
    const monthKey = parts[parts.length - 1];
    const rowId = parts.slice(0, -1).join('-');
    
    // Select the cell
    handleSelectSingleCell(cellKey);
    
    // Set focused cell for the panel
    if (selectedLayoutState === 'Measures / Dimensions x Time') {
      setCurrentFocusedCell({
        rowId,
        monthKey: monthKey as any,
      });
    }
    
    // Open the panel with single cell tab
    setCellDetailsInitialTab('single');
    setCellDetailsFocusSection(null);
    setPanelKey(prev => prev + 1); // Force remount to ensure tab switches
    setIsCellHistoryApprovalView(false); // Context menu always opens edit history view
    setIsCellDetailsHistoryOpen(true);
    setIsSettingsOpen(false);
    setIsFiltersOpen(false);
  }, [contextMenu, handleSelectSingleCell, selectedLayoutState]);

  const handleContextCellActions = useCallback(() => {
    if (!contextMenu) return;
    setContextMenu(null);

    const cellKey = contextMenu.cellKey;
    const parts = cellKey.split('-');
    const monthKey = parts[parts.length - 1];
    const rowId = parts.slice(0, -1).join('-');

    handleSelectSingleCell(cellKey);

    if (selectedLayoutState === 'Measures / Dimensions x Time') {
      setCurrentFocusedCell({ rowId, monthKey: monthKey as any });
    }

    // Open panel on the Cell Actions tab ('multi')
    setCellDetailsInitialTab('multi');
    setCellDetailsFocusSection(null);
    setPanelKey(prev => prev + 1);
    setIsCellHistoryApprovalView(false);
    setIsCellDetailsHistoryOpen(true);
    setIsSettingsOpen(false);
    setIsFiltersOpen(false);
  }, [contextMenu, handleSelectSingleCell, selectedLayoutState]);

  // Generate mock source records for explainability
  const generateSourceRecords = useCallback((cellKey: string, cellValue: number): SourceRecord[] => {
    // Parse cellKey to extract information
    const parts = cellKey.split('-');
    const monthKey = parts[parts.length - 1];
    
    // Generate mock source records with varying influence and Salesforce objects
    const mockRecords: SourceRecord[] = [
      {
        id: 'source-1',
        name: `Parent Category Total - ${monthKey}`,
        object: 'Account',
        field: 'Category_Total__c',
        value: Math.round(cellValue * 1.5),
        influence: 35.5
      },
      {
        id: 'source-2',
        name: `Related Measure - ${monthKey}`,
        object: 'Opportunity',
        field: 'Amount',
        value: Math.round(cellValue * 0.8),
        influence: 28.2
      },
      {
        id: 'source-3',
        name: `Formula Calculation`,
        object: 'Forecast__c',
        field: 'Calculated_Value__c',
        value: Math.round(cellValue * 0.6),
        influence: 22.1
      },
      {
        id: 'source-4',
        name: `External Data Source`,
        object: 'External_Data__c',
        field: 'Imported_Value__c',
        value: Math.round(cellValue * 0.4),
        influence: 10.5
      },
      {
        id: 'source-5',
        name: `Historical Average`,
        object: 'Historical_Data__c',
        field: 'Average_Value__c',
        value: Math.round(cellValue * 0.9),
        influence: 3.7
      }
    ];
    
    return mockRecords;
  }, []);

  const handleContextViewExplainability = useCallback(() => {
    if (!contextMenu) return;
    
    // Close context menu first
    setContextMenu(null);
    
    // Open explainability modal
    setExplainabilityModal({
      isOpen: true,
      cellKey: contextMenu.cellKey,
      cellValue: contextMenu.cellValue
    });
  }, [contextMenu]);

  const handleCloseExplainabilityModal = useCallback(() => {
    setExplainabilityModal(null);
  }, []);

  // Open edit history panel from popover
  const handleViewEditHistory = useCallback((cellKey?: string) => {
    // If cellKey is provided, use it; otherwise get it from editInfoPopover state
    const targetCellKey = cellKey || editInfoPopover?.cellKey;
    if (!targetCellKey || !editInfoPopover?.entry) return;
    
    // Select the specific cell whose history we want to view
    handleSelectSingleCell(targetCellKey);
    // Note: handleSelectSingleCell already clears shiftAnchorCellRef
    
    // Set focusedCell so the panel can filter history correctly
    // Use the entry's rowId, timeKey, and measureId to construct focusedCell
    const entry = editInfoPopover.entry;
    if (selectedLayoutState === 'Dimensions / Time x Measures' || selectedLayoutState === 'Time / Dimensions x Measures') {
      // For these layouts, focusedCell needs rowId and measureId
      setCurrentFocusedCell({
        rowId: entry.rowId,
        measureId: entry.measureId || entry.timeKey, // timeKey might be measureId in some cases
      });
    } else {
      // For HierarchicalGrid, focusedCell needs rowId and monthKey
      setCurrentFocusedCell({
        rowId: entry.rowId,
        monthKey: entry.timeKey,
      });
    }
    
    // Close the popover
    setEditInfoPopover(null);
    
    // Switch to single cell tab when opening from popover
    // Force panel remount by changing key to ensure tab switches
    setCellDetailsInitialTab('single');
    setCellDetailsFocusSection(null);
    setPanelKey(prev => prev + 1); // Change key to force remount
    setIsCellHistoryApprovalView(false); // Opened from value cell hover popover — edit history view
    setIsCellDetailsHistoryOpen(true);
    setIsSettingsOpen(false);
    setIsFiltersOpen(false);
  }, [handleSelectSingleCell, editInfoPopover, selectedLayoutState]);

  // Open details tab from hover popover "Show details"
  const handleShowDetailsFromPopover = useCallback((cellKey?: string) => {
    const targetCellKey = cellKey || editInfoPopover?.cellKey;
    if (!targetCellKey || !editInfoPopover?.entry) return;

    handleSelectSingleCell(targetCellKey);

    const entry = editInfoPopover.entry;
    if (selectedLayoutState === 'Dimensions / Time x Measures' || selectedLayoutState === 'Time / Dimensions x Measures') {
      setCurrentFocusedCell({
        rowId: entry.rowId,
        measureId: entry.measureId || entry.timeKey,
      });
    } else {
      setCurrentFocusedCell({
        rowId: entry.rowId,
        monthKey: entry.timeKey,
      });
    }

    setEditInfoPopover(null);
    setCellDetailsInitialTab('details');
    setCellDetailsFocusSection('approval');
    setPanelKey(prev => prev + 1);
    setIsCellHistoryApprovalView(false);
    setIsCellDetailsHistoryOpen(true);
    setIsSettingsOpen(false);
    setIsFiltersOpen(false);
    setIsSortPanelOpen(false);
    setIsAlertsOpen(false);
  }, [handleSelectSingleCell, editInfoPopover, selectedLayoutState]);

  // Close popover on outside click and scroll
  useEffect(() => {
    if (!editInfoPopover) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside the popover
      if (target.closest('.cell-edit-info-popover')) return;
      // Don't close if clicking on an editable cell (will show popover for that cell)
      if (target.closest('.editable-cell')) return;
      setEditInfoPopover(null);
    };
    
    const handleMouseLeave = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement;
      // Don't close if moving to popover or cell
      if (relatedTarget && (relatedTarget.closest('.cell-edit-info-popover') || relatedTarget.closest('.editable-cell'))) return;
      setEditInfoPopover(null);
    };
    
    const handleScroll = () => {
      // Close popover when scrolling
      setEditInfoPopover(null);
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('scroll', handleScroll, true); // Use capture phase to catch all scroll events
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [editInfoPopover]);

  
  const [selectedDimensionLevels, setSelectedDimensionLevels] = useState<Set<string>>(
    () => new Set(dimensionSchemeIds)
  );

  // Reset the visible dimension levels to the full scheme whenever the grid (industry) changes.
  useEffect(() => {
    setSelectedDimensionLevels(new Set(getDimensionScheme(currentIndustry).map((l) => l.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndustry]);
  const [selectedTimeGranularities, setSelectedTimeGranularities] = useState<Set<string>>(
    () => new Set(defaultGranularitiesForDuration(getConfigTimeFrame(currentIndustry)?.duration))
  );
  // When the active plan/config changes, reset time granularities so the plan's
  // aggregation level (Half / Quarter / Year) is shown by default.
  useEffect(() => {
    setSelectedTimeGranularities(new Set(defaultGranularitiesForDuration(getConfigTimeFrame(currentIndustry)?.duration)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndustry]);
  
  // Show all periods toggle and date range
  const [showAllPeriods, setShowAllPeriods] = useState<boolean>(true);
  const [startPeriod, setStartPeriod] = useState<string>('');
  const [endPeriod, setEndPeriod] = useState<string>('');
  const [_impactedMeasuresCount, setImpactedMeasuresCount] = useState<number>(0);

  // External filter control for intent-based filtering from AlertsPanel
  const [externalAccounts, setExternalAccounts] = useState<string[]>([]);
  const [externalCategories, setExternalCategories] = useState<string[]>([]);
  const [externalMeasures, setExternalMeasures] = useState<string[]>([]);
  // Column-level filters injected by a Focus-grid action (e.g. Bottom-N categories). Null when no
  // focus filter is active, so the grid never clobbers user-applied column filters.
  const [externalColumnFilters, setExternalColumnFilters] = useState<Map<string, ColumnFilter> | null>(null);
  const [_showOnlyImpactedKPI, setShowOnlyImpactedKPI] = useState<boolean>(false);
  const toggleShowOnlyImpactedKPIHandlerRef = useRef<((checked: boolean) => void) | null>(null);
  
  // Default column width based on layout - 50% of slider range
  // "Measures / Dimensions x Time": 50px - 200px range, default = 50 + (200-50)*0.5 = 125px
  // "Dimensions / Time x Measures": 50px - 300px range, default = 50 + (300-50)*0.5 = 175px
  // "Time / Dimensions x Measures": 50px - 300px range, default = 50 + (300-50)*0.5 = 175px
  const getDefaultColumnWidth = (layout: string, hasSubColumns: boolean = false): number => {
    if (layout === 'Measures / Dimensions x Time') {
      // When sub-columns are enabled, use wider width for progress bars
      return hasSubColumns ? 180 : 100;
    } else {
      // Range: 50px - 300px, default to smaller value
      // When sub-columns are enabled, use wider width for progress bars
      return hasSubColumns ? 200 : 120;
    }
  };
  
  const [columnWidth, setColumnWidth] = useState<number>(getDefaultColumnWidth(selectedLayoutState));
  
  // Update column width when sub-columns are enabled to accommodate progress bars
  useEffect(() => {
    if (showSubColumns && selectedSubColumns.length > 0) {
      const defaultWidth = getDefaultColumnWidth(selectedLayoutState, false);
      const widerWidth = getDefaultColumnWidth(selectedLayoutState, true);
      // Only update if current width is at or near the default (to avoid overriding user's manual adjustments)
      // This ensures we increase width when enabling sub-columns, but preserve user's wider custom widths
      setColumnWidth(prevWidth => {
        // If width is close to default (within 20px), update to wider default
        if (Math.abs(prevWidth - defaultWidth) <= 20) {
          return widerWidth;
        }
        // Otherwise, keep current width (user may have manually adjusted)
        return prevWidth;
      });
    }
  }, [showSubColumns, selectedSubColumns.length, selectedLayoutState]);
  
  // Search state
  const [gridSearch, setGridSearch] = useState<string>('');

  const showHierarchicalParentTotalsHint = useMemo(() => {
    const fullDimensionLevels = new Set(dimensionSchemeIds);
    const searchActive = gridSearch.trim().length > 0;
    const filtersPanelActive = activeFilterCount > 0;
    const dimensionLevelsHide =
      selectedDimensionLevels.size < fullDimensionLevels.size ||
      [...fullDimensionLevels].some((id) => !selectedDimensionLevels.has(id));
    const globalSortFlattens =
      (globalSortConfig.criteria?.length ?? 0) > 0 && !globalSortConfig.preserveHierarchy;

    return (
      filtersPanelActive ||
      searchActive ||
      dimensionLevelsHide ||
      globalSortFlattens ||
      hierarchyRowHidingFromGrid.hasColumnFilters ||
      hierarchyRowHidingFromGrid.hasQuickFilters
    );
  }, [
    activeFilterCount,
    gridSearch,
    selectedDimensionLevels,
    globalSortConfig.criteria,
    globalSortConfig.preserveHierarchy,
    hierarchyRowHidingFromGrid,
  ]);

  /** Generate column filter summary */
  const columnFilterSummary = useMemo(() => {
    const filters = hierarchyRowHidingFromGrid.columnFilters;
    if (filters.size === 0) return '';

    const filterDescriptions: string[] = [];
    
    filters.forEach((filter, columnKey) => {
      // Extract month name from column key (e.g., "jan2026" -> "Jan")
      const monthMatch = columnKey.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)2026/i);
      const monthLabel = monthMatch ? monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1) : columnKey;
      
      if (filter.conditions && filter.conditions.length > 0) {
        const conditionDescriptions = filter.conditions.map((cond: any) => {
          const dimensionLabel = cond.dimension.charAt(0).toUpperCase() + cond.dimension.slice(1);
          
          // Handle name-based filtering
          if (cond.measureId === 'name' && cond.selectedNames && cond.selectedNames.length > 0) {
            const namesList = cond.selectedNames.join(', ');
            return `${dimensionLabel} name = ${namesList}`;
          }
          
          const operatorSymbol = cond.operator === '>=' ? '≥' : cond.operator === '<=' ? '≤' : cond.operator;
          return `${dimensionLabel} ${operatorSymbol} ${cond.value}`;
        }).join(', ');
        filterDescriptions.push(`${monthLabel}: ${conditionDescriptions}`);
      }
    });
    
    return filterDescriptions.length > 0 ? ` Column filters: ${filterDescriptions.join('; ')}` : '';
  }, [hierarchyRowHidingFromGrid.columnFilters]);

  /**
   * Totals & edits scope. The two settings move together: "Everything" = full hierarchy
   * (rollups + edits over all children); "Filter Aware" = visible children only. Surfaced
   * inline in the grid subtitle via an SLDS 2 popover.
   */
  const includeFilteredOutChildren =
    parentTotalsRollupMode === 'fullHierarchy' && !measureEditDisaggregateToVisibleChildrenOnly;

  const setScopeEverything = (everything: boolean) => {
    if (everything) {
      setParentTotalsRollupMode('fullHierarchy');
      setMeasureEditDisaggregateToVisibleChildrenOnly(false);
    } else {
      setParentTotalsRollupMode('visibleOnly');
      setMeasureEditDisaggregateToVisibleChildrenOnly(true);
    }
  };

  useEffect(() => {
    if (!isScopePopoverOpen) return;
    const reposition = () => {
      const rect = scopeTriggerRef.current?.getBoundingClientRect();
      if (rect) setScopePopoverPos({ top: rect.bottom + 8, left: rect.left });
    };
    reposition();
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        scopeTriggerRef.current?.contains(target) ||
        scopePopoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsScopePopoverOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsScopePopoverOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isScopePopoverOpen]);
  
  // Refs to store expand/collapse handlers from HierarchicalGrid
  const expandAllRef = useRef<(() => void) | null>(null);
  const collapseAllRef = useRef<(() => void) | null>(null);
  const expandMeasuresOnlyRef = useRef<(() => void) | null>(null);
  const expandToCategoriesRef = useRef<(() => void) | null>(null);
  const expandMeasureRowRef = useRef<((measureId: string, maxDepth?: number) => void) | null>(null);
  const expandRowsRef = useRef<((rowIds: string[]) => void) | null>(null);
  const resetColumnWidthsRef = useRef<(() => void) | null>(null);
  const clearAllFiltersRef = useRef<(() => void) | null>(null);
  // Registered by FiltersPanel so we can reset its filter cards from the grid hint.
  const filtersPanelClearAllRef = useRef<(() => void) | null>(null);
  // Set when intent-based (Focus grid) filters are applied so we auto-expand the
  // filtered hierarchy once the new data has propagated to the grid.
  const pendingIntentExpandRef = useRef(false);
  // Set by the Agentforce "Show on grid" action so the grid lands in a tidy collapsed
  // state (measures expanded, accounts collapsed) that visibly reads as "filtered".
  const pendingIntentCollapseRef = useRef(false);
  // Set when a focus wants accounts → categories only (categories collapsed, no products),
  // e.g. the "3 categories behind" alert card.
  const pendingIntentExpandCategoriesRef = useRef(false);

  // Injected "Review approval request from <requester>" card (set when arriving from a
  // header-bell approval notification). Rendered at the top of the Alerts/Tasks panel.
  const [reviewApprovalCard, setReviewApprovalCard] = useState<{
    id: string;
    requesterName: string;
    summary?: string;
    focusParams: FocusGridParams;
    chunks?: ApprovalFocusChunk[];
  } | null>(null);

  /** Apply (or reset) a Focus-grid request. Shared by the Alerts panel and the
   *  approval-notification deep-link effect below. */
  const handleFocusGrid = useCallback((params: FocusGridParams | null) => {
    if (params === null) {
      // Toggle off — reset all filters
      setGridSearch('');
      setShowAllPeriods(true);
      setStartPeriod('');
      setEndPeriod('');
      setExternalAccounts([]);
      setExternalCategories([]);
      setExternalMeasures([]);
      setExternalColumnFilters(null);
      setSelectedTimeGranularities(new Set(defaultGranularitiesForDuration(getConfigTimeFrame(currentIndustry)?.duration)));
    } else {
      if (params.searchTerm !== undefined) setGridSearch(params.searchTerm);
      if (params.timeGranularities && params.timeGranularities.length > 0) {
        setSelectedTimeGranularities(new Set(params.timeGranularities));
      }
      if (params.bottomNColumnFilter) {
        const { n, dimension, measureId, columnKey, operator = 'bottomN' } = params.bottomNColumnFilter;
        const filterMap = new Map<string, ColumnFilter>([
          [columnKey, {
            conditions: [{
              id: 'focus-bottom-n',
              dimension,
              measureId,
              operator,
              value: String(n),
              // Rank across the whole grid (exactly N rows) without flattening the tree —
              // the hierarchy stays nested and is expanded to reveal the matches.
              ...(params.preserveHierarchy === false ? { rankScope: 'global' as const } : {}),
            }],
          }],
        ]);
        setExternalColumnFilters(filterMap);
      } else if (params.bottomNCategories) {
        const { n, measureId, columnKey } = params.bottomNCategories;
        const filterMap = new Map<string, ColumnFilter>([
          [columnKey, {
            conditions: [{
              id: 'focus-bottom-n-category',
              dimension: 'category',
              measureId,
              operator: 'bottomN',
              value: String(n),
            }],
          }],
        ]);
        setExternalColumnFilters(filterMap);
      } else {
        setExternalColumnFilters(null);
      }
      if (params.startPeriod || params.endPeriod) {
        setShowAllPeriods(false);
        if (params.startPeriod) setStartPeriod(params.startPeriod);
        if (params.endPeriod) setEndPeriod(params.endPeriod);
      }
      if (params.selectedCellKeys && params.selectedCellKeys.length > 0) {
        const orderedKeys = [...params.selectedCellKeys];
        const selectedSet = new Set(orderedKeys);
        setSelectedCells(selectedSet);
        selectedCellsRef.current = selectedSet;
        selectedCellsOrderRef.current = orderedKeys;
        setSelectedCellsOrder(orderedKeys);
        const firstKey = orderedKeys[0];
        if (firstKey) {
          lastSelectedCellRef.current = firstKey;
          setLastSelectedCell(firstKey);
          const parts = firstKey.split('-');
          const monthKey = parts[parts.length - 1];
          const rowId = parts.slice(0, -1).join('-');
          setCurrentFocusedCell({ rowId, monthKey });
        }
      }
      if (params.accounts) setExternalAccounts(params.accounts);
      if (params.categories) setExternalCategories(params.categories);
      if (params.measures) setExternalMeasures(params.measures);
      if (params.accounts || params.categories || params.measures) {
        if (params.expandLevel === 'categories') {
          pendingIntentExpandCategoriesRef.current = true;
          pendingIntentExpandRef.current = false;
        } else {
          pendingIntentExpandRef.current = true;
        }
      }
    }
    if (resetColumnWidthsRef.current) resetColumnWidthsRef.current();
  }, []);

  // ── Agentforce assistant wiring ───────────────────────────────────────────
  const { isOpen: isAgentforceOpen, open: openAgentforce, close: closeAgentforce } = useAgentforce();
  // True while an Agentforce "Show on grid" focus is currently applied, so we can
  // revert to the original view if the panel is dismissed without clearing it.
  const agentShowAppliedRef = useRef(false);
  // Id of the conditional-formatting rule the agent injected to highlight a
  // root-cause cell/period, so we can remove exactly that rule when clearing.
  const agentHighlightRuleIdRef = useRef<string | null>(null);
  // Snapshot of the user's sort before the agent applied its own ranking sort, so we
  // can restore it (instead of blowing it away) when the agent view is cleared.
  const agentPrevSortConfigRef = useRef<GlobalSortConfig | null>(null);

  const applyAgentSort = useCallback((sort: NonNullable<FocusGridParams['sort']>) => {
    // Valid "Sort by" measure values the Sort panel understands; fall back to alphabetical.
    const VALID_SORT_BY = new Set([
      'measure-sa-qty', 'measure-sa-rev', 'measure-opp-qty', 'measure-opp-rev',
      'measure-order-qty', 'measure-order-rev',
    ]);
    const sortBy = VALID_SORT_BY.has(sort.measureId)
      ? (sort.measureId as import('./GlobalSortPanel').DimensionSort['sortBy'])
      : 'alphabetical';
    setGlobalSortConfig(prev => {
      if (agentPrevSortConfigRef.current === null) agentPrevSortConfigRef.current = prev;
      return {
        criteria: [],
        preserveHierarchy: true,
        sortMeasures: false,
        // Expressed as a dimension sort so the Sort panel shows "<Level> · <Measure> · <dir>".
        dimensionSorts: [{ id: 'agent-sort', level: sort.dimension, sortBy, direction: sort.direction }],
      };
    });
  }, []);

  const clearAgentSort = useCallback(() => {
    if (agentPrevSortConfigRef.current === null) return;
    const prior = agentPrevSortConfigRef.current;
    agentPrevSortConfigRef.current = null;
    setGlobalSortConfig(prior);
  }, []);

  // Soft red "alert" tint used for agent root-cause highlights.
  const AGENT_HIGHLIGHT_COLOR = '#FCD5D2';

  const clearAgentHighlight = useCallback(() => {
    const id = agentHighlightRuleIdRef.current;
    if (!id) return;
    agentHighlightRuleIdRef.current = null;
    setConditionalFormattingRules(prev => prev.filter(r => r.id !== id));
  }, []);

  const applyAgentHighlight = useCallback((highlight: NonNullable<FocusGridParams['highlight']>) => {
    // Agent highlights are `agent-highlight-*` modifyCells rules that stay active even
    // while design-system styling is on (see effectiveConditionalFormattingRules), so we
    // don't flip the global toggle and accidentally light up the pre-existing admin rules.
    const now = new Date();
    const id = `agent-highlight-${now.getTime()}`;
    const rule: ConditionalFormattingRule = {
      id,
      name: highlight.name,
      isActive: true,
      priority: 0, // highest precedence so the highlight wins over other cell styling
      mode: 'modifyCells',
      target: {
        measureIds: highlight.measureIds ?? [],
        dimensionLevels: highlight.dimensionLevels ?? [],
        timeKeys: highlight.timeKeys ?? [],
        cellKeys: highlight.cellKeys,
      },
      // Always-true condition — the target (cellKeys / period) decides what lights up.
      condition: { type: 'formula', formula: 'VALUE = VALUE' },
      visualization: { type: 'background', color: highlight.color ?? AGENT_HIGHLIGHT_COLOR },
      createdAt: now,
      updatedAt: now,
    };
    setConditionalFormattingRules(prev => {
      const prior = agentHighlightRuleIdRef.current;
      const cleaned = prior ? prev.filter(r => r.id !== prior) : prev;
      return [...cleaned, rule];
    });
    agentHighlightRuleIdRef.current = id;
  }, []);

  const handleAgentShowOnGrid = useCallback((params: FocusGridParams | null) => {
    if (params) {
      handleFocusGrid(params);
      // Only reshape the hierarchy when the params actually carry a filter/focus intent.
      // Some agent responses (e.g. the Arc 3 baseline reveal) pass an empty `{}` purely to
      // land the reply — they must NOT collapse the grid to a measures-only view, since the
      // reveal manages its own expansion. Treat "no filter fields" as a hierarchy no-op.
      const hasFilterIntent = !!(
        params.searchTerm ||
        params.startPeriod ||
        params.endPeriod ||
        (params.selectedCellKeys && params.selectedCellKeys.length > 0) ||
        (params.accounts && params.accounts.length > 0) ||
        (params.categories && params.categories.length > 0) ||
        (params.measures && params.measures.length > 0) ||
        params.dimensionLevel ||
        (params.timeGranularities && params.timeGranularities.length > 0) ||
        params.bottomNCategories ||
        params.bottomNColumnFilter
      );
      if (!hasFilterIntent) {
        // No filter to apply — leave the current expansion state as-is.
        pendingIntentExpandRef.current = false;
        pendingIntentCollapseRef.current = false;
      } else if (params.expandHierarchy) {
        // Deep (e.g. product) matches: expand the full parent→child tree so the user can
        // correlate the agent's named rows with the grid hierarchy.
        pendingIntentCollapseRef.current = false;
        pendingIntentExpandRef.current = true;
      } else {
        // Override the default Focus-grid auto-expand: present a collapsed, clearly-filtered view.
        pendingIntentExpandRef.current = false;
        pendingIntentCollapseRef.current = true;
      }
      if (params.highlight) {
        applyAgentHighlight(params.highlight);
      } else {
        clearAgentHighlight();
      }
      if (params.sort) {
        applyAgentSort(params.sort);
      } else {
        clearAgentSort();
      }
      agentShowAppliedRef.current = true;
    } else {
      handleFocusGrid(null);
      clearAgentHighlight();
      clearAgentSort();
      agentShowAppliedRef.current = false;
    }
  }, [handleFocusGrid, applyAgentHighlight, clearAgentHighlight, applyAgentSort, clearAgentSort]);

  // Open Settings on the Formatting tab so the user can see the rule(s) the agent applied.
  const handleAgentShowConditionalFormatting = useCallback(() => {
    setCfViewFormattingSignal((s) => s + 1);
    setIsSettingsOpen(true);
    setIsFiltersOpen(false);
    setIsSortPanelOpen(false);
    setIsCellDetailsHistoryOpen(false);
    setIsAlertsOpen(false);
  }, []);

  // Open the Sort panel so the user can see/adjust the ranking sort the agent applied.
  const handleAgentShowSort = useCallback(() => {
    setIsSortPanelOpen(true);
    setIsFiltersOpen(false);
    setIsSettingsOpen(false);
    setIsCellDetailsHistoryOpen(false);
    setIsAlertsOpen(false);
  }, []);

  const handleAgentEditFilters = useCallback((params: FocusGridParams, filterLogic?: string) => {
    // Apply (so the cards pre-populate) and hand off to the Filters panel in Advanced mode.
    handleFocusGrid(params);
    if (params.highlight) applyAgentHighlight(params.highlight);
    else clearAgentHighlight();
    if (params.sort) applyAgentSort(params.sort);
    else clearAgentSort();
    // This is a hand-off, not a dismiss — don't let the close-effect revert the grid.
    agentShowAppliedRef.current = false;
    setFiltersInitialTab('advanced');
    setFiltersInitialTabSignal((s) => s + 1);
    // Pre-populate the derived AND/OR expression into the Filter Logic box.
    setExternalFilterLogic(filterLogic ?? '');
    setExternalFilterLogicSignal((s) => s + 1);
    setIsFiltersOpen(true);
    closeAgentforce();
  }, [handleFocusGrid, closeAgentforce, applyAgentHighlight, clearAgentHighlight, applyAgentSort, clearAgentSort]);

  // When the Agentforce panel is dismissed while a "Show on grid" view is active,
  // revert the grid to its original (unapplied) view.
  useEffect(() => {
    if (!isAgentforceOpen && agentShowAppliedRef.current) {
      handleFocusGrid(null);
      clearAgentHighlight();
      clearAgentSort();
      agentShowAppliedRef.current = false;
    }
  }, [isAgentforceOpen, handleFocusGrid, clearAgentHighlight, clearAgentSort]);

  // When arriving via a header-bell approval notification, open the Alerts panel,
  // inject the "Review approval request from <requester>" card, and focus the grid
  // on the exact section the requester asked about.
  const location = useLocation();
  const navigate = useNavigate();
  const handledNotificationFocusRef = useRef<unknown>(null);
  useEffect(() => {
    const incoming = (location.state as { focusFromNotification?: import('../contexts/NotificationsContext').ApprovalNotificationPayload } | null)?.focusFromNotification;
    if (!incoming) return;
    // Guard against re-applying the same navigation state on every render.
    if (handledNotificationFocusRef.current === location.state) return;
    handledNotificationFocusRef.current = location.state;

    const fc = incoming.focusContext;
    let focusParams: FocusGridParams = {
      searchTerm: fc?.searchTerm,
      startPeriod: fc?.startPeriod,
      endPeriod: fc?.endPeriod,
      selectedCellKeys: fc?.selectedCellKeys,
    };

    let chunks = buildApprovalFocusChunks(fc?.selectedCellKeys, data);
    // Plan-level requests carry no searchTerm and (often) no usable cell keys —
    // the submit happened on the plan page, not the grid. When the incoming keys
    // don't resolve to any section in the current grid, fall back to the cells the
    // requester actually edited (recorded in this grid's own edit history) so
    // "Focus grid" has a real target instead of doing nothing.
    if (!fc?.searchTerm && chunks.length === 0) {
      const requesterId = incoming.requesterUserId;
      const fallbackKeys = editHistory
        .filter((e) => e.oldValue !== undefined || e.newValue !== undefined)
        .filter((e) => !requesterId || !e.userId || e.userId === requesterId)
        .filter((e) => {
          const tk = (e.timeKey || e.cellKey.split('-').pop() || '').toLowerCase();
          return CHUNK_MONTH_ORDER.includes(tk);
        })
        .map((e) => e.cellKey);
      chunks = buildApprovalFocusChunks(fallbackKeys, data);
    }

    // Derive the "Focus grid" params from the resolved chunks so it actually
    // narrows the grid (branch + month range + cell selection).
    if (!fc?.searchTerm && chunks.length > 0) {
      if (chunks.length === 1) {
        focusParams = chunks[0].focusParams;
      } else {
        const allKeys = chunks.flatMap((c) => c.focusParams.selectedCellKeys ?? []);
        const months = allKeys
          .map((k) => (k.split('-').pop() || '').toLowerCase())
          .filter((m) => CHUNK_MONTH_ORDER.includes(m))
          .sort((a, b) => CHUNK_MONTH_ORDER.indexOf(a) - CHUNK_MONTH_ORDER.indexOf(b));
        focusParams = {
          startPeriod: months[0],
          endPeriod: months[months.length - 1],
          selectedCellKeys: allKeys,
        };
      }
    }

    // Seed the pending approval request so the approver can act on it (and so the
    // decision notification can find the original requester) even though the grid
    // remounted on navigation.
    if (incoming.cellKey) {
      const cellKey = incoming.cellKey;
      const parts = cellKey.split('-');
      const monthKey = parts[parts.length - 1];
      const rowId = parts.slice(0, -1).join('-');
      const measureId = rowId.split('-').find((p) => p.startsWith('measure-')) || '';
      setApprovalRequests((prev) => {
        if (prev.has(cellKey)) return prev;
        const next = new Map(prev);
        next.set(cellKey, {
          id: `approval-${cellKey}-${Date.now()}`,
          cellKey,
          measureId,
          rowId,
          timeKey: monthKey,
          oldValue: 0,
          newValue: 0,
          variancePct: 0,
          requesterNote: '',
          requesterId: incoming.requesterUserId || '',
          requesterName: incoming.requesterName,
          approverId: '',
          approverName: '',
          status: 'pending',
          userInitiated: true,
          focusContext: fc,
          createdAt: new Date(),
        });
        return next;
      });
    }

    setReviewApprovalCard({
      id: `review-approval-${incoming.cellKey || Date.now()}`,
      requesterName: incoming.requesterName,
      summary: incoming.summary,
      focusParams,
      // The review card is a pure list of logical sections (measure · branch ·
      // contiguous months); each has its own "Focus grid" button. There is no
      // global "focus all" — see AlertsPanel.
      chunks: chunks.length > 0 ? chunks : undefined,
    });
    setIsAlertsOpen(true);
    // Auto-focus the first section on open so the approver lands somewhere
    // meaningful (the union of all edits rarely narrows anything useful).
    handleFocusGrid(chunks.length > 0 ? chunks[0].focusParams : focusParams);

    // Clear the notification payload from the browser history entry. Otherwise
    // react-router persists location.state across reloads / re-navigation, and a
    // fresh load (even by a different user who never requested approval) would
    // re-trigger this effect and re-inject the review card.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, handleFocusGrid, navigate, data, editHistory]);

  // ── Arc 5: Slack-approved amendment lands on the grid ──────────────────────
  // The standalone Slack approval screen navigates here with ?amendment=emotor
  // once Rita approves and the Slackbot "updates the plan". We replay that as a
  // real edit on the E-Motor Housing / Sales Manager Target Quantity line
  // (+18%), producing the edited cell, the impacted rollups, a pre-written note
  // and the unsaved Save bar — so the seller reviews and commits the amendment.
  const amendmentAppliedRef = useRef(false);

  // The standalone Slack tab (opened via "View in Slack") posts back here when the
  // seller clicks "Review in grid". We bring this tab forward (the Slack tab closes
  // itself) and navigate to the amended grid so the edit lands in the same session.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; amendment?: string } | null;
      if (d && d.type === 'cpm-slack-amendment' && d.amendment === 'emotor') {
        amendmentAppliedRef.current = false;
        navigate('/home/manufacturing-acme?amendment=emotor');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('amendment') !== 'emotor' || amendmentAppliedRef.current) return;

    let cancelled = false;
    let tries = 0;
    const findEMotor = (): { id: string; june: number } | null => {
      // Resolve the SAME node the red warning flagged — the Midwest E-Motor Housing.
      const node = findMidwestEMotorNode(data as any[]);
      const jun = node?.values?.[ARC5_RISK_MONTH_KEY];
      return node && typeof jun === 'number' ? { id: node.id, june: jun } : null;
    };

    const tryApply = () => {
      if (cancelled || amendmentAppliedRef.current) return;
      tries += 1;
      const handler = cellChangeHandlerRef.current;
      const target = findEMotor();
      if (handler && target && selectedLayoutState === 'Measures / Dimensions x Time') {
        amendmentAppliedRef.current = true;
        // The amendment lands where the risk originates — E-Motor Housing's June cell —
        // and ripples straight up the flagged lineage (Midwest → Light Trucks → North
        // America → Acme Partners) that carried the red warning.
        const next = Math.round(target.june * 1.18);
        const note = `Updated on Rita Menon's approval — E-Motor Housing +18% (Midwest Sales Agreement amendment).`;
        handler(target.id, ARC5_RISK_MONTH_KEY as any, next, note);
        // Mark the amendment as pending commit — the next Save clears the alert + bell dot.
        arc5AmendmentPendingRef.current = true;
        // Clear the red warning lineage entirely: coming back from Slack, the amendment reads
        // as an ordinary unsaved edit — E-Motor Housing's June cell is the dark-yellow edited
        // cell (carrying Rita's approval note) and its ancestors are light-yellow impacted
        // rollups. No green "resolved" checkmark.
        setRiskCellKeys(new Set());
        setRiskResolved(false);
        // Drop the param so a refresh doesn't re-apply the amendment.
        navigate(`${location.pathname}`, { replace: true, state: null });
        // Expand the branch down to the edited E-Motor Housing row (siblings +
        // impacted rollups stay visible — no narrowing search filter), then scroll
        // it into view so the seller lands on the edit + ripple in full context.
        setTimeout(() => { if (!cancelled) drillToRowRef.current?.(target.id, { scroll: true }); }, 500);
        return;
      }
      if (tries < 50) setTimeout(tryApply, 150);
    };
    const kickoff = setTimeout(tryApply, 300);
    return () => { cancelled = true; clearTimeout(kickoff); };
  }, [location.search, location.pathname, data, selectedLayoutState, navigate]);

  // On initial load, open the Order Quantity (No.s) measure row one level (→ its plants)
  // so the DF-demo grid lands on the story measure. Retries briefly until the grid has
  // registered its expand-measure-row handler. Mount-only: manual collapse/layout changes
  // afterward are left alone.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tryExpand = () => {
      if (cancelled) return;
      if (expandMeasureRowRef.current) {
        expandMeasureRowRef.current('measure-order-qty', 1);
        return;
      }
      if (tries++ < 40) setTimeout(tryExpand, 100);
    };
    const t = setTimeout(tryExpand, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const handleExpandAllRows = () => {
    if (expandAllRef.current) {
      expandAllRef.current();
    }
  };
  
  const handleCollapseAllRows = () => {
    if (collapseAllRef.current) {
      collapseAllRef.current();
    }
  };

  // Clears EVERY filter source that can trigger the parent-totals hint, so the grid's
  // "Clear filter" link reliably resets the view regardless of which filter is active.
  const handleClearAllGridFilters = () => {
    // 1. Grid-internal column & quick filters
    clearAllFiltersRef.current?.();
    // 2. Filters panel cards (resets to All, re-applies, clears active count)
    filtersPanelClearAllRef.current?.();
    // 3. Grid search
    setGridSearch('');
    // 4. Dimension level selection back to the full hierarchy
    setSelectedDimensionLevels(new Set(dimensionSchemeIds));
    // 5. Global sort (only flattens the hierarchy when criteria exist)
    setGlobalSortConfig({ criteria: [], preserveHierarchy: true, sortMeasures: false });
    // 6. Intent-based (Focus grid) external filters
    setExternalAccounts([]);
    setExternalCategories([]);
    setExternalMeasures([]);
    // 7. Time period back to the full range
    setShowAllPeriods(true);
    setStartPeriod('');
    setEndPeriod('');
  };
  const [lastRefreshed] = useState(() => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${time}, ${date}`;
  });

  // Data-freshness indicator shown next to "Last refreshed". Hovering the pill
  // reveals a short summary of what was newly ingested and when. The popover is
  // portaled to <body> (fixed positioning) so it renders on the top layer and
  // is never clipped by the header/grid overflow.
  const [isDataStatusOpen, setIsDataStatusOpen] = useState(false);
  const [dataStatusPos, setDataStatusPos] = useState<{ top: number; right: number } | null>(null);
  const dataStatusPillRef = useRef<HTMLButtonElement>(null);
  const dataStatusCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataStatusFresh = true;
  const openDataStatus = useCallback(() => {
    if (dataStatusCloseTimer.current) clearTimeout(dataStatusCloseTimer.current);
    const rect = dataStatusPillRef.current?.getBoundingClientRect();
    if (rect) setDataStatusPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setIsDataStatusOpen(true);
  }, []);
  const scheduleCloseDataStatus = useCallback(() => {
    if (dataStatusCloseTimer.current) clearTimeout(dataStatusCloseTimer.current);
    dataStatusCloseTimer.current = setTimeout(() => setIsDataStatusOpen(false), 140);
  }, []);
  const dpeRunTimestamp = '06:42 AM, 25/07/2026';
  const headerSummaryText = useMemo(() => {
    // Measure categories (M of N)
    const allMeasureCategories = isConfigIndustry(industry)
      ? getConfigMeasureCategories(industry).map((c) => c.name)
      : ['Revenue & Quantity Measures', 'Adjustment Measures'];
    const selectedCategoryCount = allMeasureCategories.filter(c => selectedMeasureSubgroup.has(c)).length;

    // Measures (A of B) — visible measures vs. the full measure set
    const totalMeasures = originalData.length;
    const visibleMeasures = hierarchicalGridData.length;

    // Count dimension rows per level in a measure's subtree.
    const countLevels = (measure?: any) => {
      let accounts = 0, categories = 0, products = 0, configLeaves = 0;
      const walk = (rows?: any[]) => {
        rows?.forEach((r: any) => {
          if (r.type === 'account') accounts++;
          else if (r.type === 'category') categories++;
          else if (r.type === 'product') products++;
          else if (isConfigLevel(r.type) && (!r.children || r.children.length === 0)) configLeaves++;
          walk(r.children);
        });
      };
      walk(measure?.children);
      return { accounts, categories, products, configLeaves };
    };
    const totalLevels = countLevels(originalData[0]);
    const visibleLevels = countLevels(hierarchicalGridData[0]);
    const visibleRecords = visibleLevels.products || visibleLevels.categories || visibleLevels.accounts || visibleLevels.configLeaves;
    const totalRecords = totalLevels.products || totalLevels.categories || totalLevels.accounts || totalLevels.configLeaves;

    // Dimensions filtered (K) — levels where fewer rows are visible than exist in full.
    let dimensionsFiltered = 0;
    if (visibleLevels.accounts < totalLevels.accounts) dimensionsFiltered++;
    if (visibleLevels.categories < totalLevels.categories) dimensionsFiltered++;
    if (visibleLevels.products < totalLevels.products) dimensionsFiltered++;

    // Time periods (L)
    const monthOrder = [
      'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
      'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
    ];
    let periodCount = monthOrder.length;
    if (!showAllPeriods && startPeriod && endPeriod) {
      const i = monthOrder.indexOf(startPeriod);
      const j = monthOrder.indexOf(endPeriod);
      if (i >= 0 && j >= 0) periodCount = Math.abs(j - i) + 1;
    }

    const fmt = (n: number) => n.toLocaleString();
    const periodText = `${periodCount} ${periodCount === 1 ? 'time period' : 'time periods'}`;
    // Only mention dimension filters when at least one is applied.
    const filterClause = dimensionsFiltered === 0
      ? periodText
      : `Filtered by ${dimensionsFiltered} ${dimensionsFiltered === 1 ? 'dimension' : 'dimensions'} across ${periodText}`;

    return `Showing ${fmt(visibleRecords)} of ${fmt(totalRecords)} records`
      + ` • ${selectedCategoryCount} of ${allMeasureCategories.length} measure categories`
      + ` • ${visibleMeasures} of ${totalMeasures} measures`
      + ` • ${filterClause}`;
  }, [
    selectedMeasureSubgroup,
    originalData,
    hierarchicalGridData,
    showAllPeriods,
    startPeriod,
    endPeriod,
    industry,
  ]);


  const handleDimensionLevelsChange = (levels: Set<string>) => {
    setSelectedDimensionLevels(levels);
  };

  const handleTimeGranularitiesChange = (granularities: Set<string>) => {
    setSelectedTimeGranularities(granularities);
  };

  // Handle layout change - preserve focus and update column width to layout-specific default
  const handleLayoutChange = (newLayout: string) => {
    setSelectedLayoutState(newLayout);
    // Update column width to default for new layout (consider sub-columns if enabled)
    const hasSubColumns = showSubColumns && selectedSubColumns.length > 0;
    setColumnWidth(getDefaultColumnWidth(newLayout, hasSubColumns));
  };

  // Helper to map HierarchicalGrid focus to DimensionsTimeGrid focus
  const mapToDimensionsTimeFocus = (
    hierarchicalFocus: HierarchicalGridFocus
  ): DimensionsTimeGridFocus => {
    if (!hierarchicalFocus) return null;

    // Extract measure ID from rowId (e.g., "product-trn-a-measure-sa-qty" -> "measure-sa-qty")
    const parts = hierarchicalFocus.rowId.split('-');
    const measureIndex = parts.findIndex(part => part === 'measure');
    if (measureIndex === -1) return null;
    
    const measureId = `measure-${parts.slice(measureIndex + 1).join('-')}`;
    
    // Extract dimension ID (remove measure suffix)
    const dimensionId = parts.slice(0, measureIndex).join('-');
    
    // Build the transformed row ID: dimension-{dimensionId}-{timeKey}
    const timeKey = hierarchicalFocus.monthKey;
    let transformedRowId = `dimension-${dimensionId}`;
    
    // Add time period suffix based on monthKey
    if (timeKey === 'year') {
      transformedRowId = `${transformedRowId}-year`;
    } else if (timeKey.startsWith('q')) {
      // Quarter: dimension-{dimensionId}-year-{quarter}
      transformedRowId = `${transformedRowId}-year-${timeKey}`;
    } else {
      // Month: dimension-{dimensionId}-year-{quarter}-{month}
      // Need to determine which quarter contains this month
      const quarterMap: { [key: string]: string } = {
        'jan2026': 'q1', 'feb2026': 'q1', 'mar2026': 'q1',
        'apr2026': 'q2', 'may2026': 'q2', 'jun2026': 'q2',
        'jul2026': 'q3', 'aug2026': 'q3', 'sep2026': 'q3',
        'oct2026': 'q4', 'nov2026': 'q4', 'dec2026': 'q4',
      };
      const quarter = quarterMap[timeKey];
      if (quarter) {
        transformedRowId = `${transformedRowId}-year-${quarter}-${timeKey}`;
      }
    }

    return { rowId: transformedRowId, measureId };
  };

  // Helper to map DimensionsTimeGrid focus to HierarchicalGrid focus
  const mapToHierarchicalFocus = (
    dimensionsTimeFocus: DimensionsTimeGridFocus
  ): HierarchicalGridFocus => {
    if (!dimensionsTimeFocus) return null;

    // Extract dimension ID and time period from rowId
    // Format: dimension-{dimensionId}-year or dimension-{dimensionId}-year-{quarter} or dimension-{dimensionId}-year-{quarter}-{month}
    const rowId = dimensionsTimeFocus.rowId.replace('dimension-', '');
    
    // Split by '-' to parse
    const parts = rowId.split('-');
    
    // Find where time period starts (look for 'year')
    const yearIndex = parts.findIndex(part => part === 'year');
    if (yearIndex === -1) return null;
    
    // Dimension ID is everything before 'year'
    const dimensionId = parts.slice(0, yearIndex).join('-');
    
    // Determine time key
    let monthKey: string;
    if (parts.length === yearIndex + 1) {
      // Just year
      monthKey = 'year';
    } else if (parts.length === yearIndex + 2) {
      // Year and quarter
      monthKey = parts[yearIndex + 1];
    } else {
      // Year, quarter, and month
      monthKey = parts[yearIndex + 2];
    }
    
    // Build hierarchical rowId: {dimensionId}-{measureId}
    const measureId = dimensionsTimeFocus.measureId;
    const hierarchicalRowId = `${dimensionId}-${measureId}`;

    return { rowId: hierarchicalRowId, monthKey };
  };

  return (
    <div className="forecasting-container">
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumbs-row">
            <div className="breadcrumbs">
              <Link 
                to="/planning-forecasting"
                className="breadcrumbs-link"
              >
                Planning and Forecasting
              </Link>
              <span className="breadcrumbs-separator">&gt;</span>
              Grid
            </div>
          </div>
          <div className="page-header-title">
            Planning & Forecasting FY26 - Grid View
          </div>
          <div className="grid-status-text-header">
            {headerSummaryText}
            {showHierarchicalParentTotalsHint && (
            <>
            {' • '}
            <span className="grid-scope-inline">
              <span className="grid-scope-label">
                Calculation Scope:{' '}
                <span className={`slds-badge grid-scope-badge${includeFilteredOutChildren ? ' grid-scope-badge--everything' : ''}`}>
                  {includeFilteredOutChildren ? 'All rows' : 'Only Filtered Rows'}
                </span>
              </span>
              <button
                type="button"
                ref={scopeTriggerRef}
                className={`grid-scope-menu-trigger${includeFilteredOutChildren ? ' grid-scope-menu-trigger--everything' : ''}${isScopePopoverOpen ? ' grid-scope-menu-trigger--open' : ''}`}
                aria-haspopup="menu"
                aria-expanded={isScopePopoverOpen}
                aria-label={`Calculation scope: ${includeFilteredOutChildren ? 'All rows' : 'Only Filtered Rows'}. Change`}
                onClick={() => {
                  if (!isScopePopoverOpen) setScopeDraftEverything(includeFilteredOutChildren);
                  setIsScopePopoverOpen((v) => !v);
                }}
                title="Calculation scope — change how totals roll up and edits distribute"
              >
                <svg className="grid-scope-menu-trigger__icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
                  <rect x="3" y="1.5" width="10" height="13" rx="1.8" fill="currentColor" />
                  <rect x="5" y="3.4" width="6" height="2.4" rx="0.5" fill="#fff" />
                  <circle cx="5.5" cy="9" r="0.75" fill="#fff" />
                  <circle cx="8" cy="9" r="0.75" fill="#fff" />
                  <circle cx="10.5" cy="9" r="0.75" fill="#fff" />
                  <circle cx="5.5" cy="11.6" r="0.75" fill="#fff" />
                  <circle cx="8" cy="11.6" r="0.75" fill="#fff" />
                  <circle cx="10.5" cy="11.6" r="0.75" fill="#fff" />
                </svg>
                <svg className="grid-scope-menu-trigger__caret" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">
                  <path
                    d="M4 6l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {isScopePopoverOpen && scopePopoverPos && createPortal(
                <div
                  ref={scopePopoverRef}
                  className="grid-scope-popover slds-popover slds-popover_small"
                  role="dialog"
                  aria-label="Totals and edits scope"
                  style={{ top: scopePopoverPos.top, left: scopePopoverPos.left }}
                >
                  <div className="grid-scope-popover__nubbin" aria-hidden="true" />
                  <div className="grid-scope-popover__body">
                    <h2 className="grid-scope-popover__title">Totals &amp; edits scope</h2>
                    <div role="radiogroup" aria-label="Totals and edits scope">
                      <button
                        type="button"
                        className={`grid-scope-option${!scopeDraftEverything ? ' grid-scope-option--selected' : ''}`}
                        role="radio"
                        aria-checked={!scopeDraftEverything}
                        onClick={() => setScopeDraftEverything(false)}
                      >
                        <span className="grid-scope-option__radio" aria-hidden="true" />
                        <span className="grid-scope-option__body">
                          <span className="grid-scope-option__label">Only Filtered Rows</span>
                          <span className="grid-scope-option__desc">
                            Totals &amp; edits apply to the visible rows only. Rows outside your filter are never changed.
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`grid-scope-option${scopeDraftEverything ? ' grid-scope-option--selected' : ''}`}
                        role="radio"
                        aria-checked={scopeDraftEverything}
                        onClick={() => setScopeDraftEverything(true)}
                      >
                        <span className="grid-scope-option__radio" aria-hidden="true" />
                        <span className="grid-scope-option__body">
                          <span className="grid-scope-option__label grid-scope-option__label--warning">
                            All rows
                          </span>
                          <span className="grid-scope-option__desc">
                            Totals roll up over all children and edits spread to every child row — including ones hidden by your filters.
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="grid-scope-popover__footer">
                    <button
                      type="button"
                      className="grid-scope-btn grid-scope-btn_text"
                      onClick={() => {
                        handleClearAllGridFilters();
                        setIsScopePopoverOpen(false);
                      }}
                    >
                      Clear filters
                    </button>
                    <div className="grid-scope-popover__footer-actions">
                      <button
                        type="button"
                        className="grid-scope-btn grid-scope-btn_neutral"
                        onClick={() => setIsScopePopoverOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="grid-scope-btn grid-scope-btn_brand"
                        onClick={() => {
                          setScopeEverything(scopeDraftEverything);
                          setIsScopePopoverOpen(false);
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </span>
            </>
            )}
          </div>
        </div>
        <div className="page-header-right">
          <div className="last-refreshed-row">
            <div
              className="data-status"
              onMouseEnter={openDataStatus}
              onMouseLeave={scheduleCloseDataStatus}
            >
              <button
                ref={dataStatusPillRef}
                type="button"
                className={`data-status-pill ${dataStatusFresh ? 'data-status-pill--fresh' : 'data-status-pill--stale'}`}
                aria-label={`Data status: ${dataStatusFresh ? 'Fresh' : 'Stale'}`}
                aria-expanded={isDataStatusOpen}
                onClick={() => (isDataStatusOpen ? setIsDataStatusOpen(false) : openDataStatus())}
              >
                <span className="data-status-label">Data Status:</span>
                <span className={`data-status-value ${dataStatusFresh ? 'data-status-value--fresh' : 'data-status-value--stale'}`}>
                  {dataStatusFresh ? (
                    <svg className="data-status-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <span className="data-status-dot" aria-hidden="true" />
                  )}
                  {dataStatusFresh ? 'Fresh' : 'Stale'}
                </span>
              </button>
              {isDataStatusOpen && dataStatusPos && createPortal(
                <div
                  className="data-status-popover"
                  role="dialog"
                  aria-label="Data ingestion status"
                  style={{ top: dataStatusPos.top, right: dataStatusPos.right }}
                  onMouseEnter={() => {
                    if (dataStatusCloseTimer.current) clearTimeout(dataStatusCloseTimer.current);
                  }}
                  onMouseLeave={scheduleCloseDataStatus}
                >
                  <div className="data-status-popover-head">
                    <div className="data-status-popover-headtext">
                      <div className="data-status-popover-title">
                        {dataStatusFresh ? 'DPE runs are up to date' : 'A DPE run may be behind'}
                      </div>
                      <div className="data-status-popover-sub">Last DPE run {dpeRunTimestamp} · via Data Cloud</div>
                    </div>
                    <button className="refresh-button data-status-refresh" type="button" title="Re-run DPE sync">
                      <svg className="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 2v6h-6"/>
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                        <path d="M3 22v-6h6"/>
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                      </svg>
                    </button>
                  </div>
                </div>,
                document.body,
              )}
            </div>
          </div>
          <div className="page-header-right-top">
            <GridToolbar 
              onSettingsClick={() => {
                setIsSettingsOpen(true);
                setIsFiltersOpen(false);
                setIsSortPanelOpen(false);
                setIsCellDetailsHistoryOpen(false);
                setIsAlertsOpen(false);
                setIsChartsOpen(false);
              }}
              onFilterClick={() => {
                setIsFiltersOpen(true);
                setIsSettingsOpen(false);
                setIsSortPanelOpen(false);
                setIsCellDetailsHistoryOpen(false);
                setIsAlertsOpen(false);
                setIsChartsOpen(false);
              }}
              onNotesClick={() => {
                setCellDetailsInitialTab('multi');
                setCellDetailsFocusSection(null);
                setIsCellDetailsHistoryOpen(true);
                setIsSettingsOpen(false);
                setIsFiltersOpen(false);
                setIsSortPanelOpen(false);
                setIsAlertsOpen(false);
                setIsChartsOpen(false);
              }}
              onSortClick={() => {
                setIsSortPanelOpen(v => !v);
                setIsSettingsOpen(false);
                setIsFiltersOpen(false);
                setIsCellDetailsHistoryOpen(false);
                setIsAlertsOpen(false);
                setIsChartsOpen(false);
              }}
              onAlertClick={() => {
                setIsAlertsOpen(v => !v);
                setArc5Unread(false);
                setIsSettingsOpen(false);
                setIsFiltersOpen(false);
                setIsCellDetailsHistoryOpen(false);
                setIsSortPanelOpen(false);
                setIsChartsOpen(false);
              }}
              onChartClick={() => {
                setIsChartsOpen(v => !v);
                setIsSettingsOpen(false);
                setIsFiltersOpen(false);
                setIsSortPanelOpen(false);
                setIsCellDetailsHistoryOpen(false);
                setIsAlertsOpen(false);
              }}
              searchValue={gridSearch}
              onSearchChange={setGridSearch}
              isSettingsActive={isSettingsOpen}
              isFilterActive={isFiltersOpen}
              isNotesActive={isCellDetailsHistoryOpen}
              isSortActive={isSortPanelOpen || globalSortConfig.criteria.length > 0 || (globalSortConfig.dimensionSorts?.length ?? 0) > 0}
              isAlertActive={isAlertsOpen}
              hasNewAlert={arc5Unread}
              isChartActive={isChartsOpen}
              activeFilterCount={activeFilterCount}
              activeSortCount={globalSortConfig.criteria.length + (globalSortConfig.dimensionSorts?.length ?? 0)}
              globalSortConfig={globalSortConfig}
            />
          </div>
        </div>
      </div>
      {approvalSubmittedNotification.isVisible && (
        <ScopedNotification
          className="scoped-notification--approval-success"
          icon={
            <svg className="scoped-notification-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <circle cx="10" cy="10" r="9" fill="currentColor" />
              <path d="M6 10.2l2.5 2.5L14 7.2" stroke="var(--color-surface-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          message="Approval submitted."
          ctaLabel="Show status"
          onCtaClick={handleEnableApprovalStatusSubColumn}
          onClose={() => setApprovalSubmittedNotification(prev => ({ ...prev, isVisible: false }))}
        />
      )}
      {showQuickAccessToolbar && (
        <QuickAccessBar
          actions={quickAccessActions}
          onConfigure={() => setIsQuickAccessModalOpen(true)}
          onClose={() => setShowQuickAccessToolbar(false)}
          selectedMeasureSubgroup={selectedMeasureSubgroup}
          onMeasureSubgroupChange={setSelectedMeasureSubgroup}
          measures={data}
          visibleMeasureIds={visibleMeasureIds}
          onMeasuresReorder={handleMeasuresReorder}
          dimensionLevels={dimensionScheme}
          selectedDimensionLevels={selectedDimensionLevels}
          onDimensionLevelsChange={handleDimensionLevelsChange}
          selectedTimeGranularities={selectedTimeGranularities}
          onTimeGranularitiesChange={handleTimeGranularitiesChange}
          startPeriod={startPeriod}
          endPeriod={endPeriod}
          onStartPeriodChange={setStartPeriod}
          onEndPeriodChange={setEndPeriod}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'row', flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        <div className="grid-wrapper">
        {isApplyingScenario && (
          <div className="scenario-apply-overlay" role="status" aria-live="polite">
            <div className="scenario-apply-overlay-card">
              <span className="scenario-apply-spinner" aria-hidden="true" />
              <span className="scenario-apply-overlay-text">Applying scenario…</span>
            </div>
          </div>
        )}
        {isRevealingBaseline && (
          <div className="scenario-apply-overlay" role="status" aria-live="polite">
            <div className="scenario-apply-overlay-card">
              <span className="scenario-apply-spinner" aria-hidden="true" />
              <span className="scenario-apply-overlay-text">Projecting the baseline with Moirai…</span>
            </div>
          </div>
        )}
        {showChartArea && (
          <div className="grid-chart-area">
            {chartConfigs.map((chart) => (
              <button
                key={chart.id}
                type="button"
                className="grid-chart-area-card"
                onClick={() => {
                  setIsChartsOpen(true);
                  setIsSettingsOpen(false);
                  setIsFiltersOpen(false);
                }}
                title={`${chart.name} — click to open charts`}
              >
                <span className="grid-chart-area-card-head">
                  <span className="grid-chart-area-card-name">{chart.name}</span>
                  <span className="grid-chart-area-card-type">{chart.type}</span>
                </span>
                <span className="grid-chart-area-card-body">
                  <MiniChart type={chart.type} row={gridChartSourceRow} />
                </span>
              </button>
            ))}
            <button
              type="button"
              className="grid-chart-area-add"
              onClick={() => setIsConfigureChartsOpen(true)}
              title="Add a chart"
            >
              <span className="grid-chart-area-plus" aria-hidden="true">+</span>
              <span className="grid-chart-area-text">Add chart</span>
            </button>
          </div>
        )}
        {selectedLayoutState === 'Dimensions / Time x Measures' ? (
          <DimensionsTimeGrid 
            data={filteredData} 
            onDataChange={setData} 
            onExpandedRowsChange={handleGridExpandedRowsChange}
            selectedDimensionLevels={selectedDimensionLevels}
            selectedTimeGranularities={selectedTimeGranularities}
            columnWidth={columnWidth}
            onExpandAllRows={(handler) => { expandAllRef.current = handler; }}
            onCollapseAllRows={(handler) => { collapseAllRef.current = handler; }}
            onSettingsClick={() => setIsSettingsOpen(true)}
            initialFocusedCell={mapToDimensionsTimeFocus(hierarchicalGridFocusRef.current)}
            onFocusedCellChange={(focus) => { 
              dimensionsTimeGridFocusRef.current = focus;
              setCurrentFocusedCell(focus);
              // Sync selectedCells when focus changes (single-click behavior)
              if (focus) {
                const cellKey = `${focus.rowId}-${focus.measureId}`;
                // Only sync if we're in single-select mode (not multi-selecting)
                if (selectedCellsRef.current.size <= 1) {
                  setSelectedCells(new Set([cellKey]));
                  selectedCellsRef.current = new Set([cellKey]);
                  selectedCellsOrderRef.current = [cellKey];
                  setSelectedCellsOrder([cellKey]);
                }
              }
            }}
            searchTerm={gridSearch}
            onEditHistory={addDraftEditHistory}
            showAllPeriods={showAllPeriods}
            startPeriod={startPeriod}
            endPeriod={endPeriod}
            selectedCells={selectedCells}
            onCellSelect={handleCellSelect}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseMove={handleCellMouseMove}
            newlyAddedMeasureIds={newlyAddedMeasureIds}
            onScrollToMeasureReady={(handler) => {
              scrollToMeasureDimensionsTimeRef.current = handler;
            }}
          />
        ) : selectedLayoutState === 'Time / Dimensions x Measures' ? (
          <TimeDimensionsGrid 
            data={filteredData} 
            onDataChange={setData} 
            onExpandedRowsChange={handleGridExpandedRowsChange}
            selectedDimensionLevels={selectedDimensionLevels}
            selectedTimeGranularities={selectedTimeGranularities}
            columnWidth={columnWidth}
            onExpandAllRows={(handler) => { expandAllRef.current = handler; }}
            onCollapseAllRows={(handler) => { collapseAllRef.current = handler; }}
            onSettingsClick={() => setIsSettingsOpen(true)}
            initialFocusedCell={timeDimensionsGridFocusRef.current}
            onFocusedCellChange={(focus) => {
              timeDimensionsGridFocusRef.current = focus;
              setCurrentFocusedCell(focus);
              // Sync selectedCells when focus changes (single-click behavior)
              if (focus) {
                const cellKey = `${focus.rowId}-${focus.measureId}`;
                // Only sync if we're in single-select mode (not multi-selecting)
                if (selectedCellsRef.current.size <= 1) {
                  setSelectedCells(new Set([cellKey]));
                  selectedCellsRef.current = new Set([cellKey]);
                  selectedCellsOrderRef.current = [cellKey];
                  setSelectedCellsOrder([cellKey]);
                }
              }
            }}
            searchTerm={gridSearch}
            onEditHistory={addDraftEditHistory}
            showAllPeriods={showAllPeriods}
            startPeriod={startPeriod}
            endPeriod={endPeriod}
            selectedCells={selectedCells}
            onCellSelect={handleCellSelect}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseMove={handleCellMouseMove}
            newlyAddedMeasureIds={newlyAddedMeasureIds}
            onScrollToMeasureReady={(handler) => {
              scrollToMeasureTimeDimensionsRef.current = handler;
            }}
          />
        ) : (
          <>
            <HierarchicalGrid
            key={currentIndustry}
            data={hierarchicalGridData}
            rollupValueSourceData={hierarchicalRollupValueSource}
            onDataChange={handleHierarchicalGridDataChange} 
            onExpandedRowsChange={handleGridExpandedRowsChange}
            parentTotalsRollupMode={parentTotalsRollupMode}
            propagateIntoNoMatchRows={propagateIntoNoMatchRows}
            measureEditDisaggregateVisibleChildrenDefault={measureEditDisaggregateToVisibleChildrenOnly}
            planReviewGridLock={planReviewGridLock}
            planReviewRequesterStripes={planReviewRequesterStripes}
            approverMayOpenReviewPopover={isCurrentUserApprover}
            approverOverrideCellKeys={approverOverrideCellKeys}
            pendingApproverEdit={pendingApproverEdit}
            onPendingApproverEditConsumed={handlePendingApproverEditConsumed}
            onManagerOverrideForCell={handleApproverOverrideForCell}
            initialCellMapsSnapshot={initialHierarchicalCellMaps}
            onCellMapsSnapshotChange={handleCellMapsSnapshotChange}
            selectedDimensionLevels={selectedDimensionLevels}
            selectedTimeGranularities={selectedTimeGranularities}
            calendarStartMonth={calendarStartMonth}
            calendarStartYear={calendarStartYear}
            columnWidth={columnWidth}
            onExpandAllRows={(handler) => { expandAllRef.current = handler; }}
            onCollapseAllRows={(handler) => { collapseAllRef.current = handler; }}
            onExpandMeasuresOnly={(handler) => { expandMeasuresOnlyRef.current = handler; }}
            onExpandToCategories={(handler) => { expandToCategoriesRef.current = handler; }}
            onExpandMeasureRow={(handler) => { expandMeasureRowRef.current = handler; }}
            onExpandRows={(handler) => { expandRowsRef.current = handler; }}
            onResetColumnWidths={(handler) => { resetColumnWidthsRef.current = handler; }}
            onClearAllFilters={(handler) => { clearAllFiltersRef.current = handler; }}
            onSettingsClick={() => setIsSettingsOpen(true)}
            onShowCharts={(row) => {
              setChartsFocusRowId(row.id);
              setChartsBreadcrumb([{ id: row.id, name: row.name }]);
              setIsChartsOpen(true);
              setIsSettingsOpen(false);
              setIsFiltersOpen(false);
              setIsSortPanelOpen(false);
              setIsCellDetailsHistoryOpen(false);
              setIsAlertsOpen(false);
            }}
            onCellEdited={(rowId, periodKey) => {
              // Keep the Charts panel in sync IF it's already open (focus the edited row and
              // snap the composition to the edited period) — but never auto-open it on edit.
              if (!isChartsOpen) return;
              setChartsFocusRowId(rowId);
              setChartsBreadcrumb([{ id: rowId, name: resolveChartRowName(rowId) }]);
              setChartsFocusPeriod(periodKey);
              setChartsFocusPeriodSignal((s) => s + 1);
            }}
            onDrillToRowReady={(handler) => { drillToRowRef.current = handler; }}
            initialFocusedCell={mapToHierarchicalFocus(dimensionsTimeGridFocusRef.current)}
            onFocusedCellChange={(focus) => { 
              hierarchicalGridFocusRef.current = focus;
              setCurrentFocusedCell(focus);
              // Sync selectedCells when focus changes (single-click behavior)
              if (focus) {
                const cellKey = `${focus.rowId}-${focus.monthKey}`;
                // Only sync if we're in single-select mode (not multi-selecting)
                if (selectedCellsRef.current.size <= 1) {
                  setSelectedCells(new Set([cellKey]));
                  selectedCellsRef.current = new Set([cellKey]);
                  selectedCellsOrderRef.current = [cellKey];
                  setSelectedCellsOrder([cellKey]);
                }
              }
            }}
            searchTerm={gridSearch}
            onEditHistory={addDraftEditHistory}
            onCommitDrafts={commitDraftsToHistory}
            onClearDrafts={clearDrafts}
            onAfterSave={() => {
              // Close all side panels after save
              setIsCellDetailsHistoryOpen(false);
              setIsSettingsOpen(false);
              setIsFiltersOpen(false);
              // Arc 5 — committing the Slack-approved amendment resolves the risk: the
              // e-motor upside is now under contract, so clear the red warning cell and
              // dismiss the alert (+ bell dot). This save closes the loop.
              if (arc5AmendmentPendingRef.current) {
                arc5AmendmentPendingRef.current = false;
                setRiskCellKeys(new Set());
                setRiskResolved(false);
                pendingRiskCellRef.current = null;
                setArc5AlertActive(false);
                setArc5Unread(false);
                return;
              }
              // Arc 5 — on saving the FY26 commercial plan, the Next-Best-Action Agent turns the
              // flagged Midwest e-motor risk into a drafted amendment. Surface the alert (+ bell dot).
              if (hasPredictedBaseline(data)) {
                setArc5AlertActive(true);
                setArc5Unread(true);
                // Flag the bell (red dot) but don't auto-open the Alerts & Tasks
                // panel — let the user open it when they choose to.
              }
              // The saved June override on Sales Manager Target Quantity turns red with a warning
              // icon (above committed agreement). It doesn't stop at the edited total: the flag
              // traces the E-Motor Housing lineage in June (Acme Partners → North America →
              // Light Trucks → Midwest Assembly → E-Motor Housing), so the risk cascades down
              // the generations and originates at the E-Motor Housing leaf.
              if (pendingRiskCellRef.current) {
                const { keys } = computeEMotorRiskLineage(data as any[]);
                // Always include the edited total itself so the top of the chain is flagged
                // even if the lineage walk can't resolve E-Motor Housing.
                keys.add(pendingRiskCellRef.current);
                setRiskCellKeys(keys);
              }
            }}
            onAddAdjustmentNote={addAdjustmentNote}
            riskCellKeys={riskCellKeys}
            chartActiveRowId={isChartsOpen ? (gridChartSourceRow?.id ?? null) : null}
            riskResolved={riskResolved}
            onViewNextBestAction={() => {
              setIsAlertsOpen(false);
              setArc5Unread(false);
              setArc5AutoStart(ARC5_START_PROMPT);
              openAgentforce();
            }}
            agreementRiskCellKeys={agreementRiskCellKeys}
            dismissedAgreementWarningKeys={dismissedAgreementWarningKeys}
            agreementAssociatedTooltip={agreementAssociatedTooltip}
            onAgreementRiskExpand={(rowId) => {
              // Anchored to the clicked red cell: open one level to its children, then follow only
              // the red-warning children downward until the last red parent with a red child.
              // Non-red branches stay collapsed, so the page never expands the whole hierarchy.
              const ids = computeRedChainExpandIds(rowId, data, agreementRiskCellKeys);
              if (ids.length) expandRowsRef.current?.(ids);
            }}
            onAskAgentforce={(payload) => {
              setIsAlertsOpen(false);
              setAgentCellQA(payload);
              openAgentforce();
            }}
            cellEditHistory={mergedEditHistory}
            onCellFocusWithHistory={handleCellFocusWithHistory}
            lockedCells={lockedCells}
            readCells={readCells}
            onApprovalStatusChangeViewHistory={(cellKey) => {
              // Parse cellKey to get rowId and timeKey
              const parts = cellKey.split('-');
              const timeKey = parts[parts.length - 1];
              const rowId = parts.slice(0, -1).join('-');
              setCurrentFocusedCell({ rowId, monthKey: timeKey });
              setIsCellDetailsHistoryOpen(true);
              setIsSettingsOpen(false);
              setIsFiltersOpen(false);
            }}
            onApprovalStatusChangeMarkAsRead={(cellKey) => {
              setReadCells((prev: string[]) => {
                const newSet = new Set(prev);
                newSet.add(cellKey);
                return [...Array.from(newSet)];
              });
            }}
            readonlyMeasureIds={readonlyMeasureIds}
            isAdjustmentGroupSelected={selectedMeasureSubgroup.has('Adjustment Measures')}
            onMeasureGroupChange={setSelectedMeasureSubgroup}
            measureGroupContext={measureGroupContext}
            onMeasureGroupContextChange={(measureId: string, groupContext: string) => {
              setMeasureGroupContext(prev => {
                const newMap = new Map(prev);
                newMap.set(measureId, groupContext);
                return newMap;
              });
            }}
            sharedMeasureIds={sharedMeasureIds}
            onUndoHandler={(handler) => { undoHandlerRef.current = handler; }}
            onRedoHandler={(handler) => { redoHandlerRef.current = handler; }}
            onCanUndoChange={setCanUndo}
            onCanRedoChange={setCanRedo}
            onCellContextMenu={handleContextMenu}
            selectedCells={selectedCells}
            onCellSelect={handleCellSelect}
            onKeyboardSelect={handleKeyboardSelect}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseMove={handleCellMouseMove}
            lastSelectedCell={lastSelectedCell}
            onFillHandleDragStart={handleFillHandleDragStart}
            onFillHandleDragMove={handleFillHandleDragMove}
            onFillHandleDragEnd={handleFillHandleDragEnd}
            onCellChangeHandlerReady={(handler) => {
              cellChangeHandlerRef.current = handler;
            }}
            onGetCurrentCellValueReady={(handler: (rowId: string, monthKey: string) => number) => {
              getCurrentCellValueRef.current = handler;
            }}
            onEditingCellChange={(cellKey) => {
              setEditingCellKey(cellKey);
              // Clear selection when entering edit mode
              if (cellKey) {
                setSelectedCells(prev => {
                  // Remove the editing cell from selection if it's there
                  const newSelection = new Set(prev);
                  newSelection.delete(cellKey);
                  return newSelection;
                });
              }
            }}
            onSavedImpactedCellsReady={(cells) => {
              console.log('[ForecastingGrid] Received savedImpactedCells update:', Array.from(cells.keys()));
              setSavedImpactedCells(cells);
              savedImpactedCellsRef.current = cells; // Update ref immediately for synchronous access
            }}
            visibleMeasureIds={visibleMeasureIds}
            onToggleShowOnlyImpactedKPIChange={(checked) => {
              setShowOnlyImpactedKPI(checked);
              if (checked) {
                // Close all side panels when "Show Only Impacted Measures" is checked
                setIsCellDetailsHistoryOpen(false);
                setIsSettingsOpen(false);
                setIsFiltersOpen(false);
              }
            }}
            onImpactedMeasuresInfoReady={(info) => {
              setImpactedMeasuresCount(info.count);
              setShowOnlyImpactedKPI(info.showOnlyImpactedKPI);
            }}
            onToggleShowOnlyImpactedKPIHandlerReady={(handler) => {
              toggleShowOnlyImpactedKPIHandlerRef.current = handler;
            }}
            onGetVisibleRowsReady={(handler) => {
              getVisibleRowsRef.current = handler;
            }}
            onGetVisibleTimeKeysReady={(handler) => {
              getVisibleTimeKeysRef.current = handler;
            }}
            onScrollToMeasureReady={(handler) => {
              scrollToMeasureRef.current = handler;
            }}
            showAllPeriods={showAllPeriods}
            startPeriod={startPeriod}
            endPeriod={endPeriod}
            newlyAddedMeasureIds={newlyAddedMeasureIds}
            frozenColumns={showAdditionalFrozenColumns ? selectedFrozenColumns : []}
            showAdditionalFrozenColumns={showAdditionalFrozenColumns}
            subColumns={showSubColumns ? [
              ...selectedSubColumns,
              ...effectiveConditionalFormattingRules
                .filter(r => r.mode === 'createColumns' && r.isActive)
                .map(r => ({ id: r.id, name: r.name })),
            ] : []}
            globalSortConfig={globalSortConfig}
            approvalRequests={approvalRequests}
            onApprovalUpdate={handleApprovalUpdate}
            onApprovalAction={handleApprovalAction}
            conditionalFormattingRules={effectiveConditionalFormattingRules}
            conditionalFormattingColorScaleMerge={applyCfRulesAsColorScale}
            isDesignSystemRulesEnabled={isDesignSystemRulesEnabled}
            onRowHidingFiltersChange={setHierarchyRowHidingFromGrid}
            externalColumnFilters={externalColumnFilters}
        />
          </>
          )}
        </div>
        <SettingsPanel 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)}
          dimensionLevels={dimensionScheme}
          selectedDimensionLevels={selectedDimensionLevels}
          onDimensionLevelsChange={handleDimensionLevelsChange}
          selectedTimeGranularities={selectedTimeGranularities}
          onTimeGranularitiesChange={handleTimeGranularitiesChange}
          columnWidth={columnWidth}
          onColumnWidthChange={setColumnWidth}
          onExpandAllRows={handleExpandAllRows}
          onCollapseAllRows={handleCollapseAllRows}
          selectedMeasureSubgroup={selectedMeasureSubgroup}
          onMeasureSubgroupChange={setSelectedMeasureSubgroup}
          selectedLayout={selectedLayoutState}
          onLayoutChange={handleLayoutChange}
          measures={data}
          onMeasuresReorder={handleMeasuresReorder}
          visibleMeasureIds={visibleMeasureIds}
          autoLockMeasureIds={autoLockMeasureIds}
          showAllPeriods={showAllPeriods}
          onShowAllPeriodsChange={setShowAllPeriods}
          startPeriod={startPeriod}
          onStartPeriodChange={setStartPeriod}
          endPeriod={endPeriod}
          onEndPeriodChange={setEndPeriod}
          showAdditionalFrozenColumns={showAdditionalFrozenColumns}
          onShowAdditionalFrozenColumnsChange={setShowAdditionalFrozenColumns}
          onEditFrozenColumns={() => setIsEditFrozenColumnsModalOpen(true)}
          showSubColumns={showSubColumns}
          onShowSubColumnsChange={setShowSubColumns}
          onEditSubColumns={() => setIsEditSubColumnsModalOpen(true)}
          showChartArea={showChartArea}
          onShowChartAreaChange={setShowChartArea}
          onConfigureCharts={() => setIsConfigureChartsOpen(true)}
          showQuickAccessToolbar={showQuickAccessToolbar}
          onShowQuickAccessToolbarChange={setShowQuickAccessToolbar}
          onConfigureQuickAccess={() => setIsQuickAccessModalOpen(true)}
          conditionalFormattingRules={conditionalFormattingRules}
          onConditionalFormattingRulesChange={handleConditionalFormattingRulesChange}
          onConditionalFormattingPreviewChange={setPreviewConditionalFormattingRule}
          applyCfRulesAsColorScale={applyCfRulesAsColorScale}
          onApplyCfRulesAsColorScaleChange={setApplyCfRulesAsColorScale}
          designSystemRulesEnabled={isDesignSystemRulesEnabled}
          onDesignSystemRulesChange={handleDesignSystemRulesChange}
          selectedCellKey={lastSelectedCell}
          forceFormattingTabSignal={cfLaunchFromSelectionSignal + cfViewFormattingSignal}
          cfLaunchFromSelectionSignal={cfLaunchFromSelectionSignal}
          cfLaunchFromSelectionCellKeys={cfFromSelectionCellKeys}
          selectedCalendarId={selectedCalendarId}
          onCalendarChange={setSelectedCalendarId}
        />
        <EditFrozenColumnsModal
          isOpen={isEditFrozenColumnsModalOpen}
          onClose={() => setIsEditFrozenColumnsModalOpen(false)}
          availableColumns={AVAILABLE_FROZEN_COLUMNS}
          selectedColumns={selectedFrozenColumns}
          onSave={(columns) => {
            setSelectedFrozenColumns(columns);
            setIsEditFrozenColumnsModalOpen(false);
          }}
        />
        <EditSubColumnsModal
          isOpen={isEditSubColumnsModalOpen}
          onClose={() => setIsEditSubColumnsModalOpen(false)}
          availableColumns={AVAILABLE_SUB_COLUMNS.filter(col => !FIXED_SUB_COLUMNS.some(fixed => fixed.id === col.id))}
          selectedColumns={selectedSubColumns}
          fixedColumns={FIXED_SUB_COLUMNS}
          customColumns={customSubColumns}
          onSave={(columns, customColumns) => {
            const mergedColumns = ensureFixedSubColumns(columns);
            setSelectedSubColumns(mergedColumns);
            setCustomSubColumns(customColumns);
            
            // Auto-enable "Show sub columns" if any sub-columns are selected
            if (mergedColumns.length > 0) {
              setShowSubColumns(true);
            }
            
            setIsEditSubColumnsModalOpen(false);
          }}
        />
        <ConfigureChartsModal
          isOpen={isConfigureChartsOpen}
          onClose={() => setIsConfigureChartsOpen(false)}
          charts={chartConfigs}
          onSave={(charts) => {
            setChartConfigs(charts);
            // Opening the configure modal implies the user wants the chart area shown.
            if (charts.length > 0) setShowChartArea(true);
            setIsConfigureChartsOpen(false);
          }}
        />
        <ConfigureQuickAccessModal
          isOpen={isQuickAccessModalOpen}
          onClose={() => setIsQuickAccessModalOpen(false)}
          selectedActions={quickAccessActions}
          onSave={(actions) => {
            setQuickAccessActions(actions);
            if (actions.length > 0) setShowQuickAccessToolbar(true);
            setIsQuickAccessModalOpen(false);
          }}
        />
        <FiltersPanel
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          selectedMeasureSubgroup={selectedMeasureSubgroup}
          onMeasureSubgroupChange={setSelectedMeasureSubgroup}
          selectedDimensionLevels={selectedDimensionLevels}
          onDimensionLevelsChange={handleDimensionLevelsChange}
          data={originalData}
          measures={data}
          visibleMeasureIds={visibleMeasureIds}
          autoLockMeasureIds={autoLockMeasureIds}
          onMeasuresReorder={handleMeasuresReorder}
          showAllPeriods={showAllPeriods}
          onShowAllPeriodsChange={setShowAllPeriods}
          startPeriod={startPeriod}
          onStartPeriodChange={setStartPeriod}
          endPeriod={endPeriod}
          onEndPeriodChange={setEndPeriod}
          onApplyFilters={(filteredData, opts) => {
            setData(filteredData);
            const extra = opts?.ensureMeasureIdsVisible ?? [];
            if (extra.length > 0) {
              setVisibleMeasureIds(prev => {
                const next = new Set(prev);
                extra.forEach(id => next.add(id));
                return next;
              });
            }
          }}
          onActiveFilterCountChange={setActiveFilterCount}
          parentTotalsRollupMode={parentTotalsRollupMode}
          onParentTotalsRollupModeChange={setParentTotalsRollupMode}
          propagateIntoNoMatchRows={propagateIntoNoMatchRows}
          onPropagateIntoNoMatchRowsChange={setPropagateIntoNoMatchRows}
          measureEditDisaggregateToVisibleChildrenOnly={measureEditDisaggregateToVisibleChildrenOnly}
          onMeasureEditDisaggregateToVisibleChildrenOnlyChange={setMeasureEditDisaggregateToVisibleChildrenOnly}
          selectedTimeGranularities={selectedTimeGranularities}
          externalAccounts={externalAccounts}
          externalCategories={externalCategories}
          externalMeasures={externalMeasures}
          onRegisterClearAll={(handler) => { filtersPanelClearAllRef.current = handler; }}
          initialTab={filtersInitialTab}
          initialTabSignal={filtersInitialTabSignal}
          externalFilterLogic={externalFilterLogic}
          externalFilterLogicSignal={externalFilterLogicSignal}
        />
        <ChartsPanel
          isOpen={isChartsOpen}
          onClose={() => setIsChartsOpen(false)}
          row={chartsRow}
          overviewRows={chartsOverviewRows}
          onFocusRow={handleChartsDrill}
          compareRows={compareRows}
          compareCandidates={compareCandidates}
          compareRowIds={compareRowIdSet}
          onToggleCompare={handleToggleCompare}
          onRemoveCompare={(id) => setCompareRowIds((prev) => prev.filter((x) => x !== id))}
          onClearCompare={() => {
            setCompareRowIds([]);
            setCompareReturnRowId(null);
          }}
          onExitCompare={handleExitCompare}
          compareReturnName={compareReturnName}
          measureName={chartsMeasureName}
          subColumns={showSubColumns ? selectedSubColumns : []}
          focusPeriod={chartsFocusPeriod}
          focusPeriodSignal={chartsFocusPeriodSignal}
          breadcrumb={chartsBreadcrumb}
          onDrill={handleChartsDrill}
          onBreadcrumbNav={handleChartsBreadcrumbNav}
          onExpandRow={(rowId) => drillGridToRow(rowId, false)}
          onSelectCell={handleChartsSelectCell}
        />
        <GlobalSortPanel
          isOpen={isSortPanelOpen}
          onClose={() => setIsSortPanelOpen(false)}
          availableColumns={globalSortAvailableColumns}
          initialConfig={globalSortConfig}
          onApply={setGlobalSortConfig}
          dimensionLevels={dimensionScheme}
          showSortCriteriaSection
          sortCriteriaSectionTitle={
            useCalculatedFieldSortUi ? 'Sort by subcolumns' : 'Sort by column'
          }
          sortPickerFieldLabel={useCalculatedFieldSortUi ? 'Subcolumn' : 'Column'}
          placeholderSelectColumn={
            useCalculatedFieldSortUi ? 'Select a subcolumn' : 'Select a column'
          }
          addSortButtonLabel={
            useCalculatedFieldSortUi ? 'Add a subcolumn sort' : 'Add a sort column'
          }
          onOpenSubColumnsModal={() => setIsEditSubColumnsModalOpen(true)}
        />
        <CellDetailsHistoryPanel 
          key={panelKey}
          isOpen={isCellDetailsHistoryOpen} 
          onClose={() => {
            setIsCellDetailsHistoryOpen(false);
            setCellDetailsInitialTab('multi');
            setCellDetailsFocusSection(null);
          }}
          focusedCell={currentFocusedCell}
          data={data}
          layout={selectedLayoutState}
          editHistory={editHistory}
          draftEditHistory={draftEditHistory}
          onAddNote={handlePanelAddNote}
          selectedCells={selectedCells}
          onClearSelection={handleClearSelection}
          onMassUpdate={handleMassUpdate}
          initialTab={cellDetailsInitialTab}
          detailsFocusSection={cellDetailsFocusSection}
          preselectAction={bulkActionPreselect}
          preselectActionSignal={bulkActionPreselectSignal}
          onSetFocusedCell={setCurrentFocusedCell}
          onSingleCellUpdate={handleSingleCellUpdate}
          onToggleCellLock={handleToggleCellLock}
          isCellLocked={isCellLocked}
          getCellValue={getCellValue}
          onSelectSingleCell={handleSelectSingleCell}
          selectedCellsOrder={selectedCellsOrder}
          getSelectedCellsOrder={() => selectedCellsOrderRef.current}
          approvalRequests={approvalRequests}
          isApprovalView={isCellHistoryApprovalView}
          planWideApprovalSubmitted={planWideApprovalSubmitted}
        />

        <AlertsPanel
          isOpen={isAlertsOpen}
          onClose={() => setIsAlertsOpen(false)}
          approvalRequests={approvalRequests}
          editHistory={editHistory}
          data={data}
          onJumpToCell={(cellKey) => {
            // Select & focus the cell in the grid — visual highlight without opening any panel
            handleSelectSingleCell(cellKey);
            const parts = cellKey.split('-');
            const monthKey = parts[parts.length - 1];
            const rowId = parts.slice(0, -1).join('-');
            setCurrentFocusedCell({ rowId, monthKey });
          }}
          onViewCellHistory={(cellKey) => {
            // Focus the cell AND open Edit Info history panel (for notification cards)
            const parts = cellKey.split('-');
            const monthKey = parts[parts.length - 1];
            const rowId = parts.slice(0, -1).join('-');
            setCurrentFocusedCell({ rowId, monthKey });
            setIsCellDetailsHistoryOpen(true);
            setIsAlertsOpen(false);
          }}
          reviewApprovalCard={reviewApprovalCard}
          onDismissReviewApprovalCard={() => setReviewApprovalCard(null)}
          onFocusGrid={handleFocusGrid}
          onAskAgentforce={(prompt) => {
            setIsAlertsOpen(false);
            setArc5AutoStart(prompt);
            openAgentforce();
          }}
          nextBestActionAlert={arc5AlertActive ? {
            title: 'Midwest e-motor ramp above committed agreement',
            summary: 'Acme Partners · Midwest Assembly — E-Motor Housing ramp is ~18% above the committed agreement.',
            detail: 'Agentforce drafted an amendment to the Midwest Sales Agreement and routed it to Slack for your approval.',
            focusParams: { searchTerm: 'E-Motor Housing' },
            onViewRecommendations: () => {
              setIsAlertsOpen(false);
              setArc5Unread(false);
              setArc5AutoStart(ARC5_START_PROMPT);
              openAgentforce();
            },
          } : null}
        />

        <AgentforcePanel
          isOpen={isAgentforceOpen}
          onClose={closeAgentforce}
          data={originalData}
          onShowOnGrid={handleAgentShowOnGrid}
          onEditFilters={handleAgentEditFilters}
          onShowConditionalFormatting={handleAgentShowConditionalFormatting}
          onShowSort={handleAgentShowSort}
          autoStartPrompt={arc5AutoStart}
          onAutoStartConsumed={() => setArc5AutoStart(null)}
          autoStartQA={agentCellQA}
          onAutoStartQAConsumed={() => setAgentCellQA(null)}
          onRevealMeasure={handleAgentRevealMeasure}
          onCreateScenarios={setAgentScenarios}
        />

        {/* Cell Edit Info Popover - shown when a cell with edit history is focused */}
        {editInfoPopover && editInfoPopover.entry && (
          <CellEditInfoPopover
            entry={editInfoPopover.entry}
            position={editInfoPopover.position}
            isLocked={editInfoPopover.isLocked || false}
            lockedValue={editInfoPopover.isLocked ? editInfoPopover.cellValue : undefined}
            measureName={editInfoPopover.measureName}
            approvalSummary={(() => {
              const approval = approvalRequests.get(editInfoPopover.cellKey);
              if (!approval || approval.status !== 'pending') return undefined;
              const list = approval.approvers;
              if (list && list.length > 0) {
                return {
                  approvedCount: list.filter(
                    (a) => a.status === 'approved' || a.status === 'approvedWithCondition'
                  ).length,
                  requestedCount: list.length,
                };
              }
              // Legacy pending row without per-approver list — treat as single approver
              return { approvedCount: 0, requestedCount: 1 };
            })()}
            isRiskCell={riskCellKeys.has(editInfoPopover.cellKey) && !riskResolved}
            impactRoute={(() => {
              const ck = editInfoPopover.cellKey;
              const ld = ck.lastIndexOf('-');
              const rowId = ld > 0 ? ck.slice(0, ld) : ck;
              const path = buildHierarchyPath(rowId, data); // [root … current]
              // Name the SOURCE of the warning — the top-level account total (Acme Partners)
              // whose edit cascaded down this lineage — not the current impacted row.
              const rowName = path.length ? path[0] : (editInfoPopover.measureName || 'this cell');
              return { rowName };
            })()}
            isRiskResolved={riskCellKeys.has(editInfoPopover.cellKey) && riskResolved}
            onViewNextBestAction={() => {
              handleCloseEditInfoPopover();
              setIsAlertsOpen(false);
              setArc5Unread(false);
              setArc5AutoStart(ARC5_START_PROMPT);
              openAgentforce();
            }}
            onViewHistory={() => handleViewEditHistory(editInfoPopover.cellKey)}
            onMarkAsRead={() => {
              if (editInfoPopover.cellKey) handleShowDetailsFromPopover(editInfoPopover.cellKey);
            }}
            onClose={handleCloseEditInfoPopover}
          />
        )}

        {/* Cell Context Menu - shown on right-click */}
        {contextMenu && (
          <CellContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            onClose={handleCloseContextMenu}
            onCopy={handleContextCopy}
            onPaste={handleContextPaste}
            onToggleLock={handleContextToggleLock}
            onMassUpdate={handleContextMassUpdate}
            onViewEditHistory={handleContextViewEditHistory}
            onViewExplainability={handleContextViewExplainability}
            onMarkAsRead={handleContextMarkAsRead}
            isLocked={contextMenu.isLocked}
            canPaste={clipboardValue !== null}
            isEditable={contextMenu.isEditable}
            hasMultipleSelection={selectedCells.size > 1}
            hasApprovalSelection={hasApprovalSelection}
            pendingApprovalCount={pendingApprovalCount}
            onBulkApprove={handleBulkApprove}
            onBulkReject={handleBulkReject}
            onBulkRequestMoreInfo={handleBulkRequestMoreInfo}
            onAddFormattingRule={handleContextAddFormattingRule}
            onRequestApproval={handleContextRequestApproval}
            onCellActions={handleContextCellActions}
            onShowAssociatedCells={handleContextShowAssociatedCells}
            showAssociatedCells={!!agreementRiskCellKeys?.has(contextMenu.cellKey) && !dismissedAgreementWarningKeys.has(contextMenu.cellKey)}
          />
        )}

        {/* CF Rule from Selection — standalone modal outside SettingsPanel */}
        <ConditionalFormattingRuleModal
          isOpen={cfFromSelectionOpen}
          onClose={() => {
            setCfFromSelectionOpen(false);
            setPreviewConditionalFormattingRule(null);
          }}
          onPreview={setPreviewConditionalFormattingRule}
          onSave={(rule) => {
            setConditionalFormattingRules(prev => {
              const next = [...prev, { ...rule, priority: prev.length }];
              if (next.some(r => r.mode === 'modifyCells' && r.isActive)) {
                setIsDesignSystemRulesEnabled(false);
              }
              return next;
            });
            setPreviewConditionalFormattingRule(null);
            setCfFromSelectionOpen(false);
          }}
          mode="modifyCells"
          availableMeasures={data}
          prefillCellKeys={cfFromSelectionCellKeys}
        />

        {/* Cell Explainability Modal */}
        {explainabilityModal && (
          <CellExplainabilityModal
            isOpen={explainabilityModal.isOpen}
            onClose={handleCloseExplainabilityModal}
            cellKey={explainabilityModal.cellKey}
            cellValue={explainabilityModal.cellValue}
            sourceRecords={generateSourceRecords(explainabilityModal.cellKey, explainabilityModal.cellValue)}
          />
        )}
      </div>
      <ScenarioDrawer
        onApplyToGrid={applyScenarioToGrid}
        onPromote={(name) => console.log('Promote scenario to plan:', name)}
        incomingScenarios={agentScenarios}
      />
    </div>
  );
};

export default ForecastingGridDFDemo;

