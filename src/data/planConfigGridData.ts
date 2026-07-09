// Turns a saved PlanConfigDetail into the shapes the forecasting grid consumes:
// an ordered dimension scheme (row levels), a MeasureData[] tree, and colored
// glyphs for each level. Data is placeholder (zeros) — the point is that the
// configured level names, hierarchy order, and measures render correctly.

import type { MeasureData, GridRow, RowType } from '../types';
import type { DimensionLevelDef, DimensionGlyph } from './dimensionSchemes';
import { sumValues } from './deepHierarchyData';
import { getPlanConfigDetail, type PlanConfigDetail } from './planConfigStore';

/** cfg industry keys look like "cfg:<configId>". */
export const CONFIG_INDUSTRY_PREFIX = 'cfg:';

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
  return { year, q1, q2, q3, q4, ...m, _cost: 0 } as unknown as ValueBag;
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

/** Build the row tree for one measure: 2 children per node, leaves at the last level. */
function buildRows(
  scheme: DimensionLevelDef[],
  levelIdx: number,
  parentId: string,
  path: string,
  measureId: string,
): GridRow[] {
  const level = scheme[levelIdx];
  const isLeaf = levelIdx === scheme.length - 1;
  const count = 2;
  const rows: GridRow[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${path}-${i}-${measureId}`;
    const name = `${level.name} ${i + 1}`;
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
    const roots = buildRows(scheme, 0, measureId, measureId, measureId);
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
  const cached = CACHE.get(id);
  if (cached) return cached;
  const detail = getPlanConfigDetail(id);
  if (!detail) return null;
  const built = build(detail);
  CACHE.set(id, built);
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
