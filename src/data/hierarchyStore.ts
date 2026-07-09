// Shared source of truth for hierarchies.
//
// The Setup Hierarchies modal (CpmFeaturePage, step 1.1) edits these rows and
// persists them to localStorage. The Plan Configuration builder's
// "Select Hierarchy" dropdown (PlanningGridConfig) derives its options from the
// same data, so any change to a hierarchy's name, level names or number of
// levels made in the modal shows up in the builder, and every hierarchy created
// in the modal appears in the dropdown.

import type { Hierarchy } from './planConfigData';

export type HierarchyRow = {
  id: string;
  name: string;
  active: boolean;
  dim: 'Account' | 'Product';
  levels: number;
  status: 'ok' | 'requested';
  sync: string;
  /** Optional custom level names; when present they override the generated pool. */
  levelNames?: string[];
  /** Human-readable creation date shown in the Manage Hierarchies modal. */
  createdOn?: string;
  /** Free-form data status label shown in the Manage Hierarchies modal. */
  dataStatus?: string;
};

/* Level-name pools used to build each hierarchy's level rows. */
export const PRODUCT_LEVEL_NAMES = ['Category', 'Brand', 'Sub-Brand', 'SKU', 'Variant', 'Pack'];
export const ACCOUNT_LEVEL_NAMES = ['Region', 'Country', 'Account Group', 'Account', 'Sub-Account', 'Territory'];

// Bumped so any previously-seeded/test hierarchies are ignored and the Manage
// Hierarchies modal starts empty ("No hierarchies created") on first load.
export const HIERARCHY_STORAGE_KEY = 'cpm_hierarchies_v3';

// Flag marking that the one-time reset below has already run. Once set, the live
// key is left alone so user-created hierarchies persist across reloads.
const HIERARCHY_RESET_FLAG = 'cpm_hierarchies_reset_v3';

// Clean up legacy keys on every load, and wipe the live key exactly once so the
// Manage Hierarchies modal starts genuinely empty ("No hierarchies created") —
// even if a previous session persisted seed/test data to it. After this runs
// once, anything the user creates is preserved.
try {
  localStorage.removeItem('cpm_hierarchies');
  localStorage.removeItem('cpm_hierarchies_v2');
  if (!localStorage.getItem(HIERARCHY_RESET_FLAG)) {
    localStorage.removeItem('cpm_hierarchies_v3');
    localStorage.setItem(HIERARCHY_RESET_FLAG, '1');
  }
} catch {
  /* localStorage unavailable */
}

// No hierarchies are seeded by default — the user creates them via the
// "Create New" flow, and they then persist for the Plan Configuration builder.
export const HIERARCHY_ROWS: HierarchyRow[] = [];

/** Read the current hierarchy rows from localStorage, falling back to defaults. */
export function loadHierarchyRows(): HierarchyRow[] {
  try {
    const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as HierarchyRow[]) : HIERARCHY_ROWS;
  } catch {
    return HIERARCHY_ROWS;
  }
}

/**
 * Persist hierarchy rows so the Plan Configuration builder can read them back.
 * Also mirrors the list of dimensions (used by other setup surfaces).
 */
export function saveHierarchyRows(rows: HierarchyRow[]): void {
  try {
    localStorage.setItem(HIERARCHY_STORAGE_KEY, JSON.stringify(rows));
    const dimensions = Array.from(new Set(rows.map((r) => r.dim)));
    localStorage.setItem('cpm_dimensions', JSON.stringify(dimensions));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Resolve the data-status label shown for a hierarchy row. */
export function dataStatusForRow(row: HierarchyRow): string {
  if (row.dataStatus) return row.dataStatus;
  return row.status === 'ok' ? 'Sync Successful' : 'Data Requested';
}

/** Resolve the display names for each level of a hierarchy row. */
export function levelNamesForRow(row: HierarchyRow): string[] {
  if (row.levelNames && row.levelNames.length > 0) return row.levelNames;
  const pool = row.dim === 'Product' ? PRODUCT_LEVEL_NAMES : ACCOUNT_LEVEL_NAMES;
  return Array.from({ length: row.levels }, (_, i) => pool[i] || `Level ${i + 1}`);
}

/** Map the modal's hierarchy rows into the shape the Plan Config builder expects. */
export function toPlanConfigHierarchies(rows: HierarchyRow[]): Hierarchy[] {
  return rows.map((row) => {
    const names = levelNamesForRow(row);
    return {
      id: row.id,
      name: row.name,
      dimension: row.dim,
      dataStatus: dataStatusForRow(row),
      lastSync: row.sync,
      selected: false,
      isActive: row.active,
      numLevels: names.length,
      levels: names.map((name, i) => ({ id: i, level: i, name, isEditable: i >= 2 })),
    };
  });
}

/** Convenience: load rows and map them straight to Plan Config hierarchies. */
export function loadPlanConfigHierarchies(): Hierarchy[] {
  return toPlanConfigHierarchies(loadHierarchyRows());
}

// This module is the single source of truth for hierarchy data. React Fast
// Refresh preserves component state across edits, which can keep a stale
// in-memory hierarchy list alive. Force a genuine full page reload whenever this
// store changes so what you see always reflects localStorage (and the empty
// initial state).
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
