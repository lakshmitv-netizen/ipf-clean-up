// Deep-hierarchy demo dataset for the "manufacturing-deep" grid.
//
// Each measure expands into a 10-level hierarchy:
//   Account:  Global Account Group -> Strategic Account Group -> Segment -> Sold-to -> Ship-to
//   Product:  Company -> Business Unit -> Product Family -> Commodity -> Part
// (product levels nest under the deepest account level, mirroring how the existing grid
// nests products under accounts). Values roll up bottom-up so parent totals equal the
// sum of their children. Weekly columns are added later by getMockData via ensureWeekValues.

import type { MeasureData, GridRow, RowType } from '../types';

const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

const MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
] as const;

type ValueBag = GridRow['values'];

/** Build a full values bag (months + quarters + year) for a leaf from a base amount. */
function leafValues(base: number, seed: string): ValueBag {
  const months: Record<string, number> = {};
  MONTH_KEYS.forEach((mk, idx) => {
    const jitter = 0.85 + seededRandom(`${seed}-${mk}`) * 0.30; // 0.85–1.15
    const seasonal = 1 + Math.sin((idx / 12) * Math.PI * 2 + seededRandom(seed) * 6) * 0.08;
    months[mk] = Math.max(0, Math.round(base * jitter * seasonal));
  });
  return finalizeValues(months, base, seed);
}

/** Sum an array of child value bags into a parent bag. */
export function sumValues(children: ValueBag[], base: number, seed: string): ValueBag {
  const months: Record<string, number> = {};
  MONTH_KEYS.forEach((mk) => {
    months[mk] = children.reduce((acc, c) => acc + (c[mk as keyof ValueBag] as number || 0), 0);
  });
  return finalizeValues(months, base, seed);
}

function finalizeValues(months: Record<string, number>, base: number, seed: string): ValueBag {
  const q1 = months.jan2026 + months.feb2026 + months.mar2026;
  const q2 = months.apr2026 + months.may2026 + months.jun2026;
  const q3 = months.jul2026 + months.aug2026 + months.sep2026;
  const q4 = months.oct2026 + months.nov2026 + months.dec2026;
  const year = q1 + q2 + q3 + q4;
  const cost = Math.round((year || base) * (0.45 + seededRandom(`${seed}-cost`) * 0.5));
  return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...months, _cost: cost } as unknown as ValueBag;
}

interface LevelDef {
  type: RowType;
  names: string[];
  branch: number;
}

// 10-level config (account levels first, then product levels nested under the deepest account).
const LEVELS: LevelDef[] = [
  { type: 'acct-global',    names: ['Acme Global', 'Zenith Global'],                       branch: 2 },
  { type: 'acct-strategic', names: ['Strategic Group Alpha', 'Strategic Group Beta'],      branch: 2 },
  { type: 'acct-segment',   names: ['Enterprise', 'Mid-Market'],                           branch: 2 },
  { type: 'acct-soldto',    names: ['Sold-to North', 'Sold-to South'],                     branch: 1 },
  { type: 'acct-shipto',    names: ['Ship-to Primary', 'Ship-to Secondary'],               branch: 1 },
  { type: 'prod-company',   names: ['MagnaCorp', 'Zenith Manufacturing'],                  branch: 2 },
  { type: 'prod-bu',        names: ['Powertrain BU', 'Chassis BU'],                        branch: 2 },
  { type: 'prod-family',    names: ['Transmission Family', 'Driveline Family'],            branch: 2 },
  { type: 'prod-commodity', names: ['Gears', 'Bearings'],                                  branch: 1 },
  { type: 'prod-part',      names: ['PN-1001', 'PN-2002'],                                 branch: 1 },
];

const TOTAL_LEAVES = LEVELS.reduce((acc, l) => acc * l.branch, 1);

function buildNode(
  depth: number,
  parentId: string,
  pathPrefix: string,
  measureId: string,
  measureBase: number,
): GridRow {
  const def = LEVELS[depth];
  const id = `${pathPrefix}-${def.type}-${measureId}`;
  const name = def.names[extractIndex(pathPrefix) % def.names.length] ?? def.names[0];

  if (depth === LEVELS.length - 1) {
    const base = measureBase / TOTAL_LEAVES;
    return {
      id,
      name,
      parentId,
      level: depth + 1,
      type: def.type,
      values: leafValues(base, id),
    };
  }

  const children: GridRow[] = [];
  for (let b = 0; b < def.branch; b++) {
    children.push(buildNode(depth + 1, id, `${pathPrefix}-${b}`, measureId, measureBase));
  }
  return {
    id,
    name,
    parentId,
    level: depth + 1,
    type: def.type,
    values: sumValues(children.map((c) => c.values), measureBase, id),
    children,
  };
}

/** Read the last path segment index (used to vary sibling names deterministically). */
function extractIndex(pathPrefix: string): number {
  const parts = pathPrefix.split('-');
  const last = parseInt(parts[parts.length - 1], 10);
  return Number.isNaN(last) ? 0 : last;
}

export function buildDeepHierarchy(measureId: string, measureBase: number): GridRow[] {
  const roots: GridRow[] = [];
  for (let b = 0; b < LEVELS[0].branch; b++) {
    roots.push(buildNode(0, measureId, `${b}`, measureId, measureBase));
  }
  return roots;
}

const MEASURES: { id: string; name: string; base: number }[] = [
  { id: 'measure-sa-qty',        name: 'Sales Agreement Quantity (No.s)',      base: 800 },
  { id: 'measure-sa-rev',        name: 'Sales Agreement Revenue',              base: 80000 },
  { id: 'measure-opp-qty',       name: 'Opportunity Quantity (No.s)',          base: 1200 },
  { id: 'measure-opp-rev',       name: 'Opportunity Revenue',                  base: 120000 },
  { id: 'measure-order-qty',     name: 'Order Quantity (No.s)',                base: 950 },
  { id: 'measure-order-rev',     name: 'Order Revenue',                        base: 95000 },
  { id: 'measure-ly-order-qty',  name: 'Last Year Order Quantity (No.s)',      base: 750 },
  { id: 'measure-ly-order-rev',  name: 'Last Years Order Revenue',             base: 75000 },
  { id: 'measure-forecast-qty',  name: 'Forecasted Quantity (No.s)',           base: 1000 },
  { id: 'measure-forecast-rev',  name: 'Forecasted Revenue',                   base: 100000 },
];

export const deepHierarchyData: MeasureData[] = MEASURES.map((m) => {
  const children = buildDeepHierarchy(m.id, m.base);
  return {
    id: m.id,
    name: m.name,
    values: sumValues(children.map((c) => c.values), m.base, m.id),
    children,
  };
});
