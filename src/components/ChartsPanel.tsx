import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GridRow } from '../types';
import { getDimensionGlyph } from '../data/dimensionSchemes';
import { getSubColumnNumeric, getSubColumnUnit, type SubColumnUnit } from './GridRow';
import type { SubColumn } from './EditSubColumnsModal';
import { BASE_LINE_COLOR, getSubColumnLineColorMap, isChartedSubColumn } from '../utils/subColumnColors';
import '../styles/components/ChartsPanel.css';

/* ------------------------------------------------------------------ */
/* Charts panel — right-side drawer that shows, for a focused row:     */
/*   • a monthly trend line (FY26)                                     */
/*   • a donut of the share of the row's children (parent rows only),  */
/*     with a time-period dropdown.                                    */
/* ------------------------------------------------------------------ */

type ValueKey = keyof GridRow['values'];

/* Level icons — same public assets the grid uses for each dimension level. */
const ICON_BASE = import.meta.env.BASE_URL;
const LEVEL_ICON_SRC: Record<string, string> = {
  account: `${ICON_BASE}new_account.svg`,
  category: `${ICON_BASE}category.svg`,
  product: `${ICON_BASE}product.svg`,
  measure: `${ICON_BASE}measure-row.svg`,
};

/** Renders the row's level icon exactly like the grid: SVG for account/category/product/measure, colored acronym for deep/config levels. */
const RowIcon: React.FC<{ type?: string }> = ({ type }) => {
  // Measures resolved from live data have no `type` — default to the measure icon.
  const src = type ? LEVEL_ICON_SRC[type] : LEVEL_ICON_SRC.measure;
  if (src) return <img className="charts-row-icon-img" src={src} alt="" decoding="async" />;
  const glyph = type ? getDimensionGlyph(type) : null;
  if (glyph) {
    return (
      <span className="charts-row-glyph" style={{ backgroundColor: glyph.bg }}>
        {glyph.letters}
      </span>
    );
  }
  return null;
};

const MONTHS: { key: ValueKey; label: string }[] = [
  { key: 'jan2026', label: 'Jan' },
  { key: 'feb2026', label: 'Feb' },
  { key: 'mar2026', label: 'Mar' },
  { key: 'apr2026', label: 'Apr' },
  { key: 'may2026', label: 'May' },
  { key: 'jun2026', label: 'Jun' },
  { key: 'jul2026', label: 'Jul' },
  { key: 'aug2026', label: 'Aug' },
  { key: 'sep2026', label: 'Sep' },
  { key: 'oct2026', label: 'Oct' },
  { key: 'nov2026', label: 'Nov' },
  { key: 'dec2026', label: 'Dec' },
];

/* Period options for the pie/donut dropdown. */
const PERIODS: { key: ValueKey; label: string }[] = [
  { key: 'year', label: 'FY26 (full year)' },
  { key: 'q1', label: 'Q1' },
  { key: 'q2', label: 'Q2' },
  { key: 'q3', label: 'Q3' },
  { key: 'q4', label: 'Q4' },
  ...MONTHS.map((m) => ({ key: m.key, label: `${m.label} 2026` })),
];

const PIE_COLORS = [
  '#0176d3', '#1b96ff', '#9050e9', '#ff9e2c', '#04844b',
  '#e5701a', '#b83c8c', '#3ba755', '#5867e8', '#c23934',
  '#0b827c', '#8a4fdf',
];

/* Distinct palette for the sub-column-mode "share of children" pie, chosen to avoid
   clashing with the trend line colors (blue / purple / green / orange). */
const SERIES_PIE_COLORS = [
  '#ec4899', '#14b8a6', '#eab308', '#64748b', '#d946ef',
  '#84cc16', '#a16207', '#0891b2', '#be185d', '#4d7c0f',
];

/** Compact currency-ish formatter for chart labels. */
const fmt = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

/** Format a value according to its sub-column unit. */
const fmtUnit = (n: number, unit: SubColumnUnit): string => {
  if (unit === 'percent') return `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
  return fmt(n);
};

const val = (row: GridRow, key: ValueKey): number => Number(row.values?.[key] ?? 0);

/* Summary stats over the row's monthly values (for the tiles above the charts). */
interface TrendStats {
  total: number;
  avg: number;
  highest: number;
  highestMonth: string;
  lowest: number;
  lowestMonth: string;
  maxDev: number;
  maxDevPct: number;
  maxDevMonth: string;
}
const computeTrendStats = (row: GridRow): TrendStats => {
  const monthly = MONTHS.map((m) => val(row, m.key));
  const total = monthly.reduce((a, b) => a + b, 0);
  const avg = monthly.length ? total / monthly.length : 0;
  let maxI = 0;
  let minI = 0;
  let devI = 0;
  monthly.forEach((v, i) => {
    if (v > monthly[maxI]) maxI = i;
    if (v < monthly[minI]) minI = i;
    if (Math.abs(v - avg) > Math.abs(monthly[devI] - avg)) devI = i;
  });
  const maxDev = monthly[devI] - avg;
  return {
    total,
    avg,
    highest: monthly[maxI],
    highestMonth: MONTHS[maxI].label,
    lowest: monthly[minI],
    lowestMonth: MONTHS[minI].label,
    maxDev,
    maxDevPct: avg !== 0 ? (maxDev / avg) * 100 : 0,
    maxDevMonth: MONTHS[devI].label,
  };
};

/* ---------------------------- Trend lines -------------------------- */
interface TrendSeries {
  id: string;
  name: string;
  color: string;
  unit: SubColumnUnit;
  values: number[];
}

const TrendChart: React.FC<{
  width: number;
  series: TrendSeries[];
  /** Scale each line to its own range (true) or share one scale across all lines (false).
   *  When series share a unit we want the SHARED scale so the real gaps between lines show. */
  normalizePerSeries?: boolean;
  /** Frozen values used to compute the y-axis domain. Keeps the scale stable across edits so
   *  an edited point moves within a fixed axis instead of rescaling the whole chart. */
  scaleSeries?: TrendSeries[];
  selectedIndex: number | null;
  activeSeriesId?: string | null;
  onSelectMonth?: (index: number) => void;
  onSelectSeries?: (seriesId: string) => void;
  onPointHover?: (index: number, e: React.MouseEvent) => void;
  onPointLeave?: () => void;
}> = ({ width, series, normalizePerSeries = false, scaleSeries, selectedIndex, activeSeriesId, onSelectMonth, onSelectSeries, onPointHover, onPointLeave }) => {
  const W = width;
  const H = 160;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series[0]?.values.length ?? 0;
  const single = series.length === 1;
  const interactive = !!onSelectMonth;

  // Slot-centered x (matches the grouped bar chart below) so months line up across both charts.
  const slot = innerW / (n || 1);
  const x = (i: number) => padL + slot * i + slot / 2;

  // Scale each series to a padded [floor, ceil] window around its min/max. Headroom below the
  // min and above the max keeps the data in a middle band so movement reads as gentle rather
  // than dramatic. The SHARED scale (used when lines share a unit) is padded tighter so the
  // real vertical gaps between lines stay visible instead of being flattened.
  const scaleFor = (vals: number[], floorPad: number, ceilPad: number) => {
    const clean = vals.map((v) => Math.max(v, 0));
    const min = clean.length ? Math.min(...clean) : 0;
    const max = Math.max(1, ...clean);
    const range = max - min;
    const pad = range > 0 ? range : Math.max(1, max * 0.15);
    const floor = Math.max(0, min - pad * floorPad);
    const ceil = max + pad * ceilPad;
    return { floor, denom: (ceil - floor) || 1 };
  };
  const perSeries = normalizePerSeries && series.length > 1;
  // Domain is computed from the frozen scaleSeries (if provided) so edits don't rescale.
  const scaleBasis = scaleSeries ?? series;
  // Shared scale: tight padding so the gaps between same-unit lines are legible.
  const sharedScale = scaleFor(scaleBasis.flatMap((s) => s.values), 0.12, 0.12);
  const seriesScale = scaleBasis.map((s) => scaleFor(s.values, 0.9, 0.6));
  const yAt = (si: number, i: number) => {
    const { floor, denom } = perSeries ? seriesScale[si] : sharedScale;
    const v = Math.max(series[si].values[i], 0);
    return padT + innerH - ((v - floor) / denom) * innerH;
  };

  // Draw the Actual base line last (on top) so it stays visible even when another
  // series (e.g. Planned) tracks it almost identically and would otherwise cover it.
  const drawOrder = series
    .map((_, i) => i)
    .sort((a, b) => (series[a].id === '__value' ? 1 : 0) - (series[b].id === '__value' ? 1 : 0));

  // Two rows can plot to the exact same pixels (e.g. a measure and its only child, which
  // share identical values). Dash any line that lands on top of an already-drawn one so both
  // stay visible instead of one silently hiding the other.
  const plotted = series.map((_, si) => series[si].values.map((__, i) => yAt(si, i)));
  const dashed: boolean[] = new Array(series.length).fill(false);
  const drawnSoFar: number[] = [];
  for (const si of drawOrder) {
    if (drawnSoFar.some((pj) => plotted[pj].every((y, i) => Math.abs(y - plotted[si][i]) < 0.75))) {
      dashed[si] = true;
    }
    drawnSoFar.push(si);
  }

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly trend">
      <defs>
        <linearGradient id="charts-trend-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BASE_LINE_COLOR} stopOpacity="0.28" />
          <stop offset="100%" stopColor={BASE_LINE_COLOR} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#e5e5e5" strokeWidth="1" />
      {/* Vertical guide for the selected month. */}
      {selectedIndex !== null && selectedIndex >= 0 && (
        <line
          x1={x(selectedIndex)}
          y1={padT - 4}
          x2={x(selectedIndex)}
          y2={padT + innerH}
          stroke={BASE_LINE_COLOR}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.6"
        />
      )}
      {/* Area fill only for the clean single-line case. */}
      {single &&
        (() => {
          const s = series[0];
          const line = s.values.map((_, i) => `${x(i).toFixed(1)},${yAt(0, i).toFixed(1)}`).join(' ');
          const area = `${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`;
          return <polygon points={area} fill="url(#charts-trend-grad)" />;
        })()}
      {drawOrder.map((si) => {
        const s = series[si];
        const pts = s.values.map((_, i) => `${x(i).toFixed(1)},${yAt(si, i).toFixed(1)}`).join(' ');
        return (
          <g key={s.id}>
            <polyline
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth={activeSeriesId === s.id ? 3 : 2}
              strokeDasharray={dashed[si] ? '6 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {drawOrder.map((si) => {
        const s = series[si];
        return s.values.map((v, i) => {
          const sel = i === selectedIndex;
          return (
            <circle
              key={`${s.id}-${i}`}
              cx={x(i)}
              cy={yAt(si, i)}
              r={sel ? 3.6 : 2.2}
              fill={sel ? s.color : '#fff'}
              stroke={s.color}
              strokeWidth={sel ? 1.8 : 1.4}
            />
          );
        });
      })}
      {MONTHS.map((m, i) => {
        const sel = i === selectedIndex;
        if (!sel && i % 2 !== 0) return null;
        return (
          <text
            key={m.key}
            x={x(i)}
            y={H - 6}
            fontSize="8"
            textAnchor="middle"
            fill={sel ? BASE_LINE_COLOR : '#8a8a8a'}
            fontWeight={sel ? 700 : 400}
          >
            {m.label}
          </text>
        );
      })}
      {/* Transparent click bands — one per month. */}
      {interactive &&
        MONTHS.map((m, i) => {
          const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
          const right = i === n - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
          return (
            <rect
              key={`hit-${m.key}`}
              x={left}
              y={padT - 4}
              width={Math.max(right - left, 1)}
              height={innerH + 4}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectMonth?.(i)}
              onMouseMove={(e) => onPointHover?.(i, e)}
              onMouseLeave={onPointLeave}
            />
          );
        })}
      {/* Clickable per-series hit-lines on top, so clicking a line opens that series. */}
      {onSelectSeries &&
        drawOrder.map((si) => {
          const s = series[si];
          const pts = s.values.map((_, i) => `${x(i).toFixed(1)},${yAt(si, i).toFixed(1)}`).join(' ');
          return (
            <polyline
              key={`hit-${s.id}`}
              points={pts}
              fill="none"
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectSeries(s.id)}
            />
          );
        })}
    </svg>
  );
};

/* ------------------------------- Bars ------------------------------ */
/* A normal bar chart of the row's own monthly value (single series), or a grouped
   bar chart when sub-columns are active (one bar per series within each month). */
const BarChart: React.FC<{
  width: number;
  series: TrendSeries[];
  normalizePerSeries: boolean;
  /** Frozen values used to compute the y-axis domain (keeps scale stable across edits). */
  scaleSeries?: TrendSeries[];
  selectedIndex: number | null;
  onSelectMonth?: (index: number) => void;
  onBarClick?: (seriesId: string, monthIndex: number) => void;
  onBarHover?: (monthIndex: number, e: React.MouseEvent) => void;
  onLeave?: () => void;
}> = ({ width, series, normalizePerSeries, scaleSeries, selectedIndex, onSelectMonth, onBarClick, onBarHover, onLeave }) => {
  const W = width;
  const H = 172;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = MONTHS.length;
  const slot = innerW / n;
  const groupW = Math.min(slot * 0.72, 26);
  const groupCount = Math.max(series.length, 1);
  const barW = Math.max(groupW / groupCount, 2);
  const baseY = padT + innerH;

  // Zoomed scale (kept identical to the line chart above so bars and lines line up 1:1):
  // pad below the min and above the max so differences read gently. The shared scale (used
  // when bars share a unit) is padded tighter so the gaps between grouped bars stay visible.
  const scaleFor = (vals: number[], floorPad: number, ceilPad: number) => {
    const clean = vals.map((v) => Math.max(v, 0));
    const min = clean.length ? Math.min(...clean) : 0;
    const max = Math.max(1, ...clean);
    const range = max - min;
    const pad = range > 0 ? range : Math.max(1, max * 0.15);
    const floor = Math.max(0, min - pad * floorPad);
    const ceil = max + pad * ceilPad;
    return { floor, denom: (ceil - floor) || 1 };
  };
  const scaleBasis = scaleSeries ?? series;
  const sharedScale = scaleFor(scaleBasis.flatMap((s) => s.values), 0.12, 0.12);
  const seriesScale = scaleBasis.map((s) => scaleFor(s.values, 0.9, 0.6));
  const heightFor = (si: number, v: number) => {
    const { floor, denom } = normalizePerSeries ? seriesScale[si] : sharedScale;
    // Clamp so a value beyond the frozen domain stays inside the plot area.
    return Math.min(Math.max(0, ((Math.max(v, 0) - floor) / denom) * innerH), innerH);
  };

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly bar chart">
      <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#e5e5e5" strokeWidth="1" />
      {MONTHS.map((m, mi) => {
        const cx = padL + slot * mi + slot / 2;
        const groupLeft = cx - groupW / 2;
        const sel = mi === selectedIndex;
        return (
          <g key={m.key}>
            {sel && (
              <rect
                x={cx - slot / 2}
                y={padT - 4}
                width={slot}
                height={innerH + 4}
                fill={BASE_LINE_COLOR}
                opacity="0.08"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Transparent full-height band (behind the bars) to select the month. */}
            <rect
              x={cx - slot / 2}
              y={padT - 4}
              width={slot}
              height={innerH + 4}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectMonth?.(mi)}
              onMouseMove={(e) => onBarHover?.(mi, e)}
              onMouseLeave={onLeave}
            />
            {series.map((s, si) => {
              const v = s.values[mi];
              const h = heightFor(si, v);
              const x = groupLeft + si * barW;
              return (
                <rect
                  key={s.id}
                  x={x}
                  y={baseY - h}
                  width={Math.max(barW - (groupCount > 1 ? 1 : 0), 1.5)}
                  height={Math.max(h, 0.5)}
                  fill={s.color}
                  rx="1"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Sub-column mode → select this series + month; single-series mode → just the month.
                    if (onBarClick) onBarClick(s.id, mi);
                    else onSelectMonth?.(mi);
                  }}
                  onMouseMove={(e) => onBarHover?.(mi, e)}
                  onMouseLeave={onLeave}
                >
                  <title>{`${s.name} · ${m.label}: ${fmtUnit(v, s.unit)}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {MONTHS.map((m, i) => {
        const sel = i === selectedIndex;
        if (!sel && i % 2 !== 0) return null;
        const cx = padL + slot * i + slot / 2;
        return (
          <text
            key={m.key}
            x={cx}
            y={H - 6}
            fontSize="8"
            textAnchor="middle"
            fill={sel ? BASE_LINE_COLOR : '#8a8a8a'}
            fontWeight={sel ? 700 : 400}
          >
            {m.label}
          </text>
        );
      })}
    </svg>
  );
};

/* --------------------------- Stacked bars -------------------------- */
/* One bar per month, split into segments showing each child's contribution to the
   row's monthly total. Segment colors mirror the donut below (per-child, stable). */
const StackedBarChart: React.FC<{
  width: number;
  rows: GridRow[];
  colors: string[];
  /** Frozen child rows used to compute the total-height domain (stable scale across edits). */
  scaleRows?: GridRow[];
  selectedIndex: number | null;
  onSelectMonth?: (index: number) => void;
  onSegmentHover?: (monthIndex: number, e: React.MouseEvent) => void;
  onLeave?: () => void;
}> = ({ width, rows, colors, scaleRows, selectedIndex, onSelectMonth, onSegmentHover, onLeave }) => {
  const W = width;
  const H = 172;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = MONTHS.length;
  const slot = innerW / n;
  const barW = Math.min(slot * 0.6, 22);
  const baseY = padT + innerH;

  // Zoomed total-height scale: drop the baseline to just below the smallest month's total so
  // month-to-month differences in the overall stack are clearly visible (a flat 0-anchored
  // scale makes near-equal totals look identical). Each bar's height is then split among the
  // children by their share, so the composition within a bar stays proportional.
  const totals = MONTHS.map((m) => rows.reduce((s, c) => s + Math.max(val(c, m.key), 0), 0));
  // Domain from the frozen scaleRows (if provided) so edits don't rescale the bars.
  const domainRows = scaleRows ?? rows;
  const domainTotals = MONTHS.map((m) => domainRows.reduce((s, c) => s + Math.max(val(c, m.key), 0), 0));
  const minTotal = domainTotals.length ? Math.min(...domainTotals) : 0;
  const maxTotal = Math.max(1, ...domainTotals);
  const range = maxTotal - minTotal;
  const FLOOR_PAD = 0.18; // fraction of range left below the min (smaller = more zoom)
  const floor = range > 0 ? Math.max(0, minTotal - range * FLOOR_PAD) : Math.max(0, minTotal - 1);
  const denom = maxTotal + range * 0.06 - floor || 1; // tiny headroom above the tallest stack
  const barHeightFor = (total: number) => Math.min(Math.max(0, ((total - floor) / denom) * innerH), innerH);

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly stacked bar chart">
      <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#e5e5e5" strokeWidth="1" />
      {MONTHS.map((m, mi) => {
        const cx = padL + slot * mi + slot / 2;
        const sel = mi === selectedIndex;
        const total = totals[mi];
        const barH = barHeightFor(total);
        let yCursor = baseY;
        return (
          <g key={m.key}>
            {sel && (
              <rect
                x={cx - slot / 2}
                y={padT - 4}
                width={slot}
                height={innerH + 4}
                fill={BASE_LINE_COLOR}
                opacity="0.08"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Full-height band to select the month + drive the tooltip. */}
            <rect
              x={cx - slot / 2}
              y={padT - 4}
              width={slot}
              height={innerH + 4}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectMonth?.(mi)}
              onMouseMove={(e) => onSegmentHover?.(mi, e)}
              onMouseLeave={onLeave}
            />
            {rows.map((c, ci) => {
              const v = Math.max(val(c, m.key), 0);
              // Split the (zoomed) bar height by each child's share of the month total.
              const h = total > 0 ? barH * (v / total) : 0;
              if (h <= 0) return null;
              yCursor -= h;
              return (
                <rect
                  key={c.id}
                  x={cx - barW / 2}
                  y={yCursor}
                  width={barW}
                  height={Math.max(h - 0.5, 0.5)}
                  fill={colors[ci % colors.length]}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMonth?.(mi);
                  }}
                  onMouseMove={(e) => onSegmentHover?.(mi, e)}
                  onMouseLeave={onLeave}
                >
                  <title>{`${c.name} · ${m.label}: ${fmt(v)}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {MONTHS.map((m, i) => {
        const sel = i === selectedIndex;
        if (!sel && i % 2 !== 0) return null;
        const cx = padL + slot * i + slot / 2;
        return (
          <text
            key={m.key}
            x={cx}
            y={H - 6}
            fontSize="8"
            textAnchor="middle"
            fill={sel ? BASE_LINE_COLOR : '#8a8a8a'}
            fontWeight={sel ? 700 : 400}
          >
            {m.label}
          </text>
        );
      })}
    </svg>
  );
};

/* ------------------------------ Donut ------------------------------ */
interface Slice {
  id: string;
  name: string;
  value: number;
  color: string;
}
const Donut: React.FC<{
  slices: Slice[];
  total: number;
  hoveredId?: string | null;
  interactive?: boolean;
  onSliceHover?: (s: Slice, pct: number, e: React.MouseEvent) => void;
  onSliceLeave?: () => void;
  onSliceClick?: (s: Slice) => void;
}> = ({ slices, total, hoveredId, interactive, onSliceHover, onSliceLeave, onSliceClick }) => {
  const cx = 74;
  const cy = 74;
  const r = 54;
  const sw = 26;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg className="charts-donut" viewBox="0 0 148 148" role="img" aria-label="Share by child">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f6" strokeWidth={sw} />
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {slices.map((s) => {
          const frac = total > 0 ? Math.max(s.value, 0) / total : 0;
          const pct = frac * 100;
          const len = frac * C;
          const offset = acc * C;
          acc += frac;
          const isHovered = hoveredId === s.id;
          return (
            <circle
              key={s.id}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={isHovered ? sw + 5 : sw}
              strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
              strokeDashoffset={-offset}
              opacity={hoveredId && !isHovered ? 0.55 : 1}
              style={{ cursor: interactive ? 'pointer' : 'default', transition: 'stroke-width 0.1s, opacity 0.1s' }}
              onMouseMove={(e) => onSliceHover?.(s, pct, e)}
              onMouseLeave={onSliceLeave}
              onClick={() => onSliceClick?.(s)}
            >
              <title>{`${s.name}: ${fmt(s.value)} (${pct.toFixed(0)}%)`}</title>
            </circle>
          );
        })}
      </g>
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize="9" fill="#8a8a8a">
        Total
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="#181818">
        {fmt(total)}
      </text>
    </svg>
  );
};

/* Reusable composition section: donut + legend + period dropdown + drill. */
interface PieSectionProps {
  title: string;
  titleIcon?: React.ReactNode;
  subtitle?: string;
  slices: Slice[];
  total: number;
  periodKey: ValueKey;
  onPeriodChange: (k: ValueKey) => void;
  periodLabel: string;
  onDrill?: (id: string) => void;
  /** Select the clicked slice's child cell (for the current period) on the grid. */
  onSliceSelectCell?: (id: string) => void;
  hoveredSliceId: string | null;
  setHoveredSliceId: (id: string | null) => void;
  showTip: (e: React.MouseEvent, title: string, rows: TipState['rows']) => void;
  hideTip: () => void;
  // Optional series selector (sub-column mode): pick which column's breakdown to show.
  seriesOptions?: { id: string; name: string }[];
  selectedSeriesId?: string | null;
  onSeriesChange?: (id: string) => void;
  loading?: boolean;
}
const PieSection: React.FC<PieSectionProps> = ({
  title,
  titleIcon,
  subtitle,
  slices,
  total,
  periodKey,
  onPeriodChange,
  periodLabel,
  onDrill,
  onSliceSelectCell,
  hoveredSliceId,
  setHoveredSliceId,
  showTip,
  hideTip,
  seriesOptions,
  selectedSeriesId,
  onSeriesChange,
  loading,
}) => {
  return (
    <section className="charts-section">
      <div className="charts-section-head">
        <div className="charts-section-titlewrap">
          <div className="charts-section-titlerow">
            {titleIcon && <span className="charts-section-icon">{titleIcon}</span>}
            <h4 className="charts-section-title">{title}</h4>
          </div>
          {subtitle && <span className="charts-section-sub">{subtitle}</span>}
        </div>
        <div className="charts-controls">
          {seriesOptions && seriesOptions.length > 0 && (
            <div className="charts-period">
              <label className="charts-period-label">Series</label>
              <select
                className="charts-period-select"
                value={selectedSeriesId ?? ''}
                onChange={(e) => onSeriesChange?.(e.target.value)}
              >
                {seriesOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="charts-period">
            <label className="charts-period-label">Period</label>
            <select
              className="charts-period-select"
              value={periodKey}
              onChange={(e) => onPeriodChange(e.target.value as ValueKey)}
            >
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="charts-pie-loading" role="status" aria-live="polite">
          <span className="charts-spinner" aria-hidden="true" />
          <span className="charts-pie-loading-text">Loading {periodLabel}…</span>
        </div>
      ) : total > 0 ? (
        <>
          <div className="charts-pie-wrap">
            <Donut
              slices={slices}
              total={total}
              interactive={!!onDrill}
              hoveredId={hoveredSliceId}
              onSliceHover={(s, pct, e) => {
                setHoveredSliceId(s.id);
                showTip(e, s.name, [
                  { label: periodLabel, val: fmt(s.value), color: s.color },
                  { label: 'Share', val: `${pct.toFixed(0)}%` },
                ]);
              }}
              onSliceLeave={hideTip}
              onSliceClick={(s) => {
                onSliceSelectCell?.(s.id);
                onDrill?.(s.id);
              }}
            />
            <ul className="charts-legend">
              {slices.map((s) => {
                const pct = total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0;
                return (
                  <li
                    key={s.id}
                    className={`charts-legend-item${onDrill ? ' charts-legend-item--drill' : ''}${
                      hoveredSliceId === s.id ? ' charts-legend-item--hover' : ''
                    }`}
                    onClick={() => {
                      onSliceSelectCell?.(s.id);
                      onDrill?.(s.id);
                    }}
                    onMouseMove={(e) => {
                      setHoveredSliceId(s.id);
                      showTip(e, s.name, [
                        { label: periodLabel, val: fmt(s.value), color: s.color },
                        { label: 'Share', val: `${pct.toFixed(0)}%` },
                      ]);
                    }}
                    onMouseLeave={hideTip}
                  >
                    <span className="charts-legend-dot" style={{ backgroundColor: s.color }} />
                    <span className="charts-legend-name" title={s.name}>
                      {s.name}
                    </span>
                    <span className="charts-legend-val">{fmt(s.value)}</span>
                    <span className="charts-legend-pct">{pct.toFixed(0)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
          {onDrill && (
            <p className="charts-scale-note">
              Tip: click a slice to open that section on the grid and drill in here.
            </p>
          )}
        </>
      ) : (
        <p className="charts-note">No values for this period.</p>
      )}
    </section>
  );
};

/* ===================================================================== */
/* Advanced analysis charts (waterfall, pareto, tornado, band, bullet).  */
/* ===================================================================== */
const COL_UP = '#2e844a';
const COL_DOWN = '#ba0517';
const COL_TOTAL = '#0b5cab';

/* --------------------------- Waterfall ----------------------------- */
/* Variance bridge: a start total, a series of + / − steps, and an end total. */
interface WaterfallStep {
  name: string;
  delta: number;
  kind?: 'total';
}
const WaterfallChart: React.FC<{
  width: number;
  startLabel: string;
  startValue: number;
  steps: WaterfallStep[];
  endLabel: string;
  endValue: number;
  onStepHover?: (i: number, e: React.MouseEvent) => void;
  onLeave?: () => void;
}> = ({ width, startLabel, startValue, steps, endLabel, endValue, onStepHover, onLeave }) => {
  const W = width;
  const H = 210;
  const padL = 6;
  const padR = 6;
  const padT = 16;
  const padB = 46;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Build the column model: start (anchored), each step (floating), end (anchored).
  type Col = { label: string; from: number; to: number; delta: number; anchor: boolean; up: boolean };
  const cols: Col[] = [];
  cols.push({ label: startLabel, from: 0, to: startValue, delta: startValue, anchor: true, up: true });
  let run = startValue;
  steps.forEach((s) => {
    const from = run;
    run += s.delta;
    cols.push({ label: s.name, from, to: run, delta: s.delta, anchor: false, up: s.delta >= 0 });
  });
  cols.push({ label: endLabel, from: 0, to: endValue, delta: endValue, anchor: true, up: true });

  const allVals = cols.flatMap((c) => [c.from, c.to]);
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(1, ...allVals);
  const range = maxV - minV || 1;
  const floor = minV - range * 0.08;
  const ceil = maxV + range * 0.1;
  const denom = ceil - floor || 1;
  const yOf = (v: number) => padT + innerH - ((v - floor) / denom) * innerH;

  const n = cols.length;
  const slot = innerW / n;
  const barW = Math.min(slot * 0.62, 46);

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Variance waterfall">
      <line x1={padL} y1={yOf(Math.max(floor, 0))} x2={W - padR} y2={yOf(Math.max(floor, 0))} stroke="#e5e5e5" strokeWidth="1" />
      {cols.map((c, i) => {
        const cx = padL + slot * i + slot / 2;
        const yTop = yOf(Math.max(c.from, c.to));
        const yBot = yOf(Math.min(c.from, c.to));
        const h = Math.max(yBot - yTop, 1.5);
        const color = c.anchor ? COL_TOTAL : c.up ? COL_UP : COL_DOWN;
        return (
          <g key={`${c.label}-${i}`}>
            {/* connector line from previous column's running level */}
            {i > 0 && !c.anchor && (
              <line x1={cx - slot / 2 - barW / 2 + barW} y1={yOf(c.from)} x2={cx - barW / 2} y2={yOf(c.from)} stroke="#c9c9c9" strokeWidth="1" strokeDasharray="2 2" />
            )}
            <rect
              x={cx - barW / 2}
              y={yTop}
              width={barW}
              height={h}
              fill={color}
              rx="1.5"
              opacity={c.anchor ? 1 : 0.92}
              style={{ cursor: onStepHover ? 'pointer' : 'default' }}
              onMouseMove={(e) => onStepHover?.(i, e)}
              onMouseLeave={onLeave}
            >
              <title>{`${c.label}: ${c.anchor ? fmt(c.to) : `${c.delta >= 0 ? '+' : ''}${fmt(c.delta)}`}`}</title>
            </rect>
            <text x={cx} y={yTop - 4} fontSize="8.5" textAnchor="middle" fontWeight="700" fill={c.anchor ? COL_TOTAL : c.up ? COL_UP : COL_DOWN}>
              {c.anchor ? fmt(c.to) : `${c.delta >= 0 ? '+' : ''}${fmt(c.delta)}`}
            </text>
            <text x={cx} y={H - 28} fontSize="8" textAnchor="middle" fill="#5c5c5c" transform={`rotate(28 ${cx} ${H - 28})`}>
              {c.label.length > 12 ? `${c.label.slice(0, 11)}…` : c.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* ----------------------------- Pareto ------------------------------ */
/* Children sorted descending as bars + a cumulative-% line and an 80% guide. */
const ParetoChart: React.FC<{
  width: number;
  items: { name: string; value: number; color: string }[];
  onHover?: (i: number, e: React.MouseEvent) => void;
  onLeave?: () => void;
}> = ({ width, items, onHover, onLeave }) => {
  const W = width;
  const H = 200;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const total = items.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
  const maxV = Math.max(1, ...items.map((d) => Math.max(d.value, 0)));
  const n = items.length || 1;
  const slot = innerW / n;
  const barW = Math.min(slot * 0.66, 40);
  const baseY = padT + innerH;
  const hOf = (v: number) => (Math.max(v, 0) / maxV) * innerH;

  let cum = 0;
  const cumPts: { x: number; y: number; pct: number }[] = items.map((d, i) => {
    cum += Math.max(d.value, 0);
    const pct = (cum / total) * 100;
    return { x: padL + slot * i + slot / 2, y: padT + innerH - (pct / 100) * innerH, pct };
  });
  const y80 = padT + innerH - 0.8 * innerH;

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pareto chart">
      <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#e5e5e5" strokeWidth="1" />
      <line x1={padL} y1={y80} x2={W - padR} y2={y80} stroke="#b0b0b0" strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - padR} y={y80 - 3} fontSize="8" textAnchor="end" fill="#8a8a8a">80%</text>
      {items.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const h = hOf(d.value);
        return (
          <g key={`${d.name}-${i}`}>
            <rect
              x={cx - barW / 2}
              y={baseY - h}
              width={barW}
              height={Math.max(h, 1)}
              fill={d.color}
              rx="1.5"
              style={{ cursor: onHover ? 'pointer' : 'default' }}
              onMouseMove={(e) => onHover?.(i, e)}
              onMouseLeave={onLeave}
            >
              <title>{`${d.name}: ${fmt(d.value)} (${((Math.max(d.value, 0) / total) * 100).toFixed(0)}%)`}</title>
            </rect>
            <text x={cx} y={H - 26} fontSize="8" textAnchor="middle" fill="#5c5c5c" transform={`rotate(28 ${cx} ${H - 26})`}>
              {d.name.length > 12 ? `${d.name.slice(0, 11)}…` : d.name}
            </text>
          </g>
        );
      })}
      <polyline points={cumPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={COL_TOTAL} strokeWidth="2" strokeLinejoin="round" />
      {cumPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="#fff" stroke={COL_TOTAL} strokeWidth="1.5" />
      ))}
    </svg>
  );
};

/* ----------------------------- Tornado ----------------------------- */
/* Sensitivity: how much the parent total moves if each child changes ±swing%. */
const TornadoChart: React.FC<{
  width: number;
  items: { name: string; impact: number; color: string }[];
  swingPct: number;
}> = ({ width, items, swingPct }) => {
  const W = width;
  const rowH = 26;
  const H = Math.max(items.length * rowH + 26, 60);
  const labelW = Math.min(120, W * 0.34);
  const axisX = labelW + 8;
  const plotW = W - axisX - 8;
  const maxImpact = Math.max(1, ...items.map((d) => Math.abs(d.impact)));
  const mid = axisX + plotW / 2;
  const halfW = plotW / 2;
  const scale = (v: number) => (v / maxImpact) * halfW;

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sensitivity tornado" style={{ height: H }}>
      <line x1={mid} y1={8} x2={mid} y2={H - 16} stroke="#c9c9c9" strokeWidth="1" />
      {items.map((d, i) => {
        const y = 10 + i * rowH;
        const w = scale(Math.abs(d.impact));
        return (
          <g key={`${d.name}-${i}`}>
            <text x={labelW} y={y + rowH / 2} fontSize="9.5" textAnchor="end" dominantBaseline="middle" fill="#2e2e2e">
              {d.name.length > 16 ? `${d.name.slice(0, 15)}…` : d.name}
            </text>
            {/* down side (−swing) in red on the left, up side (+swing) in green on the right */}
            <rect x={mid - w} y={y + 3} width={w} height={rowH - 12} fill={COL_DOWN} opacity="0.85" rx="1.5">
              <title>{`${d.name} −${swingPct}%: ${fmt(-d.impact)}`}</title>
            </rect>
            <rect x={mid} y={y + 3} width={w} height={rowH - 12} fill={COL_UP} opacity="0.85" rx="1.5">
              <title>{`${d.name} +${swingPct}%: +${fmt(d.impact)}`}</title>
            </rect>
            <text x={mid + w + 4} y={y + rowH / 2} fontSize="8.5" dominantBaseline="middle" fill="#5c5c5c">
              ±{fmt(d.impact)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* -------------------------- Forecast band -------------------------- */
/* A month's uncertainty cone widens with its LOCAL volatility (how sharply the trend moves around
 * it) plus a gentle horizon growth — so stable stretches stay narrow (high confidence) while ramps
 * / jumps flare wide (low confidence). A month is flagged low when its relative band width is well
 * above this row's own typical width, so we surface the genuinely uncertain months, not all of them. */
function computeConfidence(values: number[]): { band: number[]; lowIndices: number[] } {
  const n = values.length;
  const band = values.map((_, i) => {
    const prev = i > 0 ? Math.abs(values[i] - values[i - 1]) : 0;
    const next = i < n - 1 ? Math.abs(values[i + 1] - values[i]) : 0;
    const local = i === 0 ? next : i === n - 1 ? prev : (prev + next) / 2;
    const horizon = 1 + i * 0.03; // far-out months a touch less certain
    return local * 1.4 * horizon;
  });
  const rel = values.map((v, i) => (v > 0 ? band[i] / v : 0));
  const nonZero = rel.filter((r) => r > 0);
  const meanRel = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  // Low = clearly above this row's typical relative width (and not trivially small).
  const cutoff = Math.max(0.05, meanRel * 1.5);
  const lowIndices = rel.map((r, i) => (r > cutoff ? i : -1)).filter((i) => i >= 0);
  return { band, lowIndices };
}

/* A trend line with a widening ± uncertainty cone derived from recent volatility. Points where
 * confidence is low (wide cone relative to value) are flagged with a red dot. */
const ForecastBandChart: React.FC<{
  width: number;
  values: number[];
  color?: string;
  onPointHover?: (i: number, low: boolean, e: React.MouseEvent) => void;
  onPointLeave?: () => void;
}> = ({ width, values, color = BASE_LINE_COLOR, onPointHover, onPointLeave }) => {
  const W = width;
  const H = 176;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = values.length;
  const slot = innerW / (n || 1);
  const x = (i: number) => padL + slot * i + slot / 2;

  const { band: bandArr, lowIndices } = computeConfidence(values);
  const lowSet = new Set(lowIndices);
  const band = (i: number) => bandArr[i] ?? 0;

  const upper = values.map((v, i) => v + band(i));
  const lower = values.map((v, i) => Math.max(v - band(i), 0));
  const allV = [...upper, ...lower];
  const minV = Math.min(...allV, 0);
  const maxV = Math.max(1, ...allV);
  const range = maxV - minV || 1;
  const floor = Math.max(0, minV - range * 0.08);
  const denom = maxV + range * 0.08 - floor || 1;
  const yOf = (v: number) => padT + innerH - ((v - floor) / denom) * innerH;

  const areaTop = upper.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const areaBot = lower.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).reverse().join(' ');
  const line = values.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Forecast with uncertainty band">
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#e5e5e5" strokeWidth="1" />
      <polygon points={`${areaTop} ${areaBot}`} fill={color} opacity="0.14" />
      <polyline points={upper.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <polyline points={lower.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => {
        const low = lowSet.has(i);
        return (
          <g key={i}>
            {low && <circle cx={x(i)} cy={yOf(v)} r="6" fill="#ba0517" opacity="0.14" />}
            <circle cx={x(i)} cy={yOf(v)} r={low ? 3.2 : 2} fill={low ? '#ba0517' : '#fff'} stroke={low ? '#ba0517' : color} strokeWidth="1.3" />
            {onPointHover && (
              <rect
                x={x(i) - slot / 2}
                y={padT}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseMove={(e) => onPointHover(i, low, e)}
                onMouseLeave={onPointLeave}
              />
            )}
          </g>
        );
      })}
      {MONTHS.map((m, i) =>
        i % 2 === 0 ? (
          <text key={m.key} x={x(i)} y={H - 6} fontSize="8" textAnchor="middle" fill="#8a8a8a">{m.label}</text>
        ) : null,
      )}
    </svg>
  );
};

/* -------------------------- Variance band -------------------------- */
/* The selected row's actual trend against a reference (Plan/Target) with a shaded ±tolerance
 * band. Points that break out of the band are flagged so you can see exactly when and where. */
const VarianceBandChart: React.FC<{
  width: number;
  actual: number[];
  reference: number[];
  tolerancePct: number;
  selectedIndex?: number | null;
  onSelectIndex?: (i: number) => void;
  onPointHover?: (i: number, e: React.MouseEvent) => void;
  onPointLeave?: () => void;
}> = ({ width, actual, reference, tolerancePct, selectedIndex, onSelectIndex, onPointHover, onPointLeave }) => {
  const W = width;
  const H = 190;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = actual.length;
  const slot = innerW / (n || 1);
  const x = (i: number) => padL + slot * i + slot / 2;

  const tol = tolerancePct / 100;
  const upper = reference.map((v) => v * (1 + tol));
  const lower = reference.map((v) => Math.max(v * (1 - tol), 0));
  const allV = [...upper, ...lower, ...actual, ...reference];
  const minV = Math.min(...allV, 0);
  const maxV = Math.max(1, ...allV);
  const range = maxV - minV || 1;
  const floor = Math.max(0, minV - range * 0.08);
  const denom = maxV + range * 0.08 - floor || 1;
  const yOf = (v: number) => padT + innerH - ((v - floor) / denom) * innerH;

  const REF = '#5867e8';
  const areaTop = upper.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const areaBot = lower.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).reverse().join(' ');
  const refLine = reference.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const actLine = actual.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const isBreach = (i: number) => actual[i] > upper[i] + 0.5 || actual[i] < lower[i] - 0.5;

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Actual vs reference with allowed-variance band">
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#e5e5e5" strokeWidth="1" />
      {/* Selected-month guide. */}
      {selectedIndex != null && selectedIndex >= 0 && (
        <line x1={x(selectedIndex)} y1={padT - 4} x2={x(selectedIndex)} y2={padT + innerH} stroke="#0176d3" strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
      )}
      {/* Allowed-variance band around the reference. */}
      <polygon points={`${areaTop} ${areaBot}`} fill={REF} opacity="0.12" />
      <polyline points={upper.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')} fill="none" stroke={REF} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
      <polyline points={lower.map((v, i) => `${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')} fill="none" stroke={REF} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
      {/* Reference (Plan/Target) line. */}
      <polyline points={refLine} fill="none" stroke={REF} strokeWidth="1.6" strokeDasharray="5 3" strokeLinejoin="round" />
      {/* Actual line. */}
      <polyline points={actLine} fill="none" stroke={BASE_LINE_COLOR} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {actual.map((v, i) => {
        const breach = isBreach(i);
        const sel = selectedIndex === i;
        return (
          <g key={i}>
            {sel && <circle cx={x(i)} cy={yOf(v)} r="6.5" fill="none" stroke={BASE_LINE_COLOR} strokeWidth="1.4" opacity="0.4" />}
            <circle
              cx={x(i)}
              cy={yOf(v)}
              r={breach ? 4 : sel ? 3.4 : 2.4}
              fill={breach ? '#ba0517' : '#fff'}
              stroke={breach ? '#ba0517' : BASE_LINE_COLOR}
              strokeWidth="1.4"
            />
            {(onPointHover || onSelectIndex) && (
              <rect
                x={x(i) - slot / 2}
                y={padT}
                width={slot}
                height={innerH}
                fill="transparent"
                style={{ cursor: onSelectIndex ? 'pointer' : 'default' }}
                onMouseMove={onPointHover ? (e) => onPointHover(i, e) : undefined}
                onMouseLeave={onPointLeave}
                onClick={onSelectIndex ? () => onSelectIndex(i) : undefined}
              />
            )}
          </g>
        );
      })}
      {MONTHS.map((m, i) =>
        i % 2 === 0 ? (
          <text key={m.key} x={x(i)} y={H - 6} fontSize="8" textAnchor="middle" fill="#8a8a8a">{m.label}</text>
        ) : null,
      )}
    </svg>
  );
};

/* ----------------------------- Bullet ------------------------------ */
/* Actual vs target with qualitative bands (poor / ok / good). */
const BulletChart: React.FC<{
  width: number;
  actual: number;
  target: number;
  label: string;
}> = ({ width, actual, target, label }) => {
  const W = width;
  const H = 64;
  const padL = 6;
  const padR = 6;
  const trackY = 22;
  const trackH = 18;
  const innerW = W - padL - padR;
  const maxV = Math.max(actual, target) * 1.15 || 1;
  const wOf = (v: number) => (Math.max(v, 0) / maxV) * innerW;
  const bands = [
    { to: target * 0.75, color: '#eef1f6' },
    { to: target * 0.95, color: '#e2e8f2' },
    { to: maxV, color: '#d5deec' },
  ];
  let prev = 0;
  const attain = target > 0 ? (actual / target) * 100 : 0;
  const good = attain >= 100;
  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} vs target`} style={{ height: H }}>
      {bands.map((b, i) => {
        const x0 = padL + wOf(prev);
        const w = wOf(b.to) - wOf(prev);
        prev = b.to;
        return <rect key={i} x={x0} y={trackY} width={Math.max(w, 0)} height={trackH} fill={b.color} />;
      })}
      {/* actual measure bar */}
      <rect x={padL} y={trackY + 4} width={wOf(actual)} height={trackH - 8} fill={good ? COL_UP : COL_TOTAL} rx="1.5" />
      {/* target marker */}
      <line x1={padL + wOf(target)} y1={trackY - 3} x2={padL + wOf(target)} y2={trackY + trackH + 3} stroke="#181818" strokeWidth="2.5" />
      <text x={padL} y={14} fontSize="9.5" fill="#5c5c5c">{label}</text>
      <text x={W - padR} y={14} fontSize="9.5" textAnchor="end" fontWeight="700" fill={good ? COL_UP : COL_DOWN}>
        {attain.toFixed(0)}% of target
      </text>
      <text x={padL + wOf(actual) + 4} y={trackY + trackH / 2 + 3} fontSize="8.5" fill="#181818">{fmt(actual)}</text>
    </svg>
  );
};

/* --------------------------- Driver tree --------------------------- */
/* Hierarchical contribution: the focused row as a root node with its children as
   connected leaves, each showing value + % of parent. Children with their own
   children are drillable. */
const DriverTree: React.FC<{
  root: GridRow;
  period: ValueKey;
  periodLabel: string;
  onDrill?: (id: string) => void;
}> = ({ root, period, periodLabel, onDrill }) => {
  const rootVal = val(root, period);
  const kids = (root.children ?? [])
    .map((c, i) => ({ row: c, value: val(c, period), color: PIE_COLORS[i % PIE_COLORS.length] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  return (
    <div className="charts-tree">
      <div className="charts-tree-root">
        <div className="charts-tree-node charts-tree-node--root">
          <span className="charts-tree-node-name" title={root.name}>{root.name}</span>
          <span className="charts-tree-node-val">{fmt(rootVal)}</span>
          <span className="charts-tree-node-sub">{periodLabel} · total</span>
        </div>
      </div>
      {kids.length > 0 && (
        <div className="charts-tree-kids">
          {kids.map((k) => {
            const pct = rootVal > 0 ? (k.value / rootVal) * 100 : 0;
            const drillable = (k.row.children?.length ?? 0) > 0 && !!onDrill;
            return (
              <button
                key={k.row.id}
                type="button"
                className={`charts-tree-node charts-tree-node--child${drillable ? ' is-drillable' : ''}`}
                style={{ borderTopColor: k.color }}
                onClick={() => drillable && onDrill?.(k.row.id)}
                title={drillable ? `Drill into ${k.row.name}` : k.row.name}
              >
                <span className="charts-tree-node-name" title={k.row.name}>{k.row.name}</span>
                <span className="charts-tree-node-val">{fmt(k.value)}</span>
                <span className="charts-tree-bar"><span className="charts-tree-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: k.color }} /></span>
                <span className="charts-tree-node-sub">{pct.toFixed(0)}% of parent{drillable ? ' · drill' : ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** A grid row that can be added to the comparison, with grouping/parent context for the picker. */
interface CompareCandidate {
  id: string;
  name: string;
  depth: number;
  type?: string;
  /** Top-level measure this row belongs to — used as the SLDS listbox group header. */
  group: string;
  /** Parent row id — lets "Compare peers" seed a row together with its siblings. */
  parentId: string | null;
  /** Dimension ancestors between the measure and this row — shown as a breadcrumb subline. */
  path: string[];
}

/**
 * SLDS multi-select combobox for choosing rows to compare. Options are grouped by their
 * top-level measure (group headers instead of faux-indentation) so users compare like-with-like,
 * selected rows appear as removable pills, and the listbox is portaled so it never clips.
 */
const CompareRowPicker: React.FC<{
  candidates: CompareCandidate[];
  selectedIds: Set<string>;
  onToggle: (row: { id: string; name: string }) => void;
  onClear?: () => void;
}> = ({ candidates, selectedIds, onToggle, onClear }) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  // "measure": group options by measure (compare like-with-like). "node": group by dimension node
  // so the SAME node across measures sits together (e.g. compare Acme Partners' SA qty vs Forecast qty).
  const [groupMode, setGroupMode] = useState<'measure' | 'node'>('measure');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const measure = () => {
      if (!anchorRef.current) return;
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.('.compare-picker-dropdown')) return;
      setOpen(false);
      setTerm('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = term.trim().toLowerCase();
  // "By node" compares a dimension node across measures, so the measure total rows (depth 0)
  // aren't nodes — exclude them (otherwise a measure shows both as its own group and as an option).
  const base = groupMode === 'node' ? candidates.filter((c) => c.depth > 0) : candidates;
  // In "node" mode also match against the measure name so searching a measure still finds its nodes.
  const filtered = q
    ? base.filter(
        (c) => c.name.toLowerCase().includes(q) || (groupMode === 'measure' && c.group.toLowerCase().includes(q)),
      )
    : base;

  // Group either by measure (default) or by dimension node (so the same node's measures co-locate).
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { label: string; sub?: string; items: CompareCandidate[] }>();
    for (const c of filtered) {
      const key = groupMode === 'node' ? [...c.path, c.name].join(' › ') || c.name : c.group || 'Rows';
      if (!map.has(key)) {
        map.set(
          key,
          groupMode === 'node'
            ? { label: c.name, sub: c.path.length ? c.path.join(' › ') : undefined, items: [] }
            : { label: c.group || 'Rows', items: [] },
        );
        order.push(key);
      }
      map.get(key)!.items.push(c);
    }
    return order.map((k) => ({ key: k, ...map.get(k)! }));
  }, [filtered, groupMode]);

  return (
    <div className="compare-picker" ref={anchorRef}>
      <div className="slds-combobox compare-picker-combobox">
        <button
          type="button"
          className="compare-picker-input"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setTerm('');
          }}
        >
          <span className={selectedIds.size ? 'compare-picker-value' : 'compare-picker-placeholder'}>
            {selectedIds.size ? `${selectedIds.size} row${selectedIds.size > 1 ? 's' : ''} selected` : 'Add rows to compare'}
          </span>
          <svg className="compare-picker-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            className="slds-dropdown compare-picker-dropdown"
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="compare-picker-controls">
              <div className="compare-picker-seg" role="tablist" aria-label="Group rows by">
                {([
                  { k: 'measure', label: 'By measure' },
                  { k: 'node', label: 'By node' },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    role="tab"
                    aria-selected={groupMode === opt.k}
                    className={`compare-picker-seg-btn${groupMode === opt.k ? ' is-active' : ''}`}
                    onClick={() => setGroupMode(opt.k)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="slds-input compare-picker-searchinput"
                placeholder={groupMode === 'node' ? 'Search nodes…' : 'Search rows…'}
                value={term}
                autoFocus
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <ul className="slds-listbox slds-listbox_vertical compare-picker-list" role="listbox" aria-multiselectable="true">
              {groups.length === 0 ? (
                <li role="presentation" className="slds-listbox__item">
                  <div className="compare-picker-empty">No matching rows.</div>
                </li>
              ) : (
                groups.map((g) => (
                  <React.Fragment key={g.key}>
                    <li role="presentation" className="slds-listbox__item">
                      <div className="compare-picker-group-head" role="presentation">
                        <span className="compare-picker-group-label" title={g.label}>{g.label}</span>
                        {g.sub && <span className="compare-picker-group-sub" title={g.sub}>{g.sub}</span>}
                      </div>
                    </li>
                    {g.items.map((c) => {
                      const checked = selectedIds.has(c.id);
                      // By node: the differentiator is the measure. By measure: it's the dimension path.
                      const primary = groupMode === 'node' ? c.group : c.name;
                      const secondary = groupMode === 'node' ? '' : c.path.join(' › ');
                      return (
                        <li key={c.id} role="presentation" className="slds-listbox__item">
                          <div
                            role="option"
                            aria-selected={checked}
                            className={`compare-picker-option${checked ? ' is-selected' : ''}`}
                            onClick={() => onToggle({ id: c.id, name: c.name })}
                          >
                            <span
                              className={`compare-picker-check${checked ? ' is-checked' : ''}`}
                              aria-hidden="true"
                            >
                              {checked && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className="compare-picker-option-main">
                              <span className="compare-picker-option-name" title={primary}>{primary}</span>
                              {secondary && (
                                <span
                                  className="compare-picker-option-path"
                                  title={[c.group, ...c.path].join(' › ')}
                                >
                                  {secondary}
                                </span>
                              )}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
            </ul>
            {onClear && selectedIds.size > 1 && (
              <div className="compare-picker-foot">
                <span className="compare-picker-foot-count">{selectedIds.size} selected</span>
                <button type="button" className="compare-picker-clear" onClick={onClear}>Clear all</button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

interface ChartsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  row: GridRow | null;
  /** Visible top-level measure rows — shown as a multi-line overview before any row is focused. */
  overviewRows?: GridRow[];
  /** Focus a specific measure row (from the overview) to see its detailed trend + composition. */
  onFocusRow?: (rowId: string) => void;
  /** Rows the user picked to compare (ordered; first = baseline). Takes over the panel when non-empty. */
  compareRows?: GridRow[];
  /** All currently-visible grid rows (flattened) that can be added to the comparison via the picker. */
  compareCandidates?: CompareCandidate[];
  /** Ids currently in the comparison set — drives the picker checkboxes + "Compare this row" toggle. */
  compareRowIds?: Set<string>;
  /** Toggle a row in/out of the comparison set (used by the in-panel picker + "Compare this row"). */
  onToggleCompare?: (row: { id: string; name: string }) => void;
  /** Remove one row from the comparison set. */
  onRemoveCompare?: (rowId: string) => void;
  /** Clear the whole comparison set. */
  onClearCompare?: () => void;
  /** Leave compare mode and return to the charts view it was launched from. */
  onExitCompare?: () => void;
  /** Name of the row the comparison was launched from (for the "Back to …" label). */
  compareReturnName?: string | null;
  /** Measure the focused row belongs to — shown in the header for context. */
  measureName?: string | null;
  /** Active sub-columns (only when "Show subcolumns" is on) — each becomes an extra trend line. */
  subColumns?: SubColumn[];
  /** Time period of the most recent cell edit — snaps the composition breakdown to it. */
  focusPeriod?: string | null;
  /** Bumped on each cell edit so the breakdown re-syncs even if the period is unchanged. */
  focusPeriodSignal?: number;
  /** Drill trail from the origin row to the current one (last entry = current focus). */
  breadcrumb?: { id: string; name: string }[];
  /** Drill into a child section (opens it on the grid + refocuses this panel). */
  onDrill?: (childId: string) => void;
  /** Jump back to a level in the breadcrumb trail. */
  onBreadcrumbNav?: (index: number) => void;
  /** Expand the current row on the grid (so its children become visible) when a bar is clicked. */
  onExpandRow?: (rowId: string) => void;
  /** Select the corresponding grid cell (row × month) when a chart element is clicked. */
  onSelectCell?: (rowId: string, monthKey: string) => void;
}

interface TipState {
  x: number;
  y: number;
  title: string;
  rows: { label: string; val: string; color?: string }[];
}

const ChartsPanel: React.FC<ChartsPanelProps> = ({
  isOpen,
  onClose,
  row,
  overviewRows = [],
  onFocusRow,
  compareRows = [],
  compareCandidates = [],
  compareRowIds,
  onToggleCompare,
  onRemoveCompare,
  onClearCompare,
  onExitCompare,
  compareReturnName,
  measureName,
  subColumns = [],
  focusPeriod,
  focusPeriodSignal,
  breadcrumb = [],
  onDrill,
  onBreadcrumbNav,
  onExpandRow,
  onSelectCell,
}) => {
  // Composition defaults to the full year so the "Share of children" donut is visible
  // immediately (no hidden "click a month first" step). Clicking a month refines it.
  const [periodKey, setPeriodKey] = useState<ValueKey | null>('year');
  const panelRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [hoveredSliceId, setHoveredSliceId] = useState<string | null>(null);
  // In sub-column mode, which series (line/bar) is selected → drives the pie below the bars.
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  // Overview mode (no row focused): which measure rows are plotted, and the picker open state.
  const [selectedMeasureIds, setSelectedMeasureIds] = useState<Set<string> | null>(null);
  const [measurePickerOpen, setMeasurePickerOpen] = useState(false);
  const measurePickerRef = useRef<HTMLDivElement>(null);
  // Brief loader shown after a bar/period change so it's clear the pie is updating for that month.
  const [pieLoading, setPieLoading] = useState(false);
  // Loader shown while the panel switches context (a different row is focused/drilled into).
  const [panelLoading, setPanelLoading] = useState(false);
  // User-adjustable panel width (drag the left edge). Wider = wider charts (same height).
  const [panelWidth, setPanelWidth] = useState(400);
  // Measure the chart area so the SVG viewBox width tracks the rendered pixel width —
  // this keeps chart height fixed while only the width grows as the panel expands.
  const [chartW, setChartW] = useState(336);
  const chartRoRef = useRef<ResizeObserver | null>(null);
  const chartAreaRef = useCallback((node: HTMLDivElement | null) => {
    chartRoRef.current?.disconnect();
    if (node) {
      const ro = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w > 0) setChartW(w);
      });
      ro.observe(node);
      chartRoRef.current = ro;
    }
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelRef.current?.getBoundingClientRect().width ?? panelWidth;
    const onMove = (ev: MouseEvent) => {
      // Drawer is docked right, so dragging its left edge leftward widens it.
      const next = startW + (startX - ev.clientX);
      const max = Math.min(window.innerWidth - 120, 1000);
      setPanelWidth(Math.round(Math.min(Math.max(next, 360), max)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  const showTip = (e: React.MouseEvent, title: string, rows: TipState['rows']) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(e.clientX - rect.left + 12, 8), rect.width - 168);
    const y = Math.min(Math.max(e.clientY - rect.top + 12, 8), rect.height - 20);
    setTip({ x, y, title, rows });
  };
  const hideTip = () => {
    setTip(null);
    setHoveredSliceId(null);
  };

  // When a cell is edited, snap the pie/donut to the edited period (if it's a selectable one).
  useEffect(() => {
    if (focusPeriod && PERIODS.some((p) => p.key === focusPeriod)) {
      setPeriodKey(focusPeriod as ValueKey);
    }
  }, [focusPeriodSignal, focusPeriod]);

  // Reset the selected line/bar when the focused row changes, and default the composition
  // back to the full year so the donut is shown immediately for the new row.
  useEffect(() => {
    setActiveSeriesId(null);
    setPeriodKey('year');
  }, [row?.id]);

  // Overview: default the plotted measures to the first several visible rows (keeps the
  // multi-line chart legible). Runs once the overview rows are known and no selection exists.
  useEffect(() => {
    if (selectedMeasureIds !== null || overviewRows.length === 0) return;
    setSelectedMeasureIds(new Set(overviewRows.slice(0, 5).map((r) => r.id)));
  }, [overviewRows, selectedMeasureIds]);

  // Close the measure picker on an outside click.
  useEffect(() => {
    if (!measurePickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (measurePickerRef.current && !measurePickerRef.current.contains(e.target as Node)) {
        setMeasurePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [measurePickerOpen]);

  // Stable color per measure row (keyed by its position in the full visible list).
  const measureColor = useCallback(
    (id: string) => {
      const idx = overviewRows.findIndex((r) => r.id === id);
      return PIE_COLORS[(idx < 0 ? 0 : idx) % PIE_COLORS.length];
    },
    [overviewRows],
  );

  // Overview trend series: one line per selected measure row (each scaled to its own range).
  const overviewSeries: TrendSeries[] = useMemo(() => {
    if (!selectedMeasureIds) return [];
    return overviewRows
      .filter((r) => selectedMeasureIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: measureColor(r.id),
        unit: 'currency' as SubColumnUnit,
        values: MONTHS.map((m) => val(r, m.key)),
      }));
  }, [overviewRows, selectedMeasureIds, measureColor]);

  const toggleMeasure = useCallback((id: string) => {
    setSelectedMeasureIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* --------------------------- Compare mode --------------------------- */
  const compareMode = compareRows.length > 0;
  // How to plot the comparison: raw values, indexed to 100 at Jan, or grouped bars.
  const [compareView, setCompareView] = useState<'indexed' | 'absolute' | 'bars'>('absolute');
  // Month selected in the compare chart → drives the tooltip crosshair (no pie here).
  const [compareMonth, setCompareMonth] = useState<number | null>(null);

  const emptyIdSet = useMemo(() => new Set<string>(), []);

  /** Rows that share a parent with the focused row (its peers) — powers "Compare peers". */
  const focusedPeers = useMemo(() => {
    if (!row) return [];
    const self = compareCandidates.find((c) => c.id === row.id);
    if (!self) return [];
    return compareCandidates.filter((c) => c.parentId === self.parentId);
  }, [row, compareCandidates]);

  /** Seed the comparison with the focused row + its siblings (the most common comparison). */
  const compareWithPeers = useCallback(() => {
    if (!onToggleCompare) return;
    const targets = focusedPeers.length > 1 ? focusedPeers : row ? [{ id: row.id, name: row.name }] : [];
    for (const t of targets) {
      if (!(compareRowIds?.has(t.id) ?? false)) onToggleCompare({ id: t.id, name: t.name });
    }
  }, [onToggleCompare, focusedPeers, row, compareRowIds]);

  // Look up each compared row's measure/path context (from the picker candidates), so a
  // cross-measure comparison (same node under different measures) can be disambiguated.
  const compareCandidateById = useMemo(() => {
    const m = new Map<string, CompareCandidate>();
    for (const c of compareCandidates) m.set(c.id, c);
    return m;
  }, [compareCandidates]);
  const compareMeasureOf = useCallback(
    (id: string) => compareCandidateById.get(id)?.group ?? null,
    [compareCandidateById],
  );
  // True when the compared rows span more than one measure → show the measure to disambiguate.
  const compareSpansMeasures = useMemo(() => {
    const groups = new Set<string>();
    for (const r of compareRows) groups.add(compareMeasureOf(r.id) ?? '');
    return groups.size > 1;
  }, [compareRows, compareMeasureOf]);

  // One raw series per compared row (stable color by position; first row = baseline).
  // When rows span measures, qualify the series name with its measure so tooltips stay unambiguous.
  const compareBaseSeries: TrendSeries[] = useMemo(
    () =>
      compareRows.map((r, i) => {
        const measure = compareMeasureOf(r.id);
        return {
          id: r.id,
          name: compareSpansMeasures && measure ? `${r.name} · ${measure}` : r.name,
          color: PIE_COLORS[i % PIE_COLORS.length],
          unit: 'currency' as SubColumnUnit,
          values: MONTHS.map((m) => val(r, m.key)),
        };
      }),
    [compareRows, compareSpansMeasures, compareMeasureOf],
  );

  // Indexed view: rebase each series to 100 at its first non-zero month so rows with very
  // different magnitudes/units become shape-comparable.
  const compareIndexedSeries: TrendSeries[] = useMemo(
    () =>
      compareBaseSeries.map((s) => {
        const base = s.values.find((v) => v > 0) ?? 0;
        return { ...s, values: base > 0 ? s.values.map((v) => (v / base) * 100) : s.values.map(() => 0) };
      }),
    [compareBaseSeries],
  );

  const compareSeries = compareView === 'indexed' ? compareIndexedSeries : compareBaseSeries;
  // Absolute/bars: rows differ in scale → scale each independently. Indexed shares one 100-base scale.
  const compareNormalizePerSeries = compareView !== 'indexed';

  // Confidence for the focused row's monthly trend — drives the low-confidence badge + red dots.
  const bandConfidence = useMemo(
    () => (row ? computeConfidence(MONTHS.map((m) => val(row, m.key))) : { band: [], lowIndices: [] }),
    [row],
  );

  /* --------------------------- Analysis mode -------------------------- */
  // Which advanced analysis is shown in the detail view's Analysis section.
  type AnalysisTab = 'waterfall' | 'variance' | 'pareto' | 'tree' | 'tornado' | 'band' | 'bullet';
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('waterfall');
  // Waterfall bridge endpoints (default: first month → last month of FY26).
  const [wfFrom, setWfFrom] = useState<ValueKey>('jan2026');
  const [wfTo, setWfTo] = useState<ValueKey>('dec2026');
  // Waterfall bridge mode: period-to-period, or Actual-vs-Plan variance.
  const wfMode: 'period' | 'plan' = 'period';
  // Variance tab: which sub-column is the reference (Plan/Target/…) and the allowed tolerance (±%).
  const [varRefSubId, setVarRefSubId] = useState<string | null>(null);
  const [varTolerance, setVarTolerance] = useState<number>(5);
  // Variance tab: the month drilled into for the per-child variance breakdown (null = auto-pick).
  const [varMonth, setVarMonth] = useState<string | null>(null);
  // Collapsible AI Insights card.
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);

  // Show a brief loader while the panel switches to a different row's context.
  useEffect(() => {
    if (!row) {
      setPanelLoading(false);
      return;
    }
    setPanelLoading(true);
    const t = setTimeout(() => setPanelLoading(false), 500);
    return () => clearTimeout(t);
  }, [row?.id]);

  // Show a ~1s loader whenever the selected period/series changes so the user sees the
  // composition is (re)computing for the month they just clicked.
  useEffect(() => {
    if (periodKey === null) {
      setPieLoading(false);
      return;
    }
    setPieLoading(true);
    const t = setTimeout(() => setPieLoading(false), 1000);
    return () => clearTimeout(t);
  }, [periodKey, activeSeriesId]);

  // Trend series: the row's own monthly value ("Actual") plus one line per numeric sub-column.
  const trendSeries: TrendSeries[] = useMemo(() => {
    if (!row) return [];
    const base: TrendSeries = {
      id: '__value',
      name: 'Actual',
      color: BASE_LINE_COLOR,
      unit: 'currency',
      values: MONTHS.map((m) => val(row, m.key)),
    };
    const colorMap = getSubColumnLineColorMap(subColumns);
    const extras: TrendSeries[] = [];
    subColumns.forEach((sc) => {
      // Skip non-numeric columns and "Achieved" (identical to the Actual base line).
      if (!isChartedSubColumn(sc)) return;
      const unit = getSubColumnUnit(sc.id, sc.formula);
      const values = MONTHS.map((m) => getSubColumnNumeric(sc.id, val(row, m.key), row.id, m.key, sc.formula) ?? 0);
      extras.push({
        id: sc.id,
        name: sc.name,
        color: colorMap.get(sc.id) ?? BASE_LINE_COLOR,
        unit,
        values,
      });
    });
    return [base, ...extras];
  }, [row, subColumns]);

  // With more than one series of DIFFERENT units (e.g. currency + %), scale each line
  // independently so a large/volatile series doesn't flatten the others. When all lines share
  // one unit, use a shared scale instead so the real gaps between the lines are visible.
  const normalizePerSeries = useMemo(() => {
    if (trendSeries.length <= 1) return false;
    const units = new Set(trendSeries.map((s) => s.unit));
    return units.size > 1;
  }, [trendSeries]);

  const children = row?.children ?? [];
  const hasChildren = children.length > 0;

  // Frozen scale snapshots: capture the series/children once per row (and per series count /
  // subcolumn mode) so editing a cell moves only that point/segment, not the whole axis.
  // Keyed by row id + series length so it re-snapshots when the row or mode legitimately changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scaleSeries = useMemo(() => trendSeries, [row?.id, trendSeries.length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scaleRows = useMemo(() => children, [row?.id, children.length]);

  const slices: Slice[] = useMemo(() => {
    if (!hasChildren) return [];
    return children
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        value: periodKey ? val(c, periodKey) : 0,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [children, hasChildren, periodKey]);

  const pieTotal = slices.reduce((s, d) => s + Math.max(d.value, 0), 0);

  // A child's value for a given series (sub-column) at a period. For the base "Actual"
  // series this is just the child's own value; otherwise it's the derived sub-column value.
  const seriesChildValue = useCallback(
    (child: GridRow, seriesId: string, key: ValueKey): number => {
      if (seriesId === '__value') return val(child, key);
      const sc = subColumns.find((c) => c.id === seriesId);
      return getSubColumnNumeric(seriesId, val(child, key), child.id, key, sc?.formula) ?? 0;
    },
    [subColumns],
  );

  // Pie for the selected line/bar (sub-column mode): share of children for that series+period.
  const seriesSlices: Slice[] = useMemo(() => {
    if (!hasChildren || !activeSeriesId || !periodKey) return [];
    return children
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        value: seriesChildValue(c, activeSeriesId, periodKey),
        color: SERIES_PIE_COLORS[i % SERIES_PIE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [children, hasChildren, activeSeriesId, periodKey, seriesChildValue]);
  const seriesPieTotal = seriesSlices.reduce((s, d) => s + Math.max(d.value, 0), 0);

  // No sub-columns → a single bar chart. Sub-columns → a multi-line chart with a
  // grouped bar chart shown right below it.
  const hasSubColLines = trendSeries.length > 1;
  const selectedIndex = MONTHS.findIndex((m) => m.key === periodKey);
  const monthTipRows = (i: number) =>
    trendSeries.map((s) => ({ label: s.name, val: fmtUnit(s.values[i], s.unit), color: s.color }));

  // Tooltip for the stacked bars: the month total plus each child's contribution.
  const stackTipRows = (i: number) => {
    const key = MONTHS[i].key;
    const total = children.reduce((s, c) => s + Math.max(val(c, key), 0), 0);
    const kids = children
      .map((c, ci) => ({
        label: c.name,
        val: fmt(val(c, key)),
        color: PIE_COLORS[ci % PIE_COLORS.length],
        raw: Math.max(val(c, key), 0),
      }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 6)
      .map(({ label, val: v, color }) => ({ label, val: v, color }));
    return [{ label: 'Total', val: fmt(total) }, ...kids];
  };

  const activeSeries = trendSeries.find((s) => s.id === activeSeriesId) ?? null;

  /* ---- Advanced analysis data (computed from the focused row + children) ---- */
  const periodShort = (k: ValueKey) => PERIODS.find((p) => p.key === k)?.label ?? String(k);

  // A Plan/Budget/Target sub-column, if one is active — enables the Actual-vs-Plan bridge.
  const planSubCol = useMemo(
    () => subColumns.find((sc) => /plan|budget|target/i.test(sc.name)),
    [subColumns],
  );
  const planValue = useCallback(
    (r: GridRow, key: ValueKey): number =>
      planSubCol ? getSubColumnNumeric(planSubCol.id, val(r, key), r.id, key, planSubCol.formula) ?? 0 : 0,
    [planSubCol],
  );

  /** Group a list of {name, delta} into top movers + an "Other" bucket. */
  const bucketSteps = (raw: { name: string; delta: number }[]): WaterfallStep[] => {
    const sorted = raw.filter((s) => Math.abs(s.delta) > 0.5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const TOP = 7;
    const top = sorted.slice(0, TOP);
    const rest = sorted.slice(TOP);
    if (!rest.length) return top;
    const otherDelta = rest.reduce((s, r) => s + r.delta, 0);
    return Math.abs(otherDelta) > 0.5 ? [...top, { name: `Other (${rest.length})`, delta: otherDelta }] : top;
  };

  // Waterfall bridge. Two modes:
  //  • period → start = value at wfFrom, decomposed to wfTo by each child's delta.
  //  • plan   → start = Plan total, decomposed to Actual by each child's (actual − plan) variance.
  // Returns `unavailable` when Plan mode is chosen but no Plan/Budget/Target sub-column is active.
  const waterfall = useMemo(() => {
    if (!row) return null;
    if (wfMode === 'plan') {
      if (!planSubCol) return { unavailable: true as const };
      const startValue = planValue(row, 'year');
      const endValue = val(row, 'year');
      const steps =
        children.length > 0
          ? bucketSteps(children.map((c) => ({ name: c.name, delta: val(c, 'year') - planValue(c, 'year') })))
          : [{ name: 'Variance', delta: endValue - startValue }];
      return { startValue, endValue, steps, startLabel: `Plan (${planSubCol.name})`, endLabel: 'Actual' };
    }
    // Period bridge → decompose the change into month-over-month steps so the whole x-axis is
    // time (start period → each intervening month's change → end period), never mixing in child names.
    const startValue = val(row, wfFrom);
    const endValue = val(row, wfTo);
    const fromIdx = MONTHS.findIndex((m) => m.key === wfFrom);
    const toIdx = MONTHS.findIndex((m) => m.key === wfTo);
    let steps: WaterfallStep[];
    if (fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx) {
      steps = [];
      for (let i = fromIdx + 1; i <= toIdx; i++) {
        steps.push({ name: MONTHS[i].label, delta: val(row, MONTHS[i].key) - val(row, MONTHS[i - 1].key) });
      }
    } else {
      steps = [{ name: 'Change', delta: endValue - startValue }];
    }
    return { startValue, endValue, steps, startLabel: periodShort(wfFrom), endLabel: periodShort(wfTo) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, children, wfFrom, wfTo, wfMode, planSubCol, planValue]);

  // Variance references: built-in Plan/Target (derived per-cell), any active Plan/Target-like
  // sub-columns, plus every other measure (the equivalent node under that measure is the reference).
  type RefOption = { id: string; name: string; kind: 'sub' | 'measure'; measureRow?: GridRow };
  const referenceOptions = useMemo<RefOption[]>(() => {
    const out: RefOption[] = [
      { id: 'planned', name: 'Planned', kind: 'sub' },
      { id: 'target', name: 'Target', kind: 'sub' },
    ];
    for (const sc of subColumns) {
      if (/plan|target|budget|baseline|forecast|commit/i.test(sc.name) && !out.some((o) => o.id === sc.id)) {
        out.push({ id: sc.id, name: sc.name, kind: 'sub' });
      }
    }
    for (const mr of overviewRows) {
      if (mr.name === measureName) continue; // comparing a row to its own measure is pointless
      out.push({ id: `m:${mr.id}`, name: mr.name, kind: 'measure', measureRow: mr });
    }
    return out;
  }, [subColumns, overviewRows, measureName]);
  // Keep the chosen reference valid; default to the first option (Planned).
  useEffect(() => {
    if (referenceOptions.length === 0) {
      if (varRefSubId !== null) setVarRefSubId(null);
      return;
    }
    if (!varRefSubId || !referenceOptions.some((o) => o.id === varRefSubId)) {
      setVarRefSubId(referenceOptions[0].id);
    }
  }, [referenceOptions, varRefSubId]);

  // Walk a measure's dimension tree by name to find the node equivalent to the focused row.
  const findNodeByNamePath = useCallback((rootChildren: GridRow[] | undefined, names: string[]): GridRow | null => {
    let level = rootChildren;
    let node: GridRow | null = null;
    for (const nm of names) {
      if (!level) return null;
      node = level.find((r) => r.name === nm) ?? null;
      if (!node) return null;
      level = node.children;
    }
    return node;
  }, []);

  // Variance tab: the selected row's monthly Actual vs a reference (Plan/Target/another measure)
  // line, with a shaded ±tolerance band. Flags the months where Actual broke out of the band.
  const varianceBand = useMemo(() => {
    if (!row) return null;
    const refOpt = referenceOptions.find((o) => o.id === varRefSubId) ?? null;
    if (!refOpt) return { needsRef: true as const };
    const actual = MONTHS.map((m) => val(row, m.key));
    let reference: number[];
    if (refOpt.kind === 'measure') {
      // Find the equivalent dimension node under the reference measure.
      const cand = compareCandidateById.get(row.id);
      let node: GridRow | null;
      if (!cand || cand.depth === 0) node = refOpt.measureRow ?? null;
      else node = findNodeByNamePath(refOpt.measureRow?.children, [...cand.path, cand.name]);
      reference = MONTHS.map((m) => (node ? val(node, m.key) : 0));
    } else {
      const scFormula = subColumns.find((s) => s.id === refOpt.id)?.formula;
      reference = MONTHS.map(
        (m) => getSubColumnNumeric(refOpt.id, val(row, m.key), row.id, m.key, scFormula) ?? 0,
      );
    }
    const refSub = { name: refOpt.name };
    const tol = varTolerance / 100;
    const breaches = MONTHS.map((m, i) => {
      const up = reference[i] * (1 + tol);
      const lo = reference[i] * (1 - tol);
      const a = actual[i];
      if (a > up + 0.5) return { i, label: m.label, actual: a, ref: reference[i], dir: 'over' as const, pct: reference[i] ? ((a - reference[i]) / reference[i]) * 100 : 0 };
      if (a < lo - 0.5) return { i, label: m.label, actual: a, ref: reference[i], dir: 'under' as const, pct: reference[i] ? ((a - reference[i]) / reference[i]) * 100 : 0 };
      return null;
    }).filter((b): b is NonNullable<typeof b> => b !== null);
    return { refName: refSub.name, actual, reference, breaches };
  }, [row, referenceOptions, varRefSubId, varTolerance, subColumns, compareCandidateById, findNodeByNamePath]);

  // Auto-focus the month with the biggest gap so the child breakdown shows something meaningful,
  // but never override an explicit choice (months are shared across rows, so it stays put on drill).
  useEffect(() => {
    if (!varianceBand || 'needsRef' in varianceBand) return;
    if (varMonth && MONTHS.some((m) => m.key === varMonth)) return;
    let bestI = 0;
    let best = -1;
    varianceBand.actual.forEach((a, i) => {
      const d = Math.abs(a - varianceBand.reference[i]);
      if (d > best) {
        best = d;
        bestI = i;
      }
    });
    setVarMonth(MONTHS[bestI].key);
  }, [varianceBand, varMonth]);

  // For the drilled month: each child's Actual vs the same reference, as signed variance — the
  // input for a diverging bar chart showing who pulled the parent above/below the baseline.
  const varChildVariance = useMemo(() => {
    if (!row || !varMonth) return null;
    if (!varianceBand || 'needsRef' in varianceBand) return null;
    const refOpt = referenceOptions.find((o) => o.id === varRefSubId) ?? null;
    if (!refOpt) return null;
    const kids = row.children ?? [];
    if (kids.length === 0) return null;
    const cand = compareCandidateById.get(row.id);
    const focusedNames = cand && cand.depth > 0 ? [...cand.path, cand.name] : [];
    const refFor = (child: GridRow): number => {
      if (refOpt.kind === 'measure') {
        const node = findNodeByNamePath(refOpt.measureRow?.children, [...focusedNames, child.name]);
        return node ? val(node, varMonth) : 0;
      }
      const scFormula = subColumns.find((s) => s.id === refOpt.id)?.formula;
      return getSubColumnNumeric(refOpt.id, val(child, varMonth), child.id, varMonth, scFormula) ?? 0;
    };
    const tol = varTolerance / 100;
    const items = kids
      .map((c) => {
        const actual = val(c, varMonth);
        const ref = refFor(c);
        const variance = actual - ref;
        const pct = ref !== 0 ? (variance / ref) * 100 : null;
        const breach = pct !== null && Math.abs(pct) > varTolerance;
        return { id: c.id, name: c.name, actual, ref, variance, pct, breach };
      })
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.variance)));
    return {
      items,
      maxAbs,
      monthLabel: MONTHS.find((m) => m.key === varMonth)?.label ?? varMonth,
      tol,
    };
  }, [row, varMonth, varianceBand, referenceOptions, varRefSubId, varTolerance, subColumns, compareCandidateById, findNodeByNamePath]);

  // Pareto: children ranked by value at the selected period (or full year if none picked).
  const paretoPeriod: ValueKey = periodKey ?? 'year';
  const paretoItems = useMemo(
    () =>
      children
        .map((c, i) => ({ name: c.name, value: val(c, paretoPeriod), color: PIE_COLORS[i % PIE_COLORS.length] }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
    [children, paretoPeriod],
  );

  // Tornado: how much the parent's full-year total shifts if each child moves ±swing%.
  const TORNADO_SWING = 10;
  const tornadoItems = useMemo(
    () =>
      children
        .map((c, i) => ({ name: c.name, impact: Math.abs(val(c, 'year')) * (TORNADO_SWING / 100), color: PIE_COLORS[i % PIE_COLORS.length] }))
        .filter((d) => d.impact > 0)
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 8),
    [children],
  );

  // Bullet target: prefer a Target/Plan/Baseline sub-column at year; else fall back to
  // the trailing-average annualized run-rate as an implied target.
  const bulletData = useMemo(() => {
    if (!row) return null;
    const actual = val(row, 'year');
    const targetSc = subColumns.find((sc) => /target|plan|baseline|budget/i.test(sc.name));
    let target: number;
    let source: string;
    if (targetSc) {
      target = getSubColumnNumeric(targetSc.id, actual, row.id, 'year', targetSc.formula) ?? actual;
      source = targetSc.name;
    } else {
      const st = computeTrendStats(row);
      target = st.avg * 12 * 1.05; // implied plan: 5% above the annualized monthly average
      source = 'Implied plan (run-rate +5%)';
    }
    return { actual, target, source };
  }, [row, subColumns]);

  // Deterministic "AI" variance commentary from the row's own stats + children mix.
  const commentary = useMemo(() => {
    if (!row) return [];
    const st = computeTrendStats(row);
    const out: string[] = [];
    const dir = st.maxDev >= 0 ? 'above' : 'below';
    out.push(
      `${row.name} totals ${fmt(st.total)} across FY26, averaging ${fmt(st.avg)}/month. It peaks in ${st.highestMonth} (${fmt(st.highest)}) and troughs in ${st.lowestMonth} (${fmt(st.lowest)}).`,
    );
    out.push(
      `The largest swing is in ${st.maxDevMonth}, ${Math.abs(st.maxDevPct).toFixed(0)}% ${dir} the monthly average.`,
    );
    if (children.length > 0) {
      const kids = children
        .map((c) => ({ name: c.name, v: val(c, 'year') }))
        .sort((a, b) => b.v - a.v);
      const top = kids[0];
      const topShare = st.total > 0 ? (top.v / st.total) * 100 : 0;
      const top3 = kids.slice(0, 3).reduce((s, k) => s + k.v, 0);
      const top3Share = st.total > 0 ? (top3 / st.total) * 100 : 0;
      out.push(
        `${top.name} is the biggest contributor at ${topShare.toFixed(0)}% of the total; the top ${Math.min(3, kids.length)} make up ${top3Share.toFixed(0)}%${top3Share >= 70 ? ' — a concentrated mix' : ''}.`,
      );
      const startV = val(row, wfFrom);
      const endV = val(row, wfTo);
      if (startV > 0) {
        const chgPct = ((endV - startV) / startV) * 100;
        out.push(
          `From ${periodShort(wfFrom)} to ${periodShort(wfTo)}, ${row.name} ${chgPct >= 0 ? 'grew' : 'declined'} ${Math.abs(chgPct).toFixed(0)}% (${fmt(endV - startV)}).`,
        );
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, children.length, wfFrom, wfTo]);

  // Expand the currently-shown row on the grid so its children (the pie's slices) are visible.
  const expandCurrentRow = () => {
    if (row) onExpandRow?.(row.id);
  };

  // Select the row's cell for a given month on the grid (mirrors clicking that grid cell).
  const selectCellForMonth = (i: number) => {
    if (row) onSelectCell?.(row.id, MONTHS[i].key as string);
  };

  // Selecting a month (bar/band click) → set the period, reveal the row's children, and
  // highlight that month's cell on the grid.
  const handleMonthSelect = (i: number) => {
    setPeriodKey(MONTHS[i].key);
    expandCurrentRow();
    selectCellForMonth(i);
  };

  // Click a whole line → focus that series; if no month is picked yet, snap to its peak month.
  const handleSelectSeries = (seriesId: string) => {
    setActiveSeriesId(seriesId);
    let targetMonth = selectedIndex;
    if (periodKey === null) {
      const s = trendSeries.find((x) => x.id === seriesId);
      if (s && s.values.length) {
        let mi = 0;
        s.values.forEach((v, i) => {
          if (v > s.values[mi]) mi = i;
        });
        setPeriodKey(MONTHS[mi].key);
        targetMonth = mi;
      }
    }
    expandCurrentRow();
    if (targetMonth >= 0) selectCellForMonth(targetMonth);
  };

  // Click a specific bar → focus that series and snap the pie to that month.
  const handleSelectBar = (seriesId: string, monthIndex: number) => {
    setActiveSeriesId(seriesId);
    setPeriodKey(MONTHS[monthIndex].key);
    expandCurrentRow();
    selectCellForMonth(monthIndex);
  };

  // Click a metric tile → jump the trend/pie to that month (tiles are computed on the
  // Actual series, so focus that line too). Pass 'year' for the whole-year average tile.
  const focusStatPeriod = (target: string) => {
    if (target === 'year') {
      setActiveSeriesId('__value');
      setPeriodKey('year');
      return;
    }
    const mi = MONTHS.findIndex((mm) => mm.label === target);
    if (mi >= 0) {
      setActiveSeriesId('__value');
      setPeriodKey(MONTHS[mi].key);
      selectCellForMonth(mi);
    }
  };

  if (!isOpen) return null;

  const periodLabel = PERIODS.find((p) => p.key === periodKey)?.label ?? 'FY26';
  const stats = row ? computeTrendStats(row) : null;

  return (
    <div className="charts-panel" ref={panelRef} style={{ width: panelWidth }}>
      <div
        className="charts-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize charts panel"
        title="Drag to resize"
        onMouseDown={startResize}
      />
      <div className="charts-panel-header">
        <div className="charts-panel-title-section">
          <svg className="charts-panel-icon" width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M17 3.05V15h11.95A12 12 0 0 0 17 3.05zM15 4.06A12 12 0 1 0 27.94 17H15V4.06z"
              fill="#0250D9"
            />
          </svg>
          <p className="charts-panel-title">Charts</p>
        </div>
        <button className="charts-panel-close" onClick={onClose} aria-label="Close">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {tip && (
        <div className="charts-tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <div className="charts-tooltip-title">{tip.title}</div>
          {tip.rows.map((r, i) => (
            <div key={i} className="charts-tooltip-row">
              {r.color && <span className="charts-tooltip-dot" style={{ backgroundColor: r.color }} />}
              <span className="charts-tooltip-label">{r.label}</span>
              <span className="charts-tooltip-val">{r.val}</span>
            </div>
          ))}
        </div>
      )}

      <div className="charts-panel-body">
        {compareMode ? (
          <div className="charts-overview">
            {onExitCompare && (
              <button type="button" className="charts-compare-back" onClick={onExitCompare}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span>Back to {compareReturnName ? compareReturnName : 'charts'}</span>
              </button>
            )}
            <div className="charts-compare-head">
              <div className="charts-row-head-text">
                <span className="charts-row-name">Compare rows</span>
                <span className="charts-row-sub">{compareRows.length} selected · FY26 monthly</span>
              </div>
              {onToggleCompare && (
                <CompareRowPicker
                  candidates={compareCandidates}
                  selectedIds={compareRowIds ?? emptyIdSet}
                  onToggle={onToggleCompare}
                  onClear={onClearCompare}
                />
              )}
            </div>

            {compareRows.length < 2 ? (
              <p className="charts-note">
                Use <b>Compare rows</b> above to add at least one more row and compare trends side by side.
              </p>
            ) : (
              <section className="charts-section">
                <div className="charts-section-head">
                  <div className="charts-section-titlerow">
                    <h4 className="charts-section-title">Trend comparison</h4>
                  </div>
                  {/* Segmented view switch. */}
                  <div className="charts-compare-seg" role="tablist" aria-label="Comparison view">
                    {([
                      { k: 'absolute', label: 'Line' },
                      { k: 'bars', label: 'Bars' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.k}
                        type="button"
                        role="tab"
                        aria-selected={compareView === opt.k}
                        className={`charts-compare-seg-btn${compareView === opt.k ? ' is-active' : ''}`}
                        onClick={() => setCompareView(opt.k)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="charts-chart-area" ref={chartAreaRef}>
                  {compareView === 'bars' ? (
                    <BarChart
                      width={chartW}
                      series={compareSeries}
                      normalizePerSeries={compareNormalizePerSeries}
                      selectedIndex={compareMonth}
                      onSelectMonth={setCompareMonth}
                      onBarHover={(i, e) =>
                        showTip(e, `${MONTHS[i].label} 2026`, compareBaseSeries.map((s) => ({ label: s.name, val: fmt(s.values[i]), color: s.color })))
                      }
                      onLeave={hideTip}
                    />
                  ) : (
                    <TrendChart
                      width={chartW}
                      series={compareSeries}
                      normalizePerSeries={compareNormalizePerSeries}
                      selectedIndex={compareMonth}
                      onSelectMonth={setCompareMonth}
                      onPointHover={(i, e) =>
                        showTip(
                          e,
                          `${MONTHS[i].label} 2026`,
                          compareView === 'indexed'
                            ? compareSeries.map((s) => ({ label: s.name, val: `${Math.round(s.values[i])}`, color: s.color }))
                            : compareBaseSeries.map((s) => ({ label: s.name, val: fmt(s.values[i]), color: s.color })),
                        )
                      }
                      onPointLeave={hideTip}
                    />
                  )}
                  <p className="charts-scale-note">
                    {compareView === 'indexed'
                      ? 'Growth view: each row starts at 100 in its first month, so you compare growth regardless of size. Hover a point for exact values.'
                      : compareView === 'absolute'
                        ? 'Each line is scaled to its own range (rows can differ in size/units). Hover a point for exact values.'
                        : 'Grouped bars per month; each row scaled to its own range. Hover a bar for exact values.'}
                  </p>
                </div>

                {/* Legend — colour key mapping each line/bar to its row. */}
                <ul className="charts-compare-legend">
                  {compareRows.map((r, i) => (
                    <li key={r.id} className="charts-compare-legend-item">
                      <span className="charts-compare-legend-dot" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="charts-compare-legend-text">
                        <span className="charts-compare-legend-name" title={r.name}>{r.name}</span>
                        {compareSpansMeasures && compareMeasureOf(r.id) && (
                          <span className="charts-compare-legend-measure" title={compareMeasureOf(r.id) ?? undefined}>
                            {compareMeasureOf(r.id)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : !row ? (
          overviewRows.length > 0 ? (
            <div className="charts-overview">
              <div className="charts-row-head">
                <div className="charts-row-head-text">
                  <span className="charts-row-name">All measures</span>
                  <span className="charts-row-sub">FY26 · monthly trend · pick measures to compare</span>
                </div>
                {onToggleCompare && (
                  <CompareRowPicker
                    candidates={compareCandidates}
                    selectedIds={compareRowIds ?? emptyIdSet}
                    onToggle={onToggleCompare}
                    onClear={onClearCompare}
                  />
                )}
              </div>

              <section className="charts-section">
                <div className="charts-section-head">
                  <div className="charts-section-titlerow">
                    <h4 className="charts-section-title">Measure trends</h4>
                  </div>
                  {/* Multi-select dropdown to choose which measures are plotted. */}
                  <div className="charts-measure-picker" ref={measurePickerRef}>
                    <button
                      type="button"
                      className="charts-measure-picker-btn"
                      aria-haspopup="listbox"
                      aria-expanded={measurePickerOpen}
                      onClick={() => setMeasurePickerOpen((v) => !v)}
                    >
                      {(selectedMeasureIds?.size ?? 0)} of {overviewRows.length} measures
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {measurePickerOpen && (
                      <div className="charts-measure-menu" role="listbox">
                        <div className="charts-measure-menu-actions">
                          <button type="button" onClick={() => setSelectedMeasureIds(new Set(overviewRows.map((r) => r.id)))}>Select all</button>
                          <button type="button" onClick={() => setSelectedMeasureIds(new Set())}>Clear</button>
                        </div>
                        {overviewRows.map((r) => {
                          const checked = selectedMeasureIds?.has(r.id) ?? false;
                          return (
                            <label key={r.id} className="charts-measure-option">
                              <input type="checkbox" checked={checked} onChange={() => toggleMeasure(r.id)} />
                              <span className="charts-measure-swatch" style={{ backgroundColor: measureColor(r.id), opacity: checked ? 1 : 0.3 }} />
                              <span className="charts-measure-optname" title={r.name}>{r.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="charts-chart-area" ref={chartAreaRef}>
                  {overviewSeries.length > 0 ? (
                    <>
                      <TrendChart
                        width={chartW}
                        series={overviewSeries}
                        normalizePerSeries
                        selectedIndex={null}
                        onPointHover={(i, e) =>
                          showTip(
                            e,
                            `${MONTHS[i].label} 2026`,
                            overviewSeries.map((s) => ({ label: s.name, val: fmt(s.values[i]), color: s.color })),
                          )
                        }
                        onPointLeave={hideTip}
                        onSelectMonth={() => {}}
                        onSelectSeries={(id) => onFocusRow?.(id)}
                      />
                      <ul className="charts-line-legend">
                        {overviewSeries.map((s) => (
                          <li
                            key={s.id}
                            className="charts-line-legend-item charts-line-legend-item--clickable"
                            title={onFocusRow ? `Open ${s.name}` : s.name}
                            onClick={() => onFocusRow?.(s.id)}
                          >
                            <span className="charts-line-swatch" style={{ backgroundColor: s.color }} />
                            <span className="charts-line-name" title={s.name}>{s.name}</span>
                            <span className="charts-line-val">{fmt(val(overviewRows.find((r) => r.id === s.id)!, 'year'))}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="charts-scale-note">
                        Each line is scaled to its own range so trends are comparable. Exact values are in the legend and tooltips.
                        {onFocusRow ? ' Tip: click a measure to see its detailed trend and composition.' : ''}
                      </p>
                    </>
                  ) : (
                    <p className="charts-note">Select one or more measures to plot their trends.</p>
                  )}
                </div>
              </section>
            </div>
          ) : (
          <div className="charts-empty">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M17 3.05V15h11.95A12 12 0 0 0 17 3.05zM15 4.06A12 12 0 1 0 27.94 17H15V4.06z"
                fill="#c9c9c9"
              />
            </svg>
            <p className="charts-empty-title">No row selected</p>
            <p className="charts-empty-sub">
              Open a row’s <b>⋮</b> menu and choose <b>Show Charts</b> to see its trend and
              composition here.
            </p>
          </div>
          )
        ) : panelLoading ? (
          <div className="charts-panel-loading" role="status" aria-live="polite">
            <span className="charts-spinner" aria-hidden="true" />
            <span className="charts-pie-loading-text">Loading {row.name}…</span>
          </div>
        ) : (
          <>
            {/* Drill breadcrumb — simple text above the row header; click an earlier level to come back. */}
            {breadcrumb.length > 1 && (
              <nav className="charts-breadcrumb" aria-label="Chart drill path">
                {breadcrumb.map((crumb, i) => {
                  const isLast = i === breadcrumb.length - 1;
                  return (
                    <React.Fragment key={crumb.id}>
                      {isLast ? (
                        <span className="charts-crumb charts-crumb--current" title={crumb.name}>
                          {crumb.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="charts-crumb charts-crumb--link"
                          title={`Back to ${crumb.name}`}
                          onClick={() => onBreadcrumbNav?.(i)}
                        >
                          {crumb.name}
                        </button>
                      )}
                      {!isLast && <span className="charts-crumb-sep" aria-hidden="true">&gt;</span>}
                    </React.Fragment>
                  );
                })}
              </nav>
            )}

            <div className="charts-row-head">
              <RowIcon type={row.type} />
              <div className="charts-row-head-text">
                <span className="charts-row-name" title={row.name}>
                  {row.name}
                </span>
                <span className="charts-row-sub">
                  {measureName && measureName !== row.name ? (
                    <>
                      <span className="charts-row-measure" title={measureName}>{measureName}</span>
                      <span className="charts-row-sub-sep" aria-hidden="true"> · </span>
                      Trend &amp; composition
                    </>
                  ) : (
                    'Trend & composition'
                  )}
                </span>
              </div>
              {onToggleCompare && (
                <button
                  type="button"
                  className="charts-compare-add-btn"
                  title={
                    focusedPeers.length > 1
                      ? `Compare ${row.name} with its ${focusedPeers.length - 1} peer${focusedPeers.length - 1 > 1 ? 's' : ''}`
                      : `Add ${row.name} to a comparison`
                  }
                  onClick={compareWithPeers}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 3v18h18" />
                    <rect x="7" y="11" width="3" height="7" />
                    <rect x="14" y="7" width="3" height="11" />
                  </svg>
                  <span>{focusedPeers.length > 1 ? 'Compare peers' : 'Compare'}</span>
                </button>
              )}
            </div>

            {commentary.length > 0 && (
              <section className={`charts-insights${insightsCollapsed ? ' is-collapsed' : ''}`}>
                <button
                  type="button"
                  className="charts-insights-head"
                  aria-expanded={!insightsCollapsed}
                  onClick={() => setInsightsCollapsed((c) => !c)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#0176d3" aria-hidden="true">
                    <path d="M12 2l1.9 4.6L18.5 8l-3.8 3.2L15.6 16 12 13.6 8.4 16l.9-4.8L5.5 8l4.6-1.4L12 2z" />
                  </svg>
                  <span className="charts-insights-title">Insights</span>
                  <svg
                    className="charts-insights-chevron"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {!insightsCollapsed && (
                  <ul className="charts-insights-list">
                    {commentary.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {stats && !hasSubColLines && (
              <div className="charts-tiles">
                <button
                  type="button"
                  className="charts-tile charts-tile--clickable"
                  title={`Show ${stats.highestMonth}`}
                  onClick={() => focusStatPeriod(stats.highestMonth)}
                >
                  <span className="charts-tile-label">Highest</span>
                  <span className="charts-tile-val">{fmt(stats.highest)}</span>
                  <span className="charts-tile-sub">{stats.highestMonth}</span>
                </button>
                <button
                  type="button"
                  className="charts-tile charts-tile--clickable"
                  title={`Show ${stats.lowestMonth}`}
                  onClick={() => focusStatPeriod(stats.lowestMonth)}
                >
                  <span className="charts-tile-label">Lowest</span>
                  <span className="charts-tile-val">{fmt(stats.lowest)}</span>
                  <span className="charts-tile-sub">{stats.lowestMonth}</span>
                </button>
                <button
                  type="button"
                  className="charts-tile charts-tile--clickable"
                  title="Show full year"
                  onClick={() => focusStatPeriod('year')}
                >
                  <span className="charts-tile-label">Monthly avg</span>
                  <span className="charts-tile-val">{fmt(stats.avg)}</span>
                  <span className="charts-tile-sub">FY26 · {fmt(stats.total)} total</span>
                </button>
                <button
                  type="button"
                  className="charts-tile charts-tile--clickable"
                  title={`Show ${stats.maxDevMonth}`}
                  onClick={() => focusStatPeriod(stats.maxDevMonth)}
                >
                  <span className="charts-tile-label">Max deviation</span>
                  <span
                    className="charts-tile-val"
                    style={{ color: stats.maxDev >= 0 ? 'var(--slds-g-color-success-1, #2e844a)' : 'var(--slds-g-color-error-1, #ba0517)' }}
                  >
                    {stats.maxDevPct >= 0 ? '+' : ''}
                    {stats.maxDevPct.toFixed(0)}%
                  </span>
                  <span className="charts-tile-sub">
                    {stats.maxDevMonth} · {stats.maxDev >= 0 ? '+' : ''}
                    {fmt(stats.maxDev)}
                  </span>
                </button>
              </div>
            )}

            <section className="charts-section">
              <div className="charts-section-head">
                <div className="charts-section-titlerow">
                  <span className="charts-section-icon"><RowIcon type={row.type} /></span>
                  <h4 className="charts-section-title" title={row.name}>Trend of {row.name}</h4>
                </div>
                <span className="charts-section-meta">
                  {hasSubColLines
                    ? `FY26 · monthly · ${trendSeries.length} series`
                    : `FY26 · monthly · ${fmt(val(row, 'year'))}`}
                </span>
              </div>

              <div className="charts-chart-area" ref={chartAreaRef}>
                {hasSubColLines ? (
                  <>
                    {/* Sub-columns present → lines first … */}
                    <TrendChart
                      width={chartW}
                      series={trendSeries}
                      normalizePerSeries={normalizePerSeries}
                      scaleSeries={scaleSeries}
                      selectedIndex={selectedIndex}
                      activeSeriesId={activeSeriesId}
                      onSelectMonth={handleMonthSelect}
                      onSelectSeries={handleSelectSeries}
                      onPointHover={(i, e) => showTip(e, `${MONTHS[i].label} 2026`, monthTipRows(i))}
                      onPointLeave={hideTip}
                    />
                    <ul className="charts-line-legend">
                      {trendSeries.map((s) => {
                        const yearVal =
                          s.id === '__value'
                            ? val(row, 'year')
                            : getSubColumnNumeric(s.id, val(row, 'year'), row.id, 'year',
                                subColumns.find((c) => c.id === s.id)?.formula) ?? 0;
                        return (
                          <li key={s.id} className="charts-line-legend-item">
                            <span className="charts-line-swatch" style={{ backgroundColor: s.color }} />
                            <span className="charts-line-name" title={s.name}>
                              {s.name}
                            </span>
                            <span className="charts-line-val">{fmtUnit(yearVal, s.unit)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="charts-scale-note">
                      {normalizePerSeries
                        ? 'Each line is scaled to its own range (units differ), so it lines up with the matching bars below. Exact values are in the legend and tooltips.'
                        : 'Lines share one zoomed scale so the gaps between them are visible. Exact values are in the legend and tooltips.'}
                    </p>

                    {/* … and the same series as a grouped bar chart right below. */}
                    <div className="charts-subchart">
                      <span className="charts-subchart-title">Monthly bars</span>
                      <BarChart
                        width={chartW}
                        series={trendSeries}
                        normalizePerSeries={normalizePerSeries}
                        scaleSeries={scaleSeries}
                        selectedIndex={selectedIndex}
                        onSelectMonth={handleMonthSelect}
                        onBarClick={handleSelectBar}
                        onBarHover={(i, e) => showTip(e, `${MONTHS[i].label} 2026`, monthTipRows(i))}
                        onLeave={hideTip}
                      />
                    </div>
                    <p className="charts-scale-note">Tip: click a line or a bar to see the share of its children below.</p>
                  </>
                ) : hasChildren ? (
                  <>
                    {/* No sub-columns, but the row has children → stacked bars showing each
                        child's contribution to the monthly total. */}
                    <StackedBarChart
                      width={chartW}
                      rows={children}
                      colors={PIE_COLORS}
                      scaleRows={scaleRows}
                      selectedIndex={selectedIndex}
                      onSelectMonth={handleMonthSelect}
                      onSegmentHover={(i, e) => showTip(e, `${MONTHS[i].label} 2026`, stackTipRows(i))}
                      onLeave={hideTip}
                    />
                    <p className="charts-scale-note">
                      Each bar is split by child contribution (colors match the breakdown below).
                      Tip: click a bar to update the breakdown.
                    </p>
                  </>
                ) : (
                  <>
                    {/* Leaf row (no children) → a plain single bar chart. */}
                    <BarChart
                      width={chartW}
                      series={trendSeries}
                      normalizePerSeries={normalizePerSeries}
                      scaleSeries={scaleSeries}
                      selectedIndex={selectedIndex}
                      onSelectMonth={handleMonthSelect}
                      onBarHover={(i, e) => showTip(e, `${MONTHS[i].label} 2026`, monthTipRows(i))}
                      onLeave={hideTip}
                    />
                    <p className="charts-scale-note">Tip: click a bar to update the breakdown below.</p>
                  </>
                )}
              </div>
            </section>

            {/* Composition pie below the charts. */}
            {hasSubColLines ? (
              /* Sub-column mode → pie for the clicked line/bar (that series' share of children). */
              !hasChildren ? (
                <p className="charts-note">
                  This is a leaf row — expand a parent row to see a share breakdown of its children.
                </p>
              ) : activeSeriesId && periodKey ? (
                <PieSection
                  title="Share of children"
                  titleIcon={<RowIcon type={children[0]?.type} />}
                  subtitle={activeSeries ? `${activeSeries.name} · ${periodLabel}` : undefined}
                  slices={seriesSlices}
                  total={seriesPieTotal}
                  periodKey={periodKey}
                  onPeriodChange={(k) => setPeriodKey(k)}
                  periodLabel={periodLabel}
                  onDrill={onDrill}
                  onSliceSelectCell={(id) => periodKey && onSelectCell?.(id, periodKey as string)}
                  hoveredSliceId={hoveredSliceId}
                  setHoveredSliceId={setHoveredSliceId}
                  showTip={showTip}
                  hideTip={hideTip}
                  seriesOptions={trendSeries.map((s) => ({ id: s.id, name: s.name }))}
                  selectedSeriesId={activeSeriesId}
                  onSeriesChange={(id) => setActiveSeriesId(id)}
                  loading={pieLoading}
                />
              ) : null
            ) : !hasChildren ? (
              <p className="charts-note">
                This is a leaf row — expand a parent row to see a share breakdown of its children.
              </p>
            ) : periodKey === null ? (
              <p className="charts-note">
                Select a month bar in the trend above to see the share of its children.
              </p>
            ) : (
              <PieSection
                title="Share of children"
                titleIcon={<RowIcon type={children[0]?.type} />}
                slices={slices}
                total={pieTotal}
                periodKey={periodKey}
                onPeriodChange={(k) => setPeriodKey(k)}
                periodLabel={periodLabel}
                onDrill={onDrill}
                onSliceSelectCell={(id) => periodKey && onSelectCell?.(id, periodKey as string)}
                hoveredSliceId={hoveredSliceId}
                setHoveredSliceId={setHoveredSliceId}
                showTip={showTip}
                hideTip={hideTip}
                loading={pieLoading}
              />
            )}

            {/* ---------------------- Advanced analysis ---------------------- */}
            <section className="charts-section charts-analysis">
              <div className="charts-section-head">
                <div className="charts-section-titlerow">
                  <h4 className="charts-section-title">Analysis</h4>
                </div>
              </div>
              <div className="charts-analysis-tabs" role="tablist" aria-label="Analysis type">
                {([
                  { k: 'waterfall', label: 'Waterfall' },
                  { k: 'variance', label: 'Variance' },
                  { k: 'band', label: 'Confidence band', warn: bandConfidence.lowIndices.length > 0 },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    role="tab"
                    aria-selected={analysisTab === opt.k}
                    className={`charts-analysis-tab${analysisTab === opt.k ? ' is-active' : ''}`}
                    onClick={() => setAnalysisTab(opt.k)}
                  >
                    {opt.label}
                    {'warn' in opt && opt.warn && (
                      <svg
                        className="charts-tab-warn"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-label="Low confidence in some months"
                      >
                        <path d="M12 3l9 16H3l9-16z" fill="#fef1ee" stroke="#ba0517" strokeWidth="1.6" strokeLinejoin="round" />
                        <path d="M12 9v4.5" stroke="#ba0517" strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="12" cy="16.6" r="1.05" fill="#ba0517" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {analysisTab === 'waterfall' && (
                <div className="charts-analysis-body">
                  {/* Period-to-period bridge. */}
                  <div className="charts-analysis-controls">
                    <div className="charts-period">
                      <label className="charts-period-label">From</label>
                      <select className="charts-period-select" value={wfFrom} onChange={(e) => setWfFrom(e.target.value as ValueKey)}>
                        {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </div>
                    <div className="charts-period">
                      <label className="charts-period-label">To</label>
                      <select className="charts-period-select" value={wfTo} onChange={(e) => setWfTo(e.target.value as ValueKey)}>
                        {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {waterfall && !('unavailable' in waterfall) ? (
                    <>
                      <WaterfallChart
                        width={chartW}
                        startLabel={waterfall.startLabel}
                        startValue={waterfall.startValue}
                        steps={waterfall.steps}
                        endLabel={waterfall.endLabel}
                        endValue={waterfall.endValue}
                      />
                      <p className="charts-scale-note">
                        Bridge from the start period to the end period, decomposed by each month’s change along the way.
                      </p>
                    </>
                  ) : null}
                </div>
              )}

              {analysisTab === 'variance' && (
                <div className="charts-analysis-body">
                  {varianceBand && 'needsRef' in varianceBand ? (
                    <p className="charts-note">
                      Pick a reference to check variance against. Turn on a <b>Plan / Target / Budget</b> sub-column
                      via <b>Show subcolumns</b>, then choose it here.
                    </p>
                  ) : varianceBand ? (
                    <>
                      {/* Reference (Plan/Target) + allowed tolerance selectors. */}
                      <div className="charts-analysis-controls">
                        <div className="charts-period">
                          <label className="charts-period-label">Reference</label>
                          <select
                            className="charts-period-select"
                            value={varRefSubId ?? ''}
                            onChange={(e) => setVarRefSubId(e.target.value)}
                          >
                            <optgroup label="Plan / Target">
                              {referenceOptions.filter((o) => o.kind === 'sub').map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </optgroup>
                            {referenceOptions.some((o) => o.kind === 'measure') && (
                              <optgroup label="Measures">
                                {referenceOptions.filter((o) => o.kind === 'measure').map((o) => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>
                        <div className="charts-period">
                          <label className="charts-period-label">Allowed ±</label>
                          <select
                            className="charts-period-select"
                            value={varTolerance}
                            onChange={(e) => setVarTolerance(Number(e.target.value))}
                          >
                            {[3, 5, 10, 15, 20].map((t) => (
                              <option key={t} value={t}>{t}%</option>
                            ))}
                          </select>
                        </div>
                        <div className="charts-period">
                          <label className="charts-period-label">Month</label>
                          <select
                            className="charts-period-select"
                            value={varMonth ?? ''}
                            onChange={(e) => setVarMonth(e.target.value)}
                          >
                            {MONTHS.map((m) => (
                              <option key={m.key} value={m.key}>{m.label} 2026</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="charts-chart-area" ref={chartAreaRef}>
                        <VarianceBandChart
                          width={chartW}
                          actual={varianceBand.actual}
                          reference={varianceBand.reference}
                          tolerancePct={varTolerance}
                          selectedIndex={varMonth ? MONTHS.findIndex((m) => m.key === varMonth) : null}
                          onSelectIndex={(i) => setVarMonth(MONTHS[i].key)}
                          onPointHover={(i, e) => {
                            const a = varianceBand.actual[i];
                            const r = varianceBand.reference[i];
                            const dpct = r ? ((a - r) / r) * 100 : 0;
                            showTip(e, `${MONTHS[i].label} 2026`, [
                              { label: 'Actual', val: fmt(a), color: BASE_LINE_COLOR },
                              { label: varianceBand.refName, val: fmt(r), color: '#5867e8' },
                              { label: 'Variance', val: `${dpct >= 0 ? '+' : ''}${dpct.toFixed(1)}%` },
                            ]);
                          }}
                          onPointLeave={hideTip}
                        />
                      </div>

                      {/* Legend + list of breaching months. */}
                      <ul className="charts-varband-legend">
                        <li><span className="charts-varband-key charts-varband-key--actual" /> Actual</li>
                        <li><span className="charts-varband-key charts-varband-key--ref" /> {varianceBand.refName}</li>
                        <li><span className="charts-varband-key charts-varband-key--band" /> ±{varTolerance}% band</li>
                      </ul>
                      <p className="charts-scale-note">
                        The shaded band is {varianceBand.refName} ±{varTolerance}%. Red points mark months where Actual broke out of the allowed band. Click a month to break it down below.
                      </p>

                      {/* Per-child variance for the selected month — diverging bars around the reference. */}
                      <section className="charts-section charts-vdiv-section">
                        <div className="charts-section-head">
                          <h4 className="charts-section-title">
                            Children variance{varChildVariance ? ` · ${varChildVariance.monthLabel} 2026` : ''}
                          </h4>
                        </div>
                        {varChildVariance ? (
                          <>
                            <ul className="charts-vdiv-list">
                              {varChildVariance.items.map((c) => {
                                const pos = c.variance >= 0;
                                const w = (Math.abs(c.variance) / varChildVariance.maxAbs) * 50;
                                return (
                                  <li
                                    key={c.id}
                                    className={`charts-vdiv-row${c.breach ? ' is-breach' : ''}${onDrill ? ' is-clickable' : ''}`}
                                    role={onDrill ? 'button' : undefined}
                                    tabIndex={onDrill ? 0 : undefined}
                                    title={onDrill ? `Open ${c.name} charts` : undefined}
                                    onClick={onDrill ? () => onDrill(c.id) : undefined}
                                    onKeyDown={onDrill ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrill(c.id); } } : undefined}
                                    onMouseMove={(e) =>
                                      showTip(e, `${c.name} · ${varChildVariance.monthLabel} 2026`, [
                                        { label: 'Actual', val: fmt(c.actual), color: BASE_LINE_COLOR },
                                        { label: varianceBand.refName, val: fmt(c.ref), color: '#5867e8' },
                                        { label: 'Variance', val: `${pos ? '+' : '−'}${fmt(Math.abs(c.variance))}${c.pct !== null ? ` (${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(0)}%)` : ''}` },
                                      ])
                                    }
                                    onMouseLeave={hideTip}
                                  >
                                    <span className="charts-vdiv-name" title={c.name}>{c.name}</span>
                                    <span className="charts-vdiv-track">
                                      <span className="charts-vdiv-center" />
                                      <span
                                        className={`charts-vdiv-bar${pos ? ' is-pos' : ' is-neg'}${c.breach ? ' is-breach' : ''}`}
                                        style={pos ? { left: '50%', width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }}
                                      />
                                    </span>
                                    <span className={`charts-vdiv-val${pos ? ' is-pos' : ' is-neg'}`}>
                                      {pos ? '+' : '−'}{fmt(Math.abs(c.variance))}
                                      {c.pct !== null && <span className="charts-vdiv-pct"> ({c.pct >= 0 ? '+' : ''}{c.pct.toFixed(0)}%)</span>}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="charts-scale-note">
                              Each bar is a child's Actual − {varianceBand.refName} for {varChildVariance.monthLabel}. Right/green = above reference, left/red = below.
                            </p>
                          </>
                        ) : (
                          <p className="charts-note">Leaf row — no children to break the variance down by.</p>
                        )}
                      </section>
                    </>
                  ) : null}
                </div>
              )}

              {analysisTab === 'pareto' && (
                <div className="charts-analysis-body">
                  {paretoItems.length > 0 ? (
                    <>
                      <ParetoChart
                        width={chartW}
                        items={paretoItems}
                        onHover={(i, e) =>
                          showTip(e, paretoItems[i].name, [
                            { label: periodShort(paretoPeriod), val: fmt(paretoItems[i].value), color: paretoItems[i].color },
                          ])
                        }
                        onLeave={hideTip}
                      />
                      <p className="charts-scale-note">
                        Children ranked by {periodShort(paretoPeriod)}; the line is the cumulative share. The 80% guide highlights the vital few.
                      </p>
                    </>
                  ) : (
                    <p className="charts-note">No child breakdown available for a Pareto view.</p>
                  )}
                </div>
              )}

              {analysisTab === 'tree' && (
                <div className="charts-analysis-body">
                  {children.length > 0 ? (
                    <DriverTree root={row} period={paretoPeriod} periodLabel={periodShort(paretoPeriod)} onDrill={onDrill} />
                  ) : (
                    <p className="charts-note">This is a leaf row — no child drivers to show as a tree.</p>
                  )}
                </div>
              )}

              {analysisTab === 'tornado' && (
                <div className="charts-analysis-body">
                  {tornadoItems.length > 0 ? (
                    <>
                      <TornadoChart width={chartW} items={tornadoItems} swingPct={TORNADO_SWING} />
                      <p className="charts-scale-note">
                        Sensitivity of {row.name}’s FY26 total to a ±{TORNADO_SWING}% move in each child. Longest bars = biggest levers.
                      </p>
                    </>
                  ) : (
                    <p className="charts-note">No child drivers to run a sensitivity on.</p>
                  )}
                </div>
              )}

              {analysisTab === 'band' && (
                <div className="charts-analysis-body">
                  <div className="charts-chart-area" ref={chartAreaRef}>
                    <ForecastBandChart
                      width={chartW}
                      values={MONTHS.map((m) => val(row, m.key))}
                      onPointHover={(i, low, e) =>
                        showTip(e, `${MONTHS[i].label} 2026`, [
                          { label: 'Value', val: fmt(val(row, MONTHS[i].key)), color: BASE_LINE_COLOR },
                          { label: 'Confidence', val: low ? 'Low' : 'OK', color: low ? '#ba0517' : '#2e844a' },
                        ])
                      }
                      onPointLeave={hideTip}
                    />
                  </div>
                  {bandConfidence.lowIndices.length > 0 ? (
                    <div className="charts-band-lowconf">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 3l9 16H3l9-16z" fill="#fef1ee" stroke="#ba0517" strokeWidth="1.6" strokeLinejoin="round" />
                        <path d="M12 9v4.5" stroke="#ba0517" strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="12" cy="16.6" r="1.05" fill="#ba0517" />
                      </svg>
                      <span>
                        Low confidence in{' '}
                        <b>{bandConfidence.lowIndices.map((i) => MONTHS[i].label).join(', ')}</b>
                        {' '}— little history / high volatility (red dots).
                      </span>
                    </div>
                  ) : (
                    <p className="charts-scale-note">All months are within a confident range.</p>
                  )}
                  <p className="charts-scale-note">
                    Monthly trend with a ± uncertainty cone derived from recent volatility — the band widens with the forecast horizon. Red dots flag low-confidence months.
                  </p>
                </div>
              )}

              {analysisTab === 'bullet' && bulletData && (
                <div className="charts-analysis-body">
                  <BulletChart width={chartW} actual={bulletData.actual} target={bulletData.target} label="FY26 actual vs target" />
                  <p className="charts-scale-note">Target source: {bulletData.source}. The dark marker is the target; shaded bands are performance zones.</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default ChartsPanel;
