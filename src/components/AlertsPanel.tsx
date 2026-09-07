import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ApprovalRequest, MeasureData } from '../types';
import { CellEditHistoryEntry } from '../types/editHistory';
import '../styles/components/AlertsPanel.css';
import '../styles/components/PlanBrief.css';

// ── Types ──────────────────────────────────────────────────────────────────────
interface DeadlineTask {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  measureId?: string;
  timeKey?: string;
  cellKeys?: string[];
  type: 'submit' | 'review' | 'approve';
  // For approval-request cards: who submitted the change awaiting the user's decision.
  requesterName?: string;
  // Which tab this item belongs to: 'alert' (system-surfaced risk/anomaly) or 'task'
  // (a scheduled to-do). Defaults to 'task' when omitted.
  category?: 'alert' | 'task';
  // Grid focus params
  searchTerm?: string;
  startPeriod?: string;
  endPeriod?: string;
}

export interface FocusGridParams {
  searchTerm?: string;
  startPeriod?: string;
  endPeriod?: string;
  selectedCellKeys?: string[];
  // New filter params for intent-based filtering
  accounts?: string[];
  categories?: string[];
  measures?: string[];
  dimensionLevel?: 'account' | 'category' | 'product';
  // Time granularities to show as columns (e.g. ['month', 'quarter'] to surface the quarter column).
  timeGranularities?: string[];
  // Column-level Bottom-N filter on the category dimension (e.g. the 3 worst-performing categories).
  bottomNCategories?: { n: number; measureId: string; columnKey: string };
  // Generic column-level Top-N / Bottom-N filter (e.g. Bottom 3 accounts by FY26 Order Revenue).
  bottomNColumnFilter?: {
    n: number;
    dimension: 'account' | 'category' | 'product';
    measureId: string;
    columnKey: string; // e.g. 'year' for the FY26 column
    operator?: 'bottomN' | 'topN';
  };
  // For Top-N/Bottom-N: false ranks across the whole grid (exactly N rows total);
  // true (default) ranks within each parent. Used so product Bottom-N shows N rows, not N per category.
  preserveHierarchy?: boolean;
  // When the agent applies this view, expand the full hierarchy (parent → child chevrons)
  // instead of the default tidy collapsed view — used for deep (product) matches.
  expandHierarchy?: boolean;
  // Controls how far the focused view auto-expands: 'all' (default, down to products)
  // or 'categories' (accounts expanded to show categories, categories left collapsed).
  expandLevel?: 'all' | 'categories';
  // When the agent ranks rows (e.g. Bottom-3 accounts by FY26), it can also sort the
  // grid so rows appear in the same order the agent lists them. Expressed as a dimension
  // sort (level + measure) so it shows up in the Sort panel exactly as the user expects.
  sort?: {
    dimension: 'account' | 'category' | 'product';
    measureId: string;                 // measure to sort by (labels the "Sort by" field)
    direction: 'asc' | 'desc';
  };
  // When the agent pins a root-cause to specific cells/periods, it hands over a
  // conditional-formatting highlight spec so those cells light up on the grid.
  highlight?: {
    name: string;
    color?: string;                // hex; defaults to an amber "watch" tint
    cellKeys?: string[];           // explicit `${rowId}-${timeKey}` cells
    measureIds?: string[];         // column-target scope (when cellKeys is empty)
    timeKeys?: string[];           // period columns to highlight
    dimensionLevels?: string[];    // 'account' | 'category' | 'product'
  };
}

const TODAY = new Date('2026-03-17');

const MOCK_DEADLINES: DeadlineTask[] = [
  {
    id: 'dl-1',
    title: 'Approve Q1 Forecast',
    description: 'Sales Agreement Quantity · Jan–Mar 2026',
    dueDate: new Date('2026-03-10'),
    measureId: 'measure-sa-qty',
    type: 'approve',
    requesterName: 'David Chen',
    searchTerm: 'Sales Agreement',
    startPeriod: 'jan2026',
    endPeriod: 'mar2026',
  },
  {
    id: 'dl-3',
    title: 'Lock Revenue Forecast',
    description: 'Revenue · All accounts · Q2',
    dueDate: new Date('2026-03-28'),
    measureId: 'measure-revenue',
    type: 'submit',
    searchTerm: 'Revenue',
    startPeriod: 'apr2026',
    endPeriod: 'jun2026',
  },
  {
    id: 'dl-4',
    title: 'Reconcile Planned vs Actual',
    description: 'Chassis Components · Jan–Jun 2026',
    dueDate: new Date('2026-04-05'),
    measureId: 'measure-sa-qty',
    type: 'review',
    searchTerm: 'Chassis',
    startPeriod: 'jan2026',
    endPeriod: 'jun2026',
  },
  {
    id: 'dl-5',
    title: 'Urgent: Q2 at Risk - 3 Categories Behind Plan',
    description: 'Michigan + Ohio · Bottom 3 categories by Q2 revenue · $2.3M gap',
    dueDate: new Date('2026-03-19'),
    measureId: 'measure-revenue',
    type: 'review',
    category: 'alert',
    searchTerm: '',
    startPeriod: 'apr2026',
    endPeriod: 'jun2026',
  },
];

const SLA_DAYS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatRelativeTime(d: Date): string {
  const mins = Math.round((TODAY.getTime() - new Date(d).getTime()) / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
function formatTimeKey(tk: string): string {
  return tk.replace(/([a-z]+)(\d{4})/, (_, m, y) =>
    `${m.charAt(0).toUpperCase() + m.slice(1)} ${y}`
  );
}

/** Question an approval card hands to Agentforce when the user wants the background. */
function approvalAgentPrompt(requester?: string, measureSummary?: string): string {
  const on = measureSummary ? ` on ${measureSummary}` : '';
  const from = requester ? ` from ${requester}` : '';
  return `Brief me on the approval waiting on me${from}${on} — what changed and should I approve it?`;
}

type TabType = 'all' | 'alerts' | 'brief';

type OverviewTone = 'neutral' | 'positive' | 'warning' | 'critical';

/** One line of the value breakdown under an Overview row (e.g. each of the bottom 3). */
interface OverviewBreakdownRow {
  name: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
}

interface OverviewItem {
  id: string;
  label: string;
  detail: string;
  /** One-sentence read of what the number means, so the row answers "so what?". */
  insight: string;
  /** The numbers behind the headline — which rows, what they are worth, how far off. */
  breakdown?: OverviewBreakdownRow[];
  meta?: string;
  tone?: OverviewTone;
  /** Next-best-action label. Clicking hands `agentPrompt` to the Agentforce panel. */
  cta: string;
  /** Question the Agentforce panel opens with for this row. */
  agentPrompt: string;
  focusParams?: FocusGridParams;
}

interface OverviewSection {
  id: string;
  title: string;
  items: OverviewItem[];
}

const OVERVIEW_SECTIONS: OverviewSection[] = [
  {
    id: 'look-first',
    title: 'Where to focus',
    items: [
      {
        id: 'look-bottom3',
        label: 'Bottom 3 categories by Q2 revenue',
        detail: 'Michigan + Ohio · Chassis, Interior, Electronics',
        insight: 'These three carry 78% of the Q2 shortfall — the fastest place to recover plan.',
        breakdown: [
          { name: '1. Chassis', value: '$4.1M vs $5.2M', delta: '−$1.1M', trend: 'down' },
          { name: '2. Interior', value: '$2.8M vs $3.5M', delta: '−$0.7M', trend: 'down' },
          { name: '3. Electronics', value: '$3.6M vs $4.1M', delta: '−$0.5M', trend: 'down' },
        ],
        meta: '−$2.3M',
        tone: 'critical',
        cta: 'Analyse root cause',
        agentPrompt: 'Which 3 categories are furthest behind on Q2 revenue, and why?',
        focusParams: {
          startPeriod: 'apr2026',
          endPeriod: 'jun2026',
          bottomNColumnFilter: {
            n: 3,
            dimension: 'category',
            measureId: 'measure-revenue',
            columnKey: 'q2',
            operator: 'bottomN',
          },
          expandLevel: 'categories',
          sort: { dimension: 'category', measureId: 'measure-revenue', direction: 'asc' },
        },
      },
      {
        id: 'look-movers',
        label: 'Top movers this week',
        detail: 'Chassis Components +18% · Interior −9%',
        insight: 'Both swings came from manual edits rather than actuals — worth a sanity check before lock.',
        breakdown: [
          { name: 'Chassis Components', value: '$4.4M → $5.2M', delta: '+18.2%', trend: 'up' },
          { name: 'Interior Systems', value: '$3.1M → $2.8M', delta: '−9.4%', trend: 'down' },
          { name: 'Powertrain', value: '$4.2M → $4.4M', delta: '+4.1%', trend: 'up' },
        ],
        cta: 'Explain these swings',
        agentPrompt: 'What moved most this week on the plan, and was it actuals or manual edits?',
        focusParams: {
          searchTerm: 'Chassis',
          startPeriod: 'mar2026',
          endPeriod: 'may2026',
          bottomNColumnFilter: {
            n: 5,
            dimension: 'category',
            measureId: 'measure-revenue',
            columnKey: 'mar2026',
            operator: 'topN',
          },
        },
      },
      {
        id: 'look-variance',
        label: 'Highest variance vs plan',
        detail: 'Forecasted vs Sales Agreement Quantity · Powertrain · Michigan Plant',
        insight: 'Widest single gap in the plan, and it has grown each of the last three cycles.',
        breakdown: [
          { name: 'Apr · forecast vs agreed', value: '6,950 vs 7,900', delta: '−12.0%', trend: 'down' },
          { name: 'May · forecast vs agreed', value: '6,820 vs 7,930', delta: '−14.0%', trend: 'down' },
          { name: 'Jun · forecast vs agreed', value: '6,700 vs 7,975', delta: '−16.0%', trend: 'down' },
        ],
        meta: '−14%',
        tone: 'critical',
        cta: 'View next best action',
        agentPrompt: 'Why is Powertrain Forecasted Quantity on Michigan Plant 14% under the Sales Agreement for Apr–Jun, and what is the next best action?',
        focusParams: {
          searchTerm: 'Powertrain',
          accounts: ['Michigan Plant'],
          measures: ['Forecasted Quantity (No.s)', 'Sales Agreement Quantity (No.s)'],
          startPeriod: 'apr2026',
          endPeriod: 'jun2026',
        },
      },
    ],
  },
  {
    id: 'stand',
    title: 'Where do I stand?',
    items: [
      {
        id: 'stand-fy26',
        label: 'FY26 Revenue vs Plan',
        detail: '$18.4M of $19.6M · 94%',
        insight: 'Tracking 6% light for the year. Three quarters of the gap sits in H2 Chassis and Interior.',
        breakdown: [
          { name: 'Q1 · actual vs plan', value: '$4.8M vs $4.7M', delta: '+2.1%', trend: 'up' },
          { name: 'Q2 · actual vs plan', value: '$4.2M vs $4.9M', delta: '−14.3%', trend: 'down' },
          { name: 'H2 · forecast vs plan', value: '$9.4M vs $10.0M', delta: '−6.0%', trend: 'down' },
        ],
        meta: '−$1.2M',
        tone: 'warning',
        cta: 'Analyse the gap',
        agentPrompt: 'Why is FY26 revenue $1.2M behind plan, and where is the gap concentrated?',
        focusParams: {
          measures: ['Revenue'],
          startPeriod: 'jan2026',
          endPeriod: 'dec2026',
          timeGranularities: ['year', 'quarter'],
        },
      },
      {
        id: 'stand-q2-sa',
        label: 'Q2 vs Sales Agreement',
        detail: 'Michigan Plant · Quantity',
        insight: 'Committed volume is under-served for a second quarter — 41K units short of the signed agreement.',
        breakdown: [
          { name: 'Apr · forecast vs agreed', value: '152K vs 164K', delta: '−7.3%', trend: 'down' },
          { name: 'May · forecast vs agreed', value: '148K vs 162K', delta: '−8.6%', trend: 'down' },
          { name: 'Jun · forecast vs agreed', value: '158K vs 173K', delta: '−8.7%', trend: 'down' },
        ],
        meta: '−8.2%',
        tone: 'critical',
        cta: 'Diagnose the shortfall',
        agentPrompt: 'Why is Michigan Plant Q2 quantity 8.2% under the committed sales agreement?',
        focusParams: {
          searchTerm: 'Michigan',
          measures: ['Sales Agreement Quantity'],
          startPeriod: 'apr2026',
          endPeriod: 'jun2026',
        },
      },
      {
        id: 'stand-opp',
        label: 'Opportunity Quantity vs Target',
        detail: 'MagnaDrive · All plants',
        insight: 'Ahead of target on pipeline volume, carried by Texas and California. No action needed yet.',
        breakdown: [
          { name: 'Texas Plant', value: '96.4K', delta: '+5.1%', trend: 'up' },
          { name: 'California Plant', value: '78.2K', delta: '+3.4%', trend: 'up' },
          { name: 'Michigan Plant', value: '112.6K', delta: '−1.2%', trend: 'down' },
        ],
        meta: '+2.1%',
        tone: 'positive',
        cta: 'View top contributors',
        agentPrompt: 'Which accounts are driving Opportunity Quantity above target?',
        focusParams: {
          measures: ['Opportunity Quantity'],
          startPeriod: 'jan2026',
          endPeriod: 'jun2026',
        },
      },
    ],
  },
  {
    id: 'changed',
    title: 'What changed since I last looked?',
    items: [
      {
        id: 'chg-priya',
        label: 'Priya Nair raised SA Quantity · Mar',
        detail: 'Michigan Plant · Chassis Components · +12%',
        insight: '4 cells edited, note left: “OEM confirmed the March pull-in.” Rolled up to the plant total.',
        breakdown: [
          { name: 'Chassis Components · Mar', value: '21.4K → 24.0K', delta: '+12.1%', trend: 'up' },
          { name: 'Chassis Product 1 · Mar', value: '11.2K → 12.5K', delta: '+11.6%', trend: 'up' },
          { name: 'Michigan Plant total', value: '84.1K → 86.7K', delta: '+3.1%', trend: 'up' },
        ],
        meta: '2h ago',
        tone: 'neutral',
        cta: 'Summarise the edits',
        agentPrompt: 'Summarise the March Chassis Components edits on Michigan Plant and their impact.',
        focusParams: {
          searchTerm: 'Chassis',
          accounts: ['Michigan Plant'],
          startPeriod: 'mar2026',
          endPeriod: 'mar2026',
        },
      },
      {
        id: 'chg-jordan',
        label: 'Jordan Blake locked Chassis · Feb',
        detail: 'Ohio Plant · Revenue forecast locked',
        insight: 'February is now read-only for this branch. Later edits will need an unlock request.',
        breakdown: [
          { name: 'Feb Revenue locked at', value: '$1.42M', delta: 'Final', trend: 'flat' },
          { name: 'Cells locked', value: '36', delta: 'Read-only', trend: 'flat' },
          { name: 'Unlock requests', value: '0', delta: 'None', trend: 'flat' },
        ],
        meta: 'Yesterday',
        tone: 'neutral',
        cta: 'Review what changed',
        agentPrompt: 'What changed on Ohio Plant Chassis before February was locked?',
        focusParams: {
          searchTerm: 'Chassis',
          accounts: ['Ohio Plant'],
          startPeriod: 'feb2026',
          endPeriod: 'feb2026',
        },
      },
      {
        id: 'chg-recalc',
        label: 'Roll-up recalculated after Ohio edit',
        detail: 'Opportunity Revenue · Plant → Account',
        insight: '18 impacted cells above the edited row. MagnaDrive account total moved by $340K.',
        breakdown: [
          { name: 'Ohio Plant', value: '$2.14M → $2.48M', delta: '+$340K', trend: 'up' },
          { name: 'MagnaDrive account', value: '$10.02M → $10.36M', delta: '+3.4%', trend: 'up' },
          { name: 'Impacted cells', value: '18', delta: 'Recalc', trend: 'flat' },
        ],
        meta: '4h ago',
        tone: 'neutral',
        cta: 'Trace the impact',
        agentPrompt: 'Which totals moved when the Ohio Plant Opportunity Revenue edit rolled up?',
        focusParams: {
          measures: ['Opportunity Revenue'],
          accounts: ['Ohio Plant'],
          startPeriod: 'jan2026',
          endPeriod: 'jun2026',
        },
      },
    ],
  },
  {
    id: 'needs-me',
    title: 'What needs me?',
    items: [
      {
        id: 'need-approve',
        label: 'Approve Q1 Forecast',
        detail: 'Sales Agreement Quantity · Jan–Mar · from Priya Nair',
        insight: 'Past the 5-day SLA. Q1 cannot be locked until you approve or reject the submitted change.',
        breakdown: [
          { name: 'Jan · submitted', value: '8,250 → 8,690', delta: '+5.3%', trend: 'up' },
          { name: 'Feb · submitted', value: '8,269 → 8,700', delta: '+5.2%', trend: 'up' },
          { name: 'Mar · submitted', value: '8,154 → 8,600', delta: '+5.5%', trend: 'up' },
        ],
        meta: '7 days overdue',
        tone: 'critical',
        cta: 'View next best action',
        agentPrompt: 'Brief me on the Q1 Sales Agreement Quantity approval waiting on me — what is the next best action?',
        focusParams: {
          searchTerm: 'Sales Agreement',
          startPeriod: 'jan2026',
          endPeriod: 'mar2026',
        },
      },
      {
        id: 'need-q2',
        label: 'Q2 at risk — 3 categories behind plan',
        detail: 'Michigan + Ohio · $2.3M gap',
        insight: 'Closing the gap needs roughly +6% on Chassis or a reallocation from Texas before Mar 19.',
        breakdown: [
          { name: 'Chassis · Q2', value: '$4.1M vs $5.2M', delta: '−$1.1M', trend: 'down' },
          { name: 'Interior · Q2', value: '$2.8M vs $3.5M', delta: '−$0.7M', trend: 'down' },
          { name: 'Electronics · Q2', value: '$3.6M vs $4.1M', delta: '−$0.5M', trend: 'down' },
        ],
        meta: 'Due in 2 days',
        tone: 'warning',
        cta: 'Recommend a recovery',
        agentPrompt: 'How do I close the $2.3M Q2 gap across Michigan and Ohio?',
        focusParams: {
          startPeriod: 'apr2026',
          endPeriod: 'jun2026',
          bottomNCategories: { n: 3, measureId: 'measure-revenue', columnKey: 'q2' },
          expandLevel: 'categories',
        },
      },
      {
        id: 'need-blanks',
        label: '2 blank Mar cells on Georgia Plant',
        detail: 'Opportunity Quantity · Powertrain, Interior',
        insight: 'Blanks roll up as zero, so the plant total reads $210K lighter than it should.',
        breakdown: [
          { name: 'Powertrain · Mar', value: '— blank', delta: '≈6,400', trend: 'flat' },
          { name: 'Interior · Mar', value: '— blank', delta: '≈4,900', trend: 'flat' },
          { name: 'Understated total', value: '$210K', delta: 'Rolls as 0', trend: 'down' },
        ],
        meta: 'Blanks',
        tone: 'warning',
        cta: 'Suggest values',
        agentPrompt: 'What should the blank March Opportunity Quantity cells on Georgia Plant be?',
        focusParams: {
          searchTerm: 'Georgia',
          measures: ['Opportunity Quantity'],
          startPeriod: 'mar2026',
          endPeriod: 'mar2026',
        },
      },
      {
        id: 'need-note',
        label: 'Unresolved note on Transmission · Apr',
        detail: '“Confirm OEM allocation before lock” · Jordan Blake',
        insight: 'Open 3 days, blocking the Apr lock. Needs a reply or a resolution from you.',
        breakdown: [
          { name: 'Transmission · Apr', value: '12,400', delta: 'Unconfirmed', trend: 'flat' },
          { name: 'Cells waiting on the note', value: '4', delta: 'Blocked', trend: 'down' },
          { name: 'Open since', value: 'Mar 14', delta: '3 days', trend: 'flat' },
        ],
        meta: 'Note',
        tone: 'neutral',
        cta: 'Summarise the note',
        agentPrompt: 'What does the open Transmission OEM allocation note need before the April lock?',
        focusParams: {
          searchTerm: 'Transmission',
          startPeriod: 'apr2026',
          endPeriod: 'apr2026',
        },
      },
    ],
  },
];

// ── Plan Brief (Brief tab) ───────────────────────────────────────────────────
// An AI-generated narrative summary of the plan. Each section reads a headline finding, the
// numbers behind it, and offers a "dig deeper" CTA that hands the question to Agentforce.
type BriefDeltaTone = 'up' | 'down' | 'flat';

interface BriefMetric {
  name: string;
  value: string;
  /** Optional right-aligned delta chip (e.g. "32%", "+27%"). */
  delta?: string;
  deltaTone?: BriefDeltaTone;
}

interface BriefSection {
  id: string;
  /** Bold headline finding. */
  title: string;
  /** Small grey label above the body (e.g. "Shape", "Coverage"). */
  label: string;
  body: string;
  metrics: BriefMetric[];
  /** Primary CTA label; clicking hands `agentPrompt` to the Agentforce panel. */
  cta: string;
  agentPrompt: string;
  sourcesCount: number;
}

const BRIEF_META = {
  agent: 'Plan Intelligence Agent',
  timestamp: 'Today at 11:49 PM',
  highlight: '48% of the FY26 forecast is on order — 73,414 units of 154,408, worth $7.34M.',
};

// Sources shown when a section's "Sources (N)" toggle is expanded.
const BRIEF_SOURCES = [
  'Order Quantity · FY26 · all plants',
  'Sales Agreement Quantity · FY26',
  'Opportunity Quantity · FY26',
];

const BRIEF_SECTIONS: BriefSection[] = [
  {
    id: 'brief-coverage',
    title: '60% of the forecast rides on opportunity, not agreements',
    label: 'Coverage',
    body: 'The forecast of 154,408 units and $7.73M is Agreements plus Opportunity. Signed agreements back 61,775 units of it (40%); opportunity that has not converted accounts for 92,633 units (60%). Orders stand at 73,414 units, or 48%.',
    metrics: [
      { name: 'Signed agreements', value: '61,775 units', delta: '40%', deltaTone: 'flat' },
      { name: 'Opportunity', value: '92,633 units', delta: '60%', deltaTone: 'down' },
      { name: 'Ordered so far', value: '73,414 units', delta: '48%', deltaTone: 'up' },
    ],
    cta: 'Show the gap',
    agentPrompt: 'Show the gap between signed agreements, unconverted opportunity, and orders — how much of the forecast is at risk?',
    sourcesCount: 3,
  },
  {
    id: 'brief-exposure',
    title: '$669K of orders sit beyond what is signed',
    label: 'Exposure',
    body: 'Agreements cover $6.67M while orders stand at $7.34M — $669K beyond what is signed. 52% of the forecast — 80,994 units — has not been ordered yet, and Georgia Plant is the thinnest account at $881K.',
    metrics: [
      { name: 'Agreements vs orders', value: '$6.67M vs $7.34M', delta: 'orders +10%', deltaTone: 'flat' },
      { name: 'Opportunity', value: '$9.27M', delta: '60% of forecast', deltaTone: 'down' },
      { name: 'Forecast not yet ordered', value: '80,994 units', delta: '52%', deltaTone: 'down' },
    ],
    cta: 'Show exposure',
    agentPrompt: 'Show the exposure between signed agreements and orders — where are we committed beyond what is signed?',
    sourcesCount: 3,
  },
  {
    id: 'brief-momentum',
    title: 'Up 27% on last year, evenly across all 4 categories',
    label: 'Momentum',
    body: 'Orders are $7.34M against $5.80M last year (+27%), on 73,414 units versus 58,135 units (+26%) — so the value moved with the volume. The move is broad rather than driven by one category: all 4 sit at +27%.',
    metrics: [
      { name: 'Orders vs last year', value: '$7.34M vs $5.80M', delta: '+27%', deltaTone: 'up' },
      { name: 'Units vs last year', value: '73,414 units vs 58,135 units', delta: '+26%', deltaTone: 'up' },
      { name: 'Spread across the 4 categories', value: '+27%', delta: 'no outlier', deltaTone: 'flat' },
    ],
    cta: 'Compare years',
    agentPrompt: 'Compare this year to last year by category — where is the +27% coming from?',
    sourcesCount: 3,
  },
  {
    id: 'brief-shape',
    title: 'No category carries more than 32% of the plan',
    label: 'Shape',
    body: 'Orders to date are 73,414 units and $7.34M across 6 accounts and 4 categories. Transmission Assembly and Engine Components are the two largest, at 59% together, and Michigan Plant is the largest account at 22%. The plan averages $100 a unit.',
    metrics: [
      { name: 'Ordered to date', value: '73,414 units and $7.34M' },
      { name: 'Largest of the 4 categories', value: '$2.35M', delta: '32%', deltaTone: 'flat' },
      { name: 'Michigan Plant', value: '$1.64M', delta: '22%', deltaTone: 'up' },
    ],
    cta: 'Break it down',
    agentPrompt: 'Break down the plan by category and account — which segments carry the most of the 73,414 ordered units?',
    sourcesCount: 3,
  },
];

// ── Top 5 & bottom 5 (SKU ranking) card ─────────────────────────────────────────
interface SkuRankRow {
  code: string;
  revenue: string;
  program: string;
  qty: string;
  reason: string;
}

interface SkuRankGroup {
  title: string;
  method: string;
  low?: boolean;
  rows: SkuRankRow[];
}

const SKU_RANK_META = {
  headline:
    'The top five product rows carry 4% of order revenue on 4% of the units, the bottom five 1% on 1% — value tracks volume closely here, so the spread is size: the largest is 5.9× the smallest.',
  collapsedDims: 'Ranked across all 222 product rows by FY26 order revenue',
  cta: 'What to do about these',
  agentPrompt: 'What should I do about the top 5 and bottom 5 product rows by FY26 order revenue?',
  sourcesCount: 3,
};

const SKU_RANK_GROUPS: SkuRankGroup[] = [
  {
    title: 'Top 5',
    method:
      'Highest 5 of 222 product rows by FY26 order revenue — 4% of value, 4% of units. This grid carries no target measure, so the forecast is the plan number here.',
    rows: [
      { code: 'TRN 850 - A', revenue: '$67.6K', program: 'Michigan Plant · Transmission Assembly', qty: '681 units', reason: 'Biggest of the 9 Transmission Assembly rows, at $99 a unit.' },
      { code: 'TRN 750 - A', revenue: '$66.1K', program: 'Michigan Plant · Transmission Assembly', qty: '670 units', reason: '2nd of the 9 Transmission Assembly rows, at $99 a unit.' },
      { code: 'TRN 750 - B', revenue: '$62.7K', program: 'Michigan Plant · Transmission Assembly', qty: '625 units', reason: '3rd of the 9 Transmission Assembly rows, at $100 a unit.' },
      { code: 'TRN 850 - B', revenue: '$61.6K', program: 'Michigan Plant · Transmission Assembly', qty: '622 units', reason: '4th of the 9 Transmission Assembly rows, at $99 a unit.' },
      { code: 'TRN 750 - A', revenue: '$60.1K', program: 'Texas Plant · Transmission Assembly', qty: '595 units', reason: 'Biggest of the 9 Transmission Assembly rows, at $101 a unit.' },
    ],
  },
  {
    title: 'Bottom 5',
    method: 'Lowest 5 of the same 222 — 1% of value, 1% of units.',
    low: true,
    rows: [
      { code: 'O2 Sensor - Downstream', revenue: '$11.6K', program: 'Georgia Plant · Electrical Systems', qty: '120 units', reason: 'Smallest of the 9 Electrical Systems rows, at $96 a unit.' },
      { code: 'O2 Sensor - Upstream', revenue: '$13.1K', program: 'Georgia Plant · Electrical Systems', qty: '132 units', reason: '8th of the 9 Electrical Systems rows, at $99 a unit.' },
      { code: 'O2 Sensor - Downstream', revenue: '$13.2K', program: 'Illinois Plant · Electrical Systems', qty: '132 units', reason: 'Smallest of the 9 Electrical Systems rows, at $100 a unit.' },
      { code: 'O2 Sensor - Downstream', revenue: '$14.0K', program: 'California Plant · Electrical Systems', qty: '144 units', reason: 'Smallest of the 9 Electrical Systems rows, at $97 a unit.' },
      { code: 'Wiring Harness - Auxiliary', revenue: '$14.3K', program: 'Georgia Plant · Electrical Systems', qty: '144 units', reason: '7th of the 9 Electrical Systems rows, at $100 a unit.' },
    ],
  },
];

// ── Props ──────────────────────────────────────────────────────────────────────
interface AlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  approvalRequests?: Map<string, ApprovalRequest>;
  editHistory?: CellEditHistoryEntry[];
  data?: MeasureData[];
  onJumpToCell?: (cellKey: string) => void;
  onViewCellHistory?: (cellKey: string) => void;
  onFocusGrid?: (params: FocusGridParams | null) => void;
  /** Opens the Agentforce panel seeded with an Overview row's question. */
  onAskAgentforce?: (prompt: string) => void;
  /** Injected when arriving from a header-bell approval notification — rendered as a
   *  pinned "Review approval request from <requester>" card, auto-focused. */
  reviewApprovalCard?: {
    id: string;
    requesterName: string;
    summary?: string;
    focusParams: FocusGridParams;
    /** Optional logical sub-sections (measure · branch · contiguous months). When
     *  present, each renders its own "Focus grid" button beneath a "Focus all". */
    chunks?: Array<{ id: string; label: string; focusParams: FocusGridParams }>;
  } | null;
  onDismissReviewApprovalCard?: () => void;
  /** Arc 5 — the Next-Best-Action Agent alert, surfaced at the top of Alerts after a save.
   *  Provides a "View recommendations" CTA that opens the Agentforce panel. */
  nextBestActionAlert?: {
    title: string;
    summary: string;
    detail?: string;
    focusParams: FocusGridParams;
    onViewRecommendations: () => void;
  } | null;
}

// ── FocusGrid toggle button ───────────────────────────────────────────────────
const FocusToggleBtn: React.FC<{
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}> = ({ active, disabled, onClick }) => (
  <button
    className={`alerts-focus-btn ${active ? 'alerts-focus-btn--active' : ''}`}
    disabled={disabled}
    onClick={onClick}
    title={active ? 'Remove grid focus' : 'Focus grid on this item'}
  >
    {/* Target / crosshair icon */}
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
    </svg>
    {active ? 'Focused' : 'Focus grid'}
  </button>
);

// ── Component ──────────────────────────────────────────────────────────────────
const AlertsPanel: React.FC<AlertsPanelProps> = ({
  isOpen,
  onClose,
  approvalRequests = new Map(),
  editHistory = [],
  data = [],
  onJumpToCell: _onJumpToCell,
  onViewCellHistory,
  onFocusGrid,
  onAskAgentforce,
  reviewApprovalCard = null,
  onDismissReviewApprovalCard,
  nextBestActionAlert = null,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('brief');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const [showApprovals, setShowApprovals] = useState(true);
  const [showNotifications, setShowNotifications] = useState(true);
  // Local decision state for deadline-based approval-request cards (mock; no backend).
  const [resolvedDeadlineApprovals, setResolvedDeadlineApprovals] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [draftShowTasks, setDraftShowTasks] = useState(true);
  const [draftShowApprovals, setDraftShowApprovals] = useState(true);
  const [draftShowNotifications, setDraftShowNotifications] = useState(true);
  const [expandedOverviewIds, setExpandedOverviewIds] = useState<Set<string>>(
    () => new Set(OVERVIEW_SECTIONS.map(s => s.id))
  );
  // Each item card inside a section discloses its own insight / breakdown / CTA.
  const [expandedOverviewItemIds, setExpandedOverviewItemIds] = useState<Set<string>>(new Set());
  // ── Brief tab state ──────────────────────────────────────────────────────
  const [briefOpen, setBriefOpen] = useState(true);
  // The "Top 5 & bottom 5" ranking card starts collapsed, matching the source.
  const [skuRankOpen, setSkuRankOpen] = useState(false);
  const [skuRankBy, setSkuRankBy] = useState('product');
  const [briefSourcesOpen, setBriefSourcesOpen] = useState<Set<string>>(new Set());
  const [briefFeedback, setBriefFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const toggleBriefSources = (id: string) =>
    setBriefSourcesOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const setSectionFeedback = (id: string, v: 'up' | 'down') =>
    setBriefFeedback(prev => ({ ...prev, [id]: prev[id] === v ? undefined as unknown as 'up' : v }));
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const handleFocusToggle = (cardId: string, params: FocusGridParams) => {
    if (focusedCardId === cardId) {
      // Toggle off
      setFocusedCardId(null);
      onFocusGrid?.(null);
    } else {
      setFocusedCardId(cardId);
      onFocusGrid?.(params);
    }
  };

  const toggleOverviewSection = (id: string) => {
    setExpandedOverviewIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOverviewItem = (id: string) => {
    setExpandedOverviewItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // When a review-approval card is injected (arriving from a bell notification),
  // show its first section as already "Focused" — the grid focus is applied by the
  // parent on navigation. Falls back to the card id when there are no sections.
  useEffect(() => {
    if (reviewApprovalCard) {
      const firstChunk = reviewApprovalCard.chunks?.[0];
      setFocusedCardId(
        firstChunk ? `${reviewApprovalCard.id}::${firstChunk.id}` : reviewApprovalCard.id
      );
    }
  }, [reviewApprovalCard?.id]);

  // ── Deadline tasks ─────────────────────────────────────────────────────────
  const deadlineTasks = useMemo(() => MOCK_DEADLINES, []);

  // ── Pending-approval SLA tasks ─────────────────────────────────────────────
  const approvalSlaTasks = useMemo(() => {
    const tasks: Array<{
      id: string;
      cellKey: string;
      daysOverdue: number;
      daysRemaining: number;
      approval: ApprovalRequest;
    }> = [];
    approvalRequests.forEach((req, cellKey) => {
      if (req.status === 'pending') {
        const age = diffDays(new Date(req.createdAt), TODAY);
        const daysRemaining = SLA_DAYS - age;
        tasks.push({ id: `sla-${cellKey}`, cellKey, daysOverdue: Math.max(0, -daysRemaining), daysRemaining, approval: req });
      }
    });
    return tasks.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [approvalRequests]);

  // ── Approval notifications ─────────────────────────────────────────────────
  const approvalNotifications = useMemo(() => {
    const APPROVAL_LABELS = ['Not Submitted', 'Pending', 'Approved', 'Rejected'];
    return editHistory
      .filter(e => {
        if (!e.note) return false;
        return APPROVAL_LABELS.some(l => e.note!.startsWith(`${l} →`)) ||
               e.note.includes('→ Approved') || e.note.includes('→ Rejected') ||
               e.note.includes('Finance:') || e.note.includes('Supply Chain:') ||
               e.note.includes('Sales Ops:') || e.note.includes('Product Management:');
      })
      .slice(0, 10)
      .map(e => ({ ...e, notifId: `notif-${e.id}` }));
  }, [editHistory]);

  // ── SLA progress ───────────────────────────────────────────────────────────
  const forecastLockSla = useMemo(() => {
    let total = 0, filled = 0;
    const months = ['jan2026','feb2026','mar2026','apr2026','may2026','jun2026'] as const;
    const walk = (rows: any[]) => {
      rows.forEach(row => {
        if (!row.children || row.children.length === 0) {
          months.forEach(m => {
            total++;
            const v = row[m];
            if (typeof v === 'number' && v > 0) filled++;
          });
        }
        if (row.children) walk(row.children);
      });
    };
    data.forEach(measure => walk(measure.children ?? []));
    return { total: Math.max(1, total), filled };
  }, [data]);

  const approvalSlaProgress = useMemo(() => {
    let total = 0, done = 0;
    approvalRequests.forEach(req => {
      total++;
      if (req.status === 'approved' || req.status === 'rejected') done++;
    });
    return { total: Math.max(1, total), done };
  }, [approvalRequests]);

  const dismiss = (id: string) => setDismissedIds(prev => new Set([...prev, id]));

  // ── Alert / Task partitions ────────────────────────────────────────────────
  const alertDeadlines = deadlineTasks.filter(t => t.category === 'alert');
  const taskDeadlines = deadlineTasks.filter(t => (t.category ?? 'task') === 'task');
  const unreadNotifCount = approvalNotifications.filter(n => !dismissedIds.has(n.notifId)).length;

  // ── Tab badge counts ───────────────────────────────────────────────────────
  // Notifications (approval status updates) surface under Alerts; approvals + the injected
  // review-approval card are actionable Tasks. Overview is a separate summarisation surface.
  const alertsBadge = alertDeadlines.length + unreadNotifCount + (nextBestActionAlert ? 1 : 0);
  const tasksBadge = taskDeadlines.length + approvalSlaTasks.length + (reviewApprovalCard ? 1 : 0);

  // ── Filter helpers ─────────────────────────────────────────────────────────
  const showAlertsGroup = activeTab === 'alerts';
  // Tasks no longer have their own tab — their cards (approvals, deadlines, SLA tracker) now render
  // inside the Alerts tab alongside the alerts.
  const showTasksGroup = activeTab === 'alerts';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isFilterPopoverOpen &&
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(event.target as Node) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target as Node)
      ) {
        setIsFilterPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterPopoverOpen]);

  // ── Urgency helpers ────────────────────────────────────────────────────────
  const deadlineUrgency = (days: number) => days > 0 ? 'overdue' : days > -3 ? 'urgent' : 'upcoming';

  if (!isOpen) return null;

  // Approvals are all Tasks; the Tasks-group gate controls whether they render.
  const visibleApprovalSlaCards = approvalSlaTasks;
  const contextualPendingCards = visibleApprovalSlaCards.filter(t =>
    Boolean(t.approval.focusContext?.selectedCellKeys?.length)
  );
  const prioritizedCard = contextualPendingCards.sort(
    (a, b) => new Date(b.approval.createdAt).getTime() - new Date(a.approval.createdAt).getTime()
  )[0] ?? null;
  const pinnedApprovalCard = prioritizedCard ?? visibleApprovalSlaCards[0] ?? null;
  const remainingApprovalSlaCards = visibleApprovalSlaCards.filter(t => t.id !== pinnedApprovalCard?.id);

  // Whether any card is focused — used to dim all others
  const anyFocused = focusedCardId !== null;

  // Shared renderer for a deadline card (used by both the Alerts and Tasks sections).
  /** Sparkle link that hands a card's question to the Agentforce panel. */
  const askAgentBtn = (prompt: string, label = 'Ask Agentforce') =>
    onAskAgentforce ? (
      <button
        type="button"
        className="alerts-ask-agent-btn"
        onClick={() => onAskAgentforce(prompt)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
          <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
        </svg>
        {label}
      </button>
    ) : null;

  const renderDeadlineCard = (task: DeadlineTask) => {
    const days = diffDays(task.dueDate, TODAY);
    const urgency = deadlineUrgency(days);
    const isFocused = focusedCardId === task.id;
    const isDimmed = anyFocused && !isFocused;

    // Build focus params - special handling for intent-based filtering task.
    // dl-5 ("Q2 at Risk – 3 Categories Behind Plan"): surface the Q2 quarter column and
    // apply a column-level Bottom-3 filter on the category dimension (by Q2 revenue) so the
    // "3 categories behind" are explicitly the 3 worst-performing categories.
    const focusParams: FocusGridParams = task.id === 'dl-5'
      ? {
          accounts: ['MagnaDrive - Michigan Plant', 'MagnaDrive - Ohio Plant'],
          measures: ['Sales Agreement Revenue'],
          startPeriod: task.startPeriod,
          endPeriod: task.endPeriod,
          timeGranularities: ['month', 'quarter'],
          bottomNCategories: { n: 3, measureId: 'measure-sa-rev', columnKey: 'q2' },
          // Show accounts → categories only (categories collapsed) so the "3 categories
          // behind" read clearly against the card without drilling into products.
          expandLevel: 'categories',
        }
      : {
          searchTerm: task.searchTerm,
          startPeriod: task.startPeriod,
          endPeriod: task.endPeriod,
        };

    const isApproval = task.type === 'approve';
    const decision = resolvedDeadlineApprovals[task.id];

    return (
      <div
        key={task.id}
        className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
      >
        {/* Card header row */}
        <div className="alerts-card-header">
          <div className="alerts-card-header-left">
            <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
            <span className="alerts-card-title">{task.title}</span>
          </div>
          <span className={`alerts-type-badge alerts-type-badge--${task.type}`}>
            {task.type === 'submit' ? 'Submit' : task.type === 'approve' ? 'Approval' : 'Review'}
          </span>
        </div>

        {/* Sub / context */}
        <div className="alerts-card-sub">
          {isApproval && task.requesterName ? `Requested by ${task.requesterName} · ` : ''}
          {task.description}
        </div>

        {/* Status / deadline chip */}
        <div className="alerts-card-meta">
          {isApproval && decision ? (
            decision === 'approved'
              ? <span className="alerts-chip alerts-chip--green">✓ Approved</span>
              : <span className="alerts-chip alerts-chip--red">✗ Rejected</span>
          ) : days > 0
            ? <span className="alerts-chip alerts-chip--red">⏱ {days} day{days !== 1 ? 's' : ''} overdue · was due {formatDate(task.dueDate)}</span>
            : days === 0
              ? <span className="alerts-chip alerts-chip--amber">⏱ Due today</span>
              : <span className="alerts-chip alerts-chip--amber">⏱ Due in {-days} day{-days !== 1 ? 's' : ''} ({formatDate(task.dueDate)})</span>
          }
        </div>

        {/* Actions: approve/reject for approval requests, plus grid focus */}
        <div className="alerts-card-actions">
          {isApproval && !decision && (
            <>
              <button
                className="alerts-approve-btn"
                onClick={() => setResolvedDeadlineApprovals(prev => ({ ...prev, [task.id]: 'approved' }))}
              >
                Approve
              </button>
              <button
                className="alerts-reject-btn"
                onClick={() => setResolvedDeadlineApprovals(prev => ({ ...prev, [task.id]: 'rejected' }))}
              >
                Reject
              </button>
            </>
          )}
          {onFocusGrid && (
            <FocusToggleBtn
              active={isFocused}
              disabled={isDimmed}
              onClick={() => handleFocusToggle(task.id, focusParams)}
            />
          )}
          {askAgentBtn(
            `Brief me on "${task.title}" — what is driving it and what should I do before the ${formatDate(task.dueDate)} deadline?`
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="alerts-panel">
      {/* Header */}
      <div className="alerts-panel-header">
        <div className="alerts-panel-header-left">
          <svg fill="currentColor" viewBox="0 0 520 520" width="16" height="16" className="alerts-panel-header-icon" aria-hidden>
            <path d="M181 90c11 1 21 8 24 21l54 220 71-158c5-10 14-16 25-16h4c8 2 16 8 20 16l1 2 37 86h63c11 0 20 9 20 20v14c0 11-9 20-20 20h-80c-11 0-20-6-25-16l-20-47-78 173v1c-6 8-14 14-26 14-4 0-8-1-13-4l-9-8-5-11-52-217-42 97c-4 11-14 17-24 17H40c-11 0-20-8-20-19v-15c0-11 9-20 20-20h47l66-154c5-10 16-17 28-16"/>
          </svg>
          <span className="alerts-panel-title">Status</span>
        </div>
        <div className="alerts-panel-header-right">
          <div className="alerts-filter-wrapper">
            <button
              ref={filterButtonRef}
              className={`alerts-filter-btn ${isFilterPopoverOpen ? 'active' : ''}`}
              onClick={() => {
                setDraftShowTasks(showTasks);
                setDraftShowApprovals(showApprovals);
                setDraftShowNotifications(showNotifications);
                setIsFilterPopoverOpen(prev => !prev);
              }}
              aria-label="Filter alerts"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5h18" />
                <path d="M6 12h12" />
                <path d="M10 19h4" />
              </svg>
            </button>
            {isFilterPopoverOpen && (
              <div ref={filterPopoverRef} className="alerts-filter-popover">
                <div className="alerts-filter-popover-nubbin"></div>
                <div className="alerts-filter-popover-content">
                  <div className="alerts-filter-field">
                    <label>Card types</label>
                    <div className="alerts-filter-checkbox-row">
                      <label><input type="checkbox" checked={draftShowTasks} onChange={(e) => setDraftShowTasks(e.target.checked)} /> Tasks</label>
                      <label><input type="checkbox" checked={draftShowApprovals} onChange={(e) => setDraftShowApprovals(e.target.checked)} /> Approvals</label>
                      <label><input type="checkbox" checked={draftShowNotifications} onChange={(e) => setDraftShowNotifications(e.target.checked)} /> Notifications</label>
                    </div>
                  </div>
                  <div className="alerts-filter-actions">
                    <button
                      className="alerts-filter-clear-btn"
                      onClick={() => {
                        setDraftShowTasks(true);
                        setDraftShowApprovals(true);
                        setDraftShowNotifications(true);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      className="alerts-filter-apply-btn"
                      onClick={() => {
                        setShowTasks(draftShowTasks);
                        setShowApprovals(draftShowApprovals);
                        setShowNotifications(draftShowNotifications);
                        setIsFilterPopoverOpen(false);
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        <button className="alerts-panel-close" onClick={onClose} aria-label="Close">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="alerts-panel-tabs">
        {(['brief', 'all', 'alerts'] as TabType[]).map(tab => (
          <button
            key={tab}
            className={`alerts-panel-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' ? 'Overview' : tab === 'alerts' ? 'Alerts' : 'Brief'}
            {tab === 'alerts' && alertsBadge + tasksBadge > 0 && <span className="alerts-tab-badge alerts-tab-badge--red">{alertsBadge + tasksBadge}</span>}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="alerts-panel-body">

        {/* ── OVERVIEW ──────────────────────────────────────────── */}
        {activeTab === 'all' && (
          <div className="alerts-overview">
            {OVERVIEW_SECTIONS.map(section => {
              const isExpanded = expandedOverviewIds.has(section.id);
              return (
                <div key={section.id} className="alerts-overview-card">
                  <button
                    type="button"
                    className="alerts-overview-card-header"
                    onClick={() => toggleOverviewSection(section.id)}
                    aria-expanded={isExpanded}
                  >
                    <svg
                      className={`alerts-overview-card-chevron${isExpanded ? ' open' : ''}`}
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="alerts-overview-card-title">{section.title}</span>
                  </button>
                  {isExpanded && (
                    <div className="alerts-overview-card-body">
                      <ul className="alerts-overview-list">
                        {section.items.map(item => {
                          const isItemOpen = expandedOverviewItemIds.has(item.id);
                          return (
                          <li key={item.id} className={`alerts-overview-item${isItemOpen ? ' alerts-overview-item--open' : ''}`}>
                            <button
                              type="button"
                              className="alerts-overview-item-main"
                              onClick={() => toggleOverviewItem(item.id)}
                              aria-expanded={isItemOpen}
                            >
                              <svg
                                className={`alerts-overview-item-chevron${isItemOpen ? ' open' : ''}`}
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                aria-hidden
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              <div className="alerts-overview-item-text">
                                <span className="alerts-overview-item-label">{item.label}</span>
                                <span className="alerts-overview-item-detail">{item.detail}</span>
                              </div>
                              {item.meta && (
                                <span className={`alerts-chip alerts-chip--${
                                  item.tone === 'critical' ? 'red'
                                    : item.tone === 'warning' ? 'amber'
                                      : item.tone === 'positive' ? 'green'
                                        : 'grey'
                                }`}>
                                  {item.meta}
                                </span>
                              )}
                            </button>

                            {isItemOpen && (
                              <div className="alerts-overview-item-body">
                                <p className="alerts-overview-item-insight">{item.insight}</p>

                                {item.breakdown && (
                                  <div className="alerts-overview-breakdown">
                                    {item.breakdown.map(row => (
                                      <div key={row.name} className="alerts-overview-breakdown-row">
                                        <span className="alerts-overview-breakdown-name">{row.name}</span>
                                        <span className="alerts-overview-breakdown-value">{row.value}</span>
                                        {row.delta && (
                                          <span className={`alerts-overview-breakdown-delta alerts-overview-breakdown-delta--${row.trend ?? 'flat'}`}>
                                            {row.delta}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="alerts-overview-item-actions">
                                  <button
                                    type="button"
                                    className="alerts-overview-cta"
                                    onClick={() => onAskAgentforce?.(item.agentPrompt)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                                      <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
                                    </svg>
                                    {item.cta}
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── BRIEF (AI-generated plan narrative) ───────────────── */}
        {activeTab === 'brief' && (
          <div className="alerts-brief">
            {/* ── Plan Brief card (exact copy of @cpm/status-panel .plan-brief) ── */}
            <div className="plan-brief" role="region" aria-label="Plan Brief">
              <div className="plan-brief-header">
                <button
                  type="button"
                  className="plan-brief-collapse"
                  aria-expanded={briefOpen}
                  onClick={() => setBriefOpen(o => !o)}
                >
                  <svg className={`plan-brief-collapse-chevron${briefOpen ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <h2 className="plan-brief-title">Plan Brief</h2>
                </button>
                <button type="button" className="plan-brief-icon-btn" aria-label="Plan Brief actions">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
              </div>

              {briefOpen && (
                <>
                  <div className="plan-brief-badge-row">
                    <span className="plan-brief-ai-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                        <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
                      </svg>
                      This content is AI generated
                    </span>
                    <button type="button" className="plan-brief-info-btn" aria-label="About AI generated content">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4.6a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zm1.3 10.9h-2.6v-6h2.6v6z" />
                      </svg>
                    </button>
                  </div>

                  <div className="plan-brief-timestamp">
                    <span>{BRIEF_META.agent} · {BRIEF_META.timestamp}</span>
                    <button type="button" className="plan-brief-refresh-btn" aria-label="Regenerate brief">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M20 11a8 8 0 10-2.7 6" /><polyline points="20 4 20 11 13 11" />
                      </svg>
                    </button>
                  </div>

                  {/* Highlights (standalone item) */}
                  <div className="plan-brief-item">
                    <div className="plan-brief-item-heading">
                      <h3 className="plan-brief-item-title">Highlights</h3>
                    </div>
                    <p className="plan-brief-item-body">{BRIEF_META.highlight}</p>
                    <div className="plan-brief-divider" />
                  </div>

                  <ul className="plan-brief-items">
                    {BRIEF_SECTIONS.map(section => {
                      const sourcesOpen = briefSourcesOpen.has(section.id);
                      const fb = briefFeedback[section.id];
                      return (
                        <li key={section.id} className="plan-brief-item">
                          <div className="plan-brief-item-heading">
                            <h3 className="plan-brief-item-title">{section.title}</h3>
                            <p className="plan-brief-item-label">{section.label}</p>
                          </div>
                          <p className="plan-brief-item-body">{section.body}</p>

                          <div className="plan-brief-metrics">
                            {section.metrics.map((m, i) => (
                              <div key={i} className="plan-brief-metric-row">
                                <span className="plan-brief-metric-name">{m.name}</span>
                                <span className="plan-brief-metric-value">{m.value}</span>
                                {m.delta && (
                                  <span className={`plan-brief-metric-delta plan-brief-metric-delta--${m.deltaTone ?? 'flat'}`}>{m.delta}</span>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="plan-brief-item-footer">
                            <div className="plan-brief-item-buttons-sources">
                              <div className="plan-brief-item-buttons">
                                <button
                                  type="button"
                                  className="plan-brief-btn plan-brief-btn--brand"
                                  onClick={() => onAskAgentforce?.(section.agentPrompt)}
                                >
                                  {section.cta}
                                </button>
                              </div>
                              <button
                                type="button"
                                className="plan-brief-sources-toggle"
                                aria-expanded={sourcesOpen}
                                onClick={() => toggleBriefSources(section.id)}
                              >
                                <svg className={`plan-brief-sources-chevron${sourcesOpen ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                                Sources ({section.sourcesCount})
                              </button>
                              {sourcesOpen && (
                                <ul className="plan-brief-sources">
                                  {BRIEF_SOURCES.map((src, i) => (
                                    <li key={i} className="plan-brief-source">{src}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="plan-brief-feedback">
                              <button
                                type="button"
                                className="plan-brief-icon-btn"
                                aria-label={`Helpful: ${section.label}`}
                                aria-pressed={fb === 'up'}
                                onClick={() => setSectionFeedback(section.id, 'up')}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                  <path d="M9 21h8.3a2 2 0 001.95-1.55l1.7-7.4A1.6 1.6 0 0019.4 10H14l.9-4.3A2.1 2.1 0 0012.85 3a1.3 1.3 0 00-1.2.8L9 10.4V21zM3 10.6h3.4V21H3z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="plan-brief-icon-btn"
                                aria-label={`Not helpful: ${section.label}`}
                                aria-pressed={fb === 'down'}
                                onClick={() => setSectionFeedback(section.id, 'down')}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                  <path d="M15 3H6.7a2 2 0 00-1.95 1.55l-1.7 7.4A1.6 1.6 0 004.6 14H10l-.9 4.3A2.1 2.1 0 0011.15 21a1.3 1.3 0 001.2-.8L15 13.6V3zm2.6 0H21v10.4h-3.4z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="plan-brief-divider" />
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            {/* ── Top 5 & bottom 5 card (exact copy of .plan-brief.sku-rank) ── */}
            <div className="plan-brief sku-rank" role="region" aria-label={`Top 5 & bottom 5, ranked by ${skuRankBy.charAt(0).toUpperCase() + skuRankBy.slice(1)}`}>
              <div className="plan-brief-header">
                <button
                  type="button"
                  className="plan-brief-collapse"
                  aria-expanded={skuRankOpen}
                  onClick={() => setSkuRankOpen(o => !o)}
                >
                  <svg className={`plan-brief-collapse-chevron${skuRankOpen ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <h2 className="plan-brief-title">Top 5 &amp; bottom 5</h2>
                </button>
                <button type="button" className="plan-brief-icon-btn" aria-label="Ranking actions">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
              </div>

              <div className="plan-brief-badge-row">
                <span className="plan-brief-ai-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                    <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
                  </svg>
                  This content is AI generated
                </span>
                <button type="button" className="plan-brief-info-btn" aria-label="About AI generated content">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4.6a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zm1.3 10.9h-2.6v-6h2.6v6z" />
                  </svg>
                </button>
              </div>

              <div className="plan-brief-timestamp">
                <span>{BRIEF_META.agent} · ranked just now</span>
                <button type="button" className="plan-brief-refresh-btn" aria-label="Re-rank">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M20 11a8 8 0 10-2.7 6" /><polyline points="20 4 20 11 13 11" />
                  </svg>
                </button>
              </div>

              <p className="plan-brief-headline">{SKU_RANK_META.headline}</p>

              {skuRankOpen ? (
                <>
                  <div className="sku-rank-input">
                    <div className="sku-rank-field">
                      <label className="sku-rank-field-label" htmlFor="rank-level">Rank by</label>
                      <div className="sku-rank-combobox">
                        <select
                          id="rank-level"
                          className="sku-rank-select"
                          value={skuRankBy}
                          onChange={e => setSkuRankBy(e.target.value)}
                        >
                          <option value="product">Product</option>
                          <option value="category">Category</option>
                          <option value="account">Account</option>
                        </select>
                        <svg className="sku-rank-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                    <button type="button" className="sku-rank-generate">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                        <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
                      </svg>
                      Generate
                    </button>
                  </div>

                  {SKU_RANK_GROUPS.map(group => (
                    <div key={group.title} className="sku-rank-group">
                      <div className="sku-rank-group-head">
                        <h3 className="sku-rank-group-title">{group.title}</h3>
                        <p className="sku-rank-method">{group.method}</p>
                      </div>
                      {group.rows.map((row, i) => (
                        <div key={i} className="sku-rank-row">
                          <span className="sku-rank-code">{row.code}</span>
                          <span className={`sku-rank-revenue${group.low ? ' sku-rank-revenue--low' : ''}`}>{row.revenue}</span>
                          <span className="sku-rank-program">{row.program}</span>
                          <span className="sku-rank-qty">{row.qty}</span>
                          <p className="sku-rank-reason">{row.reason}</p>
                        </div>
                      ))}
                    </div>
                  ))}

                  <div className="plan-brief-item-footer">
                    <div className="plan-brief-item-buttons-sources">
                      <div className="plan-brief-item-buttons">
                        <button
                          type="button"
                          className="plan-brief-btn plan-brief-btn--brand"
                          onClick={() => onAskAgentforce?.(SKU_RANK_META.agentPrompt)}
                        >
                          {SKU_RANK_META.cta}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="plan-brief-sources-toggle"
                        aria-expanded={briefSourcesOpen.has('sku-rank')}
                        onClick={() => toggleBriefSources('sku-rank')}
                      >
                        <svg className={`plan-brief-sources-chevron${briefSourcesOpen.has('sku-rank') ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        Sources ({SKU_RANK_META.sourcesCount})
                      </button>
                      {briefSourcesOpen.has('sku-rank') && (
                        <ul className="plan-brief-sources">
                          {BRIEF_SOURCES.map((src, i) => (
                            <li key={i} className="plan-brief-source">{src}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="plan-brief-feedback">
                      <button
                        type="button"
                        className="plan-brief-icon-btn"
                        aria-label="Helpful: ranking"
                        aria-pressed={briefFeedback['sku-rank'] === 'up'}
                        onClick={() => setSectionFeedback('sku-rank', 'up')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M9 21h8.3a2 2 0 001.95-1.55l1.7-7.4A1.6 1.6 0 0019.4 10H14l.9-4.3A2.1 2.1 0 0012.85 3a1.3 1.3 0 00-1.2.8L9 10.4V21zM3 10.6h3.4V21H3z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="plan-brief-icon-btn"
                        aria-label="Not helpful: ranking"
                        aria-pressed={briefFeedback['sku-rank'] === 'down'}
                        onClick={() => setSectionFeedback('sku-rank', 'down')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M15 3H6.7a2 2 0 00-1.95 1.55l-1.7 7.4A1.6 1.6 0 004.6 14H10l-.9 4.3A2.1 2.1 0 0011.15 21a1.3 1.3 0 001.2-.8L15 13.6V3zm2.6 0H21v10.4h-3.4z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="plan-brief-collapsed-dims">{SKU_RANK_META.collapsedDims}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Injected review-approval card (from a header-bell notification) ── */}
        {showTasksGroup && reviewApprovalCard && (() => {
          const t = reviewApprovalCard;
          const chunks = t.chunks ?? [];
          const hasChunks = chunks.length > 0;
          // The card counts as focused if any of its sections is active, so
          // focusing one section doesn't dim the whole card.
          const isFocused =
            focusedCardId === t.id ||
            (!!focusedCardId && focusedCardId.startsWith(`${t.id}::`));
          const isDimmed = anyFocused && !isFocused;
          return (
            <div
              key={t.id}
              className={`alerts-card alerts-card--urgent${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
            >
              <div className="alerts-card-header">
                <div className="alerts-card-header-left">
                  <span className="alerts-urgency-dot alerts-urgency-dot--urgent"></span>
                  <span className="alerts-card-title">Review approval request from {t.requesterName}</span>
                </div>
                <span className="alerts-type-badge alerts-type-badge--approve">Approval</span>
              </div>

              {t.summary && <div className="alerts-card-sub">{t.summary}</div>}

              <div className="alerts-card-meta">
                <span className="alerts-chip alerts-chip--amber">⏱ Awaiting your decision</span>
                {chunks.length > 1 && (
                  <span className="alerts-chip">{chunks.length} sections</span>
                )}
              </div>

              <div className="alerts-card-actions">
                {onDismissReviewApprovalCard && (
                  <button className="alerts-link-btn" onClick={onDismissReviewApprovalCard}>
                    Dismiss
                  </button>
                )}
                {askAgentBtn(approvalAgentPrompt(t.requesterName, t.summary))}
              </div>

              {onFocusGrid && hasChunks && (
                <div className="alerts-chunk-list">
                  {chunks.map((chunk) => {
                    const chunkId = `${t.id}::${chunk.id}`;
                    return (
                      <div key={chunkId} className="alerts-chunk-row">
                        <span className="alerts-chunk-label">{chunk.label}</span>
                        <FocusToggleBtn
                          active={focusedCardId === chunkId}
                          disabled={false}
                          onClick={() => handleFocusToggle(chunkId, chunk.focusParams)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── ALERTS ────────────────────────────────────────────── */}
        {showAlertsGroup && (nextBestActionAlert || (showTasks && alertDeadlines.length > 0)) && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Alerts
            </div>

            {/* Arc 5 · Next-Best-Action Agent — pinned topmost */}
            {nextBestActionAlert && (() => {
              const cardId = 'arc5-nba';
              const isFocused = focusedCardId === cardId;
              const isDimmed = anyFocused && !isFocused;
              return (
                <div
                  key={cardId}
                  className={`alerts-card alerts-card--urgent alerts-card--agent${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
                >
                  <div className="alerts-card-header">
                    <div className="alerts-card-header-left">
                      <span className="alerts-agent-spark" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                          <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
                        </svg>
                      </span>
                      <span className="alerts-card-title">{nextBestActionAlert.title}</span>
                    </div>
                  </div>

                  <div className="alerts-card-sub">{nextBestActionAlert.summary}</div>

                  <div className="alerts-card-meta">
                    <span className="alerts-chip alerts-chip--amber">✦ Agentforce has a recommendation</span>
                  </div>

                  <div className="alerts-card-actions">
                    {onFocusGrid && (
                      <FocusToggleBtn
                        active={isFocused}
                        disabled={isDimmed}
                        onClick={() => handleFocusToggle(cardId, nextBestActionAlert.focusParams)}
                      />
                    )}
                    <button
                      className="alerts-agent-cta"
                      onClick={nextBestActionAlert.onViewRecommendations}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                      </svg>
                      View next best action
                    </button>
                  </div>
                </div>
              );
            })()}

            {showTasks && alertDeadlines.map(renderDeadlineCard)}
          </>
        )}

        {/* ── TASKS ─────────────────────────────────────────────── */}
        {showTasksGroup && ((showTasks && taskDeadlines.length > 0) || (showApprovals && visibleApprovalSlaCards.length > 0)) && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Tasks
            </div>

            {/* Pinned top approval card (only one) */}
            {showApprovals && pinnedApprovalCard && (() => {
              const t = pinnedApprovalCard;
              const urgency = t.daysRemaining < 0 ? 'overdue' : t.daysRemaining <= 2 ? 'urgent' : 'upcoming';
              const cellParts = t.cellKey.split('-');
              const timeKey = cellParts[cellParts.length - 1];
              const isFocused = focusedCardId === t.id;
              const isDimmed = anyFocused && !isFocused;
              const fc = t.approval.focusContext;
              const focusParams: FocusGridParams = {
                searchTerm: fc?.searchTerm,
                startPeriod: fc?.startPeriod ?? timeKey,
                endPeriod: fc?.endPeriod ?? timeKey,
                selectedCellKeys: fc?.selectedCellKeys,
              };

              return (
                <div
                  key={t.id}
                  className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
                >
                  <div className="alerts-card-header">
                    <div className="alerts-card-header-left">
                      <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
                      <span className="alerts-card-title">Approval Pending</span>
                    </div>
                    <span className="alerts-type-badge alerts-type-badge--approve">Approval</span>
                  </div>

                  <div className="alerts-card-sub">
                    {fc?.measureSummary || t.approval.requesterName}
                    {' · '}
                    {fc?.startPeriod && fc?.endPeriod
                      ? `${formatTimeKey(fc.startPeriod)}–${formatTimeKey(fc.endPeriod)}`
                      : formatTimeKey(timeKey)}
                    {fc?.dimensionSummary ? ` · ${fc.dimensionSummary}` : ''}
                  </div>

                  <div className="alerts-card-meta">
                    {t.daysRemaining < 0
                      ? <span className="alerts-chip alerts-chip--red">⏱ SLA exceeded by {t.daysOverdue} day{t.daysOverdue !== 1 ? 's' : ''}</span>
                      : <span className="alerts-chip alerts-chip--amber">⏱ SLA: {t.daysRemaining} day{t.daysRemaining !== 1 ? 's' : ''} remaining</span>
                    }
                  </div>

                  <div className="alerts-card-actions">
                    {onFocusGrid && (
                      <FocusToggleBtn
                        active={isFocused}
                        disabled={isDimmed}
                        onClick={() => handleFocusToggle(t.id, focusParams)}
                      />
                    )}
                    {askAgentBtn(approvalAgentPrompt(t.approval.requesterName, fc?.measureSummary))}
                  </div>
                </div>
              );
            })()}

            {/* Deadline task cards */}
            {showTasks && taskDeadlines.map(renderDeadlineCard)}

            {/* Remaining approval cards (keep in regular order below tasks) */}
            {showApprovals && remainingApprovalSlaCards.map(t => {
              const urgency = t.daysRemaining < 0 ? 'overdue' : t.daysRemaining <= 2 ? 'urgent' : 'upcoming';
              const cellParts = t.cellKey.split('-');
              const timeKey = cellParts[cellParts.length - 1];
              const isFocused = focusedCardId === t.id;
              const isDimmed = anyFocused && !isFocused;
              const fc = t.approval.focusContext;
              const focusParams: FocusGridParams = {
                searchTerm: fc?.searchTerm,
                startPeriod: fc?.startPeriod ?? timeKey,
                endPeriod: fc?.endPeriod ?? timeKey,
                selectedCellKeys: fc?.selectedCellKeys,
              };

              return (
                <div
                  key={t.id}
                  className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
                >
                  <div className="alerts-card-header">
                    <div className="alerts-card-header-left">
                      <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
                      <span className="alerts-card-title">Approval Pending</span>
                    </div>
                    <span className="alerts-type-badge alerts-type-badge--approve">Approval</span>
                  </div>

                  <div className="alerts-card-sub">
                    {fc?.measureSummary || t.approval.requesterName}
                    {' · '}
                    {fc?.startPeriod && fc?.endPeriod
                      ? `${formatTimeKey(fc.startPeriod)}–${formatTimeKey(fc.endPeriod)}`
                      : formatTimeKey(timeKey)}
                    {fc?.dimensionSummary ? ` · ${fc.dimensionSummary}` : ''}
                  </div>

                  <div className="alerts-card-meta">
                    {t.daysRemaining < 0
                      ? <span className="alerts-chip alerts-chip--red">⏱ SLA exceeded by {t.daysOverdue} day{t.daysOverdue !== 1 ? 's' : ''}</span>
                      : <span className="alerts-chip alerts-chip--amber">⏱ SLA: {t.daysRemaining} day{t.daysRemaining !== 1 ? 's' : ''} remaining</span>
                    }
                  </div>

                  <div className="alerts-card-actions">
                    {onFocusGrid && (
                      <FocusToggleBtn
                        active={isFocused}
                        disabled={isDimmed}
                        onClick={() => handleFocusToggle(t.id, focusParams)}
                      />
                    )}
                    {askAgentBtn(approvalAgentPrompt(t.approval.requesterName, fc?.measureSummary))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── NOTIFICATIONS (surfaced under Alerts) ─────────────── */}
        {showAlertsGroup && showNotifications && approvalNotifications.some(n => !dismissedIds.has(n.notifId)) && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              Notifications
            </div>
            {approvalNotifications
              .filter(n => !dismissedIds.has(n.notifId))
              .map(n => {
                const isApproved = n.note?.includes('→ Approved') || n.note?.includes('Approved');
                const isRejected = n.note?.includes('→ Rejected') || n.note?.includes('Rejected');
                const urgency = isRejected ? 'overdue' : isApproved ? 'approved' : 'upcoming';
                const notifCardId = n.notifId;
                const isFocused = focusedCardId === notifCardId;
                const isDimmed = anyFocused && !isFocused;

                // Parse timeKey for focus
                const cellParts = n.cellKey?.split('-') ?? [];
                const timeKey = cellParts[cellParts.length - 1];
                const focusParams: FocusGridParams = { startPeriod: timeKey, endPeriod: timeKey };

                return (
                  <div
                    key={n.notifId}
                    className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
                  >
                    <div className="alerts-card-header">
                      <div className="alerts-card-header-left">
                        <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
                        <span className="alerts-card-title">
                          {isApproved ? '✓ ' : isRejected ? '✗ ' : ''}{n.userName}
                        </span>
                      </div>
                      <span className="alerts-chip alerts-chip--grey" style={{ fontSize: 10 }}>{formatRelativeTime(n.timestamp)}</span>
                    </div>

                    <div className="alerts-card-sub alerts-card-note">
                      {n.note && n.note.length > 80 ? n.note.slice(0, 80) + '…' : n.note}
                    </div>

                    <div className="alerts-card-actions">
                      {onViewCellHistory && n.cellKey && (
                        <button className="alerts-link-btn" onClick={() => onViewCellHistory(n.cellKey!)}>
                          View cell →
                        </button>
                      )}
                      {onFocusGrid && (
                        <FocusToggleBtn
                          active={isFocused}
                          disabled={isDimmed}
                          onClick={() => handleFocusToggle(notifCardId, focusParams)}
                        />
                      )}
                      {askAgentBtn(
                        `Explain this update from ${n.userName}: ${(n.note ?? '').slice(0, 120)} — what does it change in my plan?`
                      )}
                      <button className="alerts-dismiss-btn" onClick={() => dismiss(n.notifId)}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
          </>
        )}

        {/* ── SLA TRACKER (now under Alerts, with the Tasks cards) ─ */}
        {activeTab === 'alerts' && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              SLA Tracker
            </div>
            <div className="alerts-sla-card">
              <div className="alerts-sla-card-row">
                <span className="alerts-sla-title">Forecast Lock Deadline</span>
                <span className="alerts-sla-date">Mar 25</span>
              </div>
              <div className="alerts-sla-bar-track">
                <div className="alerts-sla-bar-fill" style={{ width: `${Math.min(100, Math.round((forecastLockSla.filled / forecastLockSla.total) * 100))}%` }} />
              </div>
              <div className="alerts-sla-card-row alerts-sla-card-row--meta">
                <span>{forecastLockSla.filled} of {forecastLockSla.total} cells updated</span>
                <span>{Math.round((forecastLockSla.filled / forecastLockSla.total) * 100)}%</span>
              </div>
              <div className="alerts-card-actions">
                {askAgentBtn(
                  `Which cells still need updating before the Mar 25 forecast lock, and which ones matter most?`
                )}
              </div>
            </div>
            <div className="alerts-sla-card">
              <div className="alerts-sla-card-row">
                <span className="alerts-sla-title">Approval SLA</span>
                <span className="alerts-sla-date">5-day SLA</span>
              </div>
              <div className="alerts-sla-bar-track">
                <div className="alerts-sla-bar-fill alerts-sla-bar-fill--green" style={{ width: `${Math.min(100, Math.round((approvalSlaProgress.done / approvalSlaProgress.total) * 100))}%` }} />
              </div>
              <div className="alerts-sla-card-row alerts-sla-card-row--meta">
                <span>{approvalSlaProgress.done} of {approvalSlaProgress.total} approvals resolved</span>
                <span>{Math.round((approvalSlaProgress.done / approvalSlaProgress.total) * 100)}%</span>
              </div>
              <div className="alerts-card-actions">
                {askAgentBtn('Which approvals are still open against the 5-day SLA, and who is holding them?')}
              </div>
            </div>
          </>
        )}

        {/* ── Empty states ───────────────────────────────────────── */}
        {activeTab === 'alerts' && alertsBadge + tasksBadge === 0 && (
          <div className="alerts-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
            <p>No alerts or tasks</p>
            <span>Nothing needs your attention right now</span>
          </div>
        )}
      </div>

    </div>
  );
};

export default AlertsPanel;
