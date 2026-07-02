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
    <img src={`${import.meta.env.BASE_URL}new_account.svg`} width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  if (field === 'category') return (
    <img src={`${import.meta.env.BASE_URL}category.svg`} width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  if (field === 'products') return (
    <img src={`${import.meta.env.BASE_URL}product.svg`} width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
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

// Operators available when a dimension (Account/Category/Product) is filtered by a
// measure value instead of by its name — mirrors the column-level filter options.
const dimensionMeasureOperatorOptions = [
  { value: 'gt',  label: 'Greater than' },
  { value: 'gte', label: 'Greater than or equal' },
  { value: 'lt',  label: 'Less than' },
  { value: 'lte', label: 'Less than or equal' },
  { value: 'eq',  label: 'Equals' },
  { value: 'neq', label: 'Not equals' },
  { value: 'topN', label: 'Top-N' },
  { value: 'bottomN', label: 'Bottom-N' },
];

const DIMENSION_FIELDS = new Set(['account', 'category', 'products']);
const DIM_MEASURE_OPS = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'topN', 'bottomN']);

const MATCH_MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
];

// Month options for the Time Period start/end range selectors.
const RANGE_MONTHS = [
  { key: 'jan2026', label: 'Jan 26' }, { key: 'feb2026', label: 'Feb 26' },
  { key: 'mar2026', label: 'Mar 26' }, { key: 'apr2026', label: 'Apr 26' },
  { key: 'may2026', label: 'May 26' }, { key: 'jun2026', label: 'Jun 26' },
  { key: 'jul2026', label: 'Jul 26' }, { key: 'aug2026', label: 'Aug 26' },
  { key: 'sep2026', label: 'Sep 26' }, { key: 'oct2026', label: 'Oct 26' },
  { key: 'nov2026', label: 'Nov 26' }, { key: 'dec2026', label: 'Dec 26' },
];
const rangeMonthLabel = (key: string): string => RANGE_MONTHS.find(m => m.key === key)?.label ?? key;
// Parse a stored time value ("Equals Apr 26 to Jun 26" or a discrete list) into month keys.
const parseTimeValueToRange = (raw: string): { start: string; end: string } => {
  const body = (raw || '').replace(/^Equals\s*/i, '').trim();
  const toKey = (tok?: string): string | null => {
    const key = `${(tok || '').trim().slice(0, 3).toLowerCase()}2026`;
    return RANGE_MONTHS.some(m => m.key === key) ? key : null;
  };
  if (/\sto\s/i.test(body)) {
    const [a, b] = body.split(/\sto\s/i);
    return { start: toKey(a) ?? 'jan2026', end: toKey(b) ?? 'dec2026' };
  }
  const present = RANGE_MONTHS.map(m => m.key).filter(k => body.split(',').some(t => toKey(t) === k));
  if (present.length === 0) return { start: 'jan2026', end: 'dec2026' };
  return { start: present[0], end: present[present.length - 1] };
};

// Live preview of how many dimension members a measure-based filter keeps. Mirrors the
// apply logic in FiltersPanel: Top/Bottom-N ranks by the summed value; comparison
// operators keep a member only when every period satisfies the operator.
const computeDimMatchCount = (
  data: MeasureData[], field: string, measureName: string, op: string, rawVal: string,
): { matched: number; total: number } => {
  const dimType = field === 'products' ? 'product' : field;
  const measure = data.find(m => (m.name ?? m.id) === measureName);
  const rows: any[] = [];
  const collect = (arr: any[] | undefined) => arr?.forEach((r: any) => {
    if (r.type === dimType && (dimType !== 'product' || !r.children || r.children.length === 0)) rows.push(r);
    if (r.children) collect(r.children);
  });
  if (measure) collect(measure.children);
  const total = new Set(rows.map(r => (r.name ?? '').trim()).filter(Boolean)).size;
  if (!measure || rows.length === 0) return { matched: 0, total };

  if (op === 'topN' || op === 'bottomN') {
    const n = Math.max(0, Math.floor(parseFloat(rawVal) || 0));
    return { matched: Math.min(n, total), total };
  }
  const threshold = parseFloat(rawVal);
  if (isNaN(threshold)) return { matched: total, total };
  const holds = (v: number): boolean =>
    op === 'gt' ? v > threshold
    : op === 'gte' ? v >= threshold
    : op === 'lt' ? v < threshold
    : op === 'lte' ? v <= threshold
    : op === 'eq' ? v === threshold
    : op === 'neq' ? v !== threshold
    : true;
  const matchedNames = new Set<string>();
  rows.forEach(r => {
    const nm = (r.name ?? '').trim();
    if (!nm) return;
    const vals = MATCH_MONTH_KEYS.map(k => Number(r?.values?.[k]) || 0);
    if (vals.length > 0 && vals.every(holds)) matchedNames.add(nm);
  });
  return { matched: matchedNames.size, total };
};

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

  // Dimension "Filter By" state: 'name' (default) or a measure name. When a measure is
  // chosen, the dimension is filtered by that measure's value (numeric ops + Top/Bottom-N).
  const [dimFilterBy, setDimFilterBy] = useState('name');
  const [dimMeasureOp, setDimMeasureOp] = useState('gt');
  const [dimMeasureValue, setDimMeasureValue] = useState('');
  const [dimFilterByDropOpen, setDimFilterByDropOpen] = useState(false);
  const [dimOpDropOpen, setDimOpDropOpen] = useState(false);
  const dimFilterByDropRef = useRef<HTMLDivElement>(null);
  const dimOpDropRef = useRef<HTMLDivElement>(null);

  // Time Period start/end range state.
  const [timeStart, setTimeStart] = useState('jan2026');
  const [timeEnd, setTimeEnd] = useState('dec2026');
  const [timeStartDropOpen, setTimeStartDropOpen] = useState(false);
  const [timeEndDropOpen, setTimeEndDropOpen] = useState(false);
  const timeStartDropRef = useRef<HTMLDivElement>(null);
  const timeEndDropRef = useRef<HTMLDivElement>(null);

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
      setDimFilterBy('name');
      setDimMeasureOp('gt');
      setDimMeasureValue('');

      // Hydrate the Time Period range from the existing card value (defaults to full year).
      if ((initialField || '') === 'time' && initialValue) {
        const { start, end } = parseTimeValueToRange(initialValue);
        setTimeStart(start);
        setTimeEnd(end);
      } else {
        setTimeStart('jan2026');
        setTimeEnd('dec2026');
      }

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

      // Revisiting a dimension filtered by a measure: value encoded as measureName|op|val
      if (DIMENSION_FIELDS.has(initialField || '') && initialValue && initialValue.includes('|')) {
        const parts = initialValue.split('|');
        if (parts.length >= 3 && DIM_MEASURE_OPS.has(parts[1] ?? '')) {
          setDimFilterBy(parts[0]);
          setDimMeasureOp(parts[1]);
          setDimMeasureValue(parts.slice(2).join('|'));
        }
      }
    }
  }, [isOpen, initialField, initialValue]);

  // Close measure / dimension-measure dropdowns on outside click
  useEffect(() => {
    if (!measureNameDropOpen && !measureOpDropOpen && !dimFilterByDropOpen && !dimOpDropOpen && !timeStartDropOpen && !timeEndDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (!measureNameDropRef.current?.contains(e.target as Node)) setMeasureNameDropOpen(false);
      if (!measureOpDropRef.current?.contains(e.target as Node)) setMeasureOpDropOpen(false);
      if (!dimFilterByDropRef.current?.contains(e.target as Node)) setDimFilterByDropOpen(false);
      if (!dimOpDropRef.current?.contains(e.target as Node)) setDimOpDropOpen(false);
      if (!timeStartDropRef.current?.contains(e.target as Node)) setTimeStartDropOpen(false);
      if (!timeEndDropRef.current?.contains(e.target as Node)) setTimeEndDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [measureNameDropOpen, measureOpDropOpen, dimFilterByDropOpen, dimOpDropOpen, timeStartDropOpen, timeEndDropOpen]);

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
    // Reset dimension "Filter By" back to Name whenever the field changes.
    setDimFilterBy('name');
    setDimMeasureOp('gt');
    setDimMeasureValue('');
    setDimFilterByDropOpen(false);
    setDimOpDropOpen(false);
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
    if (field === 'time') {
      // Time is a start→end range. Keep chronological order, then encode as the
      // "Equals <start> to <end>" string the grid understands.
      const si = RANGE_MONTHS.findIndex(m => m.key === timeStart);
      const ei = RANGE_MONTHS.findIndex(m => m.key === timeEnd);
      const [fromKey, toKey] = si <= ei ? [timeStart, timeEnd] : [timeEnd, timeStart];
      onSave('time', 'equals', [`Equals ${rangeMonthLabel(fromKey)} to ${rangeMonthLabel(toKey)}`]);
      onClose();
      return;
    }
    if (field === 'measure') {
      // Encode as: measureName|operator|value (main grid cell values)
      const encoded = `${measureName}|${measureOperator}|${measureValue}`;
      onSave(field, measureOperator, [encoded]);
    } else if (DIMENSION_FIELDS.has(field) && dimFilterBy !== 'name') {
      // Dimension filtered by a measure value. Encode as: measureName|op|value
      const encoded = `${dimFilterBy}|${dimMeasureOp}|${dimMeasureValue}`;
      onSave(field, dimMeasureOp, [encoded]);
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
    setDimFilterBy('name');
    setDimMeasureOp('gt');
    setDimMeasureValue('');
    setTimeStart('jan2026');
    setTimeEnd('dec2026');
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

  const isDimensionField = DIMENSION_FIELDS.has(field);
  const dimFilterByLabel = dimFilterBy === 'name' ? 'Name' : dimFilterBy;
  const dimMeasureOpLabel = dimensionMeasureOperatorOptions.find(o => o.value === dimMeasureOp)?.label ?? dimMeasureOp;
  const dimValueIsRank = dimMeasureOp === 'topN' || dimMeasureOp === 'bottomN';
  const dimMemberNoun = field === 'products' ? 'products' : field === 'account' ? 'accounts' : 'categories';
  const dimMatch = isDimensionField && dimFilterBy !== 'name' && dimMeasureValue.trim() !== ''
    ? computeDimMatchCount(data, field, dimFilterBy, dimMeasureOp, dimMeasureValue)
    : null;

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
        {/* Filter By (dimension fields only): Name or a measure */}
        {isDimensionField && (
          <div className="ufp-section">
            <label className="ufp-label">Filter By</label>
            <div className="ufp-dropdown-wrap" ref={dimFilterByDropRef}>
              <button
                className="ufp-dropdown-trigger"
                onClick={() => { setDimFilterByDropOpen(p => !p); setFieldDropOpen(false); setDimOpDropOpen(false); }}
              >
                <span>{dimFilterByLabel}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {dimFilterByDropOpen && (
                <div className="ufp-dropdown-menu">
                  <button
                    className={`ufp-dropdown-option${dimFilterBy === 'name' ? ' selected' : ''}`}
                    onClick={() => { setDimFilterBy('name'); setDimFilterByDropOpen(false); }}
                  >
                    Name
                  </button>
                  {measureNames.map(mn => (
                    <button
                      key={mn}
                      className={`ufp-dropdown-option${dimFilterBy === mn ? ' selected' : ''}`}
                      onClick={() => { setDimFilterBy(mn); setDimFilterByDropOpen(false); }}
                    >
                      {mn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {field === 'time' ? (
          <>
            {/* Start month */}
            <div className="ufp-section">
              <label className="ufp-label">Start</label>
              <div className="ufp-dropdown-wrap" ref={timeStartDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setTimeStartDropOpen(p => !p); setTimeEndDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span>{rangeMonthLabel(timeStart)}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {timeStartDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {RANGE_MONTHS.map(m => (
                      <button
                        key={m.key}
                        className={`ufp-dropdown-option${timeStart === m.key ? ' selected' : ''}`}
                        onClick={() => { setTimeStart(m.key); setTimeStartDropOpen(false); }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* End month */}
            <div className="ufp-section">
              <label className="ufp-label">End</label>
              <div className="ufp-dropdown-wrap" ref={timeEndDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setTimeEndDropOpen(p => !p); setTimeStartDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span>{rangeMonthLabel(timeEnd)}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {timeEndDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {RANGE_MONTHS.map(m => (
                      <button
                        key={m.key}
                        className={`ufp-dropdown-option${timeEnd === m.key ? ' selected' : ''}`}
                        onClick={() => { setTimeEnd(m.key); setTimeEndDropOpen(false); }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : isDimensionField && dimFilterBy !== 'name' ? (
          <>
            {/* Measure-based operator (numeric + Top/Bottom-N) */}
            <div className="ufp-section">
              <label className="ufp-label">Operator</label>
              <div className="ufp-dropdown-wrap" ref={dimOpDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setDimOpDropOpen(p => !p); setDimFilterByDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span>{dimMeasureOpLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {dimOpDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {dimensionMeasureOperatorOptions.map(opt => (
                      <button
                        key={opt.value}
                        className={`ufp-dropdown-option${dimMeasureOp === opt.value ? ' selected' : ''}`}
                        onClick={() => { setDimMeasureOp(opt.value); setDimOpDropOpen(false); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Value: threshold, or N for Top/Bottom-N */}
            <div className="ufp-section">
              <label className="ufp-label">{dimValueIsRank ? 'N' : 'Value'}</label>
              <input
                className="ufp-measure-value-input"
                type="number"
                placeholder={dimValueIsRank ? 'Enter N…' : 'Enter a number…'}
                value={dimMeasureValue}
                onChange={e => setDimMeasureValue(e.target.value)}
              />
              {dimMatch && (
                <div
                  className="ufp-match-hint"
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: dimMatch.matched === 0 ? '#ba0517' : '#3e3e3c',
                  }}
                >
                  {dimMatch.matched === 0
                    ? `No ${dimMemberNoun} match — the grid will be empty. Try a different value.`
                    : `${dimMatch.matched} of ${dimMatch.total} ${dimMemberNoun} match`}
                  {!dimValueIsRank && (
                    <span style={{ color: '#706e6b' }}> (every period must satisfy the condition)</span>
                  )}
                </div>
              )}
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
