import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { MeasureData } from '../types';
import '../styles/components/UnifiedFilterPopover.css';

const timePeriods = [
  { value: 'year', label: 'Year (FY26)' },
  { value: 'q1', label: 'Q1' }, { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' }, { value: 'q4', label: 'Q4' },
  { value: 'jan2026', label: 'Jan 2026' }, { value: 'feb2026', label: 'Feb 2026' },
  { value: 'mar2026', label: 'Mar 2026' }, { value: 'apr2026', label: 'Apr 2026' },
  { value: 'may2026', label: 'May 2026' }, { value: 'jun2026', label: 'Jun 2026' },
  { value: 'jul2026', label: 'Jul 2026' }, { value: 'aug2026', label: 'Aug 2026' },
  { value: 'sep2026', label: 'Sep 2026' }, { value: 'oct2026', label: 'Oct 2026' },
  { value: 'nov2026', label: 'Nov 2026' }, { value: 'dec2026', label: 'Dec 2026' },
];

const fieldOptions = [
  { value: 'measure', label: 'Measure' },
  { value: 'account', label: 'Account' },
  { value: 'category', label: 'Category' },
  { value: 'products', label: 'Product' },
  { value: 'time', label: 'Time Period' },
];

const FieldIcon: React.FC<{ field: string; size?: number }> = ({ field, size = 16 }) => {
  if (field === 'measure') return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <rect x="1.5" y="9" width="3" height="5.5" rx="0.5" fill="#999"/>
      <rect x="6.5" y="5.5" width="3" height="9" rx="0.5" fill="#999"/>
      <rect x="11.5" y="1.5" width="3" height="13" rx="0.5" fill="#999"/>
    </svg>
  );
  if (field === 'account') return (
    <img src="/new_account.svg" width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  if (field === 'category') return (
    <img src="/category.svg" width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  if (field === 'products') return (
    <img src="/product.svg" width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  // Time Period — inline calendar icon (grey)
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="#999" strokeWidth="1.3"/>
      <path d="M5 1v3M11 1v3" stroke="#999" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M1.5 6h13" stroke="#999" strokeWidth="1.3"/>
      <rect x="4" y="8.5" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="7" y="8.5" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="10" y="8.5" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="4" y="11" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="7" y="11" width="2" height="2" rx="0.5" fill="#999"/>
    </svg>
  );
};

const operatorOptions = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Not Contains' },
];

const numericOperatorOptions = [
  { value: 'gt',  label: 'Greater than' },
  { value: 'gte', label: 'Greater than or equal' },
  { value: 'lt',  label: 'Less than' },
  { value: 'lte', label: 'Less than or equal' },
  { value: 'eq',  label: 'Equals' },
  { value: 'neq', label: 'Not equals' },
];

const extractMeasures = (data: MeasureData[]): string[] => {
  return data.map(m => m.name ?? m.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
};

const extractAccounts = (data: MeasureData[]): string[] => {
  const set = new Set<string>();
  const walk = (row: any) => {
    if (row.type === 'account') set.add(row.name);
    row.children?.forEach(walk);
  };
  data.forEach(m => m.children?.forEach(walk));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const extractCategories = (data: MeasureData[]): string[] => {
  const set = new Set<string>();
  const walk = (row: any) => {
    if (row.type === 'category') set.add(row.name);
    row.children?.forEach(walk);
  };
  data.forEach(m => m.children?.forEach(walk));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const extractProducts = (data: MeasureData[]): string[] => {
  const set = new Set<string>();
  const walk = (row: any) => {
    if (row.type === 'product' && (!row.children || row.children.length === 0)) set.add(row.name);
    row.children?.forEach(walk);
  };
  data.forEach(m => m.children?.forEach(walk));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

interface UnifiedFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: string, operator: string, selectedValues: string[]) => void;
  onCancel: () => void;
  initialField?: string;
  initialOperator?: string;
  initialValue?: string;
  data: MeasureData[];
  anchorElement: HTMLElement | null;
}

const UnifiedFilterPopover: React.FC<UnifiedFilterPopoverProps> = ({
  isOpen, onClose, onSave, onCancel,
  initialField, initialOperator, initialValue,
  data, anchorElement,
}) => {
  const [field, setField] = useState(initialField || 'category');
  const [operator, setOperator] = useState(initialOperator || 'equals');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [initialSelectedValues, setInitialSelectedValues] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [valueExpanded, setValueExpanded] = useState(false);
  const [fieldDropOpen, setFieldDropOpen] = useState(false);
  const [opDropOpen, setOpDropOpen] = useState(false);

  // Measure-specific state (numeric filter on main cell values: measureName|operator|value)
  const [measureName, setMeasureName] = useState('');
  const [measureOperator, setMeasureOperator] = useState('gt');
  const [measureValue, setMeasureValue] = useState('');
  const [measureNameDropOpen, setMeasureNameDropOpen] = useState(false);
  const [measureOpDropOpen, setMeasureOpDropOpen] = useState(false);
  const measureNameDropRef = useRef<HTMLDivElement>(null);
  const measureOpDropRef = useRef<HTMLDivElement>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fieldDropRef = useRef<HTMLDivElement>(null);
  const opDropRef = useRef<HTMLDivElement>(null);

  const numericMeasureOps = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);

  // Reset / hydrate state when opened
  useEffect(() => {
    if (isOpen) {
      setField(initialField || 'category');
      setOperator(initialOperator || 'equals');
      const parsed = initialValue ? initialValue.split(',').map(v => v.trim()).filter(Boolean) : [];
      setSelectedValues(parsed);
      setInitialSelectedValues(parsed);
      setSearch('');
      setValueExpanded(false);
      setMeasureName('');
      setMeasureOperator('gt');
      setMeasureValue('');

      if ((initialField || '') === 'measure' && initialValue && initialValue.includes('|')) {
        const parts = initialValue.split('|');
        if (parts.length >= 4 && numericMeasureOps.has(parts[2] ?? '')) {
          setMeasureName(parts[0]);
          setMeasureOperator(parts[2]);
          setMeasureValue(parts.slice(3).join('|'));
        } else if (parts.length === 3 && numericMeasureOps.has(parts[1] ?? '')) {
          setMeasureName(parts[0]);
          setMeasureOperator(parts[1]);
          setMeasureValue(parts[2]);
        }
      }
    }
  }, [isOpen, initialField, initialValue]);

  // Close measure dropdowns on outside click
  useEffect(() => {
    if (!measureNameDropOpen && !measureOpDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (!measureNameDropRef.current?.contains(e.target as Node)) setMeasureNameDropOpen(false);
      if (!measureOpDropRef.current?.contains(e.target as Node)) setMeasureOpDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [measureNameDropOpen, measureOpDropOpen]);

  useEffect(() => {
    if (!isOpen) { setFieldDropOpen(false); setOpDropOpen(false); }
  }, [isOpen]);

  useEffect(() => {
    if (valueExpanded && searchRef.current) searchRef.current.focus();
  }, [valueExpanded]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        anchorElement?.contains(target) ||
        fieldDropRef.current?.contains(target) ||
        opDropRef.current?.contains(target)
      ) return;
      handleCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, anchorElement]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!fieldDropOpen && !opDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (!fieldDropRef.current?.contains(e.target as Node)) setFieldDropOpen(false);
      if (!opDropRef.current?.contains(e.target as Node)) setOpDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fieldDropOpen, opDropOpen]);

  // Clear selected values when field type changes
  const handleFieldChange = (val: string) => {
    setField(val);
    setSelectedValues([]);
    setSearch('');
    setValueExpanded(false);
    setFieldDropOpen(false);
  };

  // Value options based on field
  const allOptions: { value: string; label: string }[] = field === 'measure'
    ? extractMeasures(data).map(m => ({ value: m, label: m }))
    : field === 'account'
    ? extractAccounts(data).map(a => ({ value: a, label: a }))
    : field === 'category'
    ? extractCategories(data).map(c => ({ value: c, label: c }))
    : field === 'products'
    ? extractProducts(data).map(p => ({ value: p, label: p }))
    : timePeriods;

  const filtered = allOptions.filter(o =>
    !search.trim() || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const isRevisiting = !!initialValue && initialSelectedValues.length > 0;
  const sorted = isRevisiting
    ? [...filtered].sort((a, b) => {
        const aWas = initialSelectedValues.includes(a.value);
        const bWas = initialSelectedValues.includes(b.value);
        if (aWas && !bWas) return -1;
        if (!aWas && bWas) return 1;
        return 0;
      })
    : filtered;

  const allSelected = filtered.length > 0 && filtered.every(o => selectedValues.includes(o.value));

  const toggle = (v: string) =>
    setSelectedValues(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const toggleAll = () => {
    if (allSelected) setSelectedValues(prev => prev.filter(v => !filtered.some(o => o.value === v)));
    else setSelectedValues(prev => Array.from(new Set([...prev, ...filtered.map(o => o.value)])));
  };

  const handleSave = () => {
    if (field === 'measure') {
      // Encode as: measureName|operator|value (main grid cell values)
      const encoded = `${measureName}|${measureOperator}|${measureValue}`;
      onSave(field, measureOperator, [encoded]);
    } else {
      onSave(field, operator, selectedValues);
    }
    onClose();
  };
  const handleCancel = () => {
    setSelectedValues(initialSelectedValues);
    setField(initialField || 'category');
    setOperator(initialOperator || 'equals');
    setSearch('');
    setValueExpanded(false);
    setMeasureName('');
    setMeasureOperator('gt');
    setMeasureValue('');
    onCancel();
  };

  if (!isOpen) return null;

  const getPosition = () => {
    if (!anchorElement) return { top: 8, left: 8, side: 'right' as const, nubbinTop: 28 };
    const rect = anchorElement.getBoundingClientRect();
    const w = 320, gap = 8, vw = window.innerWidth, vh = window.innerHeight;
    const leftPos = rect.left - w - gap;
    const rightPos = rect.right + gap;
    const left = leftPos >= gap ? leftPos
      : rightPos + w <= vw - gap ? rightPos
      : Math.max(gap, vw - w - gap);
    const side = left < rect.left ? 'left' as const : 'right' as const;
    const top = Math.min(rect.top, vh - 420);
    const finalTop = Math.max(8, top);
    const anchorMidY = rect.top + rect.height / 2;
    const nubbinTop = Math.max(14, Math.min(392, anchorMidY - finalTop - 8));
    return { top: finalTop, left, side, nubbinTop };
  };

  const pos = getPosition();
  const fieldLabel = fieldOptions.find(f => f.value === field)?.label ?? field;
  const opLabel = operatorOptions.find(o => o.value === operator)?.label ?? operator;
  const selectedCount = selectedValues.length;
  const placeholder = field === 'time' ? 'Search time periods...' : `Search ${fieldLabel.toLowerCase()}...`;

  const measureNames = extractMeasures(data);
  const measureNameLabel = measureName || 'Select measure…';
  const measureOpLabel = numericOperatorOptions.find(o => o.value === measureOperator)?.label ?? measureOperator;

  const nubbinOuterStyle: React.CSSProperties = pos.side === 'left'
    ? {
        position: 'absolute',
        top: `${pos.nubbinTop}px`,
        right: '-10px',
        width: 0,
        height: 0,
        borderTop: '10px solid transparent',
        borderBottom: '10px solid transparent',
        borderLeft: '10px solid var(--slds-g-color-neutral-base-70)',
        pointerEvents: 'none',
        zIndex: 100011,
      }
    : {
        position: 'absolute',
        top: `${pos.nubbinTop}px`,
        left: '-10px',
        width: 0,
        height: 0,
        borderTop: '10px solid transparent',
        borderBottom: '10px solid transparent',
        borderRight: '10px solid var(--slds-g-color-neutral-base-70)',
        pointerEvents: 'none',
        zIndex: 100011,
      };

  const nubbinInnerStyle: React.CSSProperties = pos.side === 'left'
    ? {
        position: 'absolute',
        top: `${pos.nubbinTop + 1}px`,
        right: '-9px',
        width: 0,
        height: 0,
        borderTop: '9px solid transparent',
        borderBottom: '9px solid transparent',
        borderLeft: '9px solid #ffffff',
        pointerEvents: 'none',
        zIndex: 100012,
      }
    : {
        position: 'absolute',
        top: `${pos.nubbinTop + 1}px`,
        left: '-9px',
        width: 0,
        height: 0,
        borderTop: '9px solid transparent',
        borderBottom: '9px solid transparent',
        borderRight: '9px solid #ffffff',
        pointerEvents: 'none',
        zIndex: 100012,
      };

  const content = (
    <>
      <div className="ufp-backdrop" onClick={handleCancel} />
      <div ref={popoverRef} className="ufp-popover" style={{ top: pos.top, left: pos.left }}>
        <div style={nubbinOuterStyle} aria-hidden="true" />
        <div style={nubbinInnerStyle} aria-hidden="true" />

        {/* Field */}
        <div className="ufp-section">
          <label className="ufp-label">Field</label>
          <div className="ufp-dropdown-wrap" ref={fieldDropRef}>
            <button
              className="ufp-dropdown-trigger"
              onClick={() => { setFieldDropOpen(p => !p); setOpDropOpen(false); }}
            >
              <span className="ufp-trigger-label">
                <FieldIcon field={field} size={16} />
                {fieldLabel}
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {fieldDropOpen && (
              <div className="ufp-dropdown-menu">
                {fieldOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`ufp-dropdown-option${field === opt.value ? ' selected' : ''}`}
                    onClick={() => handleFieldChange(opt.value)}
                  >
                    <FieldIcon field={opt.value} size={15} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {field === 'measure' ? (
          <>
            {/* Measure name combobox */}
            <div className="ufp-section">
              <label className="ufp-label">Measure</label>
              <div className="ufp-dropdown-wrap" ref={measureNameDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setMeasureNameDropOpen(p => !p); setMeasureOpDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span className={measureName ? undefined : 'ufp-value-placeholder-inline'}>{measureNameLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {measureNameDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {measureNames.map(mn => (
                      <button
                        key={mn}
                        className={`ufp-dropdown-option${measureName === mn ? ' selected' : ''}`}
                        onClick={() => { setMeasureName(mn); setMeasureNameDropOpen(false); }}
                      >
                        {mn}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Numeric operator */}
            <div className="ufp-section">
              <label className="ufp-label">Operator</label>
              <div className="ufp-dropdown-wrap" ref={measureOpDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setMeasureOpDropOpen(p => !p); setMeasureNameDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span>{measureOpLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {measureOpDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {numericOperatorOptions.map(opt => (
                      <button
                        key={opt.value}
                        className={`ufp-dropdown-option${measureOperator === opt.value ? ' selected' : ''}`}
                        onClick={() => { setMeasureOperator(opt.value); setMeasureOpDropOpen(false); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Numeric value input */}
            <div className="ufp-section">
              <label className="ufp-label">Value</label>
              <input
                className="ufp-measure-value-input"
                type="number"
                placeholder="Enter a number…"
                value={measureValue}
                onChange={e => setMeasureValue(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
        {/* Operator */}
        <div className="ufp-section">
          <label className="ufp-label">Operator</label>
          <div className="ufp-dropdown-wrap" ref={opDropRef}>
            <button
              className="ufp-dropdown-trigger"
              onClick={() => { setOpDropOpen(p => !p); setFieldDropOpen(false); }}
            >
              <span>{opLabel}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {opDropOpen && (
              <div className="ufp-dropdown-menu">
                {operatorOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`ufp-dropdown-option${operator === opt.value ? ' selected' : ''}`}
                    onClick={() => { setOperator(opt.value); setOpDropOpen(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Value */}
        <div className="ufp-section">
          <label className="ufp-label">Value</label>
          {!valueExpanded ? (
            <div
              className="ufp-value-collapsed"
              onClick={() => { setValueExpanded(true); setFieldDropOpen(false); setOpDropOpen(false); }}
            >
              {selectedCount > 0
                ? <span className="ufp-value-selected">{selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected</span>
                : <span className="ufp-value-placeholder">Click to select values…</span>
              }
            </div>
          ) : (
            <div className="ufp-value-expanded">
              <input
                ref={searchRef}
                type="text"
                className="ufp-search"
                placeholder={placeholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="ufp-checkbox-list">
                {filtered.length > 0 && (
                  <label className="ufp-checkbox-item ufp-checkbox-all">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    <span>All</span>
                  </label>
                )}
                {sorted.map(opt => (
                  <label key={opt.value} className="ufp-checkbox-item">
                    <input type="checkbox" checked={selectedValues.includes(opt.value)} onChange={() => toggle(opt.value)} />
                    <span>{opt.label}</span>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <div className="ufp-no-results">No results found</div>
                )}
              </div>
            </div>
          )}
        </div>
          </>
        )}

        {/* Actions */}
        <div className="ufp-actions">
          <button className="ufp-btn ufp-btn-cancel" onClick={handleCancel}>Cancel</button>
          <button className="ufp-btn ufp-btn-save" onClick={handleSave}>Save</button>
        </div>

      </div>
    </>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default UnifiedFilterPopover;
