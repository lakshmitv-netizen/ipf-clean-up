import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ChartStyles from '../lib/chartStyles';
import '../styles/components/chart-theme.css';
import '../styles/components/ScenarioDrawer.css';

/**
 * ScenarioDrawer
 * ---------------
 * A bottom overlay "sheet" for scenario planning. It floats ON TOP of the grid
 * (never reflows it) and reveals capability progressively across four snap states:
 *
 *   collapsed → peek → half → full
 *
 * Anchored-skeleton rule: the header rail (grab handle + active scenario + quick
 * levers) stays fixed in the same spot in every state. Growing the drawer only
 * *appends bands below* — nothing already on screen moves.
 *
 *   collapsed : header rail only  (grid fully visible)
 *   peek      : + scenario strip (cards + drivers)
 *   half      : + KPI comparison matrix
 *   full      : + global assumptions + trade-off charts + promote/open-in-grid
 */

export type SnapState = 'collapsed' | 'peek' | 'half' | 'full';

const SNAP_ORDER: SnapState[] = ['collapsed', 'peek', 'half', 'full'];

/** Pixel heights for each snap detent (full is computed from the viewport). */
const SNAP_PX: Record<Exclude<SnapState, 'full'>, number> = {
  collapsed: 94, // resizer (24) + rail incl. its 18px bottom padding (~68) so the footer isn't clipped
  peek: 440,
  half: 620,
};
/** Hard ceiling for the fully-expanded drawer; the actual "full" height is
 *  capped to the natural content height so there's no empty space below. */
const fullHeight = () => Math.max(520, Math.round(window.innerHeight * 0.92));

/** Given a live dragged height, return the nearest snap state. */
const nearestSnap = (px: number, full: number): SnapState => {
  const candidates: [SnapState, number][] = [
    ['collapsed', SNAP_PX.collapsed],
    ['peek', SNAP_PX.peek],
    ['half', SNAP_PX.half],
    ['full', full],
  ];
  let best: SnapState = 'collapsed';
  let bestDist = Infinity;
  for (const [s, h] of candidates) {
    const d = Math.abs(h - px);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
};

const atLeast = (state: SnapState, min: SnapState): boolean =>
  SNAP_ORDER.indexOf(state) >= SNAP_ORDER.indexOf(min);

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

interface Drivers {
  growth: number; // %
  price: number; // %
  volume: number; // %
}

interface Scenario {
  id: string;
  name: string;
  archetype: string;
  color: string;
  isBaseline?: boolean;
  drivers: Drivers;
  /** Named strategy presets (echo the reference's "Scenario Drivers" dropdowns). */
  strategy: { concession: string; margin: string; rebate: string };
}

const CONCESSION_OPTIONS = ['Hold (0%)', 'Match Competitor (6%)', 'Aggressive (12%)'];
const MARGIN_OPTIONS = ['Protect (24%)', 'Plan Target (22%)', 'Stretch (19%)'];
const REBATE_OPTIONS = ['Tier 1: 5%', 'Tier 2: 10%', 'Tier 3: 15%'];

const INITIAL_SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    name: 'Baseline',
    archetype: 'Current Trend',
    color: '#5C5C5C',
    isBaseline: true,
    drivers: { growth: 0, price: 0, volume: 0 },
    strategy: { concession: CONCESSION_OPTIONS[0], margin: MARGIN_OPTIONS[1], rebate: REBATE_OPTIONS[0] },
  },
  {
    id: 'defender',
    name: 'Market Defender',
    archetype: 'Conservative · Protective',
    color: '#066AFE',
    drivers: { growth: 2, price: 4, volume: 1 },
    strategy: { concession: CONCESSION_OPTIONS[1], margin: MARGIN_OPTIONS[0], rebate: REBATE_OPTIONS[0] },
  },
  {
    id: 'maximizer',
    name: 'Efficiency Maximizer',
    archetype: 'Profit-Led',
    color: '#0B827C',
    drivers: { growth: 3, price: 8, volume: 2 },
    strategy: { concession: CONCESSION_OPTIONS[0], margin: MARGIN_OPTIONS[2], rebate: REBATE_OPTIONS[1] },
  },
  {
    id: 'disruptor',
    name: 'Growth Disruptor',
    archetype: 'Aggressive · Signal-Led',
    color: '#8C4B02',
    drivers: { growth: 12, price: -2, volume: 9 },
    strategy: { concession: CONCESSION_OPTIONS[2], margin: MARGIN_OPTIONS[1], rebate: REBATE_OPTIONS[2] },
  },
];

// Extra SLDS 2 hues for user-added scenarios (beyond the 4 kit palette colors).
const NEW_SCENARIO_COLORS = ['#9050E9', '#B60554', '#E5701A', '#5867E8'];

// ---------------------------------------------------------------------------
// KPI computation (reactive to drivers)
// ---------------------------------------------------------------------------

interface Assumptions {
  timeFrameMonths: number;
  budget: number;
  targetRevenue: number;
}

const BASE = {
  saQty: 85000,
  saRevenue: 255000,
  oppQty: 110500,
  oppRevenue: 331500,
  orderQty: 72250,
  orderRevenue: 210000,
  netMargin: 18.5,
  concessionCost: 5000,
  costPerUnit: 1.5,
};

interface Kpis {
  saQty: number;
  saQtyLift: number;
  saRevenue: number;
  oppQty: number;
  oppRevenue: number;
  orderQty: number;
  orderRevenue: number;
  concessionCost: number;
  costPerUnit: number;
  netMargin: number;
  pctOfTarget: number;
  cannibalization: number;
}

function computeKpis(d: Drivers, a: Assumptions): Kpis {
  const revMult = (1 + d.growth / 100) * (1 + d.price / 100);
  const qtyMult = (1 + d.growth / 100) * (1 + d.volume / 100);
  const saRevenue = BASE.saRevenue * revMult;
  return {
    saQty: BASE.saQty * qtyMult,
    saQtyLift: (qtyMult - 1) * 100,
    saRevenue,
    oppQty: BASE.oppQty * qtyMult,
    oppRevenue: BASE.oppRevenue * revMult,
    orderQty: BASE.orderQty * qtyMult,
    orderRevenue: BASE.orderRevenue * revMult,
    concessionCost: BASE.concessionCost * qtyMult * (1 + Math.max(0, -d.price) / 100),
    costPerUnit: BASE.costPerUnit * (1 - d.volume / 400),
    netMargin: BASE.netMargin + d.price * 0.6 - d.growth * 0.06,
    pctOfTarget: (saRevenue / (a.targetRevenue / 60)) * 100, // target scaled to a comparable monthly figure
    cannibalization: -(Math.max(0, d.growth) * 320),
  };
}

// Slider ranges — also used as solver bounds so goal-seek stays within the model.
const DRIVER_BOUNDS: Record<keyof Drivers, { min: number; max: number }> = {
  growth: { min: -10, max: 25 },
  price: { min: -15, max: 20 },
  volume: { min: -10, max: 25 },
};

/**
 * Which driver a KPI is back-solved against for goal-seek. Editing a KPI target
 * inverts computeKpis to find this driver's value (the model's "changing cell").
 * Only cleanly monotonic KPIs are solvable/editable.
 */
const KPI_SOLVE: Partial<Record<keyof Kpis, keyof Drivers>> = {
  saQty: 'volume',
  oppQty: 'volume',
  orderQty: 'volume',
  saQtyLift: 'volume',
  costPerUnit: 'volume',
  saRevenue: 'price',
  oppRevenue: 'price',
  orderRevenue: 'price',
  netMargin: 'price',
  pctOfTarget: 'price',
  cannibalization: 'growth',
};

/**
 * Goal-seek: find the driver value (within bounds) that makes `kpiKey` hit
 * `target`, holding the scenario's other drivers fixed. Bisection over the
 * (monotonic) forward function; clamps to the nearest bound if unreachable.
 */
function solveDriverForKpi(
  kpiKey: keyof Kpis,
  target: number,
  driver: keyof Drivers,
  drivers: Drivers,
  a: Assumptions,
): number {
  const { min, max } = DRIVER_BOUNDS[driver];
  const f = (x: number) => computeKpis({ ...drivers, [driver]: x }, a)[kpiKey];
  let lo = min;
  let hi = max;
  const fLo = f(lo);
  const fHi = f(hi);
  const increasing = fHi >= fLo;
  const tLo = increasing ? fLo : fHi;
  const tHi = increasing ? fHi : fLo;
  if (target <= tLo) return increasing ? lo : hi;
  if (target >= tHi) return increasing ? hi : lo;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) < target) === increasing) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const fmtInt = (v: number) => Math.round(v).toLocaleString();
const fmtUnits = (v: number) => `${fmtInt(v)} units`;
const fmtMoney = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
};
const fmtPct = (v: number) => `${v >= 0 ? '' : ''}${v.toFixed(1)}%`;
const fmtPctPt = (v: number) => `${v.toFixed(1)}%`;

type KpiRow = {
  key: keyof Kpis;
  label: string;
  format: (v: number) => string;
  /** Whether a higher value is "good" (green up). null = neutral. */
  goodWhenUp: boolean | null;
  deltaMode: 'pct' | 'abs';
};

const KPI_ROWS: KpiRow[] = [
  { key: 'saQty', label: 'Sales Agreement Quantity', format: fmtUnits, goodWhenUp: true, deltaMode: 'pct' },
  { key: 'saQtyLift', label: 'SA Qty Lift vs Baseline', format: fmtPct, goodWhenUp: true, deltaMode: 'abs' },
  { key: 'saRevenue', label: 'Sales Agreement Revenue', format: fmtMoney, goodWhenUp: true, deltaMode: 'pct' },
  { key: 'oppQty', label: 'Opportunity Quantity', format: fmtUnits, goodWhenUp: true, deltaMode: 'pct' },
  { key: 'oppRevenue', label: 'Opportunity Revenue', format: fmtMoney, goodWhenUp: true, deltaMode: 'pct' },
  { key: 'orderQty', label: 'Order Quantity', format: fmtUnits, goodWhenUp: true, deltaMode: 'pct' },
  { key: 'orderRevenue', label: 'Order Revenue', format: fmtMoney, goodWhenUp: true, deltaMode: 'pct' },
  { key: 'concessionCost', label: 'Price Concession (Cost)', format: fmtMoney, goodWhenUp: false, deltaMode: 'pct' },
  { key: 'costPerUnit', label: 'Cost per Incremental Unit', format: (v) => `$${v.toFixed(2)}/unit`, goodWhenUp: false, deltaMode: 'pct' },
  { key: 'netMargin', label: 'Net Profit Margin', format: fmtPctPt, goodWhenUp: true, deltaMode: 'abs' },
  { key: 'pctOfTarget', label: '% of Sales Agreement Target', format: fmtPctPt, goodWhenUp: true, deltaMode: 'abs' },
  { key: 'cannibalization', label: 'Cannibalization (Adjacent Line)', format: fmtMoney, goodWhenUp: false, deltaMode: 'abs' },
];

/** Business-semantic driver dropdowns, surfaced as rows in the comparison table
 *  (one row per driver, one dropdown per scenario column). */
const STRATEGY_ROWS: { key: keyof Scenario['strategy']; label: string; options: string[] }[] = [
  { key: 'concession', label: 'Price Concession', options: CONCESSION_OPTIONS },
  { key: 'margin', label: 'Target Margin', options: MARGIN_OPTIONS },
  { key: 'rebate', label: 'Rebate Tier', options: REBATE_OPTIONS },
];

// ---------------------------------------------------------------------------
// Small SVG bits
// ---------------------------------------------------------------------------

const Chevron: React.FC<{ dir: 'up' | 'down'; size?: number }> = ({ dir, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    style={{ transform: dir === 'down' ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s ease' }}>
    <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

/** Minimal shape of a Chart.js v2 instance we interact with. */
interface KitChart {
  destroy(): void;
  resize(): void;
  update(): void;
  data: { datasets: Array<Record<string, unknown>> };
  getElementAtEvent(e: MouseEvent): Array<{ _datasetIndex: number }>;
}

/** Revenue comparison — one line per scenario over the (mock) ramp, rendered
 *  with the shared ChartStyles kit (SLDS palette, gridlines, dark-navy popover).
 *  Clicking a point focuses that scenario, connecting to the KPI table. */
const RevenueCompareChart: React.FC<{
  scenarios: Scenario[];
  assumptions: Assumptions;
  activeId: string;
  onSelect: (id: string) => void;
}> = ({ scenarios, activeId, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KitChart | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const n = MONTHS.length;
  const series = useMemo(() => {
    const baseRamp = [0.9, 0.95, 1.0, 1.05, 1.12, 1.18, 1.24, 1.3];
    return scenarios.map((s) => {
      const revMult = (1 + s.drivers.growth / 100) * (1 + s.drivers.price / 100);
      const vals = baseRamp.map((r, i) => BASE.saRevenue * r * (1 + ((revMult - 1) * (i + 1)) / n));
      return { id: s.id, name: s.name, color: s.color, isBaseline: !!s.isBaseline, vals };
    });
  }, [scenarios, n]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ChartStyles) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ChartStyles.applyGlobalDefaults();
    const chart = ChartStyles.lineChart(ctx, {
      labels: MONTHS,
      series: series.map((s) => ({ label: s.name, data: s.vals, color: s.color, dashed: s.isBaseline })),
      yFormat: (v: number) => `$${Math.round(v / 1000)}K`,
      valueFormat: (v: number) => fmtMoney(v),
    }) as KitChart;
    // Emphasize the focused scenario (thicker line + larger points).
    chart.data.datasets.forEach((d, i) => {
      const s = series[i];
      if (!s) return;
      const active = s.id === activeId;
      d.borderWidth = s.isBaseline ? 1.5 : active ? 3.25 : 2;
      d.pointRadius = s.isBaseline ? 0 : active ? 3.5 : 2;
    });
    chart.update();
    canvas.onclick = (e: MouseEvent) => {
      const hit = chart.getElementAtEvent(e);
      if (hit && hit.length) {
        const s = series[hit[0]._datasetIndex];
        if (s) onSelectRef.current(s.id);
      }
    };
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [series, activeId]);

  // Keep the responsive canvas sized to its (resizable) container.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cs-chart-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
};

/** Qty vs Margin trade-off — bubble per scenario (size ~ concession cost),
 *  rendered with the ChartStyles bubble builder. Clicking a bubble focuses that
 *  scenario, connecting to the KPI table. */
const TradeoffChart: React.FC<{
  scenarios: Scenario[];
  kpisById: Record<string, Kpis>;
  activeId: string;
  onSelect: (id: string) => void;
}> = ({ scenarios, kpisById, activeId, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KitChart | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const pts = useMemo(
    () => scenarios.map((s) => ({ id: s.id, name: s.name, color: s.color, k: kpisById[s.id] })),
    [scenarios, kpisById],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ChartStyles) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ChartStyles.applyGlobalDefaults();
    const maxCost = Math.max(...pts.map((p) => p.k.concessionCost), 1);
    const chart = ChartStyles.bubbleChart(ctx, {
      bubbles: pts.map((p) => ({
        label: p.name,
        x: p.k.saQty,
        y: p.k.netMargin,
        r: 8 + (p.k.concessionCost / maxCost) * 16,
        color: p.color,
      })),
      xLabel: 'Sales Agreement Quantity',
      yLabel: 'Net Margin',
      xFormat: (v: number) => ChartStyles.format.integer(v),
      yFormat: (v: number) => `${v.toFixed(0)}%`,
      tooltip: (i: { datasetIndex: number }) => {
        const p = pts[i.datasetIndex];
        return p
          ? `${p.name}: ${ChartStyles.format.integer(p.k.saQty)} units · ${p.k.netMargin.toFixed(1)}% margin`
          : '';
      },
    }) as KitChart;
    // Emphasize the focused scenario (thicker ring).
    chart.data.datasets.forEach((d, i) => {
      const p = pts[i];
      d.borderWidth = p && p.id === activeId ? 3 : 1.5;
    });
    chart.update();
    canvas.onclick = (e: MouseEvent) => {
      const hit = chart.getElementAtEvent(e);
      if (hit && hit.length) {
        const p = pts[hit[0]._datasetIndex];
        if (p) onSelectRef.current(p.id);
      }
    };
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [pts, activeId]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cs-chart-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
};

/** Target attainment — one bar per scenario showing % of target revenue, with a
 *  dashed 100% reference line. Answers "which scenario clears the goal?".
 *  Clicking a bar focuses that scenario, connecting to the KPI table. */
const TargetAttainmentChart: React.FC<{
  scenarios: Scenario[];
  kpisById: Record<string, Kpis>;
  activeId: string;
  onSelect: (id: string) => void;
}> = ({ scenarios, kpisById, activeId, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KitChart | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const bars = useMemo(
    () => scenarios.map((s) => ({ id: s.id, name: s.name, color: s.color, pct: kpisById[s.id]?.pctOfTarget ?? 0 })),
    [scenarios, kpisById],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ChartStyles) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ChartStyles.applyGlobalDefaults();
    const chart = ChartStyles.barChart(ctx, {
      labels: bars.map((b) => b.name),
      data: bars.map((b) => b.pct),
      colors: bars.map((b) => b.color),
      referenceValue: 100,
      beginAtZero: true,
      yFormat: (v: number) => `${Math.round(v)}%`,
      valueFormat: (v: number) => `${v.toFixed(1)}%`,
      tooltip: (i: { index: number }) => {
        const b = bars[i.index];
        return b ? `${b.name}: ${b.pct.toFixed(1)}% of target` : '';
      },
    }) as KitChart;
    // Emphasize the focused scenario (full opacity + thicker border).
    const ds = chart.data.datasets[0] as {
      backgroundColor: string[];
      borderWidth: number | number[];
    };
    if (ds) {
      ds.backgroundColor = bars.map((b) =>
        ChartStyles.hexToRgba(b.color, b.id === activeId ? 0.95 : 0.5),
      );
      ds.borderWidth = bars.map((b) => (b.id === activeId ? 2 : 1));
    }
    chart.update();
    canvas.onclick = (e: MouseEvent) => {
      const hit = chart.getElementAtEvent(e) as Array<{ _index?: number }>;
      if (hit && hit.length && typeof hit[0]._index === 'number') {
        const b = bars[hit[0]._index];
        if (b) onSelectRef.current(b.id);
      }
    };
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [bars, activeId]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cs-chart-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Multipliers a scenario applies to the grid, split by measure kind. */
export interface ScenarioMultipliers {
  rev: number;
  qty: number;
  growth: number;
}

const scenarioMultipliers = (d: Drivers): ScenarioMultipliers => ({
  rev: (1 + d.growth / 100) * (1 + d.price / 100),
  qty: (1 + d.growth / 100) * (1 + d.volume / 100),
  growth: 1 + d.growth / 100,
});

interface ScenarioDrawerProps {
  /**
   * Apply the active scenario's driver adjustments to the grid as edits — surfacing the
   * modified/impacted cells, their deltas, the impacted-measures bottom bar, and Save.
   */
  onApplyToGrid?: (mult: ScenarioMultipliers) => void;
  /** Called when a scenario is promoted to the plan (mock hook). */
  onPromote?: (scenarioName: string) => void;
  /**
   * Scenarios injected from outside (e.g. the Agentforce panel's "model the levers" flow). When this
   * array reference changes, any scenario whose id isn't already present is appended (with a palette
   * color), the first is made active, and the drawer expands to at least the KPI-comparison state.
   */
  incomingScenarios?: Omit<Scenario, 'color'>[];
  /**
   * When the Agentforce panel is open it occupies the right 400px of the viewport. The drawer
   * should stop at the grid's right edge rather than sliding under the panel, so we inset its
   * right edge by the panel width while it's open.
   */
  agentPanelOpen?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AGENT_PANEL_WIDTH = 400; // matches .agentforce-panel width in AgentforcePanel.css

const ScenarioDrawer: React.FC<ScenarioDrawerProps> = ({ onApplyToGrid, onPromote, incomingScenarios, agentPanelOpen }) => {
  // Persistent bottom strip: always mounted, starts collapsed. Users pull it up.
  const [snap, setSnap] = useState<SnapState>('collapsed');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const draggingRef = useRef(false);

  // Full-expand height is fitted to the actual content so there's no dead
  // whitespace under the footer. We measure the rendered body and cap at 92vh.
  const railRef = useRef<HTMLDivElement>(null);
  const bodyInnerRef = useRef<HTMLDivElement>(null);
  const [fullPx, setFullPx] = useState<number>(() => fullHeight());
  const fullPxRef = useRef<number>(fullPx);
  fullPxRef.current = fullPx;

  const [scenarios, setScenarios] = useState<Scenario[]>(INITIAL_SCENARIOS);
  const [activeId, setActiveId] = useState<string>('disruptor');
  // Which scenarios are shown in the comparison panel (cards, KPI table, charts).
  // Everything is visible by default; the "Show scenarios" dropdown toggles membership.
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(INITIAL_SCENARIOS.map((s) => s.id)));
  const [showPickerOpen, setShowPickerOpen] = useState(false);
  const showPickerRef = useRef<HTMLDivElement>(null);
  /** Signature (scenario + drivers) that was last pushed to the grid, so we can show "applied". */
  const [appliedSig, setAppliedSig] = useState<string | null>(null);
  const [assumptions] = useState<Assumptions>({
    timeFrameMonths: 6,
    budget: 250000,
    targetRevenue: 15_000_000,
  });

  const activeScenario = scenarios.find((s) => s.id === activeId) ?? scenarios[0];

  // "Show in grid" is an explicit action (not a live mirror): after tweaking the levers the
  // user pushes the scenario onto the grid, which surfaces it as edited/impacted cells + deltas.
  const { growth: aGrowth, price: aPrice, volume: aVolume } = activeScenario.drivers;
  const driverSig = `${activeId}:${aGrowth},${aPrice},${aVolume}`;
  const isApplied = appliedSig === driverSig;
  const applyToGrid = useCallback(() => {
    onApplyToGrid?.(scenarioMultipliers({ growth: aGrowth, price: aPrice, volume: aVolume }));
    setAppliedSig(driverSig);
  }, [onApplyToGrid, aGrowth, aPrice, aVolume, driverSig]);

  const baselineKpis = useMemo(
    () => computeKpis(scenarios.find((s) => s.isBaseline)?.drivers ?? { growth: 0, price: 0, volume: 0 }, assumptions),
    [scenarios, assumptions],
  );
  const kpisById = useMemo(() => {
    const map: Record<string, Kpis> = {};
    for (const s of scenarios) map[s.id] = computeKpis(s.drivers, assumptions);
    return map;
  }, [scenarios, assumptions]);

  // ---- driver editing (quick levers act on the active scenario) ----
  const setDriver = useCallback(
    (key: keyof Drivers, value: number) => {
      setScenarios((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, drivers: { ...s.drivers, [key]: value } } : s)),
      );
    },
    [activeId],
  );

  // ---- goal-seek: editing a KPI target back-solves its driver ----
  const [editingCell, setEditingCell] = useState<{ id: string; key: keyof Kpis } | null>(null);
  const commitKpiEdit = useCallback(
    (scenarioId: string, key: keyof Kpis, raw: string) => {
      const target = parseFloat(raw.replace(/[^0-9.-]/g, ''));
      const driver = KPI_SOLVE[key];
      setEditingCell(null);
      if (!driver || !Number.isFinite(target)) return;
      setScenarios((prev) =>
        prev.map((s) => {
          if (s.id !== scenarioId || s.isBaseline) return s;
          const solved = solveDriverForKpi(key, target, driver, s.drivers, assumptions);
          return { ...s, drivers: { ...s.drivers, [driver]: solved } };
        }),
      );
    },
    [assumptions],
  );

  const setStrategy = useCallback(
    (id: string, key: keyof Scenario['strategy'], value: string) => {
      setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, strategy: { ...s.strategy, [key]: value } } : s)));
    },
    [],
  );

  const addScenario = useCallback(() => {
    setScenarios((prev) => {
      const idx = prev.filter((s) => !s.isBaseline).length;
      const id = `custom-${Date.now()}`;
      const color = NEW_SCENARIO_COLORS[idx % NEW_SCENARIO_COLORS.length];
      const next: Scenario = {
        id,
        name: `New Scenario ${idx}`,
        archetype: 'Custom',
        color,
        drivers: { growth: 5, price: 3, volume: 4 },
        strategy: { concession: CONCESSION_OPTIONS[1], margin: MARGIN_OPTIONS[1], rebate: REBATE_OPTIONS[1] },
      };
      return [...prev, next];
    });
  }, []);

  const removeScenario = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    setActiveId((cur) => (cur === id ? 'baseline' : cur));
  }, []);

  // Only the checked scenarios render in the comparison panel; baseline/KPIs still
  // compute off the full set so deltas stay correct even when a column is hidden.
  const visibleScenarios = useMemo(
    () => scenarios.filter((s) => visibleIds.has(s.id)),
    [scenarios, visibleIds],
  );

  const toggleVisible = useCallback((id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev; // keep at least one scenario shown
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Ids we've already reconciled once — lets us tell a *genuinely new* scenario (auto-show)
  // apart from one the user has intentionally hidden (leave hidden).
  const seenIdsRef = useRef<Set<string>>(new Set(INITIAL_SCENARIOS.map((s) => s.id)));

  // Newly-added scenarios (custom) start visible; ids that no longer exist are pruned so the
  // checklist and count stay in sync. Scenarios the user hid stay hidden across re-renders.
  useEffect(() => {
    const ids = new Set(scenarios.map((s) => s.id));
    const freshIds = scenarios.filter((s) => !seenIdsRef.current.has(s.id)).map((s) => s.id);
    setVisibleIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      let changed = next.size !== prev.size;
      for (const id of freshIds) { if (!next.has(id)) { next.add(id); changed = true; } }
      return changed ? next : prev;
    });
    for (const id of Array.from(seenIdsRef.current)) if (!ids.has(id)) seenIdsRef.current.delete(id);
    for (const s of scenarios) seenIdsRef.current.add(s.id);
  }, [scenarios]);

  // If the focused scenario gets hidden, move focus to the first visible one.
  useEffect(() => {
    if (visibleIds.has(activeId)) return;
    const first = scenarios.find((s) => visibleIds.has(s.id));
    if (first) setActiveId(first.id);
  }, [visibleIds, activeId, scenarios]);

  // Close the "Show scenarios" dropdown on outside click / Escape.
  useEffect(() => {
    if (!showPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (showPickerRef.current && !showPickerRef.current.contains(e.target as Node)) setShowPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showPickerOpen]);

  // ---- ingest scenarios injected from outside (Agentforce "model the levers") ----
  const consumedIncomingRef = useRef<Omit<Scenario, 'color'>[] | null>(null);
  useEffect(() => {
    if (!incomingScenarios || incomingScenarios.length === 0) return;
    // Only act when the parent hands us a *new* batch (state array reference change).
    if (consumedIncomingRef.current === incomingScenarios) return;
    consumedIncomingRef.current = incomingScenarios;
    setScenarios((prev) => {
      const existing = new Set(prev.map((s) => s.id));
      const customCount = prev.filter((s) => !s.isBaseline).length;
      const additions = incomingScenarios
        .filter((s) => !existing.has(s.id))
        .map((s, i) => ({ ...s, color: NEW_SCENARIO_COLORS[(customCount + i) % NEW_SCENARIO_COLORS.length] }));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
    // Arriving from the agent: show only baseline + the injected scenarios. The kit scenarios
    // stay in the catalog and can be re-enabled from the "Show scenarios" dropdown.
    const baselineIds = scenarios.filter((s) => s.isBaseline).map((s) => s.id);
    setVisibleIds(new Set([...baselineIds, ...incomingScenarios.map((s) => s.id)]));
    setActiveId(incomingScenarios[0].id);
    setSnap((s) => (atLeast(s, 'half') ? s : 'half'));
  }, [incomingScenarios]);

  // ---- drag to resize ----
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const h = window.innerHeight - ev.clientY;
      setDragHeight(Math.max(SNAP_PX.collapsed, Math.min(fullPxRef.current, h)));
    };
    const up = () => {
      draggingRef.current = false;
      setDragHeight((h) => {
        if (h != null) setSnap(nearestSnap(h, fullPxRef.current));
        return null;
      });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  const cycleUp = useCallback(() => {
    setSnap((s) => SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, SNAP_ORDER.indexOf(s) + 1)]);
  }, []);
  // Down arrow collapses the drawer fully in one press — back to the band only.
  const cycleDown = useCallback(() => {
    setSnap('collapsed');
  }, []);

  const height = dragHeight ?? (snap === 'full' ? fullPx : SNAP_PX[snap]);
  // The full comparison workspace (assumptions + KPI table + charts) is the primary
  // expanded content — it appears as soon as the drawer is pulled above collapsed.
  const showWorkspace = atLeast(snap, 'peek') || (dragHeight != null && dragHeight > SNAP_PX.collapsed + 30);
  const showFull = atLeast(snap, 'full') || (dragHeight != null && dragHeight > SNAP_PX.half + 80);

  const activeKpis = kpisById[activeId] ?? baselineKpis;

  // Fit the full-expand height to the rendered content (rail + body) so the
  // drawer never leaves empty space beneath the footer. Capped at 92vh.
  useLayoutEffect(() => {
    const measure = () => {
      const rail = railRef.current;
      const inner = bodyInnerRef.current;
      if (!rail || !inner) return;
      const RESIZER_H = 12; // top resize grip
      const BODY_PAD_Y = 12; // .scenario-body bottom padding
      const natural = RESIZER_H + rail.offsetHeight + inner.offsetHeight + BODY_PAD_Y;
      const next = Math.min(fullHeight(), Math.round(natural));
      setFullPx((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (bodyInnerRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(bodyInnerRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [snap, showWorkspace, showFull, scenarios.length, visibleScenarios.length]);

  // Keep the KPI table's active column in view when the selection changes
  // (e.g. the user clicked a line/bubble on the right-hand charts).
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroll = matrixScrollRef.current;
    if (!scroll) return;
    const col = scroll.querySelector<HTMLElement>('th[data-active="true"]');
    if (col) col.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeId, showWorkspace]);

  return (
    <div
      className={`scenario-drawer scenario-drawer--${snap}`}
      style={{
        height,
        right: agentPanelOpen ? AGENT_PANEL_WIDTH : 0,
        transition: dragHeight != null
          ? 'right 0.24s cubic-bezier(0.4,0,0.2,1)'
          : 'height 0.24s cubic-bezier(0.4,0,0.2,1), right 0.24s cubic-bezier(0.4,0,0.2,1)',
      }}
      role="dialog"
      aria-label="Scenario planning"
    >
      {/* Resize handle on the top edge — full-width invisible drag strip */}
      <div className="scenario-drawer-resizer" onPointerDown={onResizeStart} role="separator" aria-label="Resize scenario drawer" />
      {/*
        Centered expand/collapse arrows straddling the drawer's top edge.
        Rendered position:fixed (anchored to the live top edge via `bottom`) so the
        drawer's overflow:hidden can't clip it and the grid can't paint over it.
      */}
      <div
        className="scenario-edge-arrows"
        style={{ bottom: (typeof height === 'number' ? height : 0) - 11 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
          <button type="button" className="scenario-icon-btn scenario-icon-btn--edge" onClick={cycleUp} title="Expand" disabled={snap === 'full'}>
            <Chevron dir="up" />
          </button>
          <button type="button" className="scenario-icon-btn scenario-icon-btn--edge" onClick={cycleDown} title="Collapse" disabled={snap === 'collapsed'}>
            <Chevron dir="down" />
          </button>
      </div>

      {/* ---- HEADER RAIL (anchored — identical in every state) ---- */}
      <div className="scenario-rail" ref={railRef}>
        <div className="scenario-rail-left">
          <label className="scenario-rail-title" htmlFor="scenario-active-select">Scenarios</label>
          <div className="scenario-rail-active">
            <span className="scenario-dot" style={{ backgroundColor: activeScenario.color }} aria-hidden="true" />
            <select
              id="scenario-active-select"
              className="scenario-active-select"
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              aria-label="Active scenario"
            >
              {visibleScenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick levers — edit the active scenario, live everywhere */}
        <div className="scenario-rail-levers">
          <QuickLever label="Growth" value={activeScenario.drivers.growth} onChange={(v) => setDriver('growth', v)} disabled={activeScenario.isBaseline} min={-10} max={25} />
          <QuickLever label="Price" value={activeScenario.drivers.price} onChange={(v) => setDriver('price', v)} disabled={activeScenario.isBaseline} min={-15} max={20} />
          <QuickLever label="Volume" value={activeScenario.drivers.volume} onChange={(v) => setDriver('volume', v)} disabled={activeScenario.isBaseline} min={-10} max={25} />
        </div>

        <div className="scenario-rail-right">
          <button
            type="button"
            className={`scenario-showgrid-btn${isApplied ? ' scenario-showgrid-btn--on' : ''}`}
            onClick={applyToGrid}
            disabled={activeScenario.isBaseline || isApplied}
            title={
              isApplied
                ? 'This scenario is applied to the grid as pending edits'
                : 'Apply this scenario to the grid as edited/impacted cells you can review and save'
            }
          >
            {isApplied ? (
              <>
                <span className="scenario-showgrid-dot" aria-hidden="true" />
                Applied to grid
              </>
            ) : appliedSig ? (
              'Update grid'
            ) : (
              'Show in grid'
            )}
          </button>
        </div>
      </div>

      {/* ---- BODY (bands revealed additively) ---- */}
      <div className="scenario-body">
        <div className="scenario-body-inner" ref={bodyInnerRef}>
        {showWorkspace && (
          <>
            {/* Two-column workspace: KPI comparison (left) + charts (right), connected. */}
            <div className="scenario-compare">
              {/* LEFT — KPI comparison table (horizontal scroll); driver dropdowns live as rows */}
              <section className="scenario-compare-left">
                <div className="scenario-band-head">
                  <span className="scenario-band-title">Scenario Comparison</span>
                  <span className="scenario-band-sub">Δ vs Baseline · pick a card to focus</span>
                  <div className="scenario-showpicker" ref={showPickerRef}>
                    <button
                      type="button"
                      className="scenario-add-btn"
                      aria-haspopup="true"
                      aria-expanded={showPickerOpen}
                      onClick={() => setShowPickerOpen((o) => !o)}
                    >
                      Show scenarios ({visibleScenarios.length})
                      <Chevron dir={showPickerOpen ? 'up' : 'down'} />
                    </button>
                    {showPickerOpen && (
                      <div className="scenario-showpicker-menu" role="menu">
                        <div className="scenario-showpicker-head">Show in comparison</div>
                        {scenarios.map((s) => {
                          const checked = visibleIds.has(s.id);
                          const lockLast = checked && visibleScenarios.length <= 1;
                          return (
                            <label key={s.id} className="scenario-showpicker-item">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={lockLast}
                                onChange={() => toggleVisible(s.id)}
                              />
                              <span className="scenario-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
                              <span className="scenario-showpicker-name">{s.name}</span>
                            </label>
                          );
                        })}
                        <button
                          type="button"
                          className="scenario-showpicker-add"
                          onClick={() => { addScenario(); }}
                        >
                          + New scenario
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Selectable scenario cards — one per column, width-matched to the
                    table columns via a leading spacer equal to the KPI label column. */}
                <div className="scenario-cards" role="tablist" aria-label="Select a scenario to focus">
                  <span className="scenario-cards-spacer" aria-hidden="true" />
                  {visibleScenarios.map((s) => {
                    const isActive = s.id === activeId;
                    const rev = kpisById[s.id].saRevenue;
                    const pct = !s.isBaseline && baselineKpis.saRevenue
                      ? ((rev - baselineKpis.saRevenue) / Math.abs(baselineKpis.saRevenue)) * 100
                      : 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`scenario-select-card${isActive ? ' is-active' : ''}`}
                        style={isActive ? { borderColor: s.color, boxShadow: `inset 0 0 0 1px ${s.color}` } : undefined}
                        onClick={() => setActiveId(s.id)}
                        title={`Focus ${s.name}`}
                      >
                        <span className="scenario-select-card-head">
                          <span className="scenario-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
                          <span className="scenario-select-card-name">{s.name}</span>
                          {s.id.startsWith('custom-') && (
                            <span
                              className="scenario-matrix-colremove"
                              role="button"
                              aria-label={`Remove ${s.name}`}
                              title="Remove scenario"
                              onClick={(e) => { e.stopPropagation(); removeScenario(s.id); }}
                            >
                              ×
                            </span>
                          )}
                        </span>
                        <span className="scenario-select-card-sub">{s.isBaseline ? 'Current Trend' : s.archetype}</span>
                        <span className="scenario-select-card-metric">
                          {fmtMoney(rev)}
                          {!s.isBaseline && (
                            <span className={`scenario-select-card-delta ${pct >= 0 ? 'pos' : 'neg'}`}>
                              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="scenario-matrix-scroll" ref={matrixScrollRef}>
                  <table className="scenario-matrix">
                    <thead>
                      <tr>
                        <th className="scenario-matrix-kpi" scope="col">KPI</th>
                        {visibleScenarios.map((s) => (
                          <th
                            key={s.id}
                            scope="col"
                            className={s.id === activeId ? 'is-active' : ''}
                            data-active={s.id === activeId}
                            aria-current={s.id === activeId ? 'true' : undefined}
                            style={s.id === activeId ? { borderTop: `3px solid ${s.color}` } : undefined}
                          >
                            <span className="scenario-matrix-colname">
                              <span className="scenario-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
                              {s.name}
                            </span>
                            <span className="scenario-matrix-colsub">{s.isBaseline ? 'Current Trend' : s.archetype}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Drivers — one row per business-semantic dropdown, per scenario column */}
                      <tr className="scenario-matrix-section-row">
                        <th className="scenario-matrix-kpi" scope="colgroup" colSpan={visibleScenarios.length + 1}>Drivers</th>
                      </tr>
                      {STRATEGY_ROWS.map((row) => (
                        <tr key={row.key} className="scenario-matrix-driver-row">
                          <th className="scenario-matrix-kpi" scope="row">{row.label}</th>
                          {visibleScenarios.map((s) => (
                            <td key={s.id} className={s.id === activeId ? 'is-active' : ''}>
                              <select
                                className="scenario-matrix-select"
                                value={s.strategy[row.key]}
                                disabled={s.isBaseline}
                                onChange={(e) => setStrategy(s.id, row.key, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`${row.label} for ${s.name}`}
                              >
                                {row.options.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}

                      {/* Outcomes — computed KPIs */}
                      <tr className="scenario-matrix-section-row">
                        <th className="scenario-matrix-kpi" scope="colgroup" colSpan={visibleScenarios.length + 1}>Outcomes</th>
                      </tr>
                      {KPI_ROWS.map((row) => (
                        <tr key={row.key}>
                          <th className="scenario-matrix-kpi" scope="row">{row.label}</th>
                          {visibleScenarios.map((s) => {
                            const val = kpisById[s.id][row.key];
                            const baseVal = baselineKpis[row.key];
                            const showDelta = !s.isBaseline;
                            let deltaStr = '';
                            let dir: 0 | 1 | -1 = 0;
                            if (showDelta) {
                              if (row.deltaMode === 'pct') {
                                const pct = baseVal !== 0 ? ((val - baseVal) / Math.abs(baseVal)) * 100 : 0;
                                dir = pct > 0.05 ? 1 : pct < -0.05 ? -1 : 0;
                                deltaStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
                              } else {
                                const diff = val - baseVal;
                                dir = diff > 0.01 ? 1 : diff < -0.01 ? -1 : 0;
                                deltaStr = `${diff >= 0 ? '+' : ''}${row.format(diff).replace('$', '$')}`;
                              }
                            }
                            const good = row.goodWhenUp;
                            const cls = dir === 0 || good == null ? 'neutral' : (dir === 1) === good ? 'pos' : 'neg';
                            const editable = !s.isBaseline && !!KPI_SOLVE[row.key];
                            const isEditing = editingCell?.id === s.id && editingCell?.key === row.key;
                            const cleanDelta = deltaStr.replace('+', '').replace('-', '');
                            const deltaLabel =
                              dir === 0
                                ? ''
                                : `${dir === 1 ? 'up' : 'down'} ${cleanDelta} versus baseline${
                                    cls === 'pos' ? ', favorable' : cls === 'neg' ? ', unfavorable' : ''
                                  }`;
                            return (
                              <td
                                key={s.id}
                                className={s.id === activeId ? 'is-active' : ''}
                                aria-current={s.id === activeId ? 'true' : undefined}
                              >
                                {isEditing ? (
                                  <input
                                    className="scenario-cell-input"
                                    type="number"
                                    autoFocus
                                    defaultValue={Number.isFinite(val) ? Math.round(val * 100) / 100 : ''}
                                    aria-label={`Target ${row.label} for ${s.name}`}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitKpiEdit(s.id, row.key, e.currentTarget.value);
                                      else if (e.key === 'Escape') setEditingCell(null);
                                    }}
                                    onBlur={(e) => commitKpiEdit(s.id, row.key, e.currentTarget.value)}
                                  />
                                ) : editable ? (
                                  <button
                                    type="button"
                                    className="scenario-cell-val scenario-cell-val--editable"
                                    onClick={() => setEditingCell({ id: s.id, key: row.key })}
                                    title="Set a target — the driver back-solves to hit it (goal seek)"
                                    aria-label={`Set target for ${row.label}, ${s.name} — currently ${row.format(val)}. Editing back-solves the driver (goal seek).`}
                                  >
                                    {row.format(val)}
                                  </button>
                                ) : (
                                  <span className="scenario-cell-val">{row.format(val)}</span>
                                )}
                                {showDelta && dir !== 0 && !isEditing && (
                                  <span className={`scenario-cell-delta ${cls}`}>
                                    <span aria-hidden="true">{dir === 1 ? '↑' : '↓'} {cleanDelta}</span>
                                    <span className="scenario-sr-only">{deltaLabel}</span>
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* RIGHT — charts; clicking a line/bubble selects the scenario on the left */}
              <section className="scenario-compare-right">
                <div className="scenario-band-head">
                  <span className="scenario-band-title">Charts</span>
                  <span className="scenario-band-sub">Click a line or bubble to focus</span>
                </div>
                <div className="scenario-chart-card">
                  <span className="scenario-chart-title">Sales Agreement Revenue Comparison</span>
                  <RevenueCompareChart scenarios={visibleScenarios} assumptions={assumptions} activeId={activeId} onSelect={setActiveId} />
                  <div className="scenario-chart-legend">
                    {visibleScenarios.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`scenario-legend-item${s.id === activeId ? ' is-active' : ''}`}
                        onClick={() => setActiveId(s.id)}
                      >
                        <span className="scenario-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="scenario-chart-card">
                  <span className="scenario-chart-title">Qty vs Margin Trade-off <span className="scenario-chart-note">(bubble = concession cost)</span></span>
                  <TradeoffChart scenarios={visibleScenarios} kpisById={kpisById} activeId={activeId} onSelect={setActiveId} />
                </div>
                <div className="scenario-chart-card">
                  <span className="scenario-chart-title">Target Revenue Attainment <span className="scenario-chart-note">(dashed line = 100% target)</span></span>
                  <TargetAttainmentChart scenarios={visibleScenarios} kpisById={kpisById} activeId={activeId} onSelect={setActiveId} />
                </div>
              </section>
            </div>
          </>
        )}

        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-controls
// ---------------------------------------------------------------------------

const QuickLever: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min: number;
  max: number;
}> = ({ label, value, onChange, disabled, min, max }) => (
  <div className={`scenario-lever${disabled ? ' scenario-lever--disabled' : ''}`}>
    <span className="scenario-lever-label">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="scenario-lever-range"
      aria-label={label}
    />
    <span className="scenario-lever-value">{value > 0 ? '+' : ''}{value}%</span>
  </div>
);

export default ScenarioDrawer;
