import React, { useState, useRef, useEffect } from 'react';
import { MeasureData } from '../types';
import { FocusGridParams } from './AlertsPanel';
import {
  runAgentQuery,
  STARTER_PROMPTS,
  ARC3_STARTER,
  hasPredictedBaseline,
  AgentResponse,
  AgentChart,
  AgentActionCard,
  AgentSlackMessage,
  AgentScenario,
} from '../utils/agentforceEngine';
import '../styles/components/AgentforcePanel.css';

export const AgentforceSparkIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 20,
  className,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
  >
    <path
      d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
      fill="currentColor"
    />
    <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" fill="currentColor" />
  </svg>
);

interface ChatTurn {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  response?: AgentResponse;
  /** Agent turn is "thinking" — show the loading state until the reply resolves. */
  pending?: boolean;
}

/**
 * Render lightweight inline markup:
 *  - `**bold**` → <strong>
 *  - `[[warn:Low confidence]]` → amber warning chip with a ⚠ icon
 * Everything else stays plain text.
 */
function renderRich(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[\[warn:[^\]]+\]\])/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    const warn = part.match(/^\[\[warn:([^\]]+)\]\]$/);
    if (warn) {
      return (
        <span key={i} className="agent-warn-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3.2 1.8 20.4h20.4L12 3.2Z"
              fill="#fef3d0"
              stroke="#e5a000"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <line x1="12" y1="10" x2="12" y2="14.5" stroke="#e5a000" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="17.4" r="1.15" fill="#e5a000" />
          </svg>
          {warn[1]}
        </span>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Split a "1. Name — value (period)" ranked bullet into its display parts. */
function parseRankedBullet(bullet: string): { rank: string; name: string; value: string; period?: string } | null {
  const m = bullet.match(/^(\d+)\.\s+(.*)$/);
  if (!m) return null;
  const rank = m[1];
  let rest = m[2];
  let name = rest;
  let value = '';
  const dash = rest.lastIndexOf(' — ');
  if (dash !== -1) {
    name = rest.slice(0, dash).trim();
    value = rest.slice(dash + 3).trim();
  }
  let period: string | undefined;
  const per = value.match(/\s*\(([^)]+)\)\s*$/);
  if (per) {
    period = per[1];
    value = value.slice(0, per.index).trim();
  }
  return { rank, name, value, period };
}

/** Compact multi-line trend chart the agent embeds inline in a reply (shared absolute scale). */
const AgentTrendChart: React.FC<{ chart: AgentChart }> = ({ chart }) => {
  const W = 320;
  const H = 148;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const n = chart.months.length;
  // A confidence band fans out over the horizon: ±band scaled from ~35% to 100% Jan→Dec.
  const halfWidth = (s: AgentChart['series'][number], i: number) =>
    s.band ? s.band * (0.35 + 0.65 * (n > 1 ? i / (n - 1) : 1)) : 0;
  // Include band extremes in the scale so the shaded area always fits.
  const all = chart.series.flatMap((s) =>
    s.band
      ? s.values.flatMap((v, i) => [v, v * (1 + halfWidth(s, i)), v * (1 - halfWidth(s, i))])
      : s.values,
  );
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const min = rawMin * 0.94;
  const max = rawMax * 1.06;
  const denom = max - min || 1;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * (W - padL - padR) : 0);
  const y = (v: number) => H - padB - ((v - min) / denom) * (H - padT - padB);
  const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}K` : `${Math.round(v)}`);

  return (
    <div className="agent-chart">
      {chart.title && <div className="agent-chart-title">{chart.title}</div>}
      <svg className="agent-chart-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={chart.title || 'Trend chart'}>
        {[0, 1, 2].map((g) => {
          const gy = padT + g * ((H - padT - padB) / 2);
          const val = max - (g / 2) * (max - min);
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#eef1f4" strokeWidth={1} />
              <text x={padL - 5} y={gy + 3} textAnchor="end" fontSize={8} fill="#98a3ad">{fmtK(val)}</text>
            </g>
          );
        })}
        {chart.months.map((m, i) =>
          i % 2 === 0 ? (
            <text key={m + i} x={x(i)} y={H - 7} textAnchor="middle" fontSize={8} fill="#98a3ad">{m}</text>
          ) : null,
        )}
        {/* Confidence bands first, so the lines sit on top. */}
        {chart.series.map((s) =>
          s.band ? (
            <polygon
              key={`band-${s.name}`}
              points={[
                ...s.values.map((v, i) => `${x(i).toFixed(1)},${y(v * (1 + halfWidth(s, i))).toFixed(1)}`),
                ...s.values.map((v, i) => `${x(i).toFixed(1)},${y(v * (1 - halfWidth(s, i))).toFixed(1)}`).reverse(),
              ].join(' ')}
              fill={s.color}
              fillOpacity={0.14}
              stroke="none"
            />
          ) : null,
        )}
        {chart.series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={1.9} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="agent-chart-legend">
        {chart.series.map((s) => (
          <span key={s.name} className="agent-chart-legend-item">
            <span className="agent-chart-legend-dot" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      {chart.note && <div className="agent-chart-note">{chart.note}</div>}
    </div>
  );
};

/** A structured record/action card the agent surfaces (e.g. a drafted Sales Agreement amendment). */
const AgentActionCardView: React.FC<{ card: AgentActionCard }> = ({ card }) => (
  <div className="agent-action-card">
    <div className="agent-action-card-head">
      <span className="agent-action-card-doc" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </span>
      <div className="agent-action-card-heading">
        {card.eyebrow && <div className="agent-action-card-eyebrow">{card.eyebrow}</div>}
        <div className="agent-action-card-title">{card.title}</div>
        {card.subtitle && <div className="agent-action-card-subtitle">{card.subtitle}</div>}
      </div>
    </div>
    <div className="agent-action-card-fields">
      {card.fields.map((f) => (
        <div key={f.label} className="agent-action-card-field">
          <span className="agent-action-card-field-label">{f.label}</span>
          <span className={`agent-action-card-field-value${f.strong ? ' is-strong' : ''}`}>{f.value}</span>
        </div>
      ))}
    </div>
    {card.status && (
      <div className={`agent-action-card-status agent-action-card-status--${card.status.tone}`}>
        {card.status.tone === 'success' ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        )}
        {card.status.label}
      </div>
    )}
    {card.footnote && <div className="agent-action-card-foot">{card.footnote}</div>}
  </div>
);

/** A Slack message the agent drafts (preview) or posts (in-channel screen) — Arc 5. */
const AgentSlackView: React.FC<{ msg: AgentSlackMessage }> = ({ msg }) => (
  <div className={`agent-slack${msg.posted ? ' agent-slack--posted' : ' agent-slack--draft'}`}>
    <div className="agent-slack-topbar">
      <span className="agent-slack-logo" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path fill="#36C5F0" d="M9 3a2 2 0 1 0 0 4h2V5a2 2 0 0 0-2-2z" />
          <path fill="#2EB67D" d="M21 9a2 2 0 1 0-4 0v2h2a2 2 0 0 0 2-2z" />
          <path fill="#ECB22E" d="M15 21a2 2 0 1 0 0-4h-2v2a2 2 0 0 0 2 2z" />
          <path fill="#E01E5A" d="M3 15a2 2 0 1 0 4 0v-2H5a2 2 0 0 0-2 2z" />
          <path fill="#36C5F0" d="M7 9a2 2 0 0 1 2-2h2a2 2 0 0 1 0 4H9a2 2 0 0 1-2-2z" opacity="0" />
        </svg>
      </span>
      <span className="agent-slack-channel"># {msg.channel}</span>
      <span className={`agent-slack-tag${msg.posted ? ' agent-slack-tag--posted' : ' agent-slack-tag--draft'}`}>
        {msg.posted ? 'Posted' : 'Draft'}
      </span>
    </div>
    <div className="agent-slack-msg">
      <div className="agent-slack-avatar" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
        </svg>
      </div>
      <div className="agent-slack-msg-body">
        <div className="agent-slack-msg-head">
          <span className="agent-slack-author">{msg.author}</span>
          <span className="agent-slack-app">APP</span>
          <span className="agent-slack-time">{msg.time}</span>
        </div>
        <div className="agent-slack-headline">{renderRich(msg.headline)}</div>
        <ul className="agent-slack-lines">
          {msg.lines.map((l, i) => (
            <li key={i}>{renderRich(l.replace(/\*([^*]+)\*/g, '**$1**'))}</li>
          ))}
        </ul>
        {msg.footer && <div className="agent-slack-footer">{msg.footer}</div>}
        {msg.posted && (
          <button
            type="button"
            className="agent-slack-view"
            onClick={() => {
              // Open via script (no noopener) so the standalone Slack screen keeps a
              // handle to this tab and can hand control back here once Rita approves.
              window.open(msg.viewUrl || 'https://slack.com', '_blank');
            }}
          >
            View in Slack
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  </div>
);

interface AgentforcePanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: MeasureData[];
  /** Apply (params) or clear (null) the agent's filter view on the grid. */
  onShowOnGrid: (params: FocusGridParams | null) => void;
  /** Hand off to the Filters panel in advanced mode, pre-populated (incl. filter logic). */
  onEditFilters: (params: FocusGridParams, filterLogic?: string) => void;
  /** Open Settings on the Formatting tab to reveal the agent's conditional-formatting rule(s). */
  onShowConditionalFormatting: () => void;
  /** Open the Sort panel to reveal the ranking sort the agent applied. */
  onShowSort: () => void;
  /** When set (and the panel is open), auto-send this prompt once to kick off a scripted flow. */
  autoStartPrompt?: string | null;
  /** Called once the auto-start prompt has been consumed, so the parent can clear it. */
  onAutoStartConsumed?: () => void;
  /**
   * When set (and the panel is open), seed a one-off Q&A directly — the user's question and the
   * agent's pre-computed answer — instead of routing through the intent engine. Used by the cell
   * edit popover's "Ask Agentforce" CTA to surface a per-cell recommendation in the panel.
   */
  autoStartQA?: {
    question: string;
    answer: string;
    bullets: string[];
    /** Optional recommended action surfaced as a chip that applies the value to the cell. */
    apply?: { label: string; run: () => void };
  } | null;
  /** Called once the seeded Q&A has been consumed, so the parent can clear it. */
  onAutoStartQAConsumed?: () => void;
  /** Reveal a measure row on the grid (Arc 3 projects ✦ Predicted Baseline). Returns the reveal duration in ms. */
  onRevealMeasure?: (measureId: string) => number;
  /** Inject agent-proposed scenarios into the bottom Scenario Planning drawer for comparison. */
  onCreateScenarios?: (scenarios: AgentScenario[]) => void;
}

const AgentforcePanel: React.FC<AgentforcePanelProps> = ({
  isOpen,
  onClose,
  data,
  onShowOnGrid,
  onEditFilters,
  onShowConditionalFormatting,
  onShowSort,
  autoStartPrompt = null,
  onAutoStartConsumed,
  autoStartQA = null,
  onAutoStartQAConsumed,
  onRevealMeasure,
  onCreateScenarios,
}) => {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);
  // Latest `ask` fn (defined after the early return); the auto-start effect calls through this ref.
  const askRef = useRef<((q: string) => void) | null>(null);
  const autoStartedRef = useRef<string | null>(null);
  const autoStartedQARef = useRef<string | null>(null);
  // Pending "apply this recommendation" action from a seeded cell Q&A — surfaced as a recommendation chip.
  const applyActionRef = useRef<{ label: string; run: () => void } | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  // Cancel any in-flight "thinking" timer if the panel unmounts.
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current);
    };
  }, []);

  // Auto-start a scripted flow (e.g. Arc 5) when opened from an alert CTA. Runs once per prompt,
  // and only into a fresh conversation so it doesn't interrupt an existing chat.
  useEffect(() => {
    // Reset the guard when the prompt clears, so the same flow can be re-triggered later.
    if (!autoStartPrompt) {
      autoStartedRef.current = null;
      return;
    }
    if (!isOpen) return;
    if (autoStartedRef.current === autoStartPrompt) return;
    autoStartedRef.current = autoStartPrompt;
    // Fresh start so the scripted beat leads the conversation.
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    // Reset turns and ask in the same tick — setTurns([]) composes with ask's functional
    // update, so the first question appears immediately (no self-cleaning defer timer).
    setTurns([]);
    askRef.current?.(autoStartPrompt);
    onAutoStartConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoStartPrompt]);

  // Seed a one-off Q&A (cell "Ask Agentforce"): append the question + a brief "thinking" state,
  // then resolve to the pre-computed answer. Appends to the current chat rather than resetting it.
  useEffect(() => {
    if (!autoStartQA) {
      autoStartedQARef.current = null;
      return;
    }
    if (!isOpen) return;
    const key = `${autoStartQA.question}|${autoStartQA.answer}`;
    if (autoStartedQARef.current === key) return;
    autoStartedQARef.current = key;
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const seq = ++idRef.current;
    const pendingId = `a-${seq}`;
    applyActionRef.current = autoStartQA.apply ?? null;
    const response: AgentResponse = {
      answer: autoStartQA.answer,
      bullets: autoStartQA.bullets,
      filterPreview: [],
      focusParams: {},
      filterLogic: '',
      followUps: autoStartQA.apply ? [autoStartQA.apply.label] : [],
    };
    setTurns((prev) => [
      ...prev,
      { id: `u-${seq}`, role: 'user', text: autoStartQA.question },
      { id: pendingId, role: 'agent', pending: true },
    ]);
    onAutoStartQAConsumed?.();
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      setTurns((prev) => prev.map((t) => (t.id === pendingId ? { ...t, pending: false, response } : t)));
    }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoStartQA]);

  if (!isOpen) return null;

  const startNewChat = () => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setTurns([]);
  };

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    // Don't stack requests while the agent is still "thinking".
    if (pendingTimerRef.current !== null) return;
    const seq = ++idRef.current;
    // Compute the grounded reply up-front (pure) so we can coordinate any grid
    // reveal (e.g. Arc 3 projecting ✦ Predicted Baseline) with the reply landing.
    const response = runAgentQuery(q, data);
    const userTurn: ChatTurn = { id: `u-${seq}`, role: 'user', text: q };
    const pendingId = `a-${seq}`;
    const pendingTurn: ChatTurn = { id: pendingId, role: 'agent', pending: true };
    setTurns((prev) => [...prev, userTurn, pendingTurn]);
    setInput('');
    // If the reply reveals a measure, kick off the grid's loading→reveal now and
    // hold the reply until the row lands (so the ✦ row and the reply appear together).
    let think = 1200;
    if (response.revealMeasureId && onRevealMeasure) {
      const revealMs = onRevealMeasure(response.revealMeasureId);
      if (revealMs && revealMs > 0) think = revealMs;
    }
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      setTurns((prev) =>
        prev.map((t) => (t.id === pendingId ? { ...t, pending: false, response } : t)),
      );
      // The filtered view is shown on the grid by default (no toggle needed).
      onShowOnGrid(response.focusParams);
      // Scenarios are NOT auto-opened — the reply shows a CTA the user clicks to open the drawer.
    }, think);
  };
  // Expose the latest `ask` to the auto-start effect (registered before this declaration).
  askRef.current = ask;

  // Recommendation chips normally re-query the agent; the seeded cell "Use <value>" action instead
  // writes the recommended value into the grid cell and confirms it inline.
  const handleRecommendation = (q: string) => {
    const apply = applyActionRef.current;
    if (apply && q === apply.label) {
      applyActionRef.current = null;
      apply.run();
      const seq = ++idRef.current;
      const value = q.replace(/^Use\s+/, '');
      setTurns((prev) => [
        ...prev,
        { id: `u-${seq}`, role: 'user', text: q },
        {
          id: `a-${seq}`,
          role: 'agent',
          response: {
            answer:
              `Done — I've entered **${value}** into the cell. It's staged as an unsaved edit, so you can review the ripple across the plan and save when you're ready.`,
            bullets: [],
            filterPreview: [],
            focusParams: {},
            filterLogic: '',
            followUps: [],
          },
        },
      ]);
      return;
    }
    ask(q);
  };

  const handleEdit = (params: FocusGridParams, filterLogic?: string) => {
    onEditFilters(params, filterLogic);
  };

  // CTA inside a scenario reply: open the bottom Scenario Planning drawer and close this panel.
  // Pass a fresh array so the drawer's incoming-scenarios effect re-fires even on a repeat click.
  const handleCompareScenarios = (scenarios: AgentScenario[]) => {
    onCreateScenarios?.([...scenarios]);
    onClose();
  };

  const hasConversation = turns.length > 0;
  // Surface the Arc-3 "Predict the baseline" starter first, but only on grids that carry the measure.
  const starterPrompts = hasPredictedBaseline(data) ? [ARC3_STARTER, ...STARTER_PROMPTS] : STARTER_PROMPTS;
  // The sticky Recommendations bar always reflects the most recent agent reply.
  const latestRecommendations =
    [...turns].reverse().find((t) => t.role === 'agent' && t.response)?.response?.followUps ?? [];

  return (
    <div className="agentforce-panel" role="complementary" aria-label="Agentforce assistant">
      {/* Header */}
      <div className="agentforce-header">
        <div className="agentforce-header-left">
          <span className="agentforce-title">Agentforce</span>
        </div>
        <div className="agentforce-header-actions">
          <button
            className="agentforce-header-btn"
            onClick={startNewChat}
            aria-label="New chat"
            title="New chat"
            disabled={!hasConversation}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="9.5" y1="10" x2="14.5" y2="10" />
              <line x1="12" y1="7.5" x2="12" y2="12.5" />
            </svg>
          </button>
          <button className="agentforce-header-btn" aria-label="Pin panel" title="Pin" tabIndex={-1}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14l-1.6-2.1a2 2 0 0 1-.4-1.2V7a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6.7a2 2 0 0 1-.4 1.2z" />
            </svg>
          </button>
          <button className="agentforce-header-btn agentforce-close" onClick={onClose} aria-label="Close Agentforce" title="Close">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div className="agentforce-body" ref={scrollRef}>
        {!hasConversation && (
          <div className="agentforce-intro">
            <img
              className="agentforce-intro-hero"
              src={`${import.meta.env.BASE_URL}agentforce-hero.png`}
              alt=""
              aria-hidden
            />
            <div className="agentforce-intro-title">Let's Chat!</div>
            <div className="agentforce-intro-sub">
              Hi, I'm Agentforce! I read your live plan data and can help you spot the accounts,
              products and periods that need attention. What can I help you with?
            </div>
            <div className="agentforce-suggestions">
              {starterPrompts.map((p) => (
                <button key={p.id} className="agentforce-suggestion" onClick={() => ask(p.label)}>
                  <span className="agentforce-suggestion-text">{p.label}</span>
                  <svg className="agentforce-suggestion-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="agentforce-user-msg">
              {turn.text}
            </div>
          ) : turn.pending ? (
            <AgentThinkingCard key={turn.id} />
          ) : (
            <AgentReplyCard
              key={turn.id}
              response={turn.response!}
              onEditFilters={() => handleEdit(turn.response!.focusParams, turn.response!.filterLogic)}
              onShowConditionalFormatting={onShowConditionalFormatting}
              onShowSort={onShowSort}
              onCompareScenarios={handleCompareScenarios}
            />
          )
        )}
      </div>

      {/* Composer (Recommendations stay pinned just above the input) */}
      <div className="agentforce-footer">
        <AgentforceRecommendations items={latestRecommendations} onSelect={handleRecommendation} />
        <form
          className="agentforce-composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <button type="button" className="agentforce-composer-add" aria-label="Add" tabIndex={-1}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <input
            className="agentforce-input"
            placeholder="Describe your task or ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {input.trim() ? (
            <button type="submit" className="agentforce-composer-icon agentforce-composer-send" aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          ) : (
            <button type="button" className="agentforce-composer-icon agentforce-composer-mic" aria-label="Voice input" tabIndex={-1}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          )}
        </form>
        <div className="agentforce-disclaimer">Agentforce is AI and can make mistakes.</div>
      </div>
    </div>
  );
};

// Loading placeholder shown while the agent "thinks" before its reply resolves.
const AgentThinkingCard: React.FC = () => (
  <div className="agentforce-reply-block">
    <div className="agentforce-reply">
      <div className="agentforce-reply-avatar">
        <img
          className="agentforce-reply-avatar-img"
          src={`${import.meta.env.BASE_URL}agentforce-avatar.png`}
          alt=""
          aria-hidden
        />
      </div>
      <div className="agentforce-reply-content">
        <div className="agentforce-thinking" role="status" aria-label="Agentforce is thinking">
          <span className="agentforce-thinking-text">Analyzing your plan data</span>
          <span className="agentforce-thinking-dots" aria-hidden>
            <span className="agentforce-thinking-dot" />
            <span className="agentforce-thinking-dot" />
            <span className="agentforce-thinking-dot" />
          </span>
        </div>
      </div>
    </div>
  </div>
);

const AgentReplyCard: React.FC<{
  response: AgentResponse;
  onEditFilters: () => void;
  onShowConditionalFormatting: () => void;
  onShowSort: () => void;
  onCompareScenarios: (scenarios: AgentScenario[]) => void;
}> = ({ response, onEditFilters, onShowConditionalFormatting, onShowSort, onCompareScenarios }) => {
  const bullets = response.bullets ?? [];
  // When every bullet is a "1. Name — value (period)" ranked row, render a clean numbered list.
  const parsedRanked = bullets.map(parseRankedBullet);
  const rankedBullets = bullets.length > 0 && parsedRanked.every((p) => p !== null)
    ? (parsedRanked as NonNullable<(typeof parsedRanked)[number]>[])
    : null;
  const filterPreview = response.filterPreview ?? [];
  const filterCount = filterPreview.length;
  // The agent applies one conditional-formatting rule per root-cause highlight it pins.
  const cfCount = response.focusParams?.highlight ? 1 : 0;
  // The agent applies one ranking sort when it orders the surfaced rows.
  const sortCount = response.focusParams?.sort ? 1 : 0;
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = [response.answer, ...bullets].join('\n');
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
  <div className="agentforce-reply-block">
    <div className="agentforce-reply">
      <div className="agentforce-reply-avatar">
        <img
          className="agentforce-reply-avatar-img"
          src={`${import.meta.env.BASE_URL}agentforce-avatar.png`}
          alt=""
          aria-hidden
        />
      </div>

      <div className="agentforce-reply-content">
        <div className="agentforce-answer">
          {response.answer
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="agentforce-answer-p">
                {renderRich(para)}
              </p>
            ))}
        </div>

        {bullets.length > 0 && (
          rankedBullets ? (
            <div className="agentforce-ranklist">
              {rankedBullets.map((b, i) => (
                <div key={i} className="agentforce-rank-line">
                  {b.rank}. {b.name}
                  {b.value && (
                    <>
                      {' — '}
                      <strong>{b.value}</strong>
                      {b.period ? ` (${b.period})` : ''}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ul className="agentforce-bullets">
              {bullets.map((b, i) => (
                <li key={i}>{renderRich(b)}</li>
              ))}
            </ul>
          )
        )}

        {response.chart && <AgentTrendChart chart={response.chart} />}

        {response.actionCard && <AgentActionCardView card={response.actionCard} />}

        {response.slackMessage && <AgentSlackView msg={response.slackMessage} />}

        {response.scenarios && response.scenarios.length > 0 && (
          <div className="agentforce-scenario-cta">
            <button
              type="button"
              className="agentforce-scenario-cta-link"
              onClick={() => onCompareScenarios(response.scenarios!)}
              title="Open Scenario Planning to compare these levers side by side"
            >
              Compare scenarios
            </button>
          </div>
        )}

        {(filterCount > 0 || cfCount > 0 || sortCount > 0) && (
          <div className="agentforce-applied-summary">
            {(() => {
              const parts: React.ReactNode[] = [];
              if (filterCount > 0) {
                parts.push(
                  <button
                    key="filters"
                    type="button"
                    className="agentforce-applied-link"
                    onClick={onEditFilters}
                    title="Show these filters in the Filters panel"
                  >
                    {filterCount} {filterCount === 1 ? 'filter' : 'filters'} applied
                  </button>,
                );
              }
              if (sortCount > 0) {
                parts.push(
                  <button
                    key="sort"
                    type="button"
                    className="agentforce-applied-link"
                    onClick={onShowSort}
                    title="Open the Sort panel to see the ranking sort"
                  >
                    {sortCount} sort applied
                  </button>,
                );
              }
              if (cfCount > 0) {
                parts.push(
                  <button
                    key="cf"
                    type="button"
                    className="agentforce-applied-link"
                    onClick={onShowConditionalFormatting}
                    title="Open the Formatting tab to see the highlight rule"
                  >
                    {cfCount} conditional formatting {cfCount === 1 ? 'rule' : 'rules'} applied
                  </button>,
                );
              }
              return parts.flatMap((node, i) =>
                i === 0
                  ? [node]
                  : [
                      <span key={`sep-${i}`} className="agentforce-applied-sep" aria-hidden>
                        •
                      </span>,
                      node,
                    ],
              );
            })()}
          </div>
        )}

        <div className="agentforce-reply-actions">
          <div className="agentforce-feedback">
            <button
              type="button"
              className={`agentforce-feedback-btn${feedback === 'up' ? ' is-active' : ''}`}
              aria-label="Good response"
              aria-pressed={feedback === 'up'}
              onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 10v11" />
                <path d="M7 10l4-7a2 2 0 0 1 2.8 1.8V8h4.5a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6H7" />
              </svg>
            </button>
            <button
              type="button"
              className={`agentforce-feedback-btn${feedback === 'down' ? ' is-active' : ''}`}
              aria-label="Bad response"
              aria-pressed={feedback === 'down'}
              onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 14V3" />
                <path d="M17 14l-4 7a2 2 0 0 1-2.8-1.8V16H5.7a2 2 0 0 1-2-2.4l1.4-7a2 2 0 0 1 2-1.6H17" />
              </svg>
            </button>
            <button
              type="button"
              className={`agentforce-feedback-btn${copied ? ' is-active' : ''}`}
              aria-label={copied ? 'Copied' : 'Copy'}
              onClick={handleCopy}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

const AgentforceRecommendations: React.FC<{
  items: string[];
  onSelect: (question: string) => void;
}> = ({ items, onSelect }) => {
  if (items.length === 0) return null;
  return (
    <div className="agentforce-recs agentforce-recs--sticky">
      <div className="agentforce-recs-label">Recommendations</div>
      <div className="agentforce-recs-list">
        {items.map((q, i) => (
          <button
            key={i}
            type="button"
            className="agentforce-rec-item"
            onClick={() => onSelect(q)}
            title={q}
          >
            <svg className="agentforce-rec-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span className="agentforce-rec-text">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AgentforcePanel;
