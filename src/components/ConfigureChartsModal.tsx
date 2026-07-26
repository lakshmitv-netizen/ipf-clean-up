import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/EditSubColumnsModal.css';
import '../styles/components/ConfigureChartsModal.css';

export type ChartType = 'bar' | 'line' | 'donut';

export interface ChartConfig {
  id: string;
  name: string;
  type: ChartType;
  /** Which series/measures are shown on this chart. */
  series: string[];
}

/** Series a user can toggle on/off per chart. */
export const CHART_SERIES_OPTIONS = ['Actual', 'Planned', 'Target', 'Variance'];

const TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar chart' },
  { value: 'line', label: 'Line chart' },
  { value: 'donut', label: 'Donut chart' },
];

interface ConfigureChartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  charts: ChartConfig[];
  onSave: (charts: ChartConfig[]) => void;
}

const ConfigureChartsModal: React.FC<ConfigureChartsModalProps> = ({ isOpen, onClose, charts, onSave }) => {
  const [list, setList] = useState<ChartConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setList(charts.map((c) => ({ ...c, series: [...c.series] })));
      setExpandedId(charts[0]?.id ?? null);
    }
  }, [isOpen, charts]);

  if (!isOpen) return null;

  const addChart = () => {
    const id = `chart-${Date.now()}`;
    setList((prev) => [...prev, { id, name: `Chart ${prev.length + 1}`, type: 'bar', series: ['Actual'] }]);
    setExpandedId(id);
  };

  const removeChart = (id: string) => {
    setList((prev) => prev.filter((c) => c.id !== id));
    setExpandedId((cur) => (cur === id ? null : cur));
  };

  const update = (id: string, patch: Partial<ChartConfig>) =>
    setList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const move = (index: number, dir: -1 | 1) =>
    setList((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const toggleSeries = (id: string, s: string) =>
    setList((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const has = c.series.includes(s);
        return { ...c, series: has ? c.series.filter((x) => x !== s) : [...c.series, s] };
      }),
    );

  const typeLabel = (t: ChartType) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

  return createPortal(
    <div className="edit-sub-columns-modal-overlay">
      <div className="edit-sub-columns-modal chart-config-modal">
        <div className="edit-sub-columns-modal-header">
          <h2 className="edit-sub-columns-modal-title">Configure Charts</h2>
          <button type="button" className="edit-sub-columns-modal-close" onClick={onClose} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="edit-sub-columns-modal-body">
          <div className="chart-config-toolbar">
            <span className="chart-config-desc">Reorder, create, and edit the charts shown above the grid.</span>
            <button type="button" className="chart-config-add-btn" onClick={addChart}>
              + New chart
            </button>
          </div>

          {list.length === 0 ? (
            <div className="chart-config-empty">No charts yet. Click “+ New chart” to add one.</div>
          ) : (
            <ul className="chart-config-list">
              {list.map((c, i) => {
                const expanded = expandedId === c.id;
                return (
                  <li key={c.id} className={`chart-config-card${expanded ? ' expanded' : ''}`}>
                    <div className="chart-config-card-head">
                      <div className="chart-config-reorder">
                        <button
                          type="button"
                          className="chart-config-reorder-btn"
                          title="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                            <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="chart-config-reorder-btn"
                          title="Move down"
                          disabled={i === list.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>

                      <button
                        type="button"
                        className="chart-config-card-main"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        aria-expanded={expanded}
                      >
                        <span className="chart-config-type-badge">{typeLabel(c.type)}</span>
                        <span className="chart-config-name-text">{c.name}</span>
                        <span className="chart-config-series-sum">
                          {c.series.length} series
                        </span>
                        <span className={`chart-config-chevron${expanded ? ' open' : ''}`} aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>

                      <button
                        type="button"
                        className="chart-config-delete"
                        title="Delete chart"
                        onClick={() => removeChart(c.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                          <path
                            d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0v11a1 1 0 001 1h6a1 1 0 001-1V7"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>

                    {expanded && (
                      <div className="chart-config-card-body">
                        <label className="chart-config-field">
                          <span className="chart-config-field-label">Chart name</span>
                          <input
                            type="text"
                            className="chart-config-input"
                            value={c.name}
                            placeholder="Chart name"
                            onChange={(e) => update(c.id, { name: e.target.value })}
                          />
                        </label>

                        <label className="chart-config-field">
                          <span className="chart-config-field-label">Chart type</span>
                          <select
                            className="chart-config-select"
                            value={c.type}
                            onChange={(e) => update(c.id, { type: e.target.value as ChartType })}
                          >
                            {TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="chart-config-field">
                          <span className="chart-config-field-label">Show on chart</span>
                          <div className="chart-config-series">
                            {CHART_SERIES_OPTIONS.map((s) => (
                              <label key={s} className="chart-config-series-chip">
                                <input
                                  type="checkbox"
                                  checked={c.series.includes(s)}
                                  onChange={() => toggleSeries(c.id, s)}
                                />
                                <span>{s}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="edit-sub-columns-modal-footer">
          <button
            type="button"
            className="edit-sub-columns-modal-button edit-sub-columns-modal-button-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="edit-sub-columns-modal-button edit-sub-columns-modal-button-primary"
            onClick={() => onSave(list)}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfigureChartsModal;
