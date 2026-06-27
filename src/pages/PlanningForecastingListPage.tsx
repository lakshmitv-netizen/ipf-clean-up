import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import ExportCsvModal from '../components/ExportCsvModal';
import { APP_USERS } from '../contexts/UserContext';
import { useIndustry, getGridPathForIndustry } from '../contexts/IndustryContext';
import '../styles/pages/PlanningForecastingListPage.css';
import '../styles/components/SettingsPanel.css';
import {
  getPeriodOptionsForGranularity,
  granularitySingularLabel,
  type PlanGranularity,
} from '../utils/planPeriodOptions';
import { getMockData } from '../data/mockData';
import { adjustmentMeasuresData } from '../data/adjustmentMeasuresData';
import type { IndustryType } from '../contexts/IndustryContext';
import type { MeasureData } from '../types';

/** Root measures shown in Create Plan → Access: main grid tree plus adjustment pipeline measures. */
function getAccessControlRootMeasures(industry: IndustryType | null): MeasureData[] {
  const primary = getMockData(industry);
  const seen = new Set(primary.map((m) => m.id));
  const extra = adjustmentMeasuresData.filter((m) => !seen.has(m.id));
  return [...primary, ...extra];
}

/** Per measure cell — View vs Edit only (access modal). */
type AccessScopePermission = 'View' | 'Edit';

const ACCESS_SCOPE_PERMISSION_OPTIONS: AccessScopePermission[] = ['View', 'Edit'];

type AccessTableFilterColumn = 'person' | 'jobRole' | 'subset' | 'measure' | 'access';
type AccessTableSortColumn = AccessTableFilterColumn;

interface AccessControlPerson {
  id: string;
  name: string;
  jobRole: string;
}

/** Job titles aligned with demo users (approval / user switcher roster). */
const ACCESS_CONTROL_ROLE_BY_USER_ID: Record<string, string> = {
  'john-carter': 'Key Account Manager',
  'alice-brennan': 'Key Account Manager',
  'bob-okoro': 'Key Account Manager',
  'carol-singh': 'Key Account Manager',
  'david-lee': 'Regional Sales Director',
};

/** Extra demo people beyond APP_USERS */
const ACCESS_CONTROL_EXTRA_PEOPLE: AccessControlPerson[] = [
  { id: 'elena-martinez', name: 'Elena Martinez', jobRole: 'Regional Sales Director' },
  { id: 'marcus-reid', name: 'Marcus Reid', jobRole: 'Regional Sales Director' },
  { id: 'priya-nair', name: 'Priya Nair', jobRole: 'Vice President' },
  { id: 'sam-oconnell', name: "Sam O'Connell", jobRole: 'Vice President' },
  { id: 'ryan-cole', name: 'Ryan Cole', jobRole: 'Vice President' },
  { id: 'omar-hassan', name: 'Omar Hassan', jobRole: 'Senior Vice President' },
  { id: 'nina-vogel', name: 'Nina Vogel', jobRole: 'Senior Vice President' },
  { id: 'james-wu', name: 'James Wu', jobRole: 'Senior Vice President' },
];

function buildAccessControlPeople(): AccessControlPerson[] {
  const fromAppUsers: AccessControlPerson[] = APP_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    jobRole: ACCESS_CONTROL_ROLE_BY_USER_ID[u.id] ?? 'Contributor',
  }));
  return [...fromAppUsers, ...ACCESS_CONTROL_EXTRA_PEOPLE];
}

function accessMeasureCellKey(personId: string, measureId: string): string {
  return `${personId}:measure:${measureId}`;
}

/** Stable key for flattened row selection (person × measure). */
function accessFlattenedRowKey(personId: string, measureId: string): string {
  return `${personId}|${measureId}`;
}

interface AccessSearchableMultiSelectProps {
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Used when `ariaLabelledby` is not set (accessible name on trigger). */
  ariaLabel: string;
  /** Prefer visible field label (e.g. id of span.list-page-modal-label). */
  ariaLabelledby?: string;
  /** Raise above column-header popovers (default 100002). */
  menuZIndex?: number;
}

/** Searchable multiselect for access table filters (above grid); fixed menu avoids modal overflow clipping. */
const AccessSearchableMultiSelect: React.FC<AccessSearchableMultiSelectProps> = ({
  options,
  values,
  onChange,
  placeholder = 'All',
  ariaLabel,
  ariaLabelledby,
  menuZIndex = 100002,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  const measureMenu = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const gap = 4;
    const below = window.innerHeight - r.bottom - gap - 16;
    const maxH = Math.min(260, Math.max(100, below));
    setMenuStyle({
      position: 'fixed',
      top: r.bottom + gap,
      left: r.left,
      width: Math.max(r.width, 152),
      maxHeight: maxH,
      zIndex: menuZIndex,
    });
  }, [menuZIndex]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    measureMenu();
    const ro = new ResizeObserver(() => measureMenu());
    const el = triggerRef.current;
    if (el) ro.observe(el);
    window.addEventListener('resize', measureMenu);
    document.addEventListener('scroll', measureMenu, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureMenu);
      document.removeEventListener('scroll', measureMenu, true);
    };
  }, [open, measureMenu]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const summary =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? values[0]
        : `${values.length} selected`;

  const toggle = (opt: string) => {
    onChange(values.includes(opt) ? values.filter((x) => x !== opt) : [...values, opt]);
  };

  return (
    <div className="list-page-modal-access-ms" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`list-page-modal-access-ms-trigger${open ? ' list-page-modal-access-ms-trigger--open' : ''}`}
        aria-labelledby={ariaLabelledby}
        aria-label={ariaLabelledby ? undefined : ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={values.length > 1 ? values.join(', ') : undefined}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setSearch('');
        }}
      >
        <span className={values.length === 0 ? 'list-page-modal-access-ms-summary--placeholder' : ''}>{summary}</span>
        <svg className="list-page-modal-access-ms-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && menuStyle && (
        <div
          ref={menuRef}
          className="list-page-modal-access-ms-menu"
          style={menuStyle}
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
        >
          <div className="list-page-modal-access-ms-menu-head">
            <input
              type="search"
              className="list-page-modal-access-ms-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${ariaLabel}`}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {values.length > 0 && (
              <button
                type="button"
                className="list-page-modal-access-ms-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange([])}
              >
                Clear
              </button>
            )}
          </div>
          <div className="list-page-modal-access-ms-list">
            {filteredOptions.length === 0 ? (
              <div className="list-page-modal-access-ms-empty">No matching options</div>
            ) : (
              filteredOptions.map((opt) => (
                <label key={opt} className="list-page-modal-access-ms-option">
                  <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
                  <span>{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** Access matrix column header: label + filter (opens panel) + sort (cycles asc → desc → off). */
interface AccessTableColumnHeaderProps {
  column: AccessTableFilterColumn;
  label: string;
  filterActive: boolean;
  filterPanelOpen: boolean;
  sortColumn: AccessTableSortColumn | null;
  sortDir: 'asc' | 'desc';
  onFilterClick: (anchor: HTMLElement) => void;
  onSortClick: () => void;
}

const AccessTableColumnHeader: React.FC<AccessTableColumnHeaderProps> = ({
  column,
  label,
  filterActive,
  filterPanelOpen,
  sortColumn,
  sortDir,
  onFilterClick,
  onSortClick,
}) => {
  const sortOn = sortColumn === column;
  const sortLabel = !sortOn
    ? `Sort ${label}: not applied. Activate for ascending.`
    : sortDir === 'asc'
      ? `Sort ${label}: ascending. Click for descending.`
      : `Sort ${label}: descending. Click to clear sort.`;

  return (
    <div className="list-page-modal-access-col-head-row">
      <span className="list-page-modal-access-col-head-text">{label}</span>
      <div className="list-page-modal-access-col-head-actions">
        <button
          type="button"
          className={`list-page-modal-access-col-filter-btn${filterActive ? ' list-page-modal-access-col-filter-btn--active' : ''}${
            filterPanelOpen ? ' list-page-modal-access-col-filter-btn--open' : ''
          }`}
          aria-expanded={filterPanelOpen}
          aria-haspopup="dialog"
          aria-controls={filterPanelOpen ? 'access-col-filter-panel' : undefined}
          title="Filter"
          aria-label={`Filter ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onFilterClick(e.currentTarget);
          }}
        >
          <svg className="list-page-modal-access-col-filter-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path
              fill="currentColor"
              d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`list-page-modal-access-col-sort-btn${sortOn && sortDir === 'asc' ? ' list-page-modal-access-col-sort-btn--asc' : ''}${
            sortOn && sortDir === 'desc' ? ' list-page-modal-access-col-sort-btn--desc' : ''
          }`}
          title="Sort"
          aria-label={sortLabel}
          onClick={(e) => {
            e.stopPropagation();
            onSortClick();
          }}
        >
          <svg className="list-page-modal-access-col-sort-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path className="list-page-modal-access-col-sort-up" fill="currentColor" d="M12 6L7 14h10L12 6z" />
            <path className="list-page-modal-access-col-sort-down" fill="currentColor" d="M12 18l5-8H7l5 8z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

interface ForecastRecord {
  id: string;
  name: string;
  adminTemplate: string;
  fiscalYear: string;
  rootRecord: string;
  status: string;
}

/** Same hierarchy grouping as grid Settings → Dimension levels (SettingsPanel). */
interface PlanModalDimensionLevel {
  id: string;
  name: string;
  hierarchy: string;
}

const PLAN_MODAL_DIMENSION_LEVELS: PlanModalDimensionLevel[] = [
  { id: 'account', name: 'Accounts', hierarchy: 'Account Hierarchy' },
  { id: 'category', name: 'Category', hierarchy: 'Product Hierarchy' },
  { id: 'product', name: 'Product', hierarchy: 'Product Hierarchy' },
];

const PLAN_MODAL_ACCOUNT_ICON = '/new_account.svg';
const PLAN_MODAL_CATEGORY_ICON = '/category.svg';
const PLAN_MODAL_PRODUCT_ICON = '/product.svg';

function buildPlanModalDimensionHierarchyGroups(): Record<string, PlanModalDimensionLevel[]> {
  const groups: Record<string, PlanModalDimensionLevel[]> = {};
  PLAN_MODAL_DIMENSION_LEVELS.forEach((level) => {
    if (!groups[level.hierarchy]) groups[level.hierarchy] = [];
    groups[level.hierarchy].push(level);
  });
  return groups;
}

const PLAN_MODAL_DIMENSION_HIERARCHY_GROUPS = buildPlanModalDimensionHierarchyGroups();

/** Plan wizard “Measure category” — two options only (unchanged for grid/settings). */
const PLAN_MODAL_MEASURE_SUBGROUP_OPTIONS = [
  { value: 'Revenue & Quantity Measures' },
  { value: 'Adjustment Measures' },
] as const;

/**
 * Demo-only labels for Create Plan → Access “Measure subset” column (does not affect hierarchical grid).
 */
const ACCESS_DEMO_MEASURE_SUBSET_LABELS = [
  'Adjustment Measures',
  'Planning Measures',
  'Revenue & Quantity Measures',
  'Revenue Measures',
  'Volume Measures',
] as const;

type AccessMeasureSubsetLabel = (typeof ACCESS_DEMO_MEASURE_SUBSET_LABELS)[number];

/** Consumer-style adjustment metrics → Adjustment bucket (demo access modal only). */
const ACCESS_MEASURE_SUBSET_ADJUSTMENT_STYLE_IDS = new Set<string>([
  'measure-promo-spend',
  'measure-days-inventory',
  'measure-trade-spend-roi',
]);

const ACCESS_MEASURE_SUBSET_PLANNING_IDS = new Set<string>(
  adjustmentMeasuresData.map((m) => m.id),
);

function getAccessMeasureSubsetLabel(measureId: string, measureName: string): AccessMeasureSubsetLabel {
  if (ACCESS_MEASURE_SUBSET_ADJUSTMENT_STYLE_IDS.has(measureId)) {
    return 'Adjustment Measures';
  }
  if (ACCESS_MEASURE_SUBSET_PLANNING_IDS.has(measureId)) {
    return 'Planning Measures';
  }
  const n = measureName.toLowerCase();
  if (/\brevenue\b/.test(n) || /\broi\b/.test(n) || (n.includes('spend') && n.includes('%'))) {
    return 'Revenue Measures';
  }
  if (
    /\bquantity\b/.test(n) ||
    /\bvolume\b/.test(n) ||
    n.includes('market share') ||
    (n.includes('days') && n.includes('inventory'))
  ) {
    return 'Volume Measures';
  }
  return 'Revenue & Quantity Measures';
}

function buildInitialAccessMatrix(industry: IndustryType | null): Record<string, AccessScopePermission> {
  const initial: Record<string, AccessScopePermission> = {};
  const people = buildAccessControlPeople();
  const measures = getAccessControlRootMeasures(industry);
  people.forEach((person) => {
    measures.forEach((m) => {
      initial[accessMeasureCellKey(person.id, m.id)] = 'View';
    });
  });
  return initial;
}

const mockRecords: ForecastRecord[] = [
  { id: 'fy26', name: 'Planning & Forecasting FY26', adminTemplate: 'KAMPlanConfig', fiscalYear: '2026', rootRecord: 'Acme', status: 'Draft' },
  { id: 'fy25', name: 'Planning & Forecasting FY25', adminTemplate: 'KAMForecastConfig', fiscalYear: '2025', rootRecord: 'MagnaDrive', status: 'Draft' },
  { id: 'fy24', name: 'Planning & Forecasting FY24', adminTemplate: 'RMPlanConfig', fiscalYear: '2024', rootRecord: 'Zenith Industries', status: 'Draft' },
  { id: 'fy23', name: 'Planning & Forecasting FY23', adminTemplate: 'RMForecastConfig', fiscalYear: '2023', rootRecord: 'Acme NYC', status: 'Draft' },
  { id: 'fy22', name: 'Planning & Forecasting FY22', adminTemplate: 'KAMPlanConfig', fiscalYear: '2022', rootRecord: 'TRN 750 - A', status: 'Draft' },
  { id: 'fy21', name: 'Planning & Forecasting FY21', adminTemplate: 'KAMForecastConfig', fiscalYear: '2021', rootRecord: 'TRN 750 - B', status: 'Draft' },
];

const INITIAL_PLAN_FORM_RECORD = {
  planName: '',
  status: 'draft',
  fiscalYear: '',
  planGranularity: 'weeks' as PlanGranularity,
  startWeekId: '',
  endWeekId: '',
  planTemplate: '',
};

const ADMIN_TEMPLATE_TO_PLAN_TEMPLATE_ID: Record<string, string> = {
  KAMPlanConfig: 'template-1',
  KAMForecastConfig: 'template-2',
  RMPlanConfig: 'plan-view-3a',
  RMForecastConfig: 'plan-view-3b',
};

function getDefaultPeriodRangeForPlanForm(
  fiscalYearStr: string,
  granularity: PlanGranularity,
): { startWeekId: string; endWeekId: string } {
  const y = parseInt(fiscalYearStr, 10);
  if (Number.isNaN(y)) return { startWeekId: '', endWeekId: '' };
  const opts = getPeriodOptionsForGranularity(y, granularity);
  if (!opts.length) return { startWeekId: '', endWeekId: '' };
  return { startWeekId: opts[0]!.id, endWeekId: opts[opts.length - 1]!.id };
}

const PlanningForecastingListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { industry } = useIndustry();
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [planModalMode, setPlanModalMode] = useState<'create' | 'clone'>('create');
  const [clonePlanDescription, setClonePlanDescription] = useState('');
  const [rowActionMenuRecordId, setRowActionMenuRecordId] = useState<string | null>(null);
  const [rowActionMenuPosition, setRowActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rowActionMenuRef = useRef<HTMLDivElement>(null);
  const [exportCsvModalOpen, setExportCsvModalOpen] = useState(false);
  const [isNextStepModalOpen, setIsNextStepModalOpen] = useState(false);
  const [accessControlMatrix, setAccessControlMatrix] = useState<Record<string, AccessScopePermission>>(
    () => buildInitialAccessMatrix(null),
  );
  const [accessFilterPersonNames, setAccessFilterPersonNames] = useState<string[]>([]);
  const [accessFilterJobRoles, setAccessFilterJobRoles] = useState<string[]>([]);
  const [accessFilterSubsetLabels, setAccessFilterSubsetLabels] = useState<string[]>([]);
  const [accessFilterMeasureNames, setAccessFilterMeasureNames] = useState<string[]>([]);
  const [accessFilterAccessLevels, setAccessFilterAccessLevels] = useState<AccessScopePermission[]>([]);
  const [accessColumnFilterPanel, setAccessColumnFilterPanel] = useState<{
    column: AccessTableFilterColumn;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const accessColumnFilterPanelRef = useRef<HTMLDivElement>(null);
  const [accessSortColumn, setAccessSortColumn] = useState<AccessTableSortColumn | null>(null);
  const [accessSortDir, setAccessSortDir] = useState<'asc' | 'desc'>('asc');
  const [accessBulkSelectedRowKeys, setAccessBulkSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [accessBulkPopoverOpen, setAccessBulkPopoverOpen] = useState(false);
  const [bulkEditPermission, setBulkEditPermission] = useState<AccessScopePermission>('View');
  const bulkEditButtonRef = useRef<HTMLButtonElement>(null);
  const bulkPopoverRef = useRef<HTMLDivElement>(null);
  const accessHeaderSelectAllRef = useRef<HTMLInputElement>(null);
  const [bulkPopoverPosition, setBulkPopoverPosition] = useState<{
    top: number;
    left: number;
    nibLeft: number;
    placement: 'below' | 'above';
  } | null>(null);

  const accessControlPeople = useMemo(() => buildAccessControlPeople(), []);

  const accessMeasureRows = useMemo(
    () =>
      getAccessControlRootMeasures(industry).map((m) => ({
        id: m.id,
        name: m.name,
        subsetLabel: getAccessMeasureSubsetLabel(m.id, m.name),
      })),
    [industry],
  );

  const accessSubsetFilterOptions = useMemo(
    () => [...ACCESS_DEMO_MEASURE_SUBSET_LABELS].sort((a, b) => a.localeCompare(b)),
    [],
  );

  const accessPersonFilterOptions = useMemo(
    () => [...new Set(accessControlPeople.map((p) => p.name))].sort((a, b) => a.localeCompare(b)),
    [accessControlPeople],
  );

  const accessJobRoleFilterOptions = useMemo(
    () => [...new Set(accessControlPeople.map((p) => p.jobRole))].sort((a, b) => a.localeCompare(b)),
    [accessControlPeople],
  );

  const accessMeasureFilterOptions = useMemo(
    () => accessMeasureRows.map((m) => m.name).sort((a, b) => a.localeCompare(b)),
    [accessMeasureRows],
  );

  const filteredAccessControlPeople = useMemo(() => {
    return accessControlPeople.filter((p) => {
      if (accessFilterPersonNames.length > 0 && !accessFilterPersonNames.includes(p.name)) return false;
      if (accessFilterJobRoles.length > 0 && !accessFilterJobRoles.includes(p.jobRole)) return false;
      return true;
    });
  }, [accessControlPeople, accessFilterPersonNames, accessFilterJobRoles]);

  type FlatAccessRow = {
    person: (typeof accessControlPeople)[number];
    measure: { id: string; name: string; subsetLabel: AccessMeasureSubsetLabel };
    rowKey: string;
  };

  const baseFlattenedAccessRows = useMemo((): FlatAccessRow[] => {
    const out: FlatAccessRow[] = [];
    filteredAccessControlPeople.forEach((person) => {
      accessMeasureRows.forEach((measure) => {
        out.push({
          person,
          measure,
          rowKey: accessFlattenedRowKey(person.id, measure.id),
        });
      });
    });
    return out;
  }, [filteredAccessControlPeople, accessMeasureRows]);

  const filteredFlattenedAccessRows = useMemo(() => {
    return baseFlattenedAccessRows.filter((row) => {
      if (
        accessFilterSubsetLabels.length > 0 &&
        !accessFilterSubsetLabels.includes(row.measure.subsetLabel)
      ) {
        return false;
      }
      if (accessFilterMeasureNames.length > 0 && !accessFilterMeasureNames.includes(row.measure.name)) {
        return false;
      }
      const perm =
        accessControlMatrix[accessMeasureCellKey(row.person.id, row.measure.id)] ?? 'View';
      if (accessFilterAccessLevels.length > 0 && !accessFilterAccessLevels.includes(perm)) {
        return false;
      }
      return true;
    });
  }, [
    baseFlattenedAccessRows,
    accessFilterSubsetLabels,
    accessFilterMeasureNames,
    accessFilterAccessLevels,
    accessControlMatrix,
  ]);

  const sortedFlattenedAccessRows = useMemo(() => {
    const rows = [...filteredFlattenedAccessRows];
    if (!accessSortColumn) return rows;
    const dir = accessSortDir === 'asc' ? 1 : -1;
    const permRank = (p: AccessScopePermission) => (p === 'View' ? 0 : 1);
    rows.sort((a, b) => {
      let cmp = 0;
      if (accessSortColumn === 'person') {
        cmp = a.person.name.localeCompare(b.person.name);
      } else if (accessSortColumn === 'jobRole') {
        cmp = a.person.jobRole.localeCompare(b.person.jobRole);
      } else if (accessSortColumn === 'subset') {
        cmp = a.measure.subsetLabel.localeCompare(b.measure.subsetLabel);
      } else if (accessSortColumn === 'measure') {
        cmp = a.measure.name.localeCompare(b.measure.name);
      } else {
        const va =
          accessControlMatrix[accessMeasureCellKey(a.person.id, a.measure.id)] ?? 'View';
        const vb =
          accessControlMatrix[accessMeasureCellKey(b.person.id, b.measure.id)] ?? 'View';
        cmp = permRank(va) - permRank(vb);
      }
      if (cmp === 0) {
        cmp =
          a.person.name.localeCompare(b.person.name) ||
          a.measure.name.localeCompare(b.measure.name);
      }
      return cmp * dir;
    });
    return rows;
  }, [filteredFlattenedAccessRows, accessSortColumn, accessSortDir, accessControlMatrix]);

  const accessBulkSelectedCount = accessBulkSelectedRowKeys.size;

  const bulkAccessSelectionLabel = useMemo(() => {
    const n = accessBulkSelectedRowKeys.size;
    if (n === 0) return '';
    return n === 1 ? '1 row selected' : `${n} rows selected`;
  }, [accessBulkSelectedRowKeys]);

  const visibleFlattenedRowKeys = useMemo(
    () => sortedFlattenedAccessRows.map((r) => r.rowKey),
    [sortedFlattenedAccessRows],
  );

  const toggleAccessColumnFilterPanel = useCallback((column: AccessTableFilterColumn, anchorEl: HTMLElement) => {
    setAccessColumnFilterPanel((cur) => {
      if (cur?.column === column) return null;
      const r = anchorEl.getBoundingClientRect();
      const panelWidth = Math.min(340, Math.max(268, r.width + 40));
      let left = r.left;
      const margin = 8;
      if (left + panelWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - panelWidth - margin);
      }
      return { column, top: r.bottom + 6, left, width: panelWidth };
    });
  }, []);

  const cycleAccessColumnSort = useCallback(
    (column: AccessTableSortColumn) => {
      if (accessSortColumn !== column) {
        setAccessSortColumn(column);
        setAccessSortDir('asc');
      } else if (accessSortDir === 'asc') {
        setAccessSortDir('desc');
      } else {
        setAccessSortColumn(null);
      }
    },
    [accessSortColumn, accessSortDir],
  );

  useEffect(() => {
    if (!accessColumnFilterPanel) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (accessColumnFilterPanelRef.current?.contains(t)) return;
      if (t.closest?.('.list-page-modal-access-ms-menu')) return;
      if (t.closest?.('.list-page-modal-access-col-filter-btn')) return;
      if (t.closest?.('.list-page-modal-access-col-sort-btn')) return;
      setAccessColumnFilterPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccessColumnFilterPanel(null);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [accessColumnFilterPanel]);

  useEffect(() => {
    if (!isNextStepModalOpen) setAccessColumnFilterPanel(null);
  }, [isNextStepModalOpen]);

  const allVisibleAccessSelected =
    visibleFlattenedRowKeys.length > 0 &&
    visibleFlattenedRowKeys.every((id) => accessBulkSelectedRowKeys.has(id));

  const someVisibleAccessSelected = visibleFlattenedRowKeys.some((id) =>
    accessBulkSelectedRowKeys.has(id),
  );

  useEffect(() => {
    const el = accessHeaderSelectAllRef.current;
    if (!el) return;
    el.indeterminate = someVisibleAccessSelected && !allVisibleAccessSelected;
  }, [someVisibleAccessSelected, allVisibleAccessSelected]);

  const toggleAccessBulkSelectRow = (rowKey: string) => {
    setAccessBulkSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleAccessBulkSelectAllVisible = () => {
    setAccessBulkSelectedRowKeys((prev) => {
      const next = new Set(prev);
      const everyVisibleSelected =
        visibleFlattenedRowKeys.length > 0 &&
        visibleFlattenedRowKeys.every((id) => next.has(id));
      if (everyVisibleSelected) {
        visibleFlattenedRowKeys.forEach((id) => next.delete(id));
      } else {
        visibleFlattenedRowKeys.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const updateBulkPopoverPosition = useCallback(() => {
    const btn = bulkEditButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverMaxHeight = 280;
    const margin = 8;
    const buttonCenterX = r.left + r.width / 2;

    let left = r.left;
    let top = r.bottom + 8;
    let placement: 'below' | 'above' = 'below';

    if (left + popoverWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popoverWidth - margin);
    }
    if (left < margin) left = margin;

    if (top + popoverMaxHeight > window.innerHeight - margin) {
      top = Math.max(margin, r.top - popoverMaxHeight - 8);
      placement = 'above';
    }

    const nibClamp = 18;
    const nibLeft = Math.min(popoverWidth - nibClamp, Math.max(nibClamp, buttonCenterX - left));

    setBulkPopoverPosition({ top, left, nibLeft, placement });
  }, []);

  useLayoutEffect(() => {
    if (!accessBulkPopoverOpen) {
      setBulkPopoverPosition(null);
      return;
    }
    updateBulkPopoverPosition();
    window.addEventListener('resize', updateBulkPopoverPosition);
    document.addEventListener('scroll', updateBulkPopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updateBulkPopoverPosition);
      document.removeEventListener('scroll', updateBulkPopoverPosition, true);
    };
  }, [accessBulkPopoverOpen, updateBulkPopoverPosition]);

  useEffect(() => {
    if (!accessBulkPopoverOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (bulkPopoverRef.current?.contains(t) || bulkEditButtonRef.current?.contains(t)) return;
      setAccessBulkPopoverOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [accessBulkPopoverOpen]);

  useEffect(() => {
    if (!accessBulkPopoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccessBulkPopoverOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accessBulkPopoverOpen]);

  useEffect(() => {
    if (accessBulkPopoverOpen && accessBulkSelectedCount === 0) {
      setAccessBulkPopoverOpen(false);
    }
  }, [accessBulkPopoverOpen, accessBulkSelectedCount]);

  const handleBulkAccessApply = () => {
    if (accessBulkSelectedRowKeys.size === 0) return;
    setAccessControlMatrix((prev) => {
      const next = { ...prev };
      accessBulkSelectedRowKeys.forEach((rowKey) => {
        const pipe = rowKey.indexOf('|');
        if (pipe <= 0) return;
        const personId = rowKey.slice(0, pipe);
        const measureId = rowKey.slice(pipe + 1);
        if (personId && measureId) {
          next[accessMeasureCellKey(personId, measureId)] = bulkEditPermission;
        }
      });
      return next;
    });
    setAccessBulkPopoverOpen(false);
  };

  const [newRecord, setNewRecord] = useState(() => ({ ...INITIAL_PLAN_FORM_RECORD }));
  const [_selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [_valuesSearchTerm, _setValuesSearchTerm] = useState<string>('');
  const [_showSelectedOnly, _setShowSelectedOnly] = useState<boolean>(false);
  const [_selectedUsers, _setSelectedUsers] = useState<Set<string>>(new Set());
  
  // State for plan configuration combobox
  const [planConfigSearchTerm, setPlanConfigSearchTerm] = useState<string>('');
  const [planConfigDropdownOpen, setPlanConfigDropdownOpen] = useState<boolean>(false);
  const [planConfigDropdownPosition, setPlanConfigDropdownPosition] = useState<{top: number, left: number, width: number} | null>(null);
  const planConfigComboboxRef = useRef<HTMLDivElement>(null);
  
  const [weekStartSearchTerm, setWeekStartSearchTerm] = useState('');
  const [weekEndSearchTerm, setWeekEndSearchTerm] = useState('');
  const [weekStartDropdownOpen, setWeekStartDropdownOpen] = useState(false);
  const [weekEndDropdownOpen, setWeekEndDropdownOpen] = useState(false);
  const [weekStartDropdownPosition, setWeekStartDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [weekEndDropdownPosition, setWeekEndDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const weekStartComboboxRef = useRef<HTMLDivElement>(null);
  const weekEndComboboxRef = useRef<HTMLDivElement>(null);

  const [selectedPlanDimensionLevels, setSelectedPlanDimensionLevels] = useState<Set<string>>(
    () => new Set(['account', 'category', 'product']),
  );
  const [dimensionLevelsDropdownOpen, setDimensionLevelsDropdownOpen] = useState(false);
  const [dimensionLevelsDropdownPosition, setDimensionLevelsDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const dimensionLevelsDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedPlanMeasureSubgroups, setSelectedPlanMeasureSubgroups] = useState<Set<string>>(
    () => new Set(['Revenue & Quantity Measures']),
  );
  const [measureSubgroupModalDropdownOpen, setMeasureSubgroupModalDropdownOpen] = useState(false);
  const [measureSubgroupModalDropdownPosition, setMeasureSubgroupModalDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const measureSubgroupModalDropdownRef = useRef<HTMLDivElement>(null);

  const togglePlanModalDimensionLevel = (levelId: string) => {
    setSelectedPlanDimensionLevels((prev) => {
      const next = new Set(prev);
      if (next.has(levelId)) {
        if (next.size <= 1) return prev;
        next.delete(levelId);
      } else {
        next.add(levelId);
      }
      return next;
    });
  };

  const planModalDimensionLevelCount = selectedPlanDimensionLevels.size;

  const planModalMeasureSubgroupCount = selectedPlanMeasureSubgroups.size;

  const togglePlanModalMeasureSubgroup = (value: string) => {
    setSelectedPlanMeasureSubgroups((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size <= 1) return prev;
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const planModalDimensionLevelIcon = (levelId: string) => {
    if (levelId === 'account') {
      return (
        <img
          src={PLAN_MODAL_ACCOUNT_ICON}
          alt=""
          style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }}
        />
      );
    }
    if (levelId === 'category') {
      return (
        <img
          src={PLAN_MODAL_CATEGORY_ICON}
          alt=""
          style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }}
        />
      );
    }
    if (levelId === 'product') {
      return (
        <img
          src={PLAN_MODAL_PRODUCT_ICON}
          alt=""
          style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }}
        />
      );
    }
    return null;
  };
  
  // Plan configuration options
  const planConfigOptions = [
    { id: 'template-1', name: 'KAMPlanConfig', meta: 'Account Hierarchy Starting at L3 • Followed by Products Hierarchy' },
    { id: 'template-2', name: 'KAMForecastConfig', meta: 'Account Hierarchy Starting at L1 • Followed by Products Hierarchy' },
    { id: 'plan-view-3a', name: 'RMPlanConfig', meta: 'Product Hierarchy Starting at L3 • Followed by Accounts Hierarchy' },
    { id: 'plan-view-3b', name: 'RMForecastConfig', meta: 'Product Hierarchy Starting at L3 • Followed by Products, Users, Territories Hierarchy' }
  ];
  
  // Get selected plan config for display
  const selectedPlanConfig = planConfigOptions.find(opt => opt.id === newRecord.planTemplate);
  
  // Update dropdown position when it opens
  useEffect(() => {
    if (planConfigDropdownOpen && planConfigComboboxRef.current) {
      const rect = planConfigComboboxRef.current.getBoundingClientRect();
      setPlanConfigDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    } else {
      setPlanConfigDropdownPosition(null);
    }
  }, [planConfigDropdownOpen]);
  
  useEffect(() => {
    if (weekStartDropdownOpen && weekStartComboboxRef.current) {
      const rect = weekStartComboboxRef.current.getBoundingClientRect();
      setWeekStartDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setWeekStartDropdownPosition(null);
    }
  }, [weekStartDropdownOpen]);

  useEffect(() => {
    if (weekEndDropdownOpen && weekEndComboboxRef.current) {
      const rect = weekEndComboboxRef.current.getBoundingClientRect();
      setWeekEndDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setWeekEndDropdownPosition(null);
    }
  }, [weekEndDropdownOpen]);

  useEffect(() => {
    if (!isNextStepModalOpen) {
      setAccessFilterPersonNames([]);
      setAccessFilterJobRoles([]);
      setAccessFilterSubsetLabels([]);
      setAccessFilterMeasureNames([]);
      setAccessFilterAccessLevels([]);
      setAccessColumnFilterPanel(null);
      setAccessSortColumn(null);
      setAccessBulkSelectedRowKeys(new Set());
      setAccessBulkPopoverOpen(false);
      return;
    }
    setAccessControlMatrix(buildInitialAccessMatrix(industry));
    setBulkEditPermission('View');
  }, [isNextStepModalOpen, industry]);

  useLayoutEffect(() => {
    if (!dimensionLevelsDropdownOpen) {
      setDimensionLevelsDropdownPosition(null);
      return;
    }

    const updatePosition = () => {
      const el = dimensionLevelsDropdownRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = rect.width;
      const top = rect.bottom + 4;
      let left = rect.left;
      const margin = 8;
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }
      if (left < margin) left = margin;
      setDimensionLevelsDropdownPosition({ top, left, width });
    };

    updatePosition();
    const modalBody = dimensionLevelsDropdownRef.current?.closest('.list-page-modal-body') ?? null;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(updatePosition);
    });

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    modalBody?.addEventListener('scroll', updatePosition);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      modalBody?.removeEventListener('scroll', updatePosition);
    };
  }, [dimensionLevelsDropdownOpen]);

  useLayoutEffect(() => {
    if (!measureSubgroupModalDropdownOpen) {
      setMeasureSubgroupModalDropdownPosition(null);
      return;
    }

    const updatePosition = () => {
      const el = measureSubgroupModalDropdownRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = rect.width;
      const top = rect.bottom + 4;
      let left = rect.left;
      const margin = 8;
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }
      if (left < margin) left = margin;
      setMeasureSubgroupModalDropdownPosition({ top, left, width });
    };

    updatePosition();
    const modalBody = measureSubgroupModalDropdownRef.current?.closest('.list-page-modal-body') ?? null;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(updatePosition);
    });

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    modalBody?.addEventListener('scroll', updatePosition);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      modalBody?.removeEventListener('scroll', updatePosition);
    };
  }, [measureSubgroupModalDropdownOpen]);

  useEffect(() => {
    setWeekStartSearchTerm('');
    setWeekEndSearchTerm('');
    setWeekStartDropdownOpen(false);
    setWeekEndDropdownOpen(false);
  }, [newRecord.fiscalYear, newRecord.planGranularity]);
  
  // Update search term when plan template changes externally
  useEffect(() => {
    if (selectedPlanConfig && planConfigSearchTerm !== selectedPlanConfig.name) {
      setPlanConfigSearchTerm(selectedPlanConfig.name);
    } else if (!newRecord.planTemplate && planConfigSearchTerm) {
      setPlanConfigSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRecord.planTemplate]);
  
  // Filter plan config options based on search - show all if search is empty
  const filteredPlanConfigOptions = planConfigSearchTerm.trim() === '' 
    ? planConfigOptions 
    : planConfigOptions.filter(option => 
        option.name.toLowerCase().includes(planConfigSearchTerm.toLowerCase()) ||
        option.meta.toLowerCase().includes(planConfigSearchTerm.toLowerCase())
      );

  const periodOptions = useMemo(() => {
    if (!newRecord.fiscalYear) return [];
    const y = parseInt(newRecord.fiscalYear, 10);
    if (Number.isNaN(y)) return [];
    return getPeriodOptionsForGranularity(y, newRecord.planGranularity);
  }, [newRecord.fiscalYear, newRecord.planGranularity]);

  const selectedStartPeriod = periodOptions.find((w) => w.id === newRecord.startWeekId);
  const selectedEndPeriod = periodOptions.find((w) => w.id === newRecord.endWeekId);

  const endPeriodCandidateOptions = useMemo(() => {
    if (!selectedStartPeriod) return periodOptions;
    return periodOptions.filter((w) => w.order >= selectedStartPeriod.order);
  }, [periodOptions, selectedStartPeriod]);

  const filteredPeriodStartOptions =
    weekStartSearchTerm.trim() === ''
      ? periodOptions
      : periodOptions.filter((w) => w.label.toLowerCase().includes(weekStartSearchTerm.toLowerCase()));

  const filteredPeriodEndOptions =
    weekEndSearchTerm.trim() === ''
      ? endPeriodCandidateOptions
      : endPeriodCandidateOptions.filter((w) => w.label.toLowerCase().includes(weekEndSearchTerm.toLowerCase()));

  const periodStartPlaceholder = !newRecord.fiscalYear
    ? 'Select fiscal year first'
    : newRecord.planGranularity === 'weeks'
      ? 'Search or select start week'
      : newRecord.planGranularity === 'months'
        ? 'Search or select start month'
        : 'Search or select start quarter';

  const periodEndPlaceholder = !newRecord.fiscalYear
    ? 'Select fiscal year first'
    : !newRecord.startWeekId
      ? `Select start ${granularitySingularLabel(newRecord.planGranularity)} first`
      : newRecord.planGranularity === 'weeks'
        ? 'Search or select end week'
        : newRecord.planGranularity === 'months'
          ? 'Search or select end month'
          : 'Search or select end quarter';

  const noMatchingPeriodsLabel =
    newRecord.planGranularity === 'weeks'
      ? 'No matching weeks'
      : newRecord.planGranularity === 'months'
        ? 'No matching months'
        : 'No matching quarters';

  useEffect(() => {
    if (selectedStartPeriod && !weekStartDropdownOpen && weekStartSearchTerm !== selectedStartPeriod.label) {
      setWeekStartSearchTerm(selectedStartPeriod.label);
    }
    if (!newRecord.startWeekId && weekStartSearchTerm !== '') {
      setWeekStartSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRecord.startWeekId, selectedStartPeriod?.label, weekStartDropdownOpen]);

  useEffect(() => {
    if (selectedEndPeriod && !weekEndDropdownOpen && weekEndSearchTerm !== selectedEndPeriod.label) {
      setWeekEndSearchTerm(selectedEndPeriod.label);
    }
    if (!newRecord.endWeekId && weekEndSearchTerm !== '') {
      setWeekEndSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRecord.endWeekId, selectedEndPeriod?.label, weekEndDropdownOpen]);

  const comboboxInputStyle: React.CSSProperties = {
    height: '40px',
    padding: '0 36px 0 12px',
    border: '1px solid var(--color-border-ui-strong)',
    borderRadius: '0.25rem',
    fontSize: '14px',
    color: 'var(--color-on-surface-strong)',
    backgroundColor: 'white',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    width: '100%',
    boxSizing: 'border-box',
  };
  
  // State for account combobox
  const [accountLevel, _setAccountLevel] = useState<string>('');
  const [_accountName, _setAccountName] = useState<string>('');
  const [levelDropdownOpen, setLevelDropdownOpen] = useState<boolean>(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState<boolean>(false);
  const accountComboboxRef = useRef<HTMLDivElement>(null);
  
  // Get account options based on selected level (unused - kept for potential future use)
  // const _getAccountOptionsByLevel = (level: string): string[] => {
  //   switch (level) {
  //     case 'Level 0':
  //       return ['Acme Industries', 'Zenith Industries', 'Magnadrive Industries'];
  //     case 'Level 1':
  //       return ['Magnadrive North America', 'Magnadrive South America', 'Acme North America', 'Acme South America', 'Zenith North America', 'Zenith South America'];
  //     case 'Level 2':
  //       return ['Magnadrive Michigan Plant', 'Magnadrive Ohio Plant'];
  //     default:
  //       return [];
  //   }
  // };
  
  // Handle click outside for account combobox
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (accountComboboxRef.current && !accountComboboxRef.current.contains(target)) {
        setLevelDropdownOpen(false);
        setAccountDropdownOpen(false);
      }
      
      // Check if click is outside plan config combobox and not on the portal dropdown
      if (planConfigDropdownOpen && planConfigComboboxRef.current) {
        const isClickOnCombobox = planConfigComboboxRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest('.slds-dropdown.slds-dropdown_fluid');
        if (!isClickOnCombobox && !isClickOnDropdown) {
          setPlanConfigDropdownOpen(false);
          setPlanConfigDropdownPosition(null);
        }
      }
      
      if (weekStartDropdownOpen && weekStartComboboxRef.current) {
        const isClickOnCombobox = weekStartComboboxRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest('.slds-dropdown.slds-dropdown_fluid');
        if (!isClickOnCombobox && !isClickOnDropdown) {
          setWeekStartDropdownOpen(false);
          setWeekStartDropdownPosition(null);
        }
      }

      if (weekEndDropdownOpen && weekEndComboboxRef.current) {
        const isClickOnCombobox = weekEndComboboxRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest('.slds-dropdown.slds-dropdown_fluid');
        if (!isClickOnCombobox && !isClickOnDropdown) {
          setWeekEndDropdownOpen(false);
          setWeekEndDropdownPosition(null);
        }
      }

      if (dimensionLevelsDropdownOpen && dimensionLevelsDropdownRef.current) {
        const isClickOnTrigger = dimensionLevelsDropdownRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest('.list-page-modal-dimension-dropdown');
        if (!isClickOnTrigger && !isClickOnDropdown) {
          setDimensionLevelsDropdownOpen(false);
          setDimensionLevelsDropdownPosition(null);
        }
      }

      if (measureSubgroupModalDropdownOpen && measureSubgroupModalDropdownRef.current) {
        const isClickOnTrigger = measureSubgroupModalDropdownRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest('.list-page-modal-measure-subgroup-dropdown');
        if (!isClickOnTrigger && !isClickOnDropdown) {
          setMeasureSubgroupModalDropdownOpen(false);
          setMeasureSubgroupModalDropdownPosition(null);
        }
      }
    };
    
    if (
      levelDropdownOpen ||
      accountDropdownOpen ||
      planConfigDropdownOpen ||
      weekStartDropdownOpen ||
      weekEndDropdownOpen ||
      dimensionLevelsDropdownOpen ||
      measureSubgroupModalDropdownOpen
    ) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [
    levelDropdownOpen,
    accountDropdownOpen,
    planConfigDropdownOpen,
    weekStartDropdownOpen,
    weekEndDropdownOpen,
    dimensionLevelsDropdownOpen,
    measureSubgroupModalDropdownOpen,
  ]);
  
  // Clear account name when level changes (but not on initial mount)
  const prevAccountLevelRef = useRef<string>('');
  useEffect(() => {
    if (prevAccountLevelRef.current !== accountLevel && prevAccountLevelRef.current !== '') {
      _setAccountName('');
    }
    prevAccountLevelRef.current = accountLevel;
  }, [accountLevel]);
  
  // Mock data for the values table based on product level (unused - kept for potential future use)
  // const getMockValues = (level: string) => {
  //   switch (level) {
  //     case 'category':
  //       return [
  //         { id: 'transmission-assembly', name: 'Transmission Assembly' },
  //         { id: 'chassis-components', name: 'Chassis Components' },
  //         { id: 'engine-components', name: 'Engine Components' },
  //         { id: 'electrical-systems', name: 'Electrical Systems' },
  //         { id: 'hydraulic-systems', name: 'Hydraulic Systems' },
  //         { id: 'brake-systems', name: 'Brake Systems' },
  //         { id: 'suspension-systems', name: 'Suspension Systems' }
  //       ];
  //     case 'brand':
  //       return [
  //         { id: 'trn-750-series', name: 'TRN 750 Series' },
  //         { id: 'trn-850-series', name: 'TRN 850 Series' },
  //         { id: 'trn-650-series', name: 'TRN 650 Series' },
  //         { id: 'chassis-heavy-duty', name: 'Heavy-Duty Chassis' },
  //         { id: 'chassis-standard', name: 'Standard Chassis' },
  //         { id: 'chassis-lightweight', name: 'Lightweight Chassis' },
  //         { id: 'engine-v8', name: 'V8 Engine Line' },
  //         { id: 'engine-v6', name: 'V6 Engine Line' }
  //       ];
  //     case 'product':
  //       return [
  //         { id: 'trn-750-a', name: 'TRN 750 - A' },
  //         { id: 'trn-750-b', name: 'TRN 750 - B' },
  //         { id: 'trn-750-c', name: 'TRN 750 - C' },
  //         { id: 'trn-750-d', name: 'TRN 750 - D' },
  //         { id: 'trn-750-e', name: 'TRN 750 - E' },
  //         { id: 'chassis-product-1', name: 'Chassis Product 1' },
  //         { id: 'chassis-product-2', name: 'Chassis Product 2' },
  //         { id: 'engine-block-assembly', name: 'Engine Block Assembly' },
  //         { id: 'cylinder-head-pro', name: 'Cylinder Head Pro' },
  //         { id: 'piston-assembly-set', name: 'Piston Assembly Set' }
  //       ];
  //     default:
  //       return [];
  //   }
  // };

  // const _mockValues = getMockValues(newRecord.planningLevel);
  
  // Filter values based on search term and showSelectedOnly toggle (unused - kept for potential future use)
  // const _filteredValues = mockValues.filter(value => {
  //   const matchesSearch = value.name.toLowerCase().includes(_valuesSearchTerm.toLowerCase());
  //   if (_showSelectedOnly) {
  //     return matchesSearch && selectedValues.has(value.id);
  //   }
  //   return matchesSearch;
  // });


  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(mockRecords.map(r => r.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
    setSelectAll(newSelected.size === mockRecords.length);
  };

  const resetPlanFormForCreate = useCallback(() => {
    setNewRecord({ ...INITIAL_PLAN_FORM_RECORD });
    setWeekStartSearchTerm('');
    setWeekEndSearchTerm('');
    setPlanConfigSearchTerm('');
    setPlanConfigDropdownOpen(false);
    setPlanConfigDropdownPosition(null);
    setWeekStartDropdownOpen(false);
    setWeekEndDropdownOpen(false);
    setWeekStartDropdownPosition(null);
    setWeekEndDropdownPosition(null);
    setDimensionLevelsDropdownOpen(false);
    setDimensionLevelsDropdownPosition(null);
    setMeasureSubgroupModalDropdownOpen(false);
    setMeasureSubgroupModalDropdownPosition(null);
    setSelectedPlanDimensionLevels(new Set(['account', 'category', 'product']));
    setSelectedPlanMeasureSubgroups(new Set(['Revenue & Quantity Measures']));
    setClonePlanDescription('');
    setPlanModalMode('create');
  }, []);

  const openClonePlanModal = useCallback((record: ForecastRecord) => {
    setRowActionMenuRecordId(null);
    setRowActionMenuPosition(null);
    const templateId = ADMIN_TEMPLATE_TO_PLAN_TEMPLATE_ID[record.adminTemplate] ?? 'template-1';
    const gran: PlanGranularity = 'weeks';
    const { startWeekId, endWeekId } = getDefaultPeriodRangeForPlanForm(record.fiscalYear, gran);
    const y = parseInt(record.fiscalYear, 10);
    const opts = Number.isNaN(y) ? [] : getPeriodOptionsForGranularity(y, gran);
    const startLabel = opts.find((o) => o.id === startWeekId)?.label ?? '';
    const endLabel = opts.find((o) => o.id === endWeekId)?.label ?? '';
    setPlanModalMode('clone');
    setNewRecord({
      planName: '',
      status: 'draft',
      fiscalYear: record.fiscalYear,
      planGranularity: gran,
      startWeekId,
      endWeekId,
      planTemplate: templateId,
    });
    setClonePlanDescription('');
    setSelectedPlanDimensionLevels(new Set(['account', 'category', 'product']));
    setSelectedPlanMeasureSubgroups(new Set(['Revenue & Quantity Measures']));
    setPlanConfigSearchTerm('');
    setWeekStartSearchTerm(startLabel);
    setWeekEndSearchTerm(endLabel);
    setPlanConfigDropdownOpen(false);
    setPlanConfigDropdownPosition(null);
    setWeekStartDropdownOpen(false);
    setWeekEndDropdownOpen(false);
    setWeekStartDropdownPosition(null);
    setWeekEndDropdownPosition(null);
    setDimensionLevelsDropdownOpen(false);
    setDimensionLevelsDropdownPosition(null);
    setMeasureSubgroupModalDropdownOpen(false);
    setMeasureSubgroupModalDropdownPosition(null);
    setIsModalOpen(true);
  }, []);

  const closePlanFormModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedValues(new Set());
    setPlanModalMode('create');
    setClonePlanDescription('');
  }, []);

  useEffect(() => {
    if (!rowActionMenuRecordId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rowActionMenuRef.current?.contains(t)) return;
      const el = t as Element;
      if (typeof el.closest === 'function' && el.closest('.list-page-row-action-btn')) return;
      setRowActionMenuRecordId(null);
      setRowActionMenuPosition(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [rowActionMenuRecordId]);

  useEffect(() => {
    const rid = (location.state as { cloneRecordId?: string } | undefined)?.cloneRecordId;
    if (!rid) return;
    const rec = mockRecords.find((r) => r.id === rid);
    if (rec) {
      openClonePlanModal(rec);
    }
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate, openClonePlanModal]);

  return (
    <div className="app">
      <Header />
      <div className="main-content list-page-content">
        <div className="list-page-container">
          {/* Page Header */}
          <div className="list-page-header">
            <div className="list-page-header-left">
              <div className="list-page-title-row">
                <div className="list-page-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
                  </svg>
                </div>
                <h1 className="list-page-title">Recently Viewed</h1>
                <svg className="list-page-title-chevron" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5H7z"/>
                </svg>
                <button className="list-page-pin-button" title="Pin this list view">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                  </svg>
                </button>
              </div>
              <p className="list-page-subtitle">
                {mockRecords.length} items • Sorted by Name • Updated a few seconds ago
              </p>
            </div>
            <div className="list-page-header-right">
              <button
                className="list-page-new-btn"
                onClick={() => {
                  resetPlanFormForCreate();
                  setIsModalOpen(true);
                  setSelectedValues(new Set());
                  setAccessControlMatrix(buildInitialAccessMatrix(industry));
                }}
              >
                New
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="list-page-table-container">
            <table className="list-page-table">
              <thead>
                <tr>
                  <th className="list-page-th-checkbox">
                    <input 
                      type="checkbox" 
                      checked={selectAll}
                      onChange={handleSelectAll}
                      className="list-page-checkbox"
                    />
                  </th>
                  <th className="list-page-th-name">
                    <span>Name</span>
                    <svg className="list-page-sort-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5H7z"/>
                    </svg>
                  </th>
                  <th className="list-page-th">
                    <span>Fiscal Year</span>
                    <svg className="list-page-sort-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5H7z"/>
                    </svg>
                  </th>
                  <th className="list-page-th">
                    <span>Plan Configuration</span>
                    <svg className="list-page-sort-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5H7z"/>
                    </svg>
                  </th>
                  <th className="list-page-th">
                    <span>Root Record</span>
                    <svg className="list-page-sort-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5H7z"/>
                    </svg>
                  </th>
                  <th className="list-page-th">
                    <span>Plan Status</span>
                    <svg className="list-page-sort-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5H7z"/>
                    </svg>
                  </th>
                  <th className="list-page-th-actions"></th>
                </tr>
              </thead>
              <tbody>
                {mockRecords.map((record) => (
                  <tr key={record.id} className="list-page-row">
                    <td className="list-page-td-checkbox">
                      <input 
                        type="checkbox" 
                        checked={selectedRows.has(record.id)}
                        onChange={() => handleSelectRow(record.id)}
                        className="list-page-checkbox"
                      />
                    </td>
                    <td className="list-page-td-name">
                      <Link 
                        to={record.id === 'fy26' ? '/planning-forecasting' : '#'}
                        className="list-page-name-link"
                      >
                        {record.name}
                      </Link>
                    </td>
                    <td className="list-page-td">{record.fiscalYear}</td>
                    <td className="list-page-td">{record.adminTemplate}</td>
                    <td className="list-page-td">{record.rootRecord}</td>
                    <td className="list-page-td">{record.status}</td>
                    <td className="list-page-td-actions">
                      <button
                        type="button"
                        className="list-page-row-action-btn"
                        aria-expanded={rowActionMenuRecordId === record.id}
                        aria-haspopup="menu"
                        aria-label={`Actions for ${record.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          if (rowActionMenuRecordId === record.id) {
                            setRowActionMenuRecordId(null);
                            setRowActionMenuPosition(null);
                          } else {
                            setRowActionMenuRecordId(record.id);
                            setRowActionMenuPosition({
                              top: rect.bottom + 4,
                              left: Math.max(8, rect.right - 188),
                            });
                          }
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M7 10l5 5 5-5H7z"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {rowActionMenuRecordId && rowActionMenuPosition &&
        createPortal(
          <div
            ref={rowActionMenuRef}
            className="list-page-row-action-menu"
            role="menu"
            style={{
              position: 'fixed',
              top: rowActionMenuPosition.top,
              left: rowActionMenuPosition.left,
              zIndex: 99998,
            }}
          >
            <button
              type="button"
              className="list-page-row-action-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                const rec = mockRecords.find((r) => r.id === rowActionMenuRecordId);
                if (rec) openClonePlanModal(rec);
              }}
            >
              Clone
            </button>
            <button
              type="button"
              className="list-page-row-action-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setRowActionMenuRecordId(null);
                setRowActionMenuPosition(null);
                setExportCsvModalOpen(true);
              }}
            >
              Export Grid
            </button>
            <button
              type="button"
              className="list-page-row-action-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setRowActionMenuRecordId(null);
                setRowActionMenuPosition(null);
                navigate(getGridPathForIndustry(industry));
              }}
            >
              View Grid
            </button>
          </div>,
          document.body,
        )}

      <ExportCsvModal isOpen={exportCsvModalOpen} onClose={() => setExportCsvModalOpen(false)} />

      {/* New Record / Clone Plan Modal */}
      {isModalOpen && createPortal(
        <div className="list-page-modal-overlay" onClick={closePlanFormModal}>
          <div className="list-page-modal" onClick={(e) => e.stopPropagation()}>
            <div className="list-page-modal-header">
              <h2 className="list-page-modal-title">
                {planModalMode === 'clone' ? 'Clone plan' : 'Create New Plan Config'}
              </h2>
            </div>
            <div className="list-page-modal-body">
              {/* BASIC DETAILS Section */}
              <div className="list-page-modal-section">
                {planModalMode === 'clone' ? (
                  <>
                    <div className="list-page-modal-row">
                      <div className="list-page-modal-field">
                        <label className="list-page-modal-label" htmlFor="clone-plan-name">
                          Clone name
                        </label>
                        <input
                          id="clone-plan-name"
                          type="text"
                          className="list-page-modal-input"
                          value={newRecord.planName}
                          onChange={(e) => setNewRecord({ ...newRecord, planName: e.target.value })}
                          placeholder="Enter clone name"
                        />
                      </div>
                      <div className="list-page-modal-field">
                        <label className="list-page-modal-label">Plan Status:</label>
                        <select
                          className="list-page-modal-select"
                          value={newRecord.status}
                          onChange={(e) => setNewRecord({ ...newRecord, status: e.target.value })}
                          style={!newRecord.status ? { color: 'var(--slds-g-color-neutral-base-60)' } : {}}
                        >
                          <option value="draft">Draft</option>
                        </select>
                      </div>
                    </div>
                    <div className="list-page-modal-row">
                      <div className="list-page-modal-field list-page-modal-field-full">
                        <label className="list-page-modal-label" htmlFor="clone-plan-description">
                          Clone description
                        </label>
                        <textarea
                          id="clone-plan-description"
                          className="list-page-modal-textarea"
                          value={clonePlanDescription}
                          onChange={(e) => setClonePlanDescription(e.target.value)}
                          placeholder="Enter clone description"
                          rows={3}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                <div className="list-page-modal-row">
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">Plan Name:</label>
                    <input 
                      type="text" 
                      className="list-page-modal-input"
                      value={newRecord.planName}
                      onChange={(e) => setNewRecord({...newRecord, planName: e.target.value})}
                      placeholder="Enter Plan Name"
                    />
                  </div>
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">Plan Status:</label>
                    <select 
                      className="list-page-modal-select"
                      value={newRecord.status}
                      onChange={(e) => setNewRecord({...newRecord, status: e.target.value})}
                      style={!newRecord.status ? { color: 'var(--slds-g-color-neutral-base-60)' } : {}}
                    >
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>
                )}
                <div className="list-page-modal-row">
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">Fiscal Year:</label>
                    <select 
                      className="list-page-modal-select"
                      value={newRecord.fiscalYear}
                      onChange={(e) =>
                        setNewRecord({
                          ...newRecord,
                          fiscalYear: e.target.value,
                          startWeekId: '',
                          endWeekId: '',
                        })
                      }
                      style={!newRecord.fiscalYear ? { color: 'var(--slds-g-color-neutral-base-60)' } : {}}
                    >
                      <option value="">Select Fiscal Year</option>
                      <option value="2026">2026 (Jan - Dec)</option>
                      <option value="2025">2025 (Jan - Dec)</option>
                      <option value="2024">2024 (Jan - Dec)</option>
                      <option value="2023">2023 (Jan - Dec)</option>
                      <option value="2022">2022 (Jan - Dec)</option>
                      <option value="2021">2021 (Jan - Dec)</option>
                    </select>
                      </div>
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">Default Plan Granularity:</label>
                    <select
                      className="list-page-modal-select"
                      value={newRecord.planGranularity}
                      onChange={(e) =>
                        setNewRecord({
                          ...newRecord,
                          planGranularity: e.target.value as PlanGranularity,
                          startWeekId: '',
                          endWeekId: '',
                        })
                      }
                    >
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="quarters">Quarters</option>
                    </select>
                  </div>
                </div>
                <div className="list-page-modal-row">
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">Start period:</label>
                    <div ref={weekStartComboboxRef} style={{ position: 'relative' }}>
                      <div className="slds-combobox">
                        <div className="slds-combobox__form-element slds-input-has-icon slds-input-has-icon_right" style={{ position: 'relative' }}>
                          <input
                            type="text"
                            className="slds-input slds-combobox__input"
                            value={weekStartDropdownOpen ? weekStartSearchTerm : (selectedStartPeriod ? selectedStartPeriod.label : weekStartSearchTerm)}
                            placeholder={periodStartPlaceholder}
                            disabled={!newRecord.fiscalYear}
                            onChange={(e) => {
                              setWeekStartSearchTerm(e.target.value);
                              setWeekStartDropdownOpen(true);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!newRecord.fiscalYear) return;
                              setWeekStartDropdownOpen(true);
                              if (selectedStartPeriod && weekStartSearchTerm === selectedStartPeriod.label) {
                                setWeekStartSearchTerm('');
                              }
                            }}
                            onFocus={(e) => {
                              e.stopPropagation();
                              if (!newRecord.fiscalYear) return;
                              setWeekStartDropdownOpen(true);
                              if (selectedStartPeriod && weekStartSearchTerm === selectedStartPeriod.label) {
                                setWeekStartSearchTerm('');
                              }
                            }}
                            style={{
                              ...comboboxInputStyle,
                              color: newRecord.fiscalYear ? comboboxInputStyle.color : 'var(--slds-g-color-neutral-base-60)',
                              backgroundColor: newRecord.fiscalYear ? 'white' : 'var(--color-surface-gray)',
                              cursor: newRecord.fiscalYear ? 'text' : 'not-allowed',
                            }}
                          />
                          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M5.5 9.5C7.70914 9.5 9.5 7.70914 9.5 5.5C9.5 3.29086 7.70914 1.5 5.5 1.5C3.29086 1.5 1.5 3.29086 1.5 5.5C1.5 7.70914 3.29086 9.5 5.5 9.5Z" stroke="var(--color-interactive-border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M8.5 8.5L10.5 10.5" stroke="var(--color-interactive-border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          {weekStartDropdownOpen && newRecord.fiscalYear && weekStartDropdownPosition && createPortal(
                            <div
                              className="slds-dropdown slds-dropdown_fluid"
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'fixed',
                                top: `${weekStartDropdownPosition.top}px`,
                                left: `${weekStartDropdownPosition.left}px`,
                                width: `${weekStartDropdownPosition.width}px`,
                                zIndex: 99999,
                                backgroundColor: 'var(--color-surface-white)',
                                border: '1px solid var(--color-border-ui-strong)',
                                borderRadius: '0.25rem',
                                boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                                padding: '0.25rem 0',
                                maxHeight: '20rem',
                                overflowY: 'auto',
                              }}
                            >
                              <ul className="slds-listbox slds-listbox_vertical" role="listbox">
                                {filteredPeriodStartOptions.length > 0 ? (
                                  filteredPeriodStartOptions.map((option) => (
                                    <li key={option.id} role="presentation" className="slds-listbox__item">
                                      <div
                                        className={`slds-media slds-listbox__option slds-listbox__option_plain slds-media_small ${newRecord.startWeekId === option.id ? 'slds-is-selected' : ''}`}
                                        role="option"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setNewRecord((prev) => {
                                            const endOpt = periodOptions.find((w) => w.id === prev.endWeekId);
                                            const clearEnd = Boolean(endOpt && endOpt.order < option.order);
                                            return {
                                              ...prev,
                                              startWeekId: option.id,
                                              endWeekId: clearEnd ? '' : prev.endWeekId,
                                            };
                                          });
                                          setWeekStartSearchTerm(option.label);
                                          setWeekStartDropdownOpen(false);
                                          setWeekStartDropdownPosition(null);
                                        }}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          cursor: 'pointer',
                                          backgroundColor: newRecord.startWeekId === option.id ? 'var(--color-surface-gray)' : 'var(--color-surface-white)',
                                          transition: 'background-color 0.1s ease',
                                          fontSize: '14px',
                                          color: 'var(--color-on-surface-strong)',
                                        }}
                                        onMouseEnter={(e) => {
                                          if (newRecord.startWeekId !== option.id) {
                                            e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (newRecord.startWeekId !== option.id) {
                                            e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                                          }
                                        }}
                                      >
                                        {option.label}
                                      </div>
                                    </li>
                                  ))
                                ) : (
                                  <li role="presentation" className="slds-listbox__item">
                                    <div style={{ padding: '0.75rem', color: 'var(--color-interactive-border)', fontSize: '14px' }}>
                                      {noMatchingPeriodsLabel}
                                    </div>
                                  </li>
                                )}
                              </ul>
                            </div>,
                            document.body
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">End period:</label>
                    <div ref={weekEndComboboxRef} style={{ position: 'relative' }}>
                      <div className="slds-combobox">
                        <div className="slds-combobox__form-element slds-input-has-icon slds-input-has-icon_right" style={{ position: 'relative' }}>
                          <input
                            type="text"
                            className="slds-input slds-combobox__input"
                            value={weekEndDropdownOpen ? weekEndSearchTerm : (selectedEndPeriod ? selectedEndPeriod.label : weekEndSearchTerm)}
                            placeholder={periodEndPlaceholder}
                            disabled={!newRecord.fiscalYear || !newRecord.startWeekId}
                            onChange={(e) => {
                              setWeekEndSearchTerm(e.target.value);
                              setWeekEndDropdownOpen(true);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!newRecord.fiscalYear || !newRecord.startWeekId) return;
                              setWeekEndDropdownOpen(true);
                              if (selectedEndPeriod && weekEndSearchTerm === selectedEndPeriod.label) {
                                setWeekEndSearchTerm('');
                              }
                            }}
                            onFocus={(e) => {
                              e.stopPropagation();
                              if (!newRecord.fiscalYear || !newRecord.startWeekId) return;
                              setWeekEndDropdownOpen(true);
                              if (selectedEndPeriod && weekEndSearchTerm === selectedEndPeriod.label) {
                                setWeekEndSearchTerm('');
                              }
                            }}
                            style={{
                              ...comboboxInputStyle,
                              color:
                                newRecord.fiscalYear && newRecord.startWeekId
                                  ? comboboxInputStyle.color
                                  : 'var(--slds-g-color-neutral-base-60)',
                              backgroundColor:
                                newRecord.fiscalYear && newRecord.startWeekId ? 'white' : 'var(--color-surface-gray)',
                              cursor: newRecord.fiscalYear && newRecord.startWeekId ? 'text' : 'not-allowed',
                            }}
                          />
                          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M5.5 9.5C7.70914 9.5 9.5 7.70914 9.5 5.5C9.5 3.29086 7.70914 1.5 5.5 1.5C3.29086 1.5 1.5 3.29086 1.5 5.5C1.5 7.70914 3.29086 9.5 5.5 9.5Z" stroke="var(--color-interactive-border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M8.5 8.5L10.5 10.5" stroke="var(--color-interactive-border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          {weekEndDropdownOpen && newRecord.fiscalYear && newRecord.startWeekId && weekEndDropdownPosition && createPortal(
                            <div
                              className="slds-dropdown slds-dropdown_fluid"
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'fixed',
                                top: `${weekEndDropdownPosition.top}px`,
                                left: `${weekEndDropdownPosition.left}px`,
                                width: `${weekEndDropdownPosition.width}px`,
                                zIndex: 99999,
                                backgroundColor: 'var(--color-surface-white)',
                                border: '1px solid var(--color-border-ui-strong)',
                                borderRadius: '0.25rem',
                                boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                                padding: '0.25rem 0',
                                maxHeight: '20rem',
                                overflowY: 'auto',
                              }}
                            >
                              <ul className="slds-listbox slds-listbox_vertical" role="listbox">
                                {filteredPeriodEndOptions.length > 0 ? (
                                  filteredPeriodEndOptions.map((option) => (
                                    <li key={option.id} role="presentation" className="slds-listbox__item">
                                      <div
                                        className={`slds-media slds-listbox__option slds-listbox__option_plain slds-media_small ${newRecord.endWeekId === option.id ? 'slds-is-selected' : ''}`}
                                        role="option"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setNewRecord((prev) => ({ ...prev, endWeekId: option.id }));
                                          setWeekEndSearchTerm(option.label);
                                          setWeekEndDropdownOpen(false);
                                          setWeekEndDropdownPosition(null);
                                        }}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          cursor: 'pointer',
                                          backgroundColor: newRecord.endWeekId === option.id ? 'var(--color-surface-gray)' : 'var(--color-surface-white)',
                                          transition: 'background-color 0.1s ease',
                                          fontSize: '14px',
                                          color: 'var(--color-on-surface-strong)',
                                        }}
                                        onMouseEnter={(e) => {
                                          if (newRecord.endWeekId !== option.id) {
                                            e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (newRecord.endWeekId !== option.id) {
                                            e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                                          }
                                        }}
                                      >
                                        {option.label}
                                      </div>
                                    </li>
                                  ))
                                ) : (
                                  <li role="presentation" className="slds-listbox__item">
                                    <div style={{ padding: '0.75rem', color: 'var(--color-interactive-border)', fontSize: '14px' }}>
                                      {noMatchingPeriodsLabel}
                                    </div>
                                  </li>
                                )}
                              </ul>
                            </div>,
                            document.body
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="list-page-modal-row">
                  <div className="list-page-modal-field list-page-modal-field-full">
                    <label className="list-page-modal-label">Plan Configuration:</label>
                    <div ref={planConfigComboboxRef} style={{ position: 'relative' }}>
                      <div className="slds-combobox">
                        <div className="slds-combobox__form-element slds-input-has-icon slds-input-has-icon_right" style={{ position: 'relative' }}>
                          <input
                            type="text"
                            className="slds-input slds-combobox__input"
                            value={planConfigDropdownOpen ? planConfigSearchTerm : (selectedPlanConfig ? selectedPlanConfig.name : planConfigSearchTerm)}
                            placeholder="Select Plan Configuration"
                            onChange={(e) => {
                              setPlanConfigSearchTerm(e.target.value);
                              setPlanConfigDropdownOpen(true);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlanConfigDropdownOpen(true);
                              // Clear search term when clicking to show all options
                              if (selectedPlanConfig && planConfigSearchTerm === selectedPlanConfig.name) {
                                setPlanConfigSearchTerm('');
                              } else if (!planConfigSearchTerm) {
                                setPlanConfigSearchTerm('');
                              }
                            }}
                            onFocus={(e) => {
                              e.stopPropagation();
                              setPlanConfigDropdownOpen(true);
                              // Clear search term when focusing to show all options
                              if (selectedPlanConfig && planConfigSearchTerm === selectedPlanConfig.name) {
                                setPlanConfigSearchTerm('');
                              } else if (!planConfigSearchTerm) {
                                setPlanConfigSearchTerm('');
                              }
                            }}
                            style={{
                              height: '40px',
                              padding: '0 36px 0 12px',
                              border: '1px solid var(--color-border-ui-strong)',
                              borderRadius: '0.25rem',
                              fontSize: '14px',
                              color: 'var(--color-on-surface-strong)',
                              backgroundColor: 'white',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              width: '100%',
                              boxSizing: 'border-box'
                            }}
                          />
                          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M5.5 9.5C7.70914 9.5 9.5 7.70914 9.5 5.5C9.5 3.29086 7.70914 1.5 5.5 1.5C3.29086 1.5 1.5 3.29086 1.5 5.5C1.5 7.70914 3.29086 9.5 5.5 9.5Z" stroke="var(--color-interactive-border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M8.5 8.5L10.5 10.5" stroke="var(--color-interactive-border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          {planConfigDropdownOpen && planConfigDropdownPosition && createPortal(
                            <div 
                              className="slds-dropdown slds-dropdown_fluid" 
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'fixed',
                                top: `${planConfigDropdownPosition.top}px`,
                                left: `${planConfigDropdownPosition.left}px`,
                                width: `${planConfigDropdownPosition.width}px`,
                                zIndex: 99999,
                                backgroundColor: 'var(--color-surface-white)',
                                border: '1px solid var(--color-border-ui-strong)',
                                borderRadius: '0.25rem',
                                boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                                padding: '0.25rem 0',
                                maxHeight: '20rem',
                                overflowY: 'auto'
                              }}>
                              <ul className="slds-listbox slds-listbox_vertical" role="listbox">
                                {filteredPlanConfigOptions.length > 0 ? (
                                  filteredPlanConfigOptions.map((option) => (
                                    <li key={option.id} role="presentation" className="slds-listbox__item">
                                      <div
                                        className={`slds-media slds-listbox__option slds-listbox__option_plain slds-media_small ${newRecord.planTemplate === option.id ? 'slds-is-selected' : ''}`}
                                        role="option"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setNewRecord({...newRecord, planTemplate: option.id});
                                          setPlanConfigSearchTerm(option.name);
                                          setPlanConfigDropdownOpen(false);
                                          setPlanConfigDropdownPosition(null);
                                        }}
                                        style={{
                                          padding: '0.75rem',
                                          cursor: 'pointer',
                                          backgroundColor: newRecord.planTemplate === option.id ? 'var(--color-surface-gray)' : 'var(--color-surface-white)',
                                          transition: 'background-color 0.1s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                          if (newRecord.planTemplate !== option.id) {
                                            e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (newRecord.planTemplate !== option.id) {
                                            e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                                          }
                                        }}
                                      >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-on-surface-strong)', marginBottom: '4px' }}>
                                            {option.name}
                                          </div>
                                          <div style={{ fontSize: '14px', fontWeight: 400, color: 'var(--color-interactive-border)', lineHeight: '1.5' }}>
                                            {option.meta}
                                          </div>
                                        </div>
                                      </div>
                                    </li>
                                  ))
                                ) : (
                                  <li role="presentation" className="slds-listbox__item">
                                    <div style={{ padding: '0.75rem', color: 'var(--color-interactive-border)', fontSize: '14px' }}>
                                      No results found
                                    </div>
                                  </li>
                                )}
                              </ul>
                            </div>,
                            document.body
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                  <div className="list-page-modal-row">
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">Dimension levels</label>
                    <div className="settings-dropdown-wrapper" ref={dimensionLevelsDropdownRef}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={`settings-dropdown-trigger ${dimensionLevelsDropdownOpen ? 'open' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDimensionLevelsDropdownOpen((o) => !o);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDimensionLevelsDropdownOpen((o) => !o);
                          }
                        }}
                        aria-expanded={dimensionLevelsDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        <span
                          className={
                            planModalDimensionLevelCount > 0
                              ? 'settings-dropdown-value'
                              : 'settings-dropdown-placeholder'
                          }
                        >
                          {planModalDimensionLevelCount > 0
                            ? `${planModalDimensionLevelCount} Level${planModalDimensionLevelCount !== 1 ? 's' : ''} Selected`
                            : 'Select Dimension Levels'}
                        </span>
                        <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                      {dimensionLevelsDropdownOpen &&
                        dimensionLevelsDropdownPosition &&
                        createPortal(
                              <div 
                            className="settings-dropdown-list settings-dimension-dropdown list-page-modal-dimension-dropdown"
                            role="listbox"
                            aria-multiselectable="true"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  position: 'fixed',
                              top: `${dimensionLevelsDropdownPosition.top}px`,
                              left: `${dimensionLevelsDropdownPosition.left}px`,
                              width: `${dimensionLevelsDropdownPosition.width}px`,
                                  zIndex: 99999,
                              maxHeight: '20rem',
                              overflowY: 'auto',
                                  boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                            }}
                          >
                            {Object.entries(PLAN_MODAL_DIMENSION_HIERARCHY_GROUPS).map(([hierarchy, levels]) => (
                              <div key={hierarchy}>
                                <div className="settings-dropdown-header">{hierarchy}</div>
                                {levels.map((level) => {
                                  const isSelected = selectedPlanDimensionLevels.has(level.id);
                                  return (
                                    <div
                                      key={level.id}
                                      className="settings-dropdown-checkbox-option"
                                          role="option"
                                      aria-selected={isSelected}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                        togglePlanModalDimensionLevel(level.id);
                                      }}
                                    >
                                      <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                                        {isSelected && (
                                          <svg
                                            className="settings-checkbox-icon"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2.5}
                                              d="M5 13l4 4L19 7"
                                            />
                                          </svg>
                                        )}
                                        </div>
                                      {planModalDimensionLevelIcon(level.id)}
                                      <span className="settings-dropdown-checkbox-label">{level.name}</span>
                                      </div>
                                  );
                                })}
                              </div>
                            ))}
                              </div>,
                          document.body,
                            )}
                          </div>
                        </div>
                  <div className="list-page-modal-field">
                    <label className="list-page-modal-label">Measure category</label>
                    <div className="settings-dropdown-wrapper" ref={measureSubgroupModalDropdownRef}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={`settings-dropdown-trigger ${measureSubgroupModalDropdownOpen ? 'open' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMeasureSubgroupModalDropdownOpen((o) => !o);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setMeasureSubgroupModalDropdownOpen((o) => !o);
                          }
                        }}
                        aria-expanded={measureSubgroupModalDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        <span
                          className={
                            planModalMeasureSubgroupCount > 0
                              ? 'settings-dropdown-value'
                              : 'settings-dropdown-placeholder'
                          }
                        >
                          {planModalMeasureSubgroupCount > 0
                            ? `${planModalMeasureSubgroupCount} Categor${planModalMeasureSubgroupCount !== 1 ? 'ies' : 'y'} Selected`
                            : 'Select Measure Category'}
                          </span>
                        <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        </div>
                      {measureSubgroupModalDropdownOpen &&
                        measureSubgroupModalDropdownPosition &&
                        createPortal(
                          <div
                            className="settings-dropdown-list settings-dimension-dropdown list-page-modal-measure-subgroup-dropdown"
                            role="listbox"
                            aria-multiselectable="true"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'fixed',
                              top: `${measureSubgroupModalDropdownPosition.top}px`,
                              left: `${measureSubgroupModalDropdownPosition.left}px`,
                              width: `${measureSubgroupModalDropdownPosition.width}px`,
                              zIndex: 99999,
                              maxHeight: '20rem',
                              overflowY: 'auto',
                              boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                            }}
                          >
                            {PLAN_MODAL_MEASURE_SUBGROUP_OPTIONS.map((option, index) => {
                              const isSelected = selectedPlanMeasureSubgroups.has(option.value);
                              return (
                                <div
                                  key={index}
                                  className="settings-dropdown-checkbox-option"
                                  role="option"
                                  aria-selected={isSelected}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePlanModalMeasureSubgroup(option.value);
                                  }}
                                >
                                  <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                                    {isSelected && (
                                      <svg
                                        className="settings-checkbox-icon"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2.5}
                                          d="M5 13l4 4L19 7"
                                        />
                                      </svg>
                      )}
                    </div>
                                  <span className="settings-dropdown-checkbox-label">{option.value}</span>
                  </div>
                              );
                            })}
                          </div>,
                          document.body,
                )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="list-page-modal-footer">
              <button type="button" className="list-page-modal-cancel" onClick={closePlanFormModal}>
                Cancel
              </button>
              <button
                type="button"
                className="list-page-modal-create"
                onClick={() => {
                setIsModalOpen(false);
                setSelectedValues(new Set());
                  setIsNextStepModalOpen(true);
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isNextStepModalOpen &&
        createPortal(
          <>
            <div
              className="list-page-modal-overlay"
              onClick={() => {
                setIsNextStepModalOpen(false);
              }}
            >
            <div className="list-page-modal list-page-modal--access-wide" onClick={(e) => e.stopPropagation()}>
              <div className="list-page-modal-header">
                <h2 className="list-page-modal-title">Create New Plan Config</h2>
              </div>
              <div className="list-page-modal-body list-page-modal-body--access-step" aria-label="Next step">
                <div className="settings-section-header list-page-modal-access-control-section">
                  <p className="settings-section-title">Access control settings</p>
                </div>
                <div className="list-page-modal-access-grid-block">
                  <div
                    className="list-page-modal-access-filters list-page-modal-access-filters--toolbar"
                    role="group"
                    aria-label="Access table toolbar"
                  >
                    <p className="list-page-modal-access-toolbar-hint">
                      Use the filter and sort icons on Person, Job role, Measure subset, Measure, and Access.
                    </p>
                    <div className="list-page-modal-access-bulk-actions">
                      <button
                        type="button"
                        ref={bulkEditButtonRef}
                        className="list-page-modal-access-bulk-edit-btn"
                        disabled={accessBulkSelectedCount === 0}
                        onClick={() => setAccessBulkPopoverOpen(true)}
                      >
                        Bulk edit Access
                      </button>
                    </div>
                  </div>
                  <div className="list-page-modal-access-table-wrap">
                    <table className="list-page-modal-access-table">
                    <thead>
                      <tr>
                        <th scope="col" className="list-page-modal-access-table-check-col">
                          <span className="list-page-modal-sr-only">Select rows</span>
                          <input
                            ref={accessHeaderSelectAllRef}
                            type="checkbox"
                            className="list-page-modal-access-row-check"
                            checked={allVisibleAccessSelected}
                            disabled={visibleFlattenedRowKeys.length === 0}
                            onChange={toggleAccessBulkSelectAllVisible}
                            aria-label="Select all rows shown in the table"
                          />
                        </th>
                        <th scope="col" className="list-page-modal-access-table-corner">
                          <AccessTableColumnHeader
                            column="person"
                            label="Person"
                            filterActive={accessFilterPersonNames.length > 0}
                            filterPanelOpen={accessColumnFilterPanel?.column === 'person'}
                            sortColumn={accessSortColumn}
                            sortDir={accessSortDir}
                            onFilterClick={(anchor) => toggleAccessColumnFilterPanel('person', anchor)}
                            onSortClick={() => cycleAccessColumnSort('person')}
                          />
                        </th>
                        <th scope="col" className="list-page-modal-access-table-role-col">
                          <AccessTableColumnHeader
                            column="jobRole"
                            label="Job role"
                            filterActive={accessFilterJobRoles.length > 0}
                            filterPanelOpen={accessColumnFilterPanel?.column === 'jobRole'}
                            sortColumn={accessSortColumn}
                            sortDir={accessSortDir}
                            onFilterClick={(anchor) => toggleAccessColumnFilterPanel('jobRole', anchor)}
                            onSortClick={() => cycleAccessColumnSort('jobRole')}
                          />
                        </th>
                        <th scope="col" className="list-page-modal-access-table-subset-col">
                          <AccessTableColumnHeader
                            column="subset"
                            label="Measure subset"
                            filterActive={accessFilterSubsetLabels.length > 0}
                            filterPanelOpen={accessColumnFilterPanel?.column === 'subset'}
                            sortColumn={accessSortColumn}
                            sortDir={accessSortDir}
                            onFilterClick={(anchor) => toggleAccessColumnFilterPanel('subset', anchor)}
                            onSortClick={() => cycleAccessColumnSort('subset')}
                          />
                        </th>
                        <th scope="col" className="list-page-modal-access-table-measure-col">
                          <AccessTableColumnHeader
                            column="measure"
                            label="Measure"
                            filterActive={accessFilterMeasureNames.length > 0}
                            filterPanelOpen={accessColumnFilterPanel?.column === 'measure'}
                            sortColumn={accessSortColumn}
                            sortDir={accessSortDir}
                            onFilterClick={(anchor) => toggleAccessColumnFilterPanel('measure', anchor)}
                            onSortClick={() => cycleAccessColumnSort('measure')}
                          />
                        </th>
                        <th scope="col" className="list-page-modal-access-table-access-col">
                          <AccessTableColumnHeader
                            column="access"
                            label="Access"
                            filterActive={accessFilterAccessLevels.length > 0}
                            filterPanelOpen={accessColumnFilterPanel?.column === 'access'}
                            sortColumn={accessSortColumn}
                            sortDir={accessSortDir}
                            onFilterClick={(anchor) => toggleAccessColumnFilterPanel('access', anchor)}
                            onSortClick={() => cycleAccessColumnSort('access')}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFlattenedAccessRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="list-page-modal-access-table-empty">
                            {filteredAccessControlPeople.length === 0
                              ? accessFilterPersonNames.length > 0 || accessFilterJobRoles.length > 0
                                ? 'No rows match the column filters. Open a column’s filter icon and clear selections to see more rows.'
                                : 'No people to show.'
                              : 'No rows match the column filters. Open a column’s filter icon and clear selections to see more rows.'}
                          </td>
                        </tr>
                      ) : (
                        sortedFlattenedAccessRows.map((row) => {
                          const cellKey = accessMeasureCellKey(row.person.id, row.measure.id);
                          const perm = accessControlMatrix[cellKey] ?? 'View';
                          return (
                            <tr key={row.rowKey}>
                              <td className="list-page-modal-access-table-check-cell">
                                <input
                                  type="checkbox"
                                  className="list-page-modal-access-row-check"
                                  checked={accessBulkSelectedRowKeys.has(row.rowKey)}
                                  onChange={() => toggleAccessBulkSelectRow(row.rowKey)}
                                  aria-label={`Select ${row.person.name} — ${row.measure.name}`}
                                />
                              </td>
                              <th scope="row">{row.person.name}</th>
                              <td className="list-page-modal-access-table-role-cell">{row.person.jobRole}</td>
                              <td className="list-page-modal-access-table-subset-cell" title={row.measure.subsetLabel}>
                                {row.measure.subsetLabel}
                              </td>
                              <td className="list-page-modal-access-table-measure-name-cell" title={row.measure.name}>
                                {row.measure.name}
                              </td>
                              <td>
                                <select
                                  className="list-page-modal-select list-page-modal-access-select"
                                  aria-label={`${row.person.name} — ${row.measure.name} — access`}
                                  value={perm}
                                  onChange={(e) =>
                                    setAccessControlMatrix((prev) => ({
                                      ...prev,
                                      [cellKey]: e.target.value as AccessScopePermission,
                                    }))
                                  }
                                >
                                  {ACCESS_SCOPE_PERMISSION_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
              <div className="list-page-modal-footer list-page-modal-footer--split">
                <button
                  type="button"
                  className="list-page-modal-button-link"
                  onClick={() => {
                    setIsNextStepModalOpen(false);
                  }}
                >
                  Cancel
                </button>
                <div className="list-page-modal-footer-actions">
                  <button
                    type="button"
                    className="list-page-modal-button-neutral"
                    onClick={() => {
                      setIsNextStepModalOpen(false);
                      setIsModalOpen(true);
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="list-page-modal-create"
                    onClick={() => {
                      setIsNextStepModalOpen(false);
                    }}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
            </div>
            {accessColumnFilterPanel &&
              createPortal(
                <div
                  id="access-col-filter-panel"
                  ref={accessColumnFilterPanelRef}
                  className="list-page-modal-access-col-panel"
                  style={{
                    position: 'fixed',
                    top: accessColumnFilterPanel.top,
                    left: accessColumnFilterPanel.left,
                    width: accessColumnFilterPanel.width,
                    zIndex: 100045,
                  }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="access-col-filter-title"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="list-page-modal-access-col-panel-header">
                    <h3 className="list-page-modal-access-col-panel-title" id="access-col-filter-title">
                      {accessColumnFilterPanel.column === 'person'
                        ? 'Person'
                        : accessColumnFilterPanel.column === 'jobRole'
                          ? 'Job role'
                          : accessColumnFilterPanel.column === 'subset'
                            ? 'Measure subset'
                            : accessColumnFilterPanel.column === 'measure'
                              ? 'Measure'
                              : 'Access'}
                    </h3>
                    <button
                      type="button"
                      className="list-page-modal-access-col-panel-close"
                      aria-label="Close"
                      onClick={() => setAccessColumnFilterPanel(null)}
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="list-page-modal-access-col-panel-body">
                    {accessColumnFilterPanel.column === 'person' && (
                      <>
                        <span className="list-page-modal-label" id="access-col-panel-person-label">
                          Filter by name
                        </span>
                        <AccessSearchableMultiSelect
                          menuZIndex={100055}
                          options={accessPersonFilterOptions}
                          values={accessFilterPersonNames}
                          onChange={setAccessFilterPersonNames}
                          placeholder="All people"
                          ariaLabel="Person filter"
                          ariaLabelledby="access-col-panel-person-label"
                        />
                      </>
                    )}
                    {accessColumnFilterPanel.column === 'jobRole' && (
                      <>
                        <span className="list-page-modal-label" id="access-col-panel-job-label">
                          Filter by job role
                        </span>
                        <AccessSearchableMultiSelect
                          menuZIndex={100055}
                          options={accessJobRoleFilterOptions}
                          values={accessFilterJobRoles}
                          onChange={setAccessFilterJobRoles}
                          placeholder="All roles"
                          ariaLabel="Job role filter"
                          ariaLabelledby="access-col-panel-job-label"
                        />
                      </>
                    )}
                    {accessColumnFilterPanel.column === 'subset' && (
                      <>
                        <span className="list-page-modal-label" id="access-col-panel-subset-label">
                          Filter by measure subset
                        </span>
                        <AccessSearchableMultiSelect
                          menuZIndex={100055}
                          options={accessSubsetFilterOptions}
                          values={accessFilterSubsetLabels}
                          onChange={setAccessFilterSubsetLabels}
                          placeholder="All subsets"
                          ariaLabel="Measure subset filter"
                          ariaLabelledby="access-col-panel-subset-label"
                        />
                      </>
                    )}
                    {accessColumnFilterPanel.column === 'measure' && (
                      <>
                        <span className="list-page-modal-label" id="access-col-panel-measure-label">
                          Filter by measure
                        </span>
                        <AccessSearchableMultiSelect
                          menuZIndex={100055}
                          options={accessMeasureFilterOptions}
                          values={accessFilterMeasureNames}
                          onChange={setAccessFilterMeasureNames}
                          placeholder="All measures"
                          ariaLabel="Measure filter"
                          ariaLabelledby="access-col-panel-measure-label"
                        />
                      </>
                    )}
                    {accessColumnFilterPanel.column === 'access' && (
                      <>
                        <span className="list-page-modal-label" id="access-col-panel-access-label">
                          Filter by access level
                        </span>
                        <AccessSearchableMultiSelect
                          menuZIndex={100055}
                          options={[...ACCESS_SCOPE_PERMISSION_OPTIONS]}
                          values={accessFilterAccessLevels}
                          onChange={(v) => setAccessFilterAccessLevels(v as AccessScopePermission[])}
                          placeholder="All access levels"
                          ariaLabel="Access level filter"
                          ariaLabelledby="access-col-panel-access-label"
                        />
                      </>
                    )}
                  </div>
                </div>,
                document.body,
              )}
            {accessBulkPopoverOpen && bulkPopoverPosition && (
              <div
                ref={bulkPopoverRef}
                className={`list-page-modal-access-bulk-popover${
                  bulkPopoverPosition.placement === 'above' ? ' list-page-modal-access-bulk-popover--above' : ''
                }`}
                style={{
                  position: 'fixed',
                  top: bulkPopoverPosition.top,
                  left: bulkPopoverPosition.left,
                  zIndex: 100003,
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="access-bulk-popover-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span
                  className="list-page-modal-access-bulk-popover-nib"
                  style={{ left: bulkPopoverPosition.nibLeft }}
                  aria-hidden
                />
                <div className="list-page-modal-access-bulk-popover-body">
                  <p className="list-page-modal-access-bulk-popover-count" id="access-bulk-popover-title">
                    {bulkAccessSelectionLabel}
                  </p>
                  <p className="list-page-modal-access-bulk-popover-hint">
                    Sets access for all selected person–measure rows.
                  </p>
                  <div className="list-page-modal-access-bulk-popover-field">
                    <label className="list-page-modal-label" htmlFor="access-bulk-permission">
                      Access
                    </label>
                    <select
                      id="access-bulk-permission"
                      className="list-page-modal-select"
                      value={bulkEditPermission}
                      onChange={(e) => setBulkEditPermission(e.target.value as AccessScopePermission)}
                    >
                      {ACCESS_SCOPE_PERMISSION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="list-page-modal-access-bulk-popover-footer">
                  <button
                    type="button"
                    className="list-page-modal-button-neutral"
                    onClick={() => setAccessBulkPopoverOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="list-page-modal-create"
                    disabled={accessBulkSelectedRowKeys.size === 0}
                    onClick={handleBulkAccessApply}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </>,
          document.body,
        )}
    </div>
  );
};

export default PlanningForecastingListPage;

