// Turns a saved PlanConfigDetail into the shapes the forecasting grid consumes:
// an ordered dimension scheme (row levels), a MeasureData[] tree, and colored
// glyphs for each level. Data is placeholder (zeros) — the point is that the
// configured level names, hierarchy order, and measures render correctly.

import type { MeasureData, GridRow, RowType } from '../types';
import type { DimensionLevelDef, DimensionGlyph } from './dimensionSchemes';
import { sumValues } from './deepHierarchyData';
import { getPlanConfigDetail, type PlanConfigDetail, type PlanConfigLevel } from './planConfigStore';
import {
  loadHierarchyRows,
  levelNamesForRow,
  ACCOUNT_LEVEL_NAMES,
  PRODUCT_LEVEL_NAMES,
} from './hierarchyStore';
import { loadSessionMeasures } from './measureStore';

/** cfg industry keys look like "cfg:<configId>". */
export const CONFIG_INDUSTRY_PREFIX = 'cfg:';

/**
 * Fixed id for the out-of-the-box "Account Planning" template. Its config is
 * derived live from the current Account/Product hierarchies and the current
 * measure list, so any customization the user makes to those flows straight
 * through config → plan → grid.
 */
export const OOTB_ACCOUNT_PLANNING_CONFIG_ID = 'ootb-account-planning';

/** The OOTB measure pack (name + subset category), matching the Review Measures seed. */
export const OOTB_MEASURES: { name: string; category: string }[] = [
  { name: 'Sales Agreement Quantity (No.s)', category: 'Volume' },
  { name: 'Sales Agreement Revenue', category: 'Financials' },
  { name: 'Opportunity Quantity (No.s)', category: 'Volume' },
  { name: 'Opportunity Revenue', category: 'Financials' },
  { name: 'Order Quantity (No.s)', category: 'Volume' },
  { name: 'Order Revenue', category: 'Financials' },
  { name: 'Last Year Order Quantity (No.s)', category: 'Volume' },
  { name: 'Last Years Order Revenue', category: 'Financials' },
  { name: 'Forecasted Quantity (No.s)', category: 'Volume' },
  { name: 'Forecasted Revenue', category: 'Financials' },
];

const OOTB_MEASURE_NAMES = OOTB_MEASURES.map((m) => m.name);

/**
 * Build the "Account Planning" config from live sources: the two OOTB hierarchies
 * (Account Sales + Product Sales) supply the levels, and the current measure list
 * supplies the measures. Re-derived on every call so the config always mirrors
 * the latest hierarchy/measure edits.
 */
export function buildOotbAccountPlanningDetail(): PlanConfigDetail {
  const rows = loadHierarchyRows().filter(
    (r) => r.id === 'ootb-account-sales' || r.id === 'ootb-product-sales',
  );
  const accountRows = rows.filter((r) => r.dim === 'Account');
  const productRows = rows.filter((r) => r.dim === 'Product');
  const levels: PlanConfigLevel[] = [];
  [...accountRows, ...productRows].forEach((row) => {
    levelNamesForRow(row).forEach((name) => levels.push({ name, hierarchy: row.name }));
  });

  const session = loadSessionMeasures();
  const measures =
    session && session.length
      ? session.map((m) => ({ name: m.name, category: m.category || 'Volume' }))
      : OOTB_MEASURES.map((m) => ({ ...m }));

  return {
    id: OOTB_ACCOUNT_PLANNING_CONFIG_ID,
    name: 'Account Planning',
    description:
      'B2B account × product revenue, volume, and margin planning at defined hierarchy levels.',
    levels,
    measures,
    subsets: [{ name: 'Revenue & Quantity Measures', measures: measures.map((m) => m.name) }],
  };
}

function orderedEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * True when the Account Planning plan is still the untouched OOTB template — i.e.
 * its account levels, product levels, and measures all match the OOTB defaults.
 * When pristine, the grid uses the ready-made deep dataset (realistic numbers);
 * once anything diverges, callers fall back to the generated config grid.
 */
export function isPristineOotbAccountPlanning(industry: string | null | undefined): boolean {
  if (!isConfigIndustry(industry)) return false;
  const id = configIdFromIndustry(industry as string);
  if (id !== OOTB_ACCOUNT_PLANNING_CONFIG_ID) return false;
  const detail = getPlanConfigDetail(id) ?? buildOotbAccountPlanningDetail();
  const accountLevels = detail.levels.filter((l) => /account/i.test(l.hierarchy)).map((l) => l.name);
  const productLevels = detail.levels.filter((l) => /product/i.test(l.hierarchy)).map((l) => l.name);
  const measureNames = detail.measures.map((m) => m.name);
  return (
    orderedEqual(accountLevels, ACCOUNT_LEVEL_NAMES) &&
    orderedEqual(productLevels, PRODUCT_LEVEL_NAMES) &&
    setEqual(measureNames, OOTB_MEASURE_NAMES)
  );
}

export function isConfigIndustry(industry: string | null | undefined): boolean {
  return typeof industry === 'string' && industry.startsWith(CONFIG_INDUSTRY_PREFIX);
}

export function configIndustryKey(id: string): `cfg:${string}` {
  return `cfg:${id}`;
}

function configIdFromIndustry(industry: string): string {
  return industry.slice(CONFIG_INDUSTRY_PREFIX.length);
}

export function isConfigLevel(levelId: string): boolean {
  return levelId.startsWith('cfg-');
}

/** The active plan's time frame (duration + planning period), or null when the
 *  industry isn't a config or the config carries no time frame. */
export function getConfigTimeFrame(
  industry: string | null | undefined,
): { duration?: string; planningPeriod?: string } | null {
  if (!isConfigIndustry(industry)) return null;
  const detail = getPlanConfigDetail(configIdFromIndustry(industry as string));
  if (!detail || (!detail.duration && !detail.planningPeriod)) return null;
  return { duration: detail.duration, planningPeriod: detail.planningPeriod };
}

const H1_MONTHS = ['jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026'];
const H2_MONTHS = ['jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026'];
const Q_MONTHS: Record<string, string[]> = {
  q1: ['jan2026', 'feb2026', 'mar2026'],
  q2: ['apr2026', 'may2026', 'jun2026'],
  q3: ['jul2026', 'aug2026', 'sep2026'],
  q4: ['oct2026', 'nov2026', 'dec2026'],
};

export interface PlanPeriodScope {
  /** Allowed aggregate/month column keys. Empty when unscoped. */
  keys: Set<string>;
  /** Inclusive [start, end] week numbers, or null for all weeks / unscoped. */
  weekRange: [number, number] | null;
  /** When false, the grid shows all periods (e.g. a full-year plan). */
  scoped: boolean;
}

/**
 * Map a planning period string (e.g. "H2 FY 2025", "Q1 FY 2026", "FY 2025") to
 * the set of grid time columns it should show. Half/quarter plans scope the grid
 * to just that span (and its aggregate column); full-year plans stay unscoped.
 */
export function getPlanPeriodScope(planningPeriod?: string): PlanPeriodScope {
  const unscoped: PlanPeriodScope = { keys: new Set(), weekRange: null, scoped: false };
  if (!planningPeriod) return unscoped;
  const p = planningPeriod.trim().toUpperCase();
  if (p.startsWith('H1')) return { keys: new Set(['h1', 'q1', 'q2', ...H1_MONTHS]), weekRange: [1, 26], scoped: true };
  if (p.startsWith('H2')) return { keys: new Set(['h2', 'q3', 'q4', ...H2_MONTHS]), weekRange: [27, 52], scoped: true };
  const qMatch = /^Q([1-4])/.exec(p);
  if (qMatch) {
    const q = `q${qMatch[1]}`;
    const weekStart = (Number(qMatch[1]) - 1) * 13 + 1;
    return { keys: new Set([q, ...Q_MONTHS[q]]), weekRange: [weekStart, weekStart + 12], scoped: true };
  }
  // Full-year ("FY ...") or anything else: show everything.
  return unscoped;
}

/** Default grid granularities for a plan duration, so the matching aggregation
 *  column (Half/Quarter/Year) is visible alongside months. */
export function defaultGranularitiesForDuration(duration?: string): string[] {
  if (duration === 'half-yearly') return ['half', 'month'];
  if (duration === 'quarterly') return ['quarter', 'month'];
  return ['year', 'month'];
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'lvl';

const ACCOUNT_PALETTE = ['#1B5E9B', '#2E7D9A', '#0F9D8C', '#3B7A57', '#6A8D2F', '#4A6FA5'];
const PRODUCT_PALETTE = ['#6A3FB5', '#8E44AD', '#B03A78', '#C0562B', '#B8860B', '#9B59B6'];

function glyphLetters(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || 'LV';
}

// ── value bags ──────────────────────────────────────────────────────────────
const MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
] as const;

type ValueBag = GridRow['values'];

const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

/** Build a value bag (months + quarters + year + cost) from a 12-month array. */
function bag(months: number[]): ValueBag {
  const m: Record<string, number> = {};
  MONTH_KEYS.forEach((mk, idx) => { m[mk] = months[idx] ?? 0; });
  const q1 = m.jan2026 + m.feb2026 + m.mar2026;
  const q2 = m.apr2026 + m.may2026 + m.jun2026;
  const q3 = m.jul2026 + m.aug2026 + m.sep2026;
  const q4 = m.oct2026 + m.nov2026 + m.dec2026;
  const year = q1 + q2 + q3 + q4;
  return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...m, _cost: 0 } as unknown as ValueBag;
}

/** Small placeholder single-digit values per month for a leaf. */
function leafMonths(seed: string): number[] {
  return Array.from({ length: 12 }, (_, i) => Math.floor(seededRandom(`${seed}-${i}`) * 10));
}

interface BuiltConfig {
  scheme: DimensionLevelDef[];
  data: MeasureData[];
  glyphs: Record<string, DimensionGlyph>;
}

const CACHE = new Map<string, BuiltConfig>();
// Global glyph registry so getDimensionGlyph (which only knows a level id) can resolve.
const GLYPH_REGISTRY: Record<string, DimensionGlyph> = {};

export function getConfigGlyph(levelId: string): DimensionGlyph | null {
  return GLYPH_REGISTRY[levelId] ?? { letters: 'LV', bg: '#5C5C5C' };
}

function buildScheme(detail: PlanConfigDetail): { scheme: DimensionLevelDef[]; glyphs: Record<string, DimensionGlyph> } {
  const scheme: DimensionLevelDef[] = [];
  const glyphs: Record<string, DimensionGlyph> = {};
  let accountIdx = 0;
  let productIdx = 0;
  detail.levels.forEach((lvl, i) => {
    const id = `cfg-${i}-${slug(lvl.name)}`;
    scheme.push({ id, name: lvl.name, hierarchy: lvl.hierarchy });
    const isProduct = /product/i.test(lvl.hierarchy);
    const palette = isProduct ? PRODUCT_PALETTE : ACCOUNT_PALETTE;
    const paletteIdx = isProduct ? productIdx++ : accountIdx++;
    glyphs[id] = { letters: glyphLetters(lvl.name), bg: palette[paletteIdx % palette.length] };
  });
  return { scheme, glyphs };
}

/** Build the row tree for one measure: 2 children per node, leaves at the last
 *  level. At the top level, `topLevelValues` (the account groups picked in the
 *  Create Plan modal) drive the row count and labels so the grid matches the
 *  user's selection; deeper levels keep generic "<level> <n>" names. */
function buildRows(
  scheme: DimensionLevelDef[],
  levelIdx: number,
  parentId: string,
  path: string,
  measureId: string,
  topLevelValues?: string[],
): GridRow[] {
  const level = scheme[levelIdx];
  const isLeaf = levelIdx === scheme.length - 1;
  const useSelection = levelIdx === 0 && !!topLevelValues && topLevelValues.length > 0;
  const count = useSelection ? topLevelValues!.length : 2;
  const rows: GridRow[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${path}-${i}-${measureId}`;
    const name = useSelection ? topLevelValues![i] : `${level.name} ${i + 1}`;
    if (isLeaf) {
      rows.push({
        id,
        name,
        parentId,
        level: levelIdx + 1,
        type: level.id as RowType,
        values: bag(leafMonths(id)),
      });
    } else {
      const children = buildRows(scheme, levelIdx + 1, id, `${path}-${i}`, measureId);
      rows.push({
        id,
        name,
        parentId,
        level: levelIdx + 1,
        type: level.id as RowType,
        values: sumValues(children.map((c) => c.values), 0, id),
        children,
      });
    }
  }
  return rows;
}

function buildData(detail: PlanConfigDetail, scheme: DimensionLevelDef[]): MeasureData[] {
  if (scheme.length === 0) return [];
  return detail.measures.map((m, mi) => {
    const measureId = `cfgm-${mi}-${slug(m.name)}`;
    const roots = buildRows(scheme, 0, measureId, measureId, measureId, detail.topLevelValues);
    return {
      id: measureId,
      name: m.name,
      values: sumValues(roots.map((r) => r.values), 0, measureId),
      children: roots,
    };
  });
}

function build(detail: PlanConfigDetail): BuiltConfig {
  const { scheme, glyphs } = buildScheme(detail);
  Object.assign(GLYPH_REGISTRY, glyphs);
  const data = buildData(detail, scheme);
  return { scheme, data, glyphs };
}

function getBuilt(industry: string): BuiltConfig | null {
  const id = configIdFromIndustry(industry);
  const detail = getPlanConfigDetail(id);
  if (!detail) return null;
  // Include the selected top-level values in the key so re-creating a plan with
  // a different account-group selection rebuilds the grid instead of serving a
  // stale cached tree.
  const key = `${id}::${(detail.topLevelValues ?? []).join('|')}`;
  const cached = CACHE.get(key);
  if (cached) return cached;
  const built = build(detail);
  CACHE.set(key, built);
  return built;
}

export function getConfigDimensionScheme(industry: string): DimensionLevelDef[] {
  return getBuilt(industry)?.scheme ?? [];
}

export function getConfigMockData(industry: string): MeasureData[] {
  return getBuilt(industry)?.data ?? [];
}

/** Measure categories (subsets) for a config grid: { name, measureNames }. */
export function getConfigMeasureCategories(
  industry: string | null | undefined,
): { name: string; measures: string[] }[] {
  if (!isConfigIndustry(industry)) return [];
  const id = configIdFromIndustry(industry as string);
  const detail = getPlanConfigDetail(id);
  return detail?.subsets?.map((s) => ({ name: s.name, measures: s.measures })) ?? [];
}
