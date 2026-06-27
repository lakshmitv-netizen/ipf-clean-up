export type RowType = 'measure' | 'account' | 'category' | 'product' | 'filterSummary';

/** How parent row totals aggregate when panel filters inject "filtered out" summary siblings. */
export type ParentTotalsRollupMode =
  | 'fullHierarchy'
  | 'visibleOnly'
  /** Hierarchical grid: under each parent, show synthetic "Matches filter" / "Does not match filter" rows for column dimension filters. */
  | 'columnFilterBuckets';

export interface GridRow {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  type: RowType;
  children?: GridRow[];
  groupContext?: string; // Which measure group this row belongs to (for duplicated measures)
  /** Synthetic rows: aggregate of nodes excluded by panel filters, or column-filter pass/fail buckets */
  filterSummaryRole?: 'filteredOut' | 'filterBucketMatch' | 'filterBucketNoMatch';
  /** Dimension level of excluded siblings (for icon / parity with real dimension rows) */
  filteredOutDimension?: 'account' | 'category' | 'product';
  /** True when column filters hide at least one descendant; parent totals still reflect full hierarchy. */
  descendantsExcludedByColumnFilter?: boolean;
  values: {
    year: number; // FY26 - sum of all months
    q1: number;   // Q1 - sum of Jan, Feb, Mar
    q2: number;   // Q2 - sum of Apr, May, Jun
    q3: number;   // Q3 - sum of Jul, Aug, Sep
    q4: number;   // Q4 - sum of Oct, Nov, Dec
    jan2026: number;
    feb2026: number;
    mar2026: number;
    apr2026: number;
    may2026: number;
    jun2026: number;
    jul2026: number;
    aug2026: number;
    sep2026: number;
    oct2026: number;
    nov2026: number;
    dec2026: number;
  };
}

export interface MeasureData {
  id: string;
  name: string;
  values: {
    year: number;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    jan2026: number;
    feb2026: number;
    mar2026: number;
    apr2026: number;
    may2026: number;
    jun2026: number;
    jul2026: number;
    aug2026: number;
    sep2026: number;
    oct2026: number;
    nov2026: number;
    dec2026: number;
  };
  children: GridRow[];
  groupContext?: string; // Which measure group this instance belongs to (for duplicated measures)
}

export interface ApprovalRequest {
  id: string;
  cellKey: string;           // rowId-timeKey
  measureId: string;
  rowId: string;
  timeKey: string;           // "jan2026", "feb2026", etc.
  oldValue: number;
  newValue: number;
  variancePct: number;
  requesterNote: string;     // The adjustment note from the requester
  requesterId: string;
  requesterName: string;
  approverId: string;
  approverName: string;
  status: 'notSubmitted' | 'pending' | 'approved' | 'approvedWithCondition' | 'rejected';
  approverComment?: string;
  approvers?: import('./approvalRequest').ApproverState[];
  userInitiated?: boolean;
  createdAt: Date;
  resolvedAt?: Date;
}

