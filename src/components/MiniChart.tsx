import React from 'react';
import type { GridRow } from '../types';
import type { ChartType } from './ConfigureChartsModal';

const MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
] as const;
const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const PALETTE = [
  '#0176d3', '#1b96ff', '#9050e9', '#ff9e2c', '#04844b',
  '#e5701a', '#b83c8c', '#3ba755', '#5867e8', '#c23934',
];
const BAR_COLOR = '#0176d3';

const num = (row: GridRow, key: string): number =>
  Number((row.values as unknown as Record<string, unknown>)[key] ?? 0);

/** Compact currency-ish formatting for the mini-chart total. */
const fmtShort = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
};

/**
 * Small live chart used in the on-grid "chart area" cards. Renders a bar or line trend of the
 * row's monthly values, or a donut of the row's children's yearly shares — from real data.
 */
export const MiniChart: React.FC<{ type: ChartType; row: GridRow | null }> = ({ type, row }) => {
  if (!row) {
    return <div className="mini-chart mini-chart--empty">No data</div>;
  }

  if (type === 'donut') {
    const children = row.children ?? [];
    const slices = children
      .map((c, i) => ({ id: c.id, name: c.name, value: Math.max(num(c, 'year'), 0), color: PALETTE[i % PALETTE.length] }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = slices.reduce((s, d) => s + d.value, 0);
    if (total <= 0) {
      return <div className="mini-chart mini-chart--empty">No breakdown</div>;
    }
    const cx = 34;
    const cy = 34;
    const r = 24;
    const sw = 11;
    const C = 2 * Math.PI * r;
    let acc = 0;
    return (
      <div className="mini-chart mini-chart--donut">
        <svg viewBox="0 0 68 68" width="68" height="68" role="img" aria-label="Share of children">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f6" strokeWidth={sw} />
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {slices.map((s) => {
              const frac = s.value / total;
              const len = frac * C;
              const offset = acc * C;
              acc += frac;
              return (
                <circle
                  key={s.id}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={sw}
                  strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                  strokeDashoffset={-offset}
                />
              );
            })}
          </g>
        </svg>
        <ul className="mini-chart-legend">
          {slices.slice(0, 4).map((s) => {
            const pct = (s.value / total) * 100;
            return (
              <li key={s.id} className="mini-chart-legend-item">
                <span className="mini-chart-legend-dot" style={{ backgroundColor: s.color }} />
                <span className="mini-chart-legend-name" title={s.name}>{s.name}</span>
                <span className="mini-chart-legend-pct">{pct.toFixed(0)}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Bar / line trend of the row's monthly values.
  const values = MONTH_KEYS.map((k) => Math.max(num(row, k), 0));
  const min = Math.min(...values);
  const max = Math.max(1, ...values);
  const range = max - min;
  const floor = range > 0 ? Math.max(0, min - range * 0.25) : Math.max(0, min - 1);
  const denom = max + range * 0.08 - floor || 1;
  const W = 320;
  const H = 64;
  const padL = 4;
  const padR = 4;
  const padT = 6;
  const padB = 12;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = values.length;
  const slot = innerW / n;
  const baseY = padT + innerH;
  const yFor = (v: number) => baseY - ((v - floor) / denom) * innerH;

  return (
    <div className="mini-chart mini-chart--trend">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label="Monthly trend">
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#e5e5e5" strokeWidth="1" />
        {type === 'line' ? (
          <>
            <polyline
              points={values.map((v, i) => `${(padL + slot * i + slot / 2).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={BAR_COLOR}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {values.map((v, i) => (
              <circle key={i} cx={padL + slot * i + slot / 2} cy={yFor(v)} r="1.8" fill="#fff" stroke={BAR_COLOR} strokeWidth="1.2" />
            ))}
          </>
        ) : (
          values.map((v, i) => {
            const bw = Math.min(slot * 0.62, 20);
            const cx = padL + slot * i + slot / 2;
            const h = Math.max(baseY - yFor(v), 0.5);
            return <rect key={i} x={cx - bw / 2} y={baseY - h} width={bw} height={h} fill={BAR_COLOR} rx="1" />;
          })
        )}
        {MONTH_LABELS.map((lbl, i) => (
          <text key={i} x={padL + slot * i + slot / 2} y={H - 3} fontSize="6" textAnchor="middle" fill="#8a8a8a">
            {lbl}
          </text>
        ))}
      </svg>
      <span className="mini-chart-total">FY26 · {fmtShort(num(row, 'year'))}</span>
    </div>
  );
};

export default MiniChart;
