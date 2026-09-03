import React, { useEffect, useRef, useState } from 'react';
import '../styles/components/AgentforcePanel.css';
import '../styles/components/PlanAgentPanel.css';

/** Minimal record shape the list-page agent grounds its answers in. */
export interface PlanAgentRecord {
  id: string;
  name: string;
  fiscalYear: string;
  adminTemplate: string;
  rootRecord: string;
  status: string;
}

interface PlanAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Open the workspace for the plan the agent just created (the FY26 Acme
   * Partners plan). The parent points the grid at the Manufacturing Account
   * Forecast workspace and navigates there.
   */
  onOpenPlan: () => void;
  /**
   * Open the plan's record detail page (opened when the user clicks the blue
   * plan-name link inside the created-record card).
   */
  onOpenRecord: () => void;
  /** Live list of plans shown on the page — used to ground the canned replies. */
  records: PlanAgentRecord[];
}

/** A single field row inside an agent-created record card. */
interface RecordField {
  label: string;
  value: string;
  /** Render the value as a blue link (matches the SLDS record-card pattern). */
  link?: boolean;
}

/** A record card the agent posts after creating an object (e.g. a new plan). */
interface RecordCard {
  title: string;
  fields: RecordField[];
  /** Label for the primary button beneath the card. */
  viewLabel: string;
  /** What the View button does. */
  action: 'openPlan';
}

interface AgentReply {
  answer: string;
  bullets?: string[];
  /** Optional call-to-action rendered as a primary button under the reply. */
  cta?: { label: string; action: 'create' };
  /** Record card the agent generated (Salesforce "agent creates a record" pattern). */
  record?: RecordCard;
  /**
   * Short reasoning line describing the specialist agent that ran, shown as a
   * subtle note beneath the reply (e.g. "Plan Setup Agent … instantiates the
   * FY26 workspace").
   */
  agentNote?: { agent: string; text: string };
}

interface ChatTurn {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  reply?: AgentReply;
  pending?: boolean;
  /** Custom "thinking" line for the pending state. */
  pendingText?: string;
}

/**
 * The plan the Plan Setup Agent builds when asked to create a new plan — the
 * FY26 commercial plan for Acme Partners, from the pre-configured
 * "Manufacturing Account Forecast" definition (per the demo script).
 */
function buildCreatedPlanReply(): AgentReply {
  const created = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  return {
    answer:
      'Done — your **FY26 commercial plan for Acme Partners** is ready. I named it, set the planning period to Fiscal Year 2026 (Jan–Dec), and applied the **Manufacturing Account Forecast** definition, so every dimension and account is already mapped. No manual setup needed.',
    record: {
      title: 'Planning & Forecasting FY26 – Acme Partners',
      fields: [
        { label: 'Plan Name', value: 'Planning & Forecasting FY26 – Acme Partners', link: true },
        { label: 'Planning Period', value: 'Jan – Dec 2026 (Fiscal Year 2026)' },
        { label: 'Plan Definition', value: 'Manufacturing Account Forecast' },
        { label: 'Account', value: 'Acme Partners (Level 1 global account)' },
        { label: 'Status', value: 'Draft' },
        { label: 'Created Date', value: created },
      ],
      viewLabel: 'View',
      action: 'openPlan',
    },
  };
}

/** Starter prompts tailored to a Key Account Manager on the Planning & Forecasting list.
 *  Leads with the net-new FY26 plan for the key account, then a from-last-year option
 *  for another account, then purpose-driven plans (different measure combinations —
 *  revenue forecasting, profit/margin monitoring), then a review/triage job. Labels
 *  with a create/build/set-up intent route into the agent's scripted plan-creation flow. */
const STARTERS: { id: string; label: string; action?: 'create' }[] = [
  { id: 'create', label: 'Build the FY26 Plan for Acme Partners', action: 'create' },
  { id: 'clone-ly', label: 'Build Globex FY26 from last year' },
  { id: 'revenue', label: 'Set up a revenue forecast plan' },
  { id: 'profit', label: 'Start a profit & margin monitoring plan' },
  { id: 'draft', label: 'Which of my plans are still in draft?' },
];

/** Render lightweight `**bold**` markup as <strong>; everything else stays plain text. */
function renderRich(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/** Tiny grounded "engine": maps a question to a canned answer using the live plan list. */
function answerListQuery(question: string, records: PlanAgentRecord[]): AgentReply {
  const q = question.toLowerCase();
  const drafts = records.filter((r) => r.status.toLowerCase() === 'draft');
  const years = Array.from(new Set(records.map((r) => r.fiscalYear))).sort();
  const latest = [...records].sort((a, b) => Number(b.fiscalYear) - Number(a.fiscalYear))[0];

  if (/\b(create|new plan|start|add)\b/.test(q)) {
    return {
      answer:
        'I can help you set up a new **Planning & Forecasting** plan — pick the fiscal year, plan configuration, account group and period, and I’ll take care of the rest.',
      cta: { label: 'Create new plan', action: 'create' },
    };
  }

  if (/\b(draft|unfinished|incomplete|pending)\b/.test(q)) {
    return {
      answer: `You have **${drafts.length} plan${drafts.length === 1 ? '' : 's'} in Draft** right now. These haven’t been submitted yet:`,
      bullets: drafts.slice(0, 5).map((r) => `${r.name} — FY${r.fiscalYear}`),
    };
  }

  if (/\b(clone|copy|duplicate|reuse|last year|previous)\b/.test(q)) {
    return {
      answer: latest
        ? `The quickest start is to clone your most recent plan, **${latest.name}** (FY${latest.fiscalYear}), and roll it forward. Use the ▾ menu on any row and choose **Clone** to carry over its configuration.`
        : 'You can clone any existing plan from its row menu (▾) to carry over its configuration into a new fiscal year.',
      cta: { label: 'Create new plan', action: 'create' },
    };
  }

  if (/\b(summar|overview|recap|how many|what plans)\b/.test(q)) {
    return {
      answer: `You’re managing **${records.length} plans** spanning FY${years[0]}–FY${years[years.length - 1]}. Here’s a quick snapshot:`,
      bullets: [
        `${drafts.length} in Draft, ${records.length - drafts.length} submitted/approved`,
        `Fiscal years covered: ${years.map((y) => 'FY' + y).join(', ')}`,
        latest ? `Most recent: ${latest.name}` : '',
      ].filter(Boolean),
    };
  }

  if (/\b(next|focus|priorit|should i|work on|todo)\b/.test(q)) {
    return {
      answer: latest
        ? `I’d start with **${latest.name}** (FY${latest.fiscalYear}) — it’s your newest plan and still in ${latest.status}. Opening its grid lets you review measures and lock in the forecast.`
        : 'Once you create a plan, I’ll recommend which one to prioritise based on status and due dates.',
    };
  }

  return {
    answer:
      'I’m your planning assistant for this page. I can help you **create a new plan**, review drafts, clone a prior year, or summarize what you’re working on. Try one of the suggestions below.',
  };
}

const PlanAgentPanel: React.FC<PlanAgentPanelProps> = ({ isOpen, onClose, onOpenPlan, onOpenRecord, records }) => {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current);
    };
  }, []);

  // Close on Escape while the panel is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const startNewChat = () => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setTurns([]);
  };

  // Post a user turn + a pending agent turn, then resolve it with `reply` after
  // a short "thinking" delay. Shared by free-text asks and scripted actions.
  const runTurn = (question: string, reply: AgentReply, pendingText?: string) => {
    if (pendingTimerRef.current !== null) return;
    const seq = ++idRef.current;
    const userTurn: ChatTurn = { id: `u-${seq}`, role: 'user', text: question };
    const pendingId = `a-${seq}`;
    const pendingTurn: ChatTurn = { id: pendingId, role: 'agent', pending: true, pendingText };
    setTurns((prev) => [...prev, userTurn, pendingTurn]);
    setInput('');
    pendingTimerRef.current = window.setTimeout(
      () => {
        pendingTimerRef.current = null;
        setTurns((prev) => prev.map((t) => (t.id === pendingId ? { ...t, pending: false, reply } : t)));
      },
      pendingText ? 1400 : 900,
    );
  };

  // The Plan Setup Agent builds the FY26 Acme Partners plan in-conversation and
  // returns a record card (rather than opening a form).
  const createPlanViaAgent = () => {
    runTurn('Build the FY26 plan for Acme Partners', buildCreatedPlanReply(), 'Instantiating your FY26 workspace');
  };

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    if (pendingTimerRef.current !== null) return;
    // Free-text create intent is routed to the agent's plan-creation flow.
    if (/\b(create|new plan|build|set ?up|start)\b/.test(q.toLowerCase())) {
      createPlanViaAgent();
      return;
    }
    runTurn(q, answerListQuery(q, records));
  };

  const onStarter = (s: (typeof STARTERS)[number]) => {
    if (s.action === 'create') {
      createPlanViaAgent();
      return;
    }
    ask(s.label);
  };

  const hasConversation = turns.length > 0;

  return (
    <div className="agentforce-panel plan-agent-panel-fixed" role="complementary" aria-label="Agentforce assistant">
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
            <div className="agentforce-intro-title">Let’s plan!</div>
            <div className="agentforce-intro-sub">
              Hi, I’m Agentforce. I can help you spin up a new plan, pick up where you left off, or
              make sense of everything on your Planning &amp; Forecasting list. What would you like to do?
            </div>
            <div className="agentforce-suggestions">
              {STARTERS.map((p) => (
                <button
                  key={p.id}
                  className={`agentforce-suggestion${p.action === 'create' ? ' plan-agent-suggestion--primary' : ''}`}
                  onClick={() => onStarter(p)}
                >
                  <span className="agentforce-suggestion-text">{p.label}</span>
                  <svg className="agentforce-suggestion-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {p.action === 'create' ? (
                      <>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </>
                    ) : (
                      <>
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </>
                    )}
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
            <AgentThinkingCard key={turn.id} text={turn.pendingText} />
          ) : (
            <AgentReplyCard
              key={turn.id}
              reply={turn.reply!}
              onCreate={createPlanViaAgent}
              onOpenPlan={onOpenPlan}
              onOpenRecord={onOpenRecord}
            />
          ),
        )}
      </div>

      {/* Composer */}
      <div className="agentforce-footer">
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

const AgentThinkingCard: React.FC<{ text?: string }> = ({ text }) => (
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
          <span className="agentforce-thinking-text">{text ?? 'Reviewing your plans'}</span>
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
  reply: AgentReply;
  onCreate: () => void;
  onOpenPlan: () => void;
  onOpenRecord: () => void;
}> = ({ reply, onCreate, onOpenPlan, onOpenRecord }) => (
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
          {reply.answer
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="agentforce-answer-p">
                {renderRich(para)}
              </p>
            ))}
        </div>

        {reply.bullets && reply.bullets.length > 0 && (
          <ul className="agentforce-bullets">
            {reply.bullets.map((b, i) => (
              <li key={i}>{renderRich(b)}</li>
            ))}
          </ul>
        )}

        {reply.record && (
          <PlanRecordCard record={reply.record} onOpenPlan={onOpenPlan} onOpenRecord={onOpenRecord} />
        )}

        {reply.agentNote && (
          <div className="plan-agent-note">
            <span className="plan-agent-note-spark" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                <path d="M18.5 13.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z" />
              </svg>
            </span>
            <div className="plan-agent-note-body">
              <span className="plan-agent-note-agent">Agentforce · {reply.agentNote.agent}</span>
              <span className="plan-agent-note-text">{reply.agentNote.text}</span>
            </div>
          </div>
        )}

        {reply.cta && (
          <div className="plan-agent-cta-row">
            <button type="button" className="plan-agent-cta-btn" onClick={onCreate}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {reply.cta.label}
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
);

/** SLDS-style record card the agent posts after creating an object. */
const PlanRecordCard: React.FC<{ record: RecordCard; onOpenPlan: () => void; onOpenRecord: () => void }> = ({
  record,
  onOpenPlan,
  onOpenRecord,
}) => (
  <div className="plan-agent-record">
    <div className="plan-agent-record-head">
      <span className="plan-agent-record-icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z" />
        </svg>
      </span>
      <span className="plan-agent-record-title">{record.title}</span>
    </div>
    <div className="plan-agent-record-fields">
      {record.fields.map((f) => (
        <div key={f.label} className="plan-agent-record-field">
          <div className="plan-agent-record-label">{f.label}</div>
          {f.link ? (
            <button
              type="button"
              className="plan-agent-record-value plan-agent-record-value--link"
              onClick={onOpenRecord}
            >
              {f.value}
            </button>
          ) : (
            <div className="plan-agent-record-value">{f.value}</div>
          )}
        </div>
      ))}
    </div>
    <div className="plan-agent-record-actions">
      <button type="button" className="plan-agent-record-view" onClick={onOpenPlan}>
        {record.viewLabel}
      </button>
    </div>
  </div>
);

export default PlanAgentPanel;
