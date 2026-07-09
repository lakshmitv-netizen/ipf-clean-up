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
};

/* Level-name pools used to build each hierarchy's level rows. */
export const PRODUCT_LEVEL_NAMES = ['Category', 'Brand', 'Sub-Brand', 'SKU', 'Variant', 'Pack'];
export const ACCOUNT_LEVEL_NAMES = ['Region', 'Country', 'Account Group', 'Account', 'Sub-Account', 'Territory'];

export const HIERARCHY_STORAGE_KEY = 'cpm_hierarchies';

export const HIERARCHY_ROWS: HierarchyRow[] = [
  { id: 'fy26-acc', name: 'FY 26 Accounts', active: true, dim: 'Account', levels: 4, status: 'ok', sync: '12/05/2026, 10:30 AM' },
  { id: 'fy25-acc', name: 'FY 25 Accounts', active: false, dim: 'Account', levels: 3, status: 'ok', sync: '12/05/2026, 10:30 AM' },
  { id: 'fy24-acc', name: 'FY 24 Accounts', active: false, dim: 'Account', levels: 5, status: 'ok', sync: '12/05/2026, 9:15 AM' },
  { id: 'fy25-prod', name: 'FY 25 Products', active: false, dim: 'Product', levels: 3, status: 'ok', sync: '12/05/2026, 8:45 AM' },
  { id: 'fy24-prod', name: 'FY 24 Products', active: true, dim: 'Product', levels: 4, status: 'requested', sync: '12/05/2026, 8:00 AM' },
  { id: 'sales-acc', name: 'Sales Accounts', active: false, dim: 'Account', levels: 6, status: 'ok', sync: '11/05/2026, 5:30 PM' },
  { id: 'fin-acc', name: 'Financial Accounts', active: false, dim: 'Account', levels: 4, status: 'ok', sync: '11/05/2026, 5:30 PM' },
];

/** Read the current hierarchy rows from localStorage, falling back to defaults. */
export function loadHierarchyRows(): HierarchyRow[] {
  try {
    const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as HierarchyRow[]) : HIERARCHY_ROWS;
  } catch {
    return HIERARCHY_ROWS;
  }
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
      dataStatus: row.status === 'ok' ? 'Sync Successful' : 'Data Requested',
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
