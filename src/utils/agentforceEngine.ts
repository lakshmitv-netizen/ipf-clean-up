import { MeasureData, GridRow } from '../types';
import { FocusGridParams } from '../components/AlertsPanel';

// ── Public types ─────────────────────────────────────────────────────────────
export interface FilterChip {
  label: string;
  value: string;
}

/** One line on an inline agent chart. */
export interface AgentChartSeries {
  name: string;
  color: string;
  values: number[];
  /** Optional confidence band as a ± fraction of each value (e.g. 0.2 = ±20%), fanning out over time. */
  band?: number;
}

/** A small multi-line trend chart the agent embeds directly in its reply. */
export interface AgentChart {
  title?: string;
  months: string[];
  series: AgentChartSeries[];
  note?: string;
}

/** A Slack message the agent drafts / posts inside its reply (Arc 5 · route for approval). */
export interface AgentSlackMessage {
  /** Channel name without the leading #. */
  channel: string;
  author: string;
  time: string;
  headline: string;
  lines: string[];
  footer?: string;
  /** Person the approval is routed to. */
  routedTo?: string;
  /** false = draft preview (before posting), true = posted-in-channel screen. */
  posted: boolean;
  /** Deep link to the full Slack screen (opens in a new tab), contextualised via query params. */
  viewUrl?: string;
}

/** A structured "record / action" card the agent surfaces in its reply (e.g. a drafted amendment). */
export interface AgentActionCard {
  /** Small overline icon glyph + eyebrow (e.g. "Amendment"). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  fields: { label: string; value: string; strong?: boolean }[];
  status?: { label: string; tone: 'pending' | 'success' | 'info' };
  footnote?: string;
}

/**
 * A scenario the agent proposes for the bottom Scenario Planning drawer. Mirrors the drawer's
 * Scenario model minus the color (the drawer assigns that). The strategy strings MUST match the
 * option arrays in ScenarioDrawer.tsx (CONCESSION_OPTIONS / MARGIN_OPTIONS / REBATE_OPTIONS) so the
 * dropdowns render the preset the agent picked.
 */
export interface AgentScenario {
  id: string;
  name: string;
  archetype: string;
  drivers: { growth: number; price: number; volume: number };
  strategy: { concession: string; margin: string; rebate: string };
}

export interface AgentResponse {
  /** The conversational, grounded answer. */
  answer: string;
  /** Grounded data points the agent cites. */
  bullets: string[];
  /** Optional inline trend chart rendered inside the agent's reply. */
  chart?: AgentChart;
  /** Optional structured record/action card (e.g. a drafted Sales Agreement amendment). */
  actionCard?: AgentActionCard;
  /** Optional Slack message the agent drafts or posts (Arc 5). */
  slackMessage?: AgentSlackMessage;
  /**
   * When set, the grid should reveal this measure row (with a brief loading state)
   * as the reply lands — Arc 3 projects the ✦ Predicted Baseline onto the grid.
   */
  revealMeasureId?: string;
  /** Preview of the filters the agent would apply (shown as chips). */
  filterPreview: FilterChip[];
  /** Params passed to handleFocusGrid for "Show on grid" + "Edit filters". */
  focusParams: FocusGridParams;
  /**
   * Boolean expression over the Advanced-filter numbers the agent derived
   * (1=Measure, 2=Account, 3=Category, 4=Products, 5=Time). Pre-populated into
   * the Filters panel's "Filter Logic" box so the user sees how the criteria combine.
   */
  filterLogic: string;
  /** Contextual questions the user is likely to ask next. */
  followUps: string[];
  /**
   * When set, the agent has proposed scenarios to model — the page injects them into the bottom
   * Scenario Planning drawer (auto-selected for comparison) as the reply lands.
   */
  scenarios?: AgentScenario[];
}

// Canonical follow-up questions (worded so the intent classifier routes them correctly).
const Q_FOCUS = 'What accounts should I focus on right now?';
const Q_WHY = 'Why is revenue low this period?';
const Q_PRODUCTS = 'Which products are underperforming?';
const Q_TOP = 'Where are my biggest opportunities?';
// Confirmation chip that turns the "biggest opportunities" answer into the agent's lever rationale.
const Q_MODEL_MAX = 'Show me how to reach the maximum';
// Second step of the progressive reveal: after the rationale, surface the three modelled scenarios.
const Q_SHOW_SCENARIOS = 'Show the 3 scenarios';

/**
 * Fixed Advanced-filter card numbers in the Filters panel, so the agent can build a
 * Filter Logic expression that lines up with what it pre-populates.
 */
const FILTER_NO = { measure: 1, account: 2, category: 3, products: 4, time: 5 } as const;

/** Join filter numbers into an AND expression (e.g. [1,2] -> "1 AND 2"). */
function andLogic(...nos: number[]): string {
  return nos.join(' AND ');
}

export interface StarterPrompt {
  id: string;
  label: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  { id: 'focus', label: 'What accounts should I focus on right now?' },
  { id: 'why', label: 'Why is revenue low this period?' },
  { id: 'products', label: 'Which products are underperforming?' },
  { id: 'top', label: 'Where are my biggest opportunities?' },
];

/**
 * Arc 3 — "Predict the Baseline, Not Just Sum It". A scripted, branching agent
 * conversation (the Forecast & Risk Agent) that plays beat-by-beat via the panel's
 * follow-up recommendations. Shown only when the grid carries a Predicted Baseline measure.
 */
export const ARC3_STARTER: StarterPrompt = {
  id: 'arc3-baseline',
  label: 'Show Predicted Baseline Quantity',
};

const ARC3 = {
  start: 'Show Predicted Baseline Quantity',
  project: 'Yes — project the baseline',
  where: 'Where is the growth coming from?',
  drill: 'Show the E-Motor Housing confidence band',
  recommend: 'What should I do about the e-motor ramp?',
  draft: 'Draft the capacity-risk note to Ops',
} as const;

/** Measure the Arc 3 "project" beat reveals on the grid. */
export const ARC3_REVEAL_MEASURE_ID = 'measure-predicted-baseline-qty';

/** True when the grid has the AI Predicted Baseline measure (Arc 3 applies). */
export function hasPredictedBaseline(data: MeasureData[]): boolean {
  return data.some((m) => /predicted baseline/i.test(m.name));
}

// ── Month helpers ────────────────────────────────────────────────────────────
const MONTHS: Array<[keyof GridRow['values'] & string, string]> = [
  ['jan2026', 'Jan 26'], ['feb2026', 'Feb 26'], ['mar2026', 'Mar 26'],
  ['apr2026', 'Apr 26'], ['may2026', 'May 26'], ['jun2026', 'Jun 26'],
  ['jul2026', 'Jul 26'], ['aug2026', 'Aug 26'], ['sep2026', 'Sep 26'],
  ['oct2026', 'Oct 26'], ['nov2026', 'Nov 26'], ['dec2026', 'Dec 26'],
];
const H1 = MONTHS.slice(0, 6);

function fmtCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

// ── Grounding helpers ────────────────────────────────────────────────────────
function isCurrencyMeasure(m: MeasureData): boolean {
  return /revenue/i.test(m.name);
}

/** Pick the most "headline" measure to reason about: Order Revenue > any Revenue > first. */
function pickPrimaryMeasure(data: MeasureData[]): MeasureData | null {
  if (data.length === 0) return null;
  return (
    data.find((m) => /order revenue/i.test(m.name)) ||
    data.find((m) => /sales agreement revenue/i.test(m.name)) ||
    data.find((m) => isCurrencyMeasure(m)) ||
    data[0]
  );
}

/**
 * Top-level rows of a measure — the first hierarchy level, treated as the
 * "accounts" to rank. Resolved structurally (depth 0) rather than by a hardcoded
 * row type, so it works across every scheme: the legacy 3-level grid ('account'),
 * the deep/Acme grids ('acct-global', …) and config-generated grids ('cfg-0-*').
 */
function topLevelRows(measure: MeasureData): GridRow[] {
  return measure.children ?? [];
}

/**
 * Roll a column up from the leaf products — matching how the grid displays parent
 * totals (fullHierarchy). Parent rows store independent values in the mock data, so
 * reading them directly would disagree with the grid; summing the leaves keeps the
 * agent's numbers consistent with what the user sees.
 */
function rollupColumn(row: GridRow, key: keyof GridRow['values']): number {
  if (row.children && row.children.length > 0) {
    return row.children.reduce((s, c) => s + rollupColumn(c, key), 0);
  }
  const v = row.values[key];
  if (typeof v === 'number') return v;
  if (key === 'year') return MONTHS.reduce((s, [k]) => s + (row.values[k] ?? 0), 0);
  return 0;
}

/** Measure-level rollup: sum the rolled-up column across all of the measure's rows. */
function measureColumn(measure: MeasureData, key: keyof GridRow['values']): number {
  return measure.children.reduce((s, c) => s + rollupColumn(c, key), 0);
}

function yearValue(row: GridRow): number {
  return rollupColumn(row, 'year');
}

interface ProductInstance {
  name: string;
  account: string;
  category: string;
  val: number;
}

/** Every leaf row (deepest level = the "products"/SKUs) with its top-level
 *  ancestor as the account and its immediate parent as the category. Resolved by
 *  tree position (leaf = no children, account = depth 0) so it works across the
 *  legacy, deep/Acme and config grids regardless of their row type ids. */
function productInstances(measure: MeasureData): ProductInstance[] {
  const out: ProductInstance[] = [];
  const walk = (rows: GridRow[] | undefined, depth: number, account: string, category: string) => {
    if (!rows) return;
    for (const r of rows) {
      const acct = depth === 0 ? r.name : account;
      const isLeaf = !r.children || r.children.length === 0;
      if (isLeaf) {
        out.push({ name: r.name, account: acct || r.name, category, val: yearValue(r) });
      } else {
        // The level whose children are all leaves acts as the "category" group.
        const childrenAreLeaves = r.children!.every((c) => !c.children || c.children.length === 0);
        walk(r.children, depth + 1, acct, childrenAreLeaves ? r.name : category);
      }
    }
  };
  walk(measure.children, 0, '', '');
  return out;
}

interface CategoryInstance {
  name: string;
  account: string;
  val: number;
}

/** Every "category" row — the level whose children are all leaves — with its top-level
 *  ancestor as the account, valued on `key`. Mirrors `productInstances`' structural
 *  resolution so it works across the legacy, deep/Acme and config grids. */
function categoryInstances(measure: MeasureData, key: keyof GridRow['values']): CategoryInstance[] {
  const out: CategoryInstance[] = [];
  const walk = (rows: GridRow[] | undefined, depth: number, account: string) => {
    if (!rows) return;
    for (const r of rows) {
      const acct = depth === 0 ? r.name : account;
      const children = r.children;
      if (!children || children.length === 0) continue;
      if (children.every((c) => !c.children || c.children.length === 0)) {
        out.push({ name: r.name, account: acct || r.name, val: rollupColumn(r, key) });
      } else {
        walk(children, depth + 1, acct);
      }
    }
  };
  walk(measure.children, 0, '');
  return out;
}

function fmtValue(measure: MeasureData, n: number): string {
  return isCurrencyMeasure(measure) ? fmtCurrency(n) : `${fmtNumber(n)} units`;
}

// ── Intent classification ────────────────────────────────────────────────────
type Intent =
  | 'products'
  | 'bottomCategories'
  | 'opportunities'
  | 'whyLow'
  | 'time'
  | 'focusAccounts'
  | 'summary';

function classify(q: string): Intent {
  const s = q.toLowerCase();
  // Ranked-category questions ("which 3 categories are furthest behind…") must beat the
  // generic whyLow branch, which answers at account level and would show every category.
  if (/categor/.test(s) && /(behind|furthest|bottom|lowest|worst|weakest|drag|underperf|softest)/.test(s)) {
    return 'bottomCategories';
  }
  if (/(product|sku|item)/.test(s)) return 'products';
  if (/(top|best|grow|opportun|invest|strongest|upside|winning)/.test(s)) return 'opportunities';
  if (/(why|low|drop|declin|weak|underperf|down|lag|behind plan|falling|slump)/.test(s)) return 'whyLow';
  if (/(quarter|q1|q2|q3|q4|this period|month|season)/.test(s)) return 'time';
  if (/(focus|account|attention|at risk|risk|priorit|where should)/.test(s)) return 'focusAccounts';
  return 'summary';
}

// ── Intent builders ──────────────────────────────────────────────────────────
function buildFocusAccounts(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;
  const accounts = topLevelRows(measure)
    .map((a) => ({ name: a.name, val: yearValue(a) }))
    .sort((a, b) => a.val - b.val);
  if (accounts.length === 0) return null;

  const n = Math.min(3, accounts.length);
  const bottom = accounts.slice(0, n);
  const top = accounts[accounts.length - 1];
  const names = bottom.map((b) => b.name);
  const gap = top.val - bottom[0].val;
  const cutoff = bottom[bottom.length - 1].val; // the Bottom-N boundary value

  const single = accounts.length === 1;
  return {
    answer: single
      ? `There's just **1 account** in view — ${bottom[0].name} at ${fmtValue(measure, bottom[0].val)} for FY26 ${measure.name}.\n` +
        `That's your entire book right now, so all focus goes here.`
      : `I ranked all ${accounts.length} accounts by FY26 ${measure.name} and pulled the **bottom ${n}** — each under ${fmtValue(measure, cutoff)}.\n` +
        `${bottom[0].name} is furthest behind at ${fmtValue(measure, bottom[0].val)}, about ${fmtValue(measure, gap)} below your strongest account (${top.name}).\n` +
        `Starting here closes the biggest part of the gap.`,
    bullets: bottom.map((b, i) => `${i + 1}. ${b.name} — ${fmtValue(measure, b.val)} (FY26)`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Column filter', value: `FY26 · Account Bottom ${n}` },
      { label: `Accounts (Bottom ${n})`, value: names.join(', ') },
    ],
    focusParams: {
      measures: [measure.name],
      accounts: names,
      dimensionLevel: 'account',
      timeGranularities: ['month', 'year'],
      bottomNColumnFilter: {
        n,
        dimension: 'account',
        measureId: measure.id,
        columnKey: 'year',
        operator: 'bottomN',
      },
      // Order the surfaced accounts weakest-first so the grid matches the ranked list.
      sort: { dimension: 'account', measureId: measure.id, direction: 'asc' },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.account),
    followUps: [
      `Why is ${bottom[0].name} underperforming?`,
      Q_PRODUCTS,
      Q_TOP,
    ],
  };
}

function buildOpportunities(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;
  const accounts = topLevelRows(measure)
    .map((a) => ({ name: a.name, val: yearValue(a) }))
    .sort((a, b) => b.val - a.val);
  if (accounts.length === 0) return null;

  const n = Math.min(3, accounts.length);
  const top = accounts.slice(0, n);
  const names = top.map((t) => t.name);
  const total = accounts.reduce((s, a) => s + a.val, 0);
  const share = total > 0 ? Math.round((top.reduce((s, a) => s + a.val, 0) / total) * 100) : 0;
  const cutoff = top[top.length - 1].val;

  return {
    answer:
      `I ranked all accounts by FY26 ${measure.name} — your **top ${n}** each clear ${fmtValue(measure, cutoff)}.\n` +
      `Together they drive about ${share}% of the total, so wins here compound fastest.\n` +
      `${top[0].name} leads at ${fmtValue(measure, top[0].val)}. The biggest untapped upside is the **agreement-vs-order gap in Electrical Systems** — orders are running below what's already committed.\n` +
      `Want suggestions on how to hit the maximum? I can model a few levers to close that gap.`,
    bullets: top.map((t, i) => `${i + 1}. ${t.name} — ${fmtValue(measure, t.val)} (FY26)`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Column filter', value: `FY26 · Account Top ${n}` },
      { label: `Accounts (Top ${n})`, value: names.join(', ') },
    ],
    focusParams: {
      measures: [measure.name],
      accounts: names,
      dimensionLevel: 'account',
      timeGranularities: ['month', 'year'],
      bottomNColumnFilter: {
        n,
        dimension: 'account',
        measureId: measure.id,
        columnKey: 'year',
        operator: 'topN',
      },
      // Order the surfaced accounts strongest-first so the grid matches the ranked list.
      sort: { dimension: 'account', measureId: measure.id, direction: 'desc' },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.account),
    followUps: [
      Q_MODEL_MAX,
      Q_FOCUS,
      Q_PRODUCTS,
    ],
  };
}

// The three lever-based scenarios the agent proposes to close the Electrical Systems agreement gap.
// Each is a distinct lever with its own trade-off; strategy strings match ScenarioDrawer's presets.
const LEVER_SCENARIOS: AgentScenario[] = [
  {
    id: 'lever-coverage',
    name: 'Coverage Play',
    archetype: 'Volume lever · convert agreement headroom',
    drivers: { growth: 4, price: -1, volume: 10 },
    strategy: { concession: 'Match Competitor (6%)', margin: 'Plan Target (22%)', rebate: 'Tier 3: 15%' },
  },
  {
    id: 'lever-margin',
    name: 'Margin Guard',
    archetype: 'Price lever · hold price, cut concessions',
    drivers: { growth: 2, price: 7, volume: 1 },
    strategy: { concession: 'Hold (0%)', margin: 'Protect (24%)', rebate: 'Tier 1: 5%' },
  },
  {
    id: 'lever-demand',
    name: 'Demand Pull',
    archetype: 'Growth lever · pull H2 demand forward',
    drivers: { growth: 11, price: 1, volume: 6 },
    strategy: { concession: 'Match Competitor (6%)', margin: 'Plan Target (22%)', rebate: 'Tier 2: 10%' },
  },
];

/**
 * Step 1 of the progressive reveal — the user confirms they want to hit the maximum.
 * Matches the rationale chip, but NOT the "Show the 3 scenarios" step (handled separately).
 */
function matchScenarioArc(question: string): boolean {
  const s = question.trim().toLowerCase();
  if (s === Q_SHOW_SCENARIOS.trim().toLowerCase()) return false;
  if (s === Q_MODEL_MAX.trim().toLowerCase()) return true;
  return /(hit|reach|get to).*(max)/.test(s) || /(model|show).*(lever)/.test(s);
}

/** Step 2 of the progressive reveal — the user asks to see the three modelled scenarios. */
function matchShowScenarios(question: string): boolean {
  const s = question.trim().toLowerCase();
  if (s === Q_SHOW_SCENARIOS.trim().toLowerCase()) return true;
  return /(show|see|view).*(3|three).*(scenario)/.test(s) || /show the scenarios/.test(s);
}

/**
 * Step 1: the agent shows its work — how it reasons from the gap to a blend of levers.
 * No scenarios attached yet; ends with a chip to reveal the three modelled scenarios.
 */
function buildScenarioRationale(_data: MeasureData[]): AgentResponse {
  return {
    answer:
      `Before I hand you scenarios, here's how I got to them. The Electrical Systems gap is **~$2.4M**, ` +
      `but no single lever closes all of it — each carries a different cost, so I looked at three.\n\n` +
      `**What's causing the gap** — conversion on the three focus SKUs is sitting at **0.65×**. ` +
      `That points to a *coverage* problem (signed agreement headroom not being ordered), not a demand or pricing problem — ` +
      `so coverage is the highest-leverage, lowest-risk place to start.\n\n` +
      `**The trade-off space I explored** — pure coverage recovers the most revenue but strains margin; ` +
      `pure price protects margin but caps recovery; pulling demand forward has the highest upside but the least certainty. ` +
      `The answer is a **blend**, so I built three scenarios that each weight one lever — you compare the trade-offs instead of guessing.`,
    bullets: [
      `**Coverage Play** (volume) — convert the agreement headroom. Biggest recoverable volume, minimal price risk.`,
      `**Margin Guard** (price) — hold price, trim concessions. Protects the 24% margin, leaves some volume behind.`,
      `**Demand Pull** (growth) — pull H2 demand forward. Highest upside, highest execution risk.`,
    ],
    filterPreview: [],
    focusParams: {},
    filterLogic: '',
    followUps: [],
    scenarios: LEVER_SCENARIOS,
  };
}

/** Step 2: names the three levers and hands them to the Scenario Planning drawer. */
function buildScenarioLevers(_data: MeasureData[]): AgentResponse {
  return {
    answer:
      `Here are the **three scenarios** — each leads with a different lever, so you can weigh the trade-offs side by side:`,
    bullets: [
      `**Coverage Play** (volume) — convert the agreement headroom into orders. Highest revenue, thinner margin.`,
      `**Margin Guard** (price) — hold price, trim concessions. Best net margin, leaves some volume on the table.`,
      `**Demand Pull** (growth) — pull H2 demand forward. Highest target attainment, highest execution risk.`,
    ],
    filterPreview: [],
    focusParams: {},
    filterLogic: '',
    followUps: [],
    scenarios: LEVER_SCENARIOS,
  };
}

function buildWhyLow(data: MeasureData[], question = ''): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;
  const accounts = topLevelRows(measure);
  if (accounts.length === 0) return null;

  const buildFor = (a: GridRow) => {
    const first = rollupColumn(a, H1[0][0]);
    const last = rollupColumn(a, H1[H1.length - 1][0]);
    const declinePct = first > 0 ? (first - last) / first : 0;
    return { row: a, declinePct, first, last };
  };

  // If the question names a specific account, analyse that one; else pick the steepest H1 decline.
  const q = question.toLowerCase();
  const named = accounts.find((a) => q.includes(a.name.toLowerCase()));
  let worst: { row: GridRow; declinePct: number; first: number; last: number } | null = named
    ? buildFor(named)
    : null;
  if (!worst) {
    for (const a of accounts) {
      const cand = buildFor(a);
      if (!worst || cand.declinePct > worst.declinePct) worst = cand;
    }
  }
  if (!worst) return null;

  // Identify the weakest single H1 month for that account.
  let troughLabel = H1[0][1];
  let troughKey: keyof GridRow['values'] & string = H1[0][0];
  let troughVal = Infinity;
  for (const [k, label] of H1) {
    const v = rollupColumn(worst.row, k);
    if (v < troughVal) {
      troughVal = v;
      troughLabel = label;
      troughKey = k;
    }
  }

  const pct = Math.round(worst.declinePct * 100);
  const trendSentence =
    pct > 0
      ? `It's down ${pct}% across H1 — from ${fmtValue(measure, worst.first)} in ${H1[0][1]} to ${fmtValue(measure, worst.last)} in ${H1[H1.length - 1][1]}.`
      : `It's running below the other accounts for most of H1.`;

  return {
    answer:
      `I compared every account's first-half trend on ${measure.name}, and ${worst.row.name} is the clear drag this period.\n` +
      `${trendSentence}\n` +
      `The weakest month is **${troughLabel}** at ${fmtValue(measure, troughVal)} — I've highlighted that cell so you can see exactly where the dip starts.`,
    bullets: [
      `${worst.row.name} — ${H1[0][1]}: ${fmtValue(measure, worst.first)} → ${H1[H1.length - 1][1]}: ${fmtValue(measure, worst.last)}`,
      `Trough month: ${troughLabel} (${fmtValue(measure, troughVal)})`,
    ],
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Account', value: worst.row.name },
      { label: 'Time', value: `${H1[0][1]} – ${H1[H1.length - 1][1]}` },
    ],
    focusParams: {
      measures: [measure.name],
      accounts: [worst.row.name],
      startPeriod: 'jan2026',
      endPeriod: 'jun2026',
      highlight: {
        name: `Root cause · ${worst.row.name} ${troughLabel}`,
        cellKeys: [`${worst.row.id}-${troughKey}`],
      },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.account, FILTER_NO.time),
    followUps: [
      `Which products are dragging ${worst.row.name} down?`,
      Q_FOCUS,
      Q_TOP,
    ],
  };
}

function buildProducts(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;

  // Rank every individual SKU row (a SKU repeats across accounts) by FY26 value and
  // pull the weakest three — the exact rows the grid's Bottom-3 column filter surfaces.
  const all = productInstances(measure).sort((a, b) => a.val - b.val);
  if (all.length === 0) return null;

  const n = Math.min(3, all.length);
  const products = all.slice(0, n);
  const cutoff = products[products.length - 1].val; // the Bottom-N boundary value
  const label = (p: ProductInstance) => `${p.name} · ${p.account}`;

  return {
    answer:
      `I ranked all ${all.length} SKU rows by FY26 ${measure.name} and pulled the **bottom ${n}** — each under ${fmtValue(measure, cutoff)}.\n` +
      `${label(products[0])} is the softest at ${fmtValue(measure, products[0].val)}.\n` +
      `I've expanded the grid to just these rows so you can see what's dragging on the number.`,
    bullets: products.map((p, i) => `${i + 1}. ${label(p)} — ${fmtValue(measure, p.val)} (FY26)`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Column filter', value: `FY26 · Product Bottom ${n}` },
      { label: `SKUs (Bottom ${n})`, value: products.map(label).join(', ') },
    ],
    focusParams: {
      measures: [measure.name],
      dimensionLevel: 'product',
      timeGranularities: ['month', 'year'],
      // Rank across the whole grid (not per-parent) so exactly N product rows show.
      preserveHierarchy: false,
      // Expand the full account → category → product tree so rows correlate with the answer.
      expandHierarchy: true,
      bottomNColumnFilter: {
        n,
        dimension: 'product',
        measureId: measure.id,
        columnKey: 'year',
        operator: 'bottomN',
      },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.products),
    followUps: [
      Q_FOCUS,
      Q_WHY,
      Q_TOP,
    ],
  };
}

/**
 * "Which N categories are furthest behind on <period>?" — ranks distinct category names
 * (summed across every account) and returns exactly N of them, so the count in the answer
 * matches the count in the question.
 */
function buildBottomCategories(data: MeasureData[], question = ''): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;

  // Honour the count the user asked for ("bottom 3 categories"), defaulting to 3.
  const askedN = Number(question.match(/\b(\d+)\s*(?:categor|worst|lowest|bottom)/i)?.[1]);
  const requestedN = Number.isFinite(askedN) && askedN > 0 ? askedN : 3;

  // Rank on the quarter the question names, else the FY column.
  const quarter = question.toLowerCase().match(/\bq([1-4])\b/)?.[1];
  const columnKey = (quarter ? `q${quarter}` : 'year') as keyof GridRow['values'];
  const periodLabel = quarter ? `Q${quarter}` : 'FY26';
  const granularities = quarter ? ['month', 'quarter'] : ['month', 'year'];

  // A category repeats across accounts (Electrical Systems sits under every plant), so rank
  // by the company-wide total per name — otherwise the "bottom 3" can be one name three times.
  const totals = new Map<string, { val: number; accounts: Set<string> }>();
  for (const c of categoryInstances(measure, columnKey)) {
    const entry = totals.get(c.name) ?? { val: 0, accounts: new Set<string>() };
    entry.val += c.val;
    entry.accounts.add(c.account);
    totals.set(c.name, entry);
  }
  const all = Array.from(totals, ([name, t]) => ({ name, val: t.val, plants: t.accounts.size })).sort(
    (a, b) => a.val - b.val
  );
  if (all.length === 0) return null;

  const n = Math.min(requestedN, all.length);
  const bottom = all.slice(0, n);
  const names = bottom.map((c) => c.name);
  const cutoff = bottom[bottom.length - 1].val;

  return {
    answer:
      `I totalled each category across every account for ${periodLabel} ${measure.name} and pulled the **bottom ${n}** of ${all.length} — each under ${fmtValue(measure, cutoff)}.\n` +
      `${bottom[0].name} is the weakest at ${fmtValue(measure, bottom[0].val)} across ${bottom[0].plants} plant${bottom[0].plants === 1 ? '' : 's'}.\n` +
      `The grid is filtered to just these ${n} categories, so you can see which plant each one is losing in.`,
    bullets: bottom.map(
      (c, i) => `${i + 1}. ${c.name} — ${fmtValue(measure, c.val)} (${periodLabel}, ${c.plants} plants)`
    ),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Time', value: periodLabel },
      { label: `Categories (Bottom ${n})`, value: names.join(', ') },
    ],
    focusParams: {
      measures: [measure.name],
      categories: names,
      dimensionLevel: 'category',
      timeGranularities: granularities,
      // Stop the expansion at the category level so products don't pad the list.
      expandLevel: 'categories',
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.category, FILTER_NO.time),
    followUps: [
      `Which products are dragging ${bottom[0].name} down?`,
      Q_WHY,
      Q_TOP,
    ],
  };
}

function buildTime(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;

  // Compare quarters using rolled-up (leaf-summed) measure values, matching the grid.
  const quarters: Array<[string, number, string, string]> = [
    ['Q1', measureColumn(measure, 'q1'), 'jan2026', 'mar2026'],
    ['Q2', measureColumn(measure, 'q2'), 'apr2026', 'jun2026'],
    ['Q3', measureColumn(measure, 'q3'), 'jul2026', 'sep2026'],
    ['Q4', measureColumn(measure, 'q4'), 'oct2026', 'dec2026'],
  ];
  const weakest = [...quarters].sort((a, b) => a[1] - b[1])[0];
  const weakestKey = weakest[0].toLowerCase() as keyof GridRow['values'] & string; // 'q1'..'q4'

  return {
    answer:
      `Comparing ${measure.name} across all four quarters, **${weakest[0]}** is the softest at ${fmtValue(measure, weakest[1])}.\n` +
      `I've highlighted the ${weakest[0]} column so you can see which accounts are pulling it down.`,
    bullets: quarters.map(([q, v]) => `${q}: ${fmtValue(measure, v)}`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Time (weakest)', value: weakest[0] },
    ],
    focusParams: {
      measures: [measure.name],
      startPeriod: weakest[2],
      endPeriod: weakest[3],
      timeGranularities: ['month', 'quarter'],
      highlight: {
        name: `Weakest period · ${weakest[0]}`,
        timeKeys: [weakestKey],
        measureIds: [measure.id],
        dimensionLevels: ['account'],
      },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.time),
    followUps: [
      Q_FOCUS,
      Q_PRODUCTS,
      Q_TOP,
    ],
  };
}

function buildSummary(data: MeasureData[]): AgentResponse | null {
  // Default: combine a focus recommendation with a light overview.
  const focus = buildFocusAccounts(data);
  if (!focus) return null;
  const measure = pickPrimaryMeasure(data)!;
  const total = topLevelRows(measure).reduce((s, a) => s + yearValue(a), 0);
  return {
    ...focus,
    answer:
      `Here's a quick read on ${measure.name} — total **${fmtValue(measure, total)}** for FY26.\n${focus.answer}`,
  };
}

// ── Arc 3 · Predict the Baseline scripted flow ───────────────────────────────
/** Compact large numbers for headlines: 14730044 -> "14.73M", 58947 -> "58,947". */
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return fmtNumber(n);
}

/** First node anywhere in the measure tree whose name contains `sub` (case-insensitive). */
function findFirstNode(measure: MeasureData | undefined, sub: string): GridRow | null {
  if (!measure) return null;
  const needle = sub.toLowerCase();
  let found: GridRow | null = null;
  const walk = (rows: GridRow[] | undefined) => {
    if (!rows || found) return;
    for (const r of rows) {
      if (found) return;
      if (r.name.toLowerCase().includes(needle)) { found = r; return; }
      walk(r.children);
    }
  };
  walk(measure.children);
  return found;
}

// Compact month labels for inline charts (Jan…Dec).
const MONTH_LABELS_SHORT = MONTHS.map(([, label]) => label.replace(' 26', ''));

/** 12 monthly rolled-up values for a node (matches the grid's leaf-summed totals). */
function monthlyNode(node: GridRow | null): number[] | null {
  if (!node) return null;
  return MONTHS.map(([k]) => rollupColumn(node, k));
}

/** 12 monthly rolled-up values for a whole measure. */
function monthlyMeasure(measure: MeasureData | undefined): number[] | null {
  if (!measure) return null;
  return MONTHS.map(([k]) => measureColumn(measure, k));
}

// Canonical fallbacks (match the seeded grid) so the charts still render if a node isn't found.
const FALLBACK = {
  midwest: [46835, 47945, 49056, 50166, 51276, 52385, 53496, 54609, 55717, 56829, 57838, 58947],
  southwest: [21111, 21129, 21150, 21168, 21188, 21207, 21226, 21244, 21265, 21283, 21303, 21322],
  emotor: [10088, 10546, 11005, 11464, 11923, 12380, 12839, 13298, 13757, 14216, 14627, 15084],
  powertrain: [6758, 6856, 6954, 7052, 7150, 7248, 7346, 7445, 7543, 7642, 7741, 7840],
};

/** Jan→Dec rollup + growth % for a node (matches the grid's leaf-summed totals). */
function janDecGrowth(node: GridRow | null): { jan: number; dec: number; pct: number } | null {
  if (!node) return null;
  const jan = rollupColumn(node, 'jan2026');
  const dec = rollupColumn(node, 'dec2026');
  const pct = jan > 0 ? Math.round(((dec - jan) / jan) * 100) : 0;
  return { jan, dec, pct };
}

/** Match a typed/clicked question to an Arc-3 beat key, or null if it isn't Arc 3. */
function matchArc3(question: string): keyof typeof ARC3 | null {
  const s = question.trim().toLowerCase();
  const eq = (v: string) => s === v.trim().toLowerCase();
  if (eq(ARC3.start) || /(predict|predictive).*baseline/.test(s)) return 'start';
  if (eq(ARC3.project) || /(yes|project|go ahead|do it|add it|confirm).*(baseline|project)/.test(s) || /project.*(forward )?baseline/.test(s)) return 'project';
  if (eq(ARC3.where) || /where.*(growth|coming from)/.test(s)) return 'where';
  if (eq(ARC3.drill) || /(drill|midwest program|confidence band|e-?motor housing)/.test(s)) return 'drill';
  if (eq(ARC3.recommend) || /(recommend|what should i do).*(ramp|e-?motor)?/.test(s) && /(ramp|e-?motor|recommend)/.test(s)) return 'recommend';
  if (eq(ARC3.draft) || /draft.*(note|ops)/.test(s)) return 'draft';
  return null;
}

const arc3Base = (): Pick<AgentResponse, 'filterPreview' | 'focusParams' | 'filterLogic'> => ({
  filterPreview: [],
  focusParams: {},
  filterLogic: '',
});

function buildArc3(beat: keyof typeof ARC3, data: MeasureData[]): AgentResponse {
  const forecast = data.find((m) => /forecast quantity/i.test(m.name));
  const baseline = data.find((m) => /predicted baseline/i.test(m.name));
  const forecastTotal = forecast ? measureColumn(forecast, 'year') : 21_155_592;
  const baselineTotal = baseline ? measureColumn(baseline, 'year') : 22_514_950;
  const upliftPct = forecastTotal > 0 ? Math.round(((baselineTotal - forecastTotal) / forecastTotal) * 100) : 6;

  const midNode = findFirstNode(baseline, 'Midwest Assembly');
  const swNode = findFirstNode(baseline, 'Southwest Stamping');
  const emhNode = findFirstNode(baseline, 'E-Motor Housing');
  const pwtNode = findFirstNode(baseline, 'Powertrain');

  const mid = janDecGrowth(midNode) ?? { jan: 46_835, dec: 58_947, pct: 26 };
  const sw = janDecGrowth(swNode) ?? { jan: 21_111, dec: 21_322, pct: 1 };
  const emh = janDecGrowth(emhNode) ?? { jan: 10_088, dec: 15_084, pct: 50 };

  // Monthly series for the inline charts (live data, with seeded fallbacks).
  const midMonthly = monthlyNode(midNode) ?? FALLBACK.midwest;
  const swMonthly = monthlyNode(swNode) ?? FALLBACK.southwest;
  const emhMonthly = monthlyNode(emhNode) ?? FALLBACK.emotor;
  const pwtMonthly = monthlyNode(pwtNode) ?? FALLBACK.powertrain;
  const forecastMonthly = monthlyMeasure(forecast);
  const baselineMonthly = monthlyMeasure(baseline);

  switch (beat) {
    case 'start':
      return {
        ...arc3Base(),
        answer:
          `I can project a forward baseline with **Moirai** (a time-series model) on your curated Data Cloud history — floored by agreements and lifted by pipeline.\n` +
          `That looks past today's committed sum to where demand is actually heading. Shall I add it?`,
        bullets: [],
        followUps: [ARC3.project],
      };
    case 'project':
      return {
        ...arc3Base(),
        revealMeasureId: ARC3_REVEAL_MEASURE_ID,
        answer:
          `Done — **✦ Predicted Baseline Quantity** is now on the grid, projected by **Moirai**.\n` +
          `FY26 rolls to **${fmtCompact(baselineTotal)} units — ~${upliftPct}% above** the committed sum. That upside isn't spread evenly — it's concentrated in **Midwest**. Want to see where it's coming from?`,
        bullets: [
          `✦ Predicted Baseline — ${fmtCompact(baselineTotal)} units (FY26)`,
          `Committed Forecast — ${fmtCompact(forecastTotal)} units (FY26)`,
        ],
        chart:
          forecastMonthly && baselineMonthly
            ? {
                title: 'Committed Forecast vs ✦ Predicted Baseline',
                months: MONTH_LABELS_SHORT,
                series: [
                  { name: '✦ Predicted Baseline', color: '#0176d3', values: baselineMonthly },
                  { name: 'Forecast (committed)', color: '#8a97a8', values: forecastMonthly },
                ],
                note: 'The baseline pulls above the committed sum as the year builds.',
              }
            : undefined,
        followUps: [ARC3.where],
      };
    case 'where':
      return {
        ...arc3Base(),
        answer:
          `It's concentrated, not even:\n` +
          `**Midwest** ramps **${fmtNumber(mid.jan)} → ${fmtNumber(mid.dec)} (+${mid.pct}%)** — the EV build. **Southwest** stays flat (**+${sw.pct}%**). A sum would show both as "on plan."\n` +
          `Inside Midwest, **E-Motor Housing** is the driver — but Moirai flags it **low confidence** (a brand-new program with little history). Want to see the confidence band?`,
        bullets: [
          `Midwest Assembly — ${fmtNumber(mid.jan)} → ${fmtNumber(mid.dec)} (+${mid.pct}%)`,
          `Southwest Stamping — ~${fmtNumber(sw.dec)} all year (+${sw.pct}%)`,
          `E-Motor Housing — driving Midwest · [[warn:Low confidence]]`,
        ],
        chart: {
          title: 'Predicted Baseline — by plant',
          months: MONTH_LABELS_SHORT,
          series: [
            { name: 'Midwest Assembly', color: '#0176d3', values: midMonthly },
            { name: 'Southwest Stamping', color: '#54698d', values: swMonthly },
          ],
          note: 'Midwest bends upward (EV ramp); Southwest holds flat (legacy chassis).',
        },
        followUps: [ARC3.drill],
      };
    case 'drill':
      return {
        ...arc3Base(),
        answer:
          `Here's the confidence band on **E-Motor Housing** — **${fmtNumber(emh.jan)} → ${fmtNumber(emh.dec)} (+${emh.pct}%)**.\n` +
          `The band fans out because the program has little history, so the projection is **least certain** where it ramps hardest. That uncertainty is your cue to act.`,
        bullets: [
          `E-Motor Housing — ${fmtNumber(emh.jan)} → ${fmtNumber(emh.dec)} (+${emh.pct}%)`,
          `Confidence: Low (new program, sparse history)`,
        ],
        chart: {
          title: 'E-Motor Housing — projection & confidence band',
          months: MONTH_LABELS_SHORT,
          series: [
            { name: 'E-Motor Housing (Low confidence)', color: '#ba0517', values: emhMonthly, band: 0.22 },
            { name: 'Powertrain', color: '#0176d3', values: pwtMonthly },
          ],
          note: 'Shaded band = confidence. It fans out for E-Motor Housing — steepest ramp, least certain.',
        },
        followUps: [ARC3.recommend],
      };
    case 'recommend':
      return {
        ...arc3Base(),
        answer:
          `The e-motor ramp is **~18% above committed volume** — real demand that isn't signed yet. Your move:`,
        bullets: [
          `1. Flag the ~18% uncommitted upside to Ops before committing capacity`,
          `2. Convert Midwest pipeline to agreement — predicted → committed`,
          `3. Leave Southwest as-is`,
        ],
        followUps: [ARC3.draft, 'Keep the baseline pinned to the plan'],
      };
    case 'draft':
    default:
      return {
        ...arc3Base(),
        answer:
          `Done — capacity-risk note drafted for Ops on the ~18% e-motor upside, and **✦ Predicted Baseline** is pinned to the FY26 plan.\n` +
          `You're now planning against where demand is heading. I recommend; you decide.`,
        bullets: [],
        followUps: [ARC3.where, ARC3.drill],
      };
  }
}

// ── Arc 5 · Edit with Clarity and Commit (Next-Best-Action Agent) ────────────
/**
 * Arc 5 fires on save: the Next-Best-Action Agent converts the flagged Midwest
 * e-motor risk into pipeline — drafting an amendment to the Midwest Sales
 * Agreement for the ~18% upside and routing it to Slack for the seller's approval.
 * The agent drafts; the human signs.
 */
export const ARC5 = {
  start: 'The Midwest e-motor ramp is ~18% above the committed agreement — what’s the next best action?',
  draft: 'Draft the Slack message',
  post: 'Post to Slack',
} as const;

export const ARC5_START_PROMPT = ARC5.start;

/** Match a typed/clicked question to an Arc-5 beat key, or null if it isn't Arc 5. */
function matchArc5(question: string): keyof typeof ARC5 | null {
  const s = question.trim().toLowerCase();
  const eq = (v: string) => s === v.trim().toLowerCase();
  if (eq(ARC5.start) || /e-?motor ramp.*(committed|agreement|what should)/.test(s)) return 'start';
  if (eq(ARC5.draft) || /draft.*(slack|message)/.test(s)) return 'draft';
  if (eq(ARC5.post) || /post.*(slack|channel)|route.*to.*slack|send.*to.*slack/.test(s)) return 'post';
  return null;
}

const ARC5_CHANNEL = 'midwest-sales-ops';
// David (the seller / current user) requests approval; Rita (his sales leader) approves.
const ARC5_REQUESTER = 'David Chen';
const ARC5_APPROVER = 'Rita Menon';

function buildArc5(beat: keyof typeof ARC5, data: MeasureData[]): AgentResponse {
  const forecast = data.find((m) => /forecast quantity/i.test(m.name));
  const forecastEmh = findFirstNode(forecast, 'E-Motor Housing');
  // Committed volume on the Midwest e-motor line (falls back to a seeded figure).
  const committed = forecastEmh ? rollupColumn(forecastEmh, 'year') : 183_971;
  const upliftPct = 18; // the risk the Forecast & Risk Agent flagged earlier (~18% above committed)
  const upliftUnits = Math.round(committed * (upliftPct / 100));
  const proposed = committed + upliftUnits;

  const account = 'Acme Partners · Midwest Assembly';
  const line = 'E-Motor Housing (EV program)';
  const viewUrl = `${import.meta.env.BASE_URL}slack-approval.html?${new URLSearchParams({
    channel: ARC5_CHANNEL,
    requester: ARC5_REQUESTER,
    approver: ARC5_APPROVER,
    account,
    line,
    committed: String(committed),
    proposed: String(proposed),
    pct: String(upliftPct),
  }).toString()}`;

  const slackMessage = (posted: boolean): AgentSlackMessage => ({
    channel: ARC5_CHANNEL,
    author: 'Agentforce',
    time: posted ? 'Just now' : 'Draft',
    headline: '✋ Approval needed — Midwest Sales Agreement amendment',
    lines: [
      `*Account* — ${account}`,
      `*Line* — ${line}`,
      `*Volume* — ${fmtNumber(committed)} → ${fmtNumber(proposed)} units (*+${upliftPct}%*)`,
      `*Why* — predicted baseline is ~${upliftPct}% above the committed agreement. Capturing the upside as pipeline.`,
    ],
    footer: 'Drafted from the saved FY26 plan · floored by the current agreement',
    routedTo: ARC5_APPROVER,
    posted,
    viewUrl,
  });

  switch (beat) {
    case 'start':
      return {
        ...arc3Base(),
        answer:
          `That ~${upliftPct}% is **real demand that isn't under contract yet**. The move is to amend the **Midwest Sales Agreement** to capture it, then route it to your team for approval.\n` +
          `Want me to **draft a Slack message** to route the amendment to #${ARC5_CHANNEL}?`,
        bullets: [
          `Committed today — ${fmtNumber(committed)} units`,
          `Predicted demand — ${fmtNumber(proposed)} units (+${upliftPct}%)`,
        ],
        followUps: [ARC5.draft],
      };
    case 'draft':
      return {
        ...arc3Base(),
        answer:
          `Drafted. Here's the message I'll post to **#${ARC5_CHANNEL}**, requesting **${ARC5_APPROVER}**'s approval on your behalf. Review it — I'll post when you're ready.`,
        bullets: [],
        slackMessage: slackMessage(false),
        followUps: [ARC5.post],
      };
    case 'post':
    default:
      return {
        ...arc3Base(),
        answer:
          `Posted to **#${ARC5_CHANNEL}** — your amendment is now with **${ARC5_APPROVER}** for approval.\n` +
          `That's the pattern across this flow: the agents **predicted, flagged, recommended, and drafted** — but every decision stayed yours.`,
        bullets: [],
        slackMessage: slackMessage(true),
        followUps: [],
      };
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
export function runAgentQuery(question: string, data: MeasureData[]): AgentResponse {
  const arc5Beat = matchArc5(question);
  if (arc5Beat) return buildArc5(arc5Beat, data);

  const arcBeat = matchArc3(question);
  if (arcBeat) return buildArc3(arcBeat, data);

  // Progressive reveal: "reach the maximum" shows the rationale; "show the 3 scenarios" reveals them.
  if (matchShowScenarios(question)) return buildScenarioLevers(data);
  if (matchScenarioArc(question)) return buildScenarioRationale(data);

  const intent = classify(question);
  let res: AgentResponse | null = null;
  switch (intent) {
    case 'products': res = buildProducts(data); break;
    case 'bottomCategories': res = buildBottomCategories(data, question); break;
    case 'opportunities': res = buildOpportunities(data); break;
    case 'whyLow': res = buildWhyLow(data, question); break;
    case 'time': res = buildTime(data); break;
    case 'focusAccounts': res = buildFocusAccounts(data); break;
    default: res = buildSummary(data); break;
  }

  return (
    res ?? {
      answer:
        "I couldn't find grid data to analyse yet. Once measures and accounts are loaded, ask me what to " +
        'focus on, why a number is low, or where your biggest opportunities are.',
      bullets: [],
      filterPreview: [],
      focusParams: {},
      filterLogic: '',
      followUps: [Q_FOCUS, Q_WHY, Q_TOP],
    }
  );
}
