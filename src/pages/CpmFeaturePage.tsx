import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReviewMeasuresModal, { Measure } from '../components/ReviewMeasuresModal';
import ManageUserAccessModal from '../components/ManageUserAccessModal';
import '../styles/pages/CpmFeaturePage.css';

/* Assets captured from the Figma design (served from /public). */
const A = `${import.meta.env.BASE_URL}cpm-feature/`;
const MEDIA = `${A}14b012ccd99b9268e1d262f873684086ebc8dc52.png`;
const CLOUD_ICON = `${import.meta.env.BASE_URL}manufacturing-cloud-icon.png`;

/* ── Inline utility icons (crisp, dependency-free) ───────────────────────── */
const ChevronDown: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 6l4 4 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRight: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M6 4l4 4-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="9" cy="9" r="6" stroke={color} strokeWidth="1.6" />
    <path d="M13.5 13.5l3 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const ExternalLinkIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#0176d3' }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M5.5 2.5H2.5v9h9v-3" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 2.5h3.5V6" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.5 2.5L7 7" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#0176d3' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.3" />
    <circle cx="8" cy="5" r="1" fill={color} />
    <path d="M8 7.5v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const WarningIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 1.5l6.5 11.5H1.5L8 1.5z" fill="#dd7a01" />
    <path d="M8 6v3.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="11.2" r="0.9" fill="#fff" />
  </svg>
);

const RefreshIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M13 8a5 5 0 1 1-1.5-3.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <path d="M13 2v3h-3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ThreeDots: React.FC<{ color?: string }> = ({ color = '#747474' }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill={color} aria-hidden>
    <circle cx="8" cy="3" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="8" cy="13" r="1.4" />
  </svg>
);

const PlayIcon: React.FC = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
    <path d="M19 15l14 9-14 9V15z" fill="#0b5cab" />
  </svg>
);

const StepCircle: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9.5" stroke="#c9c9c9" strokeWidth="1.5" />
  </svg>
);

const CloseIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 4l8 8M12 4l-8 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const StepCheck: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#2e844a" />
    <path
      d="M7.5 12.4l3 3 6-6.4"
      stroke="#ffffff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StepCheckBlue: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#0176d3" />
    <path
      d="M7.5 12.4l3 3 6-6.4"
      stroke="#ffffff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Spinner: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    className="cpm-spinner"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
  >
    <circle cx="8" cy="8" r="6.5" stroke="#e5e5e5" strokeWidth="2" />
    <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="#0176d3" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const InfoFilled: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="8" fill={color} />
    <circle cx="8" cy="4.6" r="1" fill="#fff" />
    <path d="M8 7v4.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const SyncSuccessIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="8" fill="#2e844a" />
    <path d="M4.5 8.2l2.3 2.3L11.5 5.6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DataRequestedIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="8" fill="#fe9339" />
    <path d="M8 4v4.4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11.3" r="0.9" fill="#fff" />
  </svg>
);

const PlusIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M7 2.5v9M2.5 7h9" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const KebabIcon: React.FC<{ color?: string }> = ({ color = '#5c5c5c' }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <circle cx="7" cy="2.5" r="1.25" fill={color} />
    <circle cx="7" cy="7" r="1.25" fill={color} />
    <circle cx="7" cy="11.5" r="1.25" fill={color} />
  </svg>
);

const StepCheckBlueSm: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#0176d3" />
    <path
      d="M7.5 12.4l3 3 6-6.4"
      stroke="#ffffff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RadioOn: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="9" fill="#0176d3" />
    <circle cx="10" cy="10" r="6.5" fill="#fff" />
  </svg>
);

const RadioOff: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="8.25" stroke="#747474" strokeWidth="1.5" />
  </svg>
);

const CheckboxOn: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <rect x="0.5" y="0.5" width="17" height="17" rx="2.5" fill="#0176d3" />
    <path d="M5 9.2l2.6 2.6L13 6.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckboxOff: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <rect x="1" y="1" width="16" height="16" rx="2.5" stroke="#747474" strokeWidth="1.5" />
  </svg>
);

const BlueCheckMark: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M3.5 9.4l3.5 3.5L14.5 5" stroke="#0176d3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DownCaret: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 6l4 4 4-4" stroke="#3e3e3c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── Global-header chrome icons ──────────────────────────────────────────── */
const CloudLogo: React.FC = () => (
  <svg width="40" height="28" viewBox="0 0 40 28" fill="none" aria-hidden>
    <path
      d="M16.4 7.1a6.6 6.6 0 0 1 11.2 1.5 5.4 5.4 0 0 1 2.2-.5 5.5 5.5 0 0 1 1 10.9 5 5 0 0 1-6.7 2.4 5.7 5.7 0 0 1-10.6-.3 5 5 0 0 1-1-.1 5.5 5.5 0 0 1-1.3-10.4 6 6 0 0 1 5-3z"
      fill="#00a1e0"
    />
  </svg>
);

const Waffle: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#747474" aria-hidden>
    {[2, 8, 14].map((y) =>
      [2, 8, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="3.5" rx="1" />)
    )}
  </svg>
);

const StarIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <path
      d="M10 2.5l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5L5.5 16l1-5L2.8 7.7l5-.6L10 2.5z"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusBox: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <rect x="2.5" y="2.5" width="15" height="15" rx="3" stroke="#747474" strokeWidth="1.3" />
    <path d="M10 6.5v7M6.5 10h7" stroke="#747474" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const HelpIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="7.3" stroke="#747474" strokeWidth="1.3" />
    <path
      d="M8 7.7a2 2 0 1 1 2.6 1.9c-.5.2-.8.6-.8 1.1v.4"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <circle cx="9.85" cy="13.4" r="0.85" fill="#747474" />
  </svg>
);

const GearIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="2.4" stroke="#747474" strokeWidth="1.3" />
    <path
      d="M10 2.2v2.3M10 15.5v2.3M2.2 10h2.3M15.5 10h2.3M4.5 4.5l1.6 1.6M13.9 13.9l1.6 1.6M15.5 4.5l-1.6 1.6M6.1 13.9l-1.6 1.6"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const BellIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <path
      d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.2 4.8-1.6 5.3-.2.2 0 .7.3.7h11.6c.3 0 .5-.5.3-.7-.4-.5-1.6-1.8-1.6-5.3A4.5 4.5 0 0 0 10 3z"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M8.4 16a1.7 1.7 0 0 0 3.2 0" stroke="#747474" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/* ── Left-nav model ──────────────────────────────────────────────────────── */
const NAV_ITEMS: Array<{ label: string; selected?: boolean; section?: boolean; chevron?: boolean }> = [
  { label: 'Setup Home' },
  { label: 'Salesforce Go', selected: true },
  { label: 'ADMINISTRATION', section: true },
  { label: 'Users', chevron: true },
  { label: 'Data', chevron: true },
  { label: 'Email', chevron: true },
  { label: 'PLATFORM TOOLS', section: true },
  { label: 'Apps', chevron: true },
  { label: 'Feature Settings', chevron: true },
  { label: 'Slack', chevron: true },
  { label: 'Heroku', chevron: true },
  { label: 'MuleSoft', chevron: true },
  { label: 'Einstein', chevron: true },
];

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure ' +
  'dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';

/* Level-name pools used to build each hierarchy's level rows in the detail panel. */
const PRODUCT_LEVEL_NAMES = ['Category', 'Brand', 'Sub-Brand', 'SKU', 'Variant', 'Pack'];
const ACCOUNT_LEVEL_NAMES = ['Region', 'Country', 'Account Group', 'Account', 'Sub-Account', 'Territory'];

type HierarchyRow = {
  id: string;
  name: string;
  active: boolean;
  dim: 'Account' | 'Product';
  levels: number;
  status: 'ok' | 'requested';
  sync: string;
  /** Optional custom level names; when present they override the generated pool. */
  levelNames?: string[];
};

const HIERARCHY_ROWS: HierarchyRow[] = [
  { id: 'fy26-acc', name: 'FY 26 Accounts', active: true, dim: 'Account', levels: 4, status: 'ok', sync: '12/05/2026, 10:30 AM' },
  { id: 'fy25-acc', name: 'FY 25 Accounts', active: false, dim: 'Account', levels: 3, status: 'ok', sync: '12/05/2026, 10:30 AM' },
  { id: 'fy24-acc', name: 'FY 24 Accounts', active: false, dim: 'Account', levels: 5, status: 'ok', sync: '12/05/2026, 9:15 AM' },
  { id: 'fy25-prod', name: 'FY 25 Products', active: false, dim: 'Product', levels: 3, status: 'ok', sync: '12/05/2026, 8:45 AM' },
  { id: 'fy24-prod', name: 'FY 24 Products', active: true, dim: 'Product', levels: 4, status: 'requested', sync: '12/05/2026, 8:00 AM' },
  { id: 'sales-acc', name: 'Sales Accounts', active: false, dim: 'Account', levels: 6, status: 'ok', sync: '11/05/2026, 5:30 PM' },
  { id: 'fin-acc', name: 'Financial Accounts', active: false, dim: 'Account', levels: 4, status: 'ok', sync: '11/05/2026, 5:30 PM' },
];

const INITIAL_MEASURES: Measure[] = [
  { id: 1, name: 'Sales Agreement Quantity', description: 'Sales Agreement Quantity', type: 'Read', sourceDmo: 'SalesAgreement', code: 'BASL1', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Volume', subsets: ['SalesAgreement', 'Revenue', 'Q1 Sales', 'Annual'], unit: 'volume', dataType: 'Number', sourceName: 'SalesAgreement', selected: false },
  { id: 2, name: 'Baseline Volume', description: 'Baseline Volume', type: 'Write', sourceDmo: 'OpportunityLineItem', code: 'BASL2', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Volume', subsets: ['Baseline', 'Forecast', 'Actuals'], unit: 'volume', dataType: 'Number', sourceName: 'OpportunityLineItem', selected: false },
  { id: 3, name: 'Promotional Lift', description: 'Promotional Lift', type: 'Write', sourceDmo: 'Trade Promotion', code: 'BASL3', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Volume', subsets: ['Promotions', 'Marketing', 'Campaigns'], unit: 'volume', dataType: 'Number', sourceName: 'Trade Promotion', selected: false },
  { id: 4, name: 'Trade ROI', description: 'Trade ROI', type: 'Read', sourceDmo: 'Trade Promotion', code: 'BASL4', aggregation: 'Average', disaggregation: 'Proportional', category: 'Operations', subsets: ['Trade', 'ROI', 'Performance', 'Analytics'], unit: '%', dataType: 'Percent', sourceName: 'Trade Promotion', selected: false },
  { id: 5, name: 'Net Sales Value (NSV)', description: 'Net Sales Value (NSV)', type: 'Read', sourceDmo: 'OpportunityLineItem', code: 'BASL5', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Financials', subsets: ['Revenue', 'Sales', 'Net Value'], unit: 'currency', dataType: 'Currency', sourceName: 'OpportunityLineItem', selected: false },
  { id: 6, name: 'Remaining Budget', description: 'Remaining Budget', type: 'Write', sourceDmo: 'Account Budget', code: 'BASL6', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Financials', subsets: ['Budget', 'Finance', 'Planning'], unit: 'currency', dataType: 'Currency', sourceName: 'Account Budget', selected: false },
  { id: 7, name: 'Fund Allocation', description: 'Fund Allocation', type: 'Write', sourceDmo: 'Trade Promotion', code: 'BASL7', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Financials', subsets: ['Fund', 'Allocation', 'Budget', 'Trade'], unit: 'currency', dataType: 'Currency', sourceName: 'Trade Promotion', selected: false },
  { id: 8, name: 'Deduction Amount', description: 'Deduction Amount', type: 'Read', sourceDmo: 'Deduction', code: 'BASL8', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Financials', subsets: ['Deductions', 'Adjustments'], unit: 'currency', dataType: 'Currency', sourceName: 'Deduction', selected: false },
  { id: 9, name: 'Forecasted Quantity', description: 'Forecasted Quantity', type: 'Write', sourceDmo: 'Opportunity', code: 'BASL9', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Volume', subsets: ['Forecast', 'Pipeline', 'Future'], unit: 'volume', dataType: 'Number', sourceName: 'Opportunity', selected: false },
  { id: 10, name: 'Weighted Pipeline', description: 'Weighted Pipeline', type: 'Read', sourceDmo: 'Opportunity', code: 'BASL10', aggregation: 'SUM', disaggregation: 'Proportional', category: 'Financials', subsets: ['Pipeline', 'Opportunities', 'Weighted'], unit: 'currency', dataType: 'Currency', sourceName: 'Opportunity', selected: false },
  { id: 11, name: 'Quota Attainment %', description: 'Quota Attainment %', type: 'Read', sourceDmo: 'Territory', code: 'BASL11', aggregation: 'Average', disaggregation: 'Proportional', category: 'Operations', subsets: ['Quota', 'Goals', 'Targets', 'Attainment'], unit: '%', dataType: 'Percent', sourceName: 'Territory', selected: false },
  { id: 12, name: 'Win Rate', description: 'Win Rate', type: 'Read', sourceDmo: 'Opportunity', code: 'BASL12', aggregation: 'Average', disaggregation: 'Proportional', category: 'Operations', subsets: ['Performance', 'Win Rate', 'Success'], unit: '%', dataType: 'Percent', sourceName: 'Opportunity', selected: false },
  { id: 13, name: 'Performance', description: 'Performance', type: 'Write', sourceDmo: 'Goal', code: 'BASL13', aggregation: 'Average', disaggregation: 'Proportional', category: 'Operations', subsets: ['Performance', 'Metrics', 'KPI'], unit: 'score', dataType: 'Number', sourceName: 'Goal', selected: false },
];

function levelRowsForCount(
  dim: 'Account' | 'Product',
  count: number,
): { level: string; name: string }[] {
  const pool = dim === 'Product' ? PRODUCT_LEVEL_NAMES : ACCOUNT_LEVEL_NAMES;
  return Array.from({ length: count }, (_, i) => ({
    level: `${dim} L${i}`,
    name: pool[i] || `Level ${i + 1}`,
  }));
}

function levelRowsFor(row: HierarchyRow): { level: string; name: string }[] {
  if (row.levelNames && row.levelNames.length > 0) {
    return row.levelNames.map((name, i) => ({ level: `${row.dim} L${i}`, name }));
  }
  return levelRowsForCount(row.dim, row.levels);
}

const CpmFeaturePage: React.FC = () => {
  const navigate = useNavigate();
  const [prereqOpen, setPrereqOpen] = useState(true);
  const [turnOnOpen, setTurnOnOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [dataSpaceSaved, setDataSpaceSaved] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const [turnedOn, setTurnedOn] = useState(false);
  const [reqOpen, setReqOpen] = useState(true);
  const [step11Done, setStep11Done] = useState(false);
  const [hierarchyModalOpen, setHierarchyModalOpen] = useState(false);
  const [measuresModalOpen, setMeasuresModalOpen] = useState(false);
  const [userAccessModalOpen, setUserAccessModalOpen] = useState(false);
  const [measures, setMeasures] = useState<Measure[]>(INITIAL_MEASURES);
  const [hierarchyTab, setHierarchyTab] = useState<'existing' | 'new'>('existing');
  const [hierarchyDimension, setHierarchyDimension] = useState('All');
  const [selectedHierarchy, setSelectedHierarchy] = useState<HierarchyRow | null>(null);
  const [detailTab, setDetailTab] = useState<'edit' | 'clone'>('edit');
  const [newDimension, setNewDimension] = useState('');
  const [levelColWidth, setLevelColWidth] = useState(300);
  const [hierarchies, setHierarchies] = useState<HierarchyRow[]>(HIERARCHY_ROWS);
  const [editLevelNames, setEditLevelNames] = useState<string[]>([]);
  const [cloneName, setCloneName] = useState('');
  const [cloneLevelNames, setCloneLevelNames] = useState<string[]>([]);
  const [cloneMenuIndex, setCloneMenuIndex] = useState<number | null>(null);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLevelNames, setNewLevelNames] = useState<string[]>(['', '', '', '', '']);
  const [newMenuIndex, setNewMenuIndex] = useState<number | null>(null);

  const visibleHierarchies =
    hierarchyDimension === 'All'
      ? hierarchies
      : hierarchies.filter((r) => r.dim === hierarchyDimension);

  const closeHierarchyModal = () => {
    setHierarchyModalOpen(false);
    setSelectedHierarchy(null);
  };

  const selectDimension = (d: string) => {
    setHierarchyDimension(d);
    setSelectedHierarchy(null);
  };

  const startLevelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = levelColWidth;
    const onMove = (ev: MouseEvent) => {
      setLevelColWidth(Math.max(120, Math.min(600, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Default name suggestion for a clone level at a given depth.
  const cloneDefaultName = (i: number) => {
    if (!selectedHierarchy) return '';
    const pool =
      selectedHierarchy.dim === 'Product' ? PRODUCT_LEVEL_NAMES : ACCOUNT_LEVEL_NAMES;
    return pool[i] || '';
  };

  const addCloneLevel = (index: number) => {
    setCloneLevelNames((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, cloneDefaultName(index + 1));
      return next;
    });
    setCloneMenuIndex(null);
  };

  const removeCloneLevel = (index: number) => {
    setCloneLevelNames((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
    setCloneMenuIndex(null);
  };

  const addNewLevel = (index: number) => {
    setNewLevelNames((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, '');
      return next;
    });
    setNewMenuIndex(null);
  };

  const removeNewLevel = (index: number) => {
    setNewLevelNames((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
    setNewMenuIndex(null);
  };

  const resetNewForm = () => {
    setNewName('');
    setNewLevelNames(['', '', '', '', '']);
    setNewMenuIndex(null);
  };

  const cancelNewHierarchy = () => {
    resetNewForm();
    setHierarchyTab('existing');
  };

  const deleteHierarchy = (id: string) => {
    setHierarchies((prev) => prev.filter((h) => h.id !== id));
    setSelectedHierarchy((prev) => (prev?.id === id ? null : prev));
    setRowMenuId(null);
  };

  const namesEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  // Save handler for the Edit / Clone detail panel (mirrors the reference app):
  // - Edit: replace the selected hierarchy's level names in place.
  // - Clone: create a new hierarchy from the selection and prepend it.
  const handleHierarchyDetailSave = () => {
    if (!selectedHierarchy) return;

    if (detailTab === 'edit') {
      const names = editLevelNames.map((n) => n.trim() || 'Enter Name');
      setHierarchies((prev) =>
        prev.map((h) =>
          h.id === selectedHierarchy.id
            ? { ...h, levelNames: names, levels: names.length }
            : h,
        ),
      );
    } else {
      const name = cloneName.trim() || `Clone of ${selectedHierarchy.name}`;
      const names = cloneLevelNames.map((n) => n.trim() || 'Enter Name');
      const cloned: HierarchyRow = {
        id: `clone-${Date.now()}`,
        name,
        active: false,
        dim: selectedHierarchy.dim,
        levels: names.length,
        status: 'requested',
        sync: '—',
        levelNames: names,
      };
      setHierarchies((prev) => [cloned, ...prev]);
      setHierarchyDimension(selectedHierarchy.dim);
    }

    setSelectedHierarchy(null);
  };

  // Save handler for the New Hierarchy tab.
  const handleCreateHierarchy = () => {
    const name = newName.trim();
    if (!name) return;
    const dim = (newDimension === 'Product' ? 'Product' : 'Account') as 'Account' | 'Product';
    const names = newLevelNames.map((n, i) => n.trim() || `${dim} L${i}`);
    const created: HierarchyRow = {
      id: `new-${Date.now()}`,
      name,
      active: false,
      dim,
      levels: names.length,
      status: 'requested',
      sync: '—',
      levelNames: names,
    };
    setHierarchies((prev) => [created, ...prev]);
    setHierarchyDimension(dim);
    setHierarchyTab('existing');
    resetNewForm();
  };

  useEffect(() => {
    if (!turningOn) return;
    const t = setTimeout(() => {
      setTurningOn(false);
      setTurnedOn(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [turningOn]);

  useEffect(() => {
    if (selectedHierarchy) {
      const names = levelRowsFor(selectedHierarchy).map((l) => l.name);
      setCloneName(`Clone of ${selectedHierarchy.name}`);
      setEditLevelNames(names);
      setCloneLevelNames(names);
      setCloneMenuIndex(null);
    }
  }, [selectedHierarchy]);

  // Close the per-row level dropdown when clicking outside of it.
  useEffect(() => {
    if (cloneMenuIndex === null && newMenuIndex === null && rowMenuId === null) return;
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.cpm-hier-lvl-menu-wrap')) {
        setCloneMenuIndex(null);
        setNewMenuIndex(null);
        setRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [cloneMenuIndex, newMenuIndex, rowMenuId]);

  // When a specific dimension is selected on the left panel, lock the New
  // Hierarchy dimension field to it; reset to a free choice when "All".
  useEffect(() => {
    if (hierarchyDimension === 'Account' || hierarchyDimension === 'Product') {
      setNewDimension(hierarchyDimension);
    } else {
      setNewDimension('');
    }
  }, [hierarchyDimension]);

  useEffect(() => {
    setSaveError(false);
  }, [
    hierarchyTab,
    detailTab,
    selectedHierarchy,
    newName,
    newDimension,
    newLevelNames,
    cloneName,
    cloneLevelNames,
    editLevelNames,
  ]);

  const baseLevelNames = selectedHierarchy
    ? levelRowsFor(selectedHierarchy).map((l) => l.name)
    : [];
  const editDirty =
    selectedHierarchy != null &&
    editLevelNames.length > 0 &&
    !namesEqual(editLevelNames, baseLevelNames);
  const cloneDirty =
    selectedHierarchy != null &&
    (cloneName !== `Clone of ${selectedHierarchy.name}` ||
      !namesEqual(cloneLevelNames, baseLevelNames));
  const dimensionLocked =
    hierarchyDimension === 'Account' || hierarchyDimension === 'Product';
  const newDirty =
    newName.trim() !== '' ||
    newLevelNames.some((n) => n.trim() !== '') ||
    newLevelNames.length !== 5 ||
    (!dimensionLocked && newDimension !== '');

  const hasUnsavedChanges =
    (hierarchyTab === 'new' && newDirty) ||
    (selectedHierarchy != null && detailTab === 'edit' && editDirty) ||
    (selectedHierarchy != null && detailTab === 'clone' && cloneDirty);

  return (
    <div className="cpm-feature-page">
      {/* ── Global header ──────────────────────────────────────────────── */}
      <header className="cpm-gh">
        <div className="cpm-gh-top">
          <span className="cpm-gh-logo">
            <CloudLogo />
          </span>
          <div className="cpm-gh-search">
            <div className="cpm-gh-search-all">
              <span>All</span>
              <DownCaret />
            </div>
            <div className="cpm-gh-search-field">
              <SearchIcon size={16} color="#706e6b" />
              <span>Search Salesforce</span>
            </div>
          </div>
          <div className="cpm-gh-icons">
            <StarIcon />
            <PlusBox />
            <HelpIcon />
            <GearIcon />
            <BellIcon />
            <span className="cpm-gh-avatar" aria-label="User" />
          </div>
        </div>
        <div className="cpm-gh-bottom">
          <span className="cpm-gh-logo" style={{ width: 20, height: 20 }}>
            <Waffle />
          </span>
          <span className="cpm-gh-setup">Setup</span>
          <div className="cpm-gh-tab">
            <span>Home</span>
            <ChevronDown size={16} color="#181818" />
          </div>
          <div className="cpm-gh-progress">
            <span className="bar" />
            <ChevronDown size={16} />
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="cpm-body">
        {/* Side nav */}
        <nav className="cpm-sidenav">
          <div className="cpm-sidenav-search">
            <div className="cpm-sidenav-search-field">
              <SearchIcon size={20} color="#747474" />
            </div>
          </div>
          {NAV_ITEMS.map((item) => {
            const cls = [
              'cpm-nav-item',
              item.selected ? 'cpm-nav-item--selected' : '',
              item.section ? 'cpm-nav-item--section' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={item.label}
                className={cls}
                onClick={item.label === 'Salesforce Go' ? () => navigate('/setup/salesforce-go') : undefined}
              >
                {item.chevron && <ChevronRight size={16} color="#747474" />}
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="cpm-main">
          {/* Hero */}
          <section className="cpm-hero-container">
            <div className="cpm-colorbar" />
            <div className="cpm-breadcrumb-row">
              <div className="cpm-breadcrumb">
                <span className="crumb">
                  <a className="crumb-link" onClick={() => navigate('/setup/salesforce-go')}>
                    Salesforce Go
                  </a>
                  <span className="crumb-sep">&gt;</span>
                </span>
                <span className="crumb">
                  <a className="crumb-link" onClick={() => navigate('/setup/cpm-feature-set')}>
                    Commercial Planning for Manufacturing
                  </a>
                  <span className="crumb-sep">&gt;</span>
                </span>
                <span className="crumb">
                  <span className="crumb-current">Commercial Planning for Manufacturing</span>
                </span>
              </div>
              <div className="cpm-header-actions">
                <button className="cpm-icon-btn" type="button" aria-label="Refresh">
                  <RefreshIcon />
                </button>
                <button className="cpm-icon-btn" type="button" aria-label="More actions">
                  <ThreeDots />
                </button>
              </div>
            </div>

            <div className="cpm-hero">
              <div className="cpm-hero-content">
                <div className="cpm-cloud-row">
                  <img src={CLOUD_ICON} alt="" />
                  <span>Manufacturing Cloud</span>
                </div>
                <h1 className="cpm-hero-title">Commercial Planning for Manufacturing</h1>
                <p className="cpm-hero-desc">{LOREM}</p>
                <span className="cpm-badge">In Progress</span>
              </div>
              <div className="cpm-media">
                <div className="cpm-media-bg">
                  <img src={MEDIA} alt="" />
                </div>
                <div className="cpm-media-play">
                  <PlayIcon />
                </div>
              </div>
            </div>
          </section>

          {/* Sections */}
          <div className="cpm-sections">
            {/* Complete the Prerequisites */}
            <section className="cpm-section">
              <button
                type="button"
                className="cpm-section-chevron"
                aria-expanded={prereqOpen}
                aria-label="Toggle Complete the Prerequisites"
                onClick={() => setPrereqOpen((o) => !o)}
              >
                {prereqOpen ? <ChevronDown /> : <ChevronRight />}
              </button>
              <div className="cpm-section-body">
                <div className="cpm-section-head">
                  <h2
                    className="cpm-section-title cpm-section-title--toggle"
                    onClick={() => setPrereqOpen((o) => !o)}
                  >
                    Complete the Prerequisites
                  </h2>
                  {prereqOpen && (
                    <p className="cpm-section-desc">
                      Complete the Prerequistes to continue configuring Commercial Planning for Manufacturing.
                    </p>
                  )}
                </div>

                {prereqOpen && (
                <div className="cpm-steps">
                  {/* Step 1 */}
                  <div className="cpm-step">
                    <div className="cpm-step-rail">
                      <StepCheck />
                      <div className="cpm-step-line" />
                    </div>
                    <div className="cpm-step-content">
                      <div className="cpm-step-main">
                        <div className="cpm-step-text">
                          <h3 className="cpm-step-title">Data Cloud Architect Permission Set</h3>
                          <p className="cpm-step-desc">Assign the Data Cloud Architect permission set to yourself</p>
                          <a className="cpm-link cpm-learn-more">
                            Learn More in Help
                            <ExternalLinkIcon />
                          </a>
                        </div>
                        <div className="cpm-step-controls">
                          <button className="cpm-btn cpm-btn--outline" type="button">
                            Review
                            <ExternalLinkIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="cpm-step">
                    <div className="cpm-step-rail">
                      <StepCheck />
                      <div className="cpm-step-line" />
                    </div>
                    <div className="cpm-step-content">
                      <div className="cpm-step-main">
                        <div className="cpm-step-text">
                          <h3 className="cpm-step-title">Set up Data 360</h3>
                          <a className="cpm-link cpm-learn-more">
                            Learn More in Help
                            <ExternalLinkIcon />
                          </a>
                        </div>
                        <div className="cpm-step-controls">
                          <button className="cpm-btn cpm-btn--outline" type="button">
                            Review
                            <ExternalLinkIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 — Select a Data Space */}
                  <div className="cpm-step">
                    <div className="cpm-step-rail">
                      {dataSpaceSaved ? <StepCheck /> : <StepCircle />}
                    </div>
                    <div className="cpm-step-content">
                      <div className="cpm-step-main">
                        <div className="cpm-step-text">
                          <h3 className="cpm-step-title">Select a Data Space</h3>
                          <p className="cpm-step-desc">
                            Decide which data space to use for your Commercial Planning data.{' '}
                            <span className="cpm-link-inline">Learn More in Help</span>
                          </p>
                        </div>
                        <div className="cpm-step-controls">
                          <button className="cpm-btn cpm-btn--disabled" type="button" disabled>
                            Manage Data Spaces
                            <ExternalLinkIcon color="#c9c9c9" />
                          </button>
                        </div>
                      </div>

                      <div className="cpm-embedded">
                        <div className="cpm-field">
                          <label className="cpm-field-label">
                            Data Space
                            <span className="cpm-info">
                              <InfoIcon />
                            </span>
                          </label>
                          <div className="cpm-select">Default</div>
                        </div>
                        {!dataSpaceSaved && (
                          <div className="cpm-save-actions">
                            <span className="cpm-save-warning">
                              After saving selection, you will not be able to make updates.
                            </span>
                            <div className="cpm-save-buttons">
                              <button className="cpm-btn cpm-btn--outline" type="button">
                                Cancel
                              </button>
                              <button
                                className="cpm-btn cpm-btn--brand"
                                type="button"
                                onClick={() => setSaveModalOpen(true)}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </section>

            {/* Turn on Commercial Planning for Manufacturing */}
            <section className="cpm-section cpm-section--turnon">
              <button
                type="button"
                className="cpm-section-chevron"
                aria-expanded={turnOnOpen}
                aria-label="Toggle Turn on Commercial Planning for Manufacturing"
                onClick={() => setTurnOnOpen((o) => !o)}
              >
                {turnOnOpen ? <ChevronDown /> : <ChevronRight />}
              </button>
              <div className="cpm-section-body">
                <div className="cpm-turnon-row">
                  <div className="cpm-turnon-title">
                    <h2
                      className="cpm-section-title cpm-section-title--toggle"
                      onClick={() => setTurnOnOpen((o) => !o)}
                    >
                      Turn on Commercial Planning for Manufacturing
                    </h2>
                    {!dataSpaceSaved && (
                      <span className="cpm-tooltip-wrap" tabIndex={0} aria-describedby="cpm-turnon-tip">
                        <WarningIcon />
                        <span className="cpm-tooltip" role="tooltip" id="cpm-turnon-tip">
                          Complete the pre-requisites to turn on the feature
                        </span>
                      </span>
                    )}
                  </div>
                  {turnedOn ? (
                    <span className="cpm-on-badge">On</span>
                  ) : turningOn ? (
                    <div className="cpm-turnon-progress">
                      <span className="cpm-turnon-progress-text">This may take several minutes...</span>
                      <Spinner size={20} />
                    </div>
                  ) : (
                    <button
                      className={`cpm-btn ${dataSpaceSaved ? 'cpm-btn--brand' : 'cpm-btn--turn-on'}`}
                      type="button"
                      disabled={!dataSpaceSaved}
                      onClick={() => {
                        setTurningOn(true);
                        setTurnOnOpen(true);
                      }}
                    >
                      Turn On
                    </button>
                  )}
                </div>

                {turningOn && turnOnOpen && (
                  <div className="cpm-automation-steps">
                    <div className="cpm-auto-step">
                      <div className="cpm-step-rail">
                        <StepCheckBlue />
                        <div className="cpm-step-line" />
                      </div>
                      <div className="cpm-auto-step-title">
                        <a className="cpm-link cpm-auto-step-link">Provision Data Kit</a>
                        <ExternalLinkIcon size={12} />
                        <InfoFilled size={16} />
                      </div>
                    </div>

                    <div className="cpm-auto-step">
                      <div className="cpm-step-rail">
                        <Spinner size={16} />
                        <div className="cpm-step-line" />
                      </div>
                      <div className="cpm-auto-step-title">
                        <a className="cpm-link cpm-auto-step-link">Deploy OOTB Configuration</a>
                        <ExternalLinkIcon size={12} />
                        <InfoFilled size={16} />
                      </div>
                    </div>

                    <div className="cpm-auto-step">
                      <div className="cpm-step-rail">
                        <Spinner size={16} />
                      </div>
                      <div className="cpm-auto-step-title">
                        <a className="cpm-link cpm-auto-step-link">
                          Turn on Commercial Planning for Manufacturing
                        </a>
                        <InfoFilled size={16} />
                      </div>
                    </div>
                  </div>
                )}

                {!turningOn && !turnedOn && turnOnOpen && (
                  <p className="cpm-section-desc">
                    Complete the prerequisites above before turning on Commercial Planning for Manufacturing.
                  </p>
                )}
              </div>
            </section>

            {/* Complete the Required Steps (appears once feature is turned on) */}
            {turnedOn && (
              <section className="cpm-section cpm-section--required">
                <button
                  type="button"
                  className="cpm-section-chevron"
                  aria-expanded={reqOpen}
                  aria-label="Toggle Complete the Required Steps"
                  onClick={() => setReqOpen((o) => !o)}
                >
                  {reqOpen ? <ChevronDown /> : <ChevronRight />}
                </button>
                <div className="cpm-section-body">
                  <div className="cpm-section-head">
                    <h2
                      className="cpm-section-title cpm-section-title--toggle"
                      onClick={() => setReqOpen((o) => !o)}
                    >
                      Complete the Required Steps
                    </h2>
                    {reqOpen && (
                      <p className="cpm-section-desc">
                        Complete the basics, Invoke the pre-built DPEs via salesforce flows and review the
                        out of the box settings
                      </p>
                    )}
                  </div>

                  {reqOpen && (
                    <div className="cpm-req">
                      {/* 1. Review Dimensions & Hierarchies */}
                      <div className="cpm-req-group">
                        <div className="cpm-req-lead">
                          <span className="cpm-req-ind"><RadioOn /></span>
                          <div className="cpm-req-lead-text">
                            <h3 className="cpm-req-title">1. Review Dimensions &amp; Hierarchies</h3>
                            <p className="cpm-req-desc">
                              Review and make any changes if required to out of the box settings
                            </p>
                          </div>
                        </div>
                        <div className="cpm-req-subs">
                          <div className="cpm-req-sub">
                            <button
                              type="button"
                              className="cpm-req-ind cpm-req-ind--btn"
                              onClick={() => setStep11Done((d) => !d)}
                              aria-pressed={step11Done}
                              aria-label={
                                step11Done
                                  ? 'Mark step 1.1 as not complete'
                                  : 'Mark step 1.1 as complete'
                              }
                            >
                              {step11Done ? <CheckboxOn /> : <CheckboxOff />}
                            </button>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">
                                1.1 View the Dimensions and Annotate Hierarchy levels
                              </p>
                              <p className="cpm-req-meta">2 Dimensions and 4 herarchies available</p>
                            </div>
                            <button
                              className="cpm-btn cpm-btn--outline"
                              type="button"
                              onClick={() => setHierarchyModalOpen(true)}
                            >
                              Manage
                            </button>
                          </div>
                          <div className="cpm-req-sub">
                            <span className="cpm-req-ind"><CheckboxOff /></span>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">
                                1.2 Run the DPEs for hierarchy building and dimension relationship mapping
                              </p>
                              <p className="cpm-req-sub-desc">
                                Run the "Define Dimension Hierarchy for Account Forecasting DPE"
                              </p>
                            </div>
                            <a
                              className="cpm-btn cpm-btn--outline"
                              href={window.location.origin + import.meta.env.BASE_URL + 'dpe_definition.html'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Go to DPE Definition
                              <ExternalLinkIcon />
                            </a>
                          </div>
                          <div className="cpm-req-sub">
                            <span className="cpm-req-ind"><CheckboxOff /></span>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">
                                1.3 Run the DPEs for hierarchy building and dimension relationship mapping
                              </p>
                              <p className="cpm-req-sub-desc">
                                Run the "Build Account–Product Relationships for Account Forecasting DPE"
                              </p>
                            </div>
                            <a
                              className="cpm-btn cpm-btn--outline"
                              href={window.location.origin + import.meta.env.BASE_URL + 'dpe_definition.html'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Go to DPE Definition
                              <ExternalLinkIcon />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* 2. Setup the Measures */}
                      <div className="cpm-req-group">
                        <div className="cpm-req-lead">
                          <span className="cpm-req-ind"><RadioOff /></span>
                          <div className="cpm-req-lead-text">
                            <h3 className="cpm-req-title">2. Setup the Measures</h3>
                            <p className="cpm-req-desc">View existing or create new measures</p>
                          </div>
                        </div>
                        <div className="cpm-req-subs">
                          <div className="cpm-req-sub">
                            <span className="cpm-req-ind"><CheckboxOff /></span>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">2.1 Review measures and add source DMOs</p>
                              <p className="cpm-req-meta">100 Measures Available</p>
                            </div>
                            <button
                              className="cpm-btn cpm-btn--outline"
                              type="button"
                              onClick={() => setMeasuresModalOpen(true)}
                            >
                              Manage
                            </button>
                          </div>
                          <div className="cpm-req-sub">
                            <span className="cpm-req-ind"><CheckboxOff /></span>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">2.2 Run the DPE for measure calculation</p>
                              <p className="cpm-req-sub-desc">
                                Run the Define Baseline Measures for Account Forecasting DPE.
                              </p>
                            </div>
                            <a
                              className="cpm-btn cpm-btn--outline"
                              href={window.location.origin + import.meta.env.BASE_URL + 'dpe_definition_2_2.html'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Go to DPE List
                              <ExternalLinkIcon />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* 3. Configure Time Granularity */}
                      <div className="cpm-req-group">
                        <div className="cpm-req-lead">
                          <span className="cpm-req-ind"><StepCheckBlueSm /></span>
                          <div className="cpm-req-lead-text">
                            <div className="cpm-req-title-row">
                              <h3 className="cpm-req-title">3. Configure Time Granularity</h3>
                              <span className="cpm-optional-badge">Optional</span>
                            </div>
                            <p className="cpm-req-desc">Provide time granularity your product will support</p>
                          </div>
                        </div>
                        <div className="cpm-req-subs">
                          <div className="cpm-req-sub">
                            <span className="cpm-req-ind cpm-req-ind--check"><BlueCheckMark /></span>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">3.1 Configure Org Calendar</p>
                              <p className="cpm-req-meta">Fiscal Calendar selected by default</p>
                            </div>
                            <button className="cpm-btn cpm-btn--outline" type="button">
                              Go to Org Calendar
                              <ExternalLinkIcon />
                            </button>
                          </div>
                          <div className="cpm-req-sub">
                            <span className="cpm-req-ind cpm-req-ind--check"><BlueCheckMark /></span>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">3.2 Setup time granularity</p>
                              <p className="cpm-req-meta">
                                Time granularity selected to Quarterly and Monthly by default
                              </p>
                            </div>
                            <button className="cpm-btn cpm-btn--outline" type="button">Review</button>
                          </div>
                        </div>
                      </div>

                      {/* 4. Setup User & User Roles */}
                      <div className="cpm-req-single">
                        <span className="cpm-req-ind"><CheckboxOn /></span>
                        <div className="cpm-req-lead-text">
                          <div className="cpm-req-title-row">
                            <h3 className="cpm-req-title">4. Setup User &amp; User Roles</h3>
                            <span className="cpm-optional-badge">Optional</span>
                          </div>
                          <p className="cpm-req-desc">
                            Review and make any changes if required to out of the box settings
                          </p>
                        </div>
                        <button className="cpm-btn cpm-btn--outline" type="button" onClick={() => setUserAccessModalOpen(true)}>Manage</button>
                      </div>

                      {/* 5. Setup Plan Configurations */}
                      <div className="cpm-req-single">
                        <span className="cpm-req-ind"><CheckboxOn /></span>
                        <div className="cpm-req-lead-text">
                          <h3 className="cpm-req-title">5. Setup Plan Configurations</h3>
                          <p className="cpm-req-desc">
                            Create your own and modify reuse out of the box plan configuration
                          </p>
                        </div>
                        <button className="cpm-btn cpm-btn--outline" type="button" onClick={() => navigate('/setup/plan-configuration-list')}>
                          Go to Plan Configuration List
                          <ExternalLinkIcon />
                        </button>
                      </div>

                      {/* 6. Sync Schedule for Data */}
                      <div className="cpm-req-single">
                        <span className="cpm-req-ind"><CheckboxOff /></span>
                        <div className="cpm-req-lead-text">
                          <h3 className="cpm-req-title">
                            6. Sync Schedule for Data for Measures &amp; Dimensional Hierarchies
                          </h3>
                          <p className="cpm-req-desc">
                            Sync Schedule for Data for Measures &amp; Dimensional Hierarchies
                          </p>
                        </div>
                        <button className="cpm-btn cpm-btn--outline" type="button">
                          Go to DPE List
                          <ExternalLinkIcon />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Configure Data Selection modal (opens on Save) */}
      {saveModalOpen && (
        <div className="cpm-modal-backdrop" onClick={() => setSaveModalOpen(false)}>
          <div className="cpm-modal-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="cpm-modal-close"
              aria-label="Close"
              onClick={() => setSaveModalOpen(false)}
            >
              <CloseIcon size={16} />
            </button>
            <div className="cpm-modal" role="dialog" aria-modal="true" aria-labelledby="cpm-modal-title">
              <div className="cpm-modal-header">
                <h2 id="cpm-modal-title" className="cpm-modal-title">
                  Configure Data Selection?
                </h2>
              </div>
              <div className="cpm-modal-body">
                <p className="cpm-modal-text">
                  This feature uses generative AI to generate responses using data from the selected Data Space.
                  AI-generated outputs may be inaccurate or incomplete. Ensure that only approved data sources are
                  connected and review responses before acting on them.
                </p>
                <div className="cpm-modal-disclaimers">
                  <p className="cpm-modal-disc-title">Disclaimers</p>
                  <div className="cpm-modal-disc-box">
                    <p className="cpm-modal-disc-head">No Changes Allowed!</p>
                    <p className="cpm-modal-disc-text">
                      Saving this configuration permanently associates the selected Data Space with this feature.
                      Changes cannot be made later.
                    </p>
                  </div>
                </div>
              </div>
              <div className="cpm-modal-footer">
                <button
                  className="cpm-btn cpm-btn--outline"
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="cpm-btn cpm-btn--brand"
                  type="button"
                  onClick={() => {
                    setDataSpaceSaved(true);
                    setSaveModalOpen(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setup Hierarchies modal (opens from step 1.1 Manage) */}
      {hierarchyModalOpen && (
        <div className="cpm-hier-backdrop" onClick={closeHierarchyModal}>
          <div
            className={`cpm-hier-modal ${selectedHierarchy && hierarchyTab === 'existing' ? 'cpm-hier-modal--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cpm-hier-title"
            style={{ ['--cpm-level-col-w' as string]: `${levelColWidth}px` } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cpm-hier-header">
              <h2 id="cpm-hier-title" className="cpm-hier-title">Setup Hierarchies</h2>
              <button
                type="button"
                className="cpm-hier-close"
                aria-label="Close"
                onClick={closeHierarchyModal}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="cpm-hier-body">
              {/* Notice — full width, below the header */}
              <div className="cpm-hier-notice">
                Need more context on these hierarchies?{' '}
                <a className="cpm-link">Go to Setup for more details</a>
              </div>

              <div className="cpm-hier-content">
                {/* Left dimensions panel — always visible */}
                <aside className="cpm-hier-side">
                  <div className="cpm-hier-side-head">
                    <span className="cpm-hier-side-title">DIMENSIONS</span>
                    <button type="button" className="cpm-hier-side-add" aria-label="Add dimension">
                      <PlusIcon />
                    </button>
                  </div>
                  <ul className="cpm-hier-dims">
                    {['All', 'Account', 'Product'].map((d) => (
                      <li key={d}>
                        <button
                          type="button"
                          className={`cpm-hier-dim ${hierarchyDimension === d ? 'is-active' : ''}`}
                          onClick={() => selectDimension(d)}
                        >
                          {d}
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>

                {/* Right section: tabs sit here, next to the DIMENSIONS panel */}
                <div className="cpm-hier-main">
                  <div className="cpm-hier-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={hierarchyTab === 'existing'}
                      className={`cpm-hier-tab ${hierarchyTab === 'existing' ? 'is-active' : ''}`}
                      onClick={() => setHierarchyTab('existing')}
                    >
                      Existing Hierarchies
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={hierarchyTab === 'new'}
                      className={`cpm-hier-tab ${hierarchyTab === 'new' ? 'is-active' : ''}`}
                      onClick={() => {
                        setHierarchyTab('new');
                        setSelectedHierarchy(null);
                      }}
                    >
                      New Hierarchy
                    </button>
                  </div>

                  {hierarchyTab === 'existing' ? (
                    <div className="cpm-hier-inner">
                      {/* Table (scrolls internally) */}
                      <div className="cpm-hier-table-wrap">
                        <div className="cpm-hier-toolbar">
                          <div className="cpm-hier-search">
                            <SearchIcon size={16} />
                            <input type="text" placeholder="Search..." aria-label="Search hierarchies" />
                          </div>
                        </div>

                        <div className="cpm-hier-table-scroll">
                          <table className="cpm-hier-table">
                            <thead>
                              <tr>
                                <th>Hierarchy</th>
                                <th>Dimension</th>
                                <th>Levels</th>
                                <th>Data Status</th>
                                <th>Last Sync</th>
                                <th className="cpm-hier-caret-col" />
                              </tr>
                            </thead>
                            <tbody>
                              {visibleHierarchies.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="cpm-hier-empty">
                                    No hierarchies for this dimension.
                                  </td>
                                </tr>
                              )}
                              {visibleHierarchies.map((r, idx, arr) => {
                                const isSelected = selectedHierarchy?.id === r.id;
                                return (
                                  <tr key={r.id} className={isSelected ? 'is-selected' : ''}>
                                    <td>
                                      <span className="cpm-hier-name">
                                        <a
                                          className="cpm-link"
                                          onClick={() => {
                                            setSelectedHierarchy(r);
                                            setDetailTab('edit');
                                          }}
                                        >
                                          {r.name}
                                        </a>
                                        {r.active && <span className="cpm-hier-active">ACTIVE</span>}
                                      </span>
                                    </td>
                                    <td>{r.dim}</td>
                                    <td>{r.levels}</td>
                                    <td>
                                      <span className="cpm-hier-status">
                                        {r.status === 'ok' ? <SyncSuccessIcon /> : <DataRequestedIcon />}
                                        {r.status === 'ok' ? 'Sync Successful' : 'Data Requested'}
                                      </span>
                                    </td>
                                    <td className="cpm-hier-sync-time">{r.sync}</td>
                                    <td className="cpm-hier-caret-col">
                                      <div className="cpm-hier-lvl-menu-wrap">
                                        <button
                                          type="button"
                                          className="cpm-hier-row-kebab"
                                          aria-label="Row actions"
                                          aria-haspopup="menu"
                                          aria-expanded={rowMenuId === r.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRowMenuId((cur) => (cur === r.id ? null : r.id));
                                          }}
                                        >
                                          <KebabIcon />
                                        </button>
                                        {rowMenuId === r.id && (
                                          <div
                                            className={`cpm-hier-lvl-menu ${
                                              idx === arr.length - 1 && arr.length > 1
                                                ? 'cpm-hier-lvl-menu--up'
                                                : ''
                                            }`}
                                            role="menu"
                                          >
                                            <button
                                              type="button"
                                              role="menuitem"
                                              className="cpm-hier-lvl-menu-item"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteHierarchy(r.id);
                                              }}
                                            >
                                              Delete Hierarchy
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 3rd panel — edit / clone */}
                      {selectedHierarchy && (
                        <aside className="cpm-hier-edit">
                          <div className="cpm-hier-edit-head">
                            <h3 className="cpm-hier-edit-title">{selectedHierarchy.name}</h3>
                            <div className="cpm-hier-mode-toggle">
                              <button
                                type="button"
                                className={`cpm-hier-mode-btn${detailTab === 'edit' ? ' is-active' : ''}`}
                                onClick={() => setDetailTab('edit')}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className={`cpm-hier-mode-btn${detailTab === 'clone' ? ' is-active' : ''}`}
                                onClick={() => setDetailTab('clone')}
                              >
                                Clone
                              </button>
                            </div>
                          </div>

                          <div className="cpm-hier-edit-body">
                            {detailTab === 'edit' ? (
                              <>
                                <div className="cpm-hier-edit-note">
                                  <span className="cpm-hier-edit-note-icon">i</span>
                                  <p>You can only edit the level names but not no.of levels</p>
                                </div>
                                <div className="cpm-hier-tree">
                                <div className="cpm-hier-tree-head">
                                  <span className="cpm-hier-col-th">
                                    Hierarchy Level
                                    <span
                                      className="cpm-hier-col-resizer"
                                      role="separator"
                                      aria-orientation="vertical"
                                      aria-label="Resize Hierarchy Level column"
                                      onMouseDown={startLevelResize}
                                    />
                                  </span>
                                  <span>Name</span>
                                </div>
                                  {levelRowsFor(selectedHierarchy).map((lv, i, arr) => (
                                    <div
                                      key={lv.level}
                                      className="cpm-hier-tree-row"
                                      style={{ ['--cpm-lvl' as string]: i } as React.CSSProperties}
                                    >
                                      <div className="cpm-hier-tree-cell">
                                        <button
                                          type="button"
                                          className={`cpm-hier-tree-chev ${i === arr.length - 1 ? 'is-empty' : ''}`}
                                          aria-label="Toggle level"
                                        >
                                          <ChevronDown size={14} />
                                        </button>
                                        <span className="cpm-hier-tree-link">{lv.level}</span>
                                      </div>
                                      <div className="cpm-hier-tree-cell">
                                        <input
                                          className="cpm-hier-tree-input"
                                          type="text"
                                          value={editLevelNames[i] ?? lv.name}
                                          onChange={(e) =>
                                            setEditLevelNames((prev) => {
                                              const next = [...prev];
                                              next[i] = e.target.value;
                                              return next;
                                            })
                                          }
                                          placeholder={`Enter level ${i + 1} name`}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                  {editDirty && (
                                    <div className="cpm-hier-ct-footer">
                                      <button
                                        type="button"
                                        className="cpm-btn cpm-btn--neutral-slds"
                                        onClick={() => setSelectedHierarchy(null)}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        className="cpm-btn cpm-btn--neutral-slds"
                                        onClick={handleHierarchyDetailSave}
                                      >
                                        Save
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="cpm-hier-cf-row cpm-hier-cf-row--v">
                                  <div className="cpm-hier-cf-sec">
                                    <label className="cpm-hier-cf-label">* New Hierarchy Name</label>
                                    <input
                                      className="cpm-hier-cf-input"
                                      type="text"
                                      value={cloneName}
                                      onChange={(e) => setCloneName(e.target.value)}
                                    />
                                  </div>
                                  <div className="cpm-hier-cf-sec">
                                    <div className="cpm-hier-cf-label-row">
                                      <label className="cpm-hier-cf-label">Number of Levels</label>
                                      <button type="button" className="cpm-hier-cf-info" aria-label="Info">i</button>
                                    </div>
                                    <div className="cpm-hier-cf-stepper">
                                      <button
                                        type="button"
                                        className="cpm-hier-cf-step"
                                        aria-label="Decrease"
                                        onClick={() =>
                                          setCloneLevelNames((prev) =>
                                            prev.length > 1 ? prev.slice(0, -1) : prev,
                                          )
                                        }
                                      >
                                        &#8722;
                                      </button>
                                      <span className="cpm-hier-cf-step-val">{cloneLevelNames.length}</span>
                                      <button
                                        type="button"
                                        className="cpm-hier-cf-step"
                                        aria-label="Increase"
                                        onClick={() =>
                                          setCloneLevelNames((prev) => [
                                            ...prev,
                                            cloneDefaultName(prev.length),
                                          ])
                                        }
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="cpm-hier-ct">
                                  <div className="cpm-hier-ct-head">
                                    <span className="cpm-hier-col-th">
                                      Hierarchy Level
                                      <span
                                        className="cpm-hier-col-resizer"
                                        role="separator"
                                        aria-orientation="vertical"
                                        aria-label="Resize Hierarchy Level column"
                                        onMouseDown={startLevelResize}
                                      />
                                    </span>
                                    <span>Name</span>
                                    <span />
                                  </div>
                                  <div className="cpm-hier-ct-body">
                                    {cloneLevelNames.map((nm, i, arr) => (
                                      <div
                                        key={i}
                                        className="cpm-hier-ct-row"
                                        style={{ ['--cpm-lvl' as string]: i } as React.CSSProperties}
                                      >
                                        <div className="cpm-hier-ct-cell">
                                          <button
                                            type="button"
                                            className={`cpm-hier-tree-chev ${i === arr.length - 1 ? 'is-empty' : ''}`}
                                            aria-label="Toggle level"
                                          >
                                            <ChevronDown size={14} />
                                          </button>
                                          <span className="cpm-hier-tree-link">{`${selectedHierarchy.dim} L${i}`}</span>
                                        </div>
                                        <div className="cpm-hier-ct-cell">
                                          <input
                                            className="cpm-hier-cf-name"
                                            type="text"
                                            value={nm}
                                            onChange={(e) =>
                                              setCloneLevelNames((prev) => {
                                                const next = [...prev];
                                                next[i] = e.target.value;
                                                return next;
                                              })
                                            }
                                            placeholder={`Enter level ${i + 1} name`}
                                          />
                                        </div>
                                        <div className="cpm-hier-ct-cell cpm-hier-ct-cell--act">
                                          <div className="cpm-hier-lvl-menu-wrap">
                                            <button
                                              type="button"
                                              className="cpm-hier-row-kebab"
                                              aria-label="Level actions"
                                              aria-haspopup="menu"
                                              aria-expanded={cloneMenuIndex === i}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setCloneMenuIndex((cur) => (cur === i ? null : i));
                                              }}
                                            >
                                              <KebabIcon />
                                            </button>
                                            {cloneMenuIndex === i && (
                                              <div
                                                className={`cpm-hier-lvl-menu ${
                                                  i === arr.length - 1 && arr.length > 1
                                                    ? 'cpm-hier-lvl-menu--up'
                                                    : ''
                                                }`}
                                                role="menu"
                                              >
                                                <button
                                                  type="button"
                                                  role="menuitem"
                                                  className="cpm-hier-lvl-menu-item"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    addCloneLevel(i);
                                                  }}
                                                >
                                                  Add Level
                                                </button>
                                                <button
                                                  type="button"
                                                  role="menuitem"
                                                  className="cpm-hier-lvl-menu-item"
                                                  disabled={arr.length <= 1}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeCloneLevel(i);
                                                  }}
                                                >
                                                  Remove Level
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {cloneDirty && (
                                    <div className="cpm-hier-ct-footer">
                                      <button
                                        type="button"
                                        className="cpm-btn cpm-btn--neutral-slds"
                                        onClick={() => setSelectedHierarchy(null)}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        className="cpm-btn cpm-btn--neutral-slds"
                                        onClick={handleHierarchyDetailSave}
                                      >
                                        Save
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </aside>
                      )}
                    </div>
                  ) : (
                    /* New Hierarchy — create panel */
                    <div className="cpm-hier-create">
                      <div className="cpm-hier-cf-row">
                        <div className="cpm-hier-cf-sec">
                          <label className="cpm-hier-cf-label">* New Hierarchy Name</label>
                          <input
                            className="cpm-hier-cf-input"
                            type="text"
                            placeholder="Enter Hierarchy Name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                          />
                        </div>
                        <div className="cpm-hier-cf-sec">
                          <label className="cpm-hier-cf-label">* Dimension</label>
                          <select
                            className="cpm-hier-cf-input cpm-hier-cf-select"
                            value={newDimension}
                            onChange={(e) => setNewDimension(e.target.value)}
                            disabled={hierarchyDimension === 'Account' || hierarchyDimension === 'Product'}
                          >
                            <option value="">Select Dimension</option>
                            <option value="Account">Account</option>
                            <option value="Product">Product</option>
                          </select>
                        </div>
                        <div className="cpm-hier-cf-sec">
                          <div className="cpm-hier-cf-label-row">
                            <label className="cpm-hier-cf-label">Number of Levels</label>
                            <button type="button" className="cpm-hier-cf-info" aria-label="Info">i</button>
                          </div>
                          <div className="cpm-hier-cf-stepper">
                            <button
                              type="button"
                              className="cpm-hier-cf-step"
                              aria-label="Decrease"
                              onClick={() =>
                                setNewLevelNames((prev) =>
                                  prev.length > 1 ? prev.slice(0, -1) : prev,
                                )
                              }
                            >
                              &#8722;
                            </button>
                            <span className="cpm-hier-cf-step-val">{newLevelNames.length}</span>
                            <button
                              type="button"
                              className="cpm-hier-cf-step"
                              aria-label="Increase"
                              onClick={() => setNewLevelNames((prev) => [...prev, ''])}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="cpm-hier-ct">
                        <div className="cpm-hier-ct-head">
                          <span className="cpm-hier-col-th">
                            Hierarchy Level
                            <span
                              className="cpm-hier-col-resizer"
                              role="separator"
                              aria-orientation="vertical"
                              aria-label="Resize Hierarchy Level column"
                              onMouseDown={startLevelResize}
                            />
                          </span>
                          <span>Name</span>
                          <span />
                        </div>
                        <div className="cpm-hier-ct-body">
                          {newLevelNames.map((nm, i, arr) => {
                            const levelLabel = newDimension ? `${newDimension} L${i}` : `Level ${i + 1}`;
                            return (
                              <div
                                key={i}
                                className="cpm-hier-ct-row"
                                style={{ ['--cpm-lvl' as string]: i } as React.CSSProperties}
                              >
                                <div className="cpm-hier-ct-cell">
                                  <button
                                    type="button"
                                    className={`cpm-hier-tree-chev ${i === arr.length - 1 ? 'is-empty' : ''}`}
                                    aria-label="Toggle level"
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                  <span className="cpm-hier-tree-link">{levelLabel}</span>
                                </div>
                                <div className="cpm-hier-ct-cell">
                                  <input
                                    className="cpm-hier-cf-name"
                                    type="text"
                                    placeholder={`Enter level ${i + 1} name`}
                                    value={nm}
                                    onChange={(e) =>
                                      setNewLevelNames((prev) => {
                                        const next = [...prev];
                                        next[i] = e.target.value;
                                        return next;
                                      })
                                    }
                                  />
                                </div>
                                <div className="cpm-hier-ct-cell cpm-hier-ct-cell--act">
                                  <div className="cpm-hier-lvl-menu-wrap">
                                    <button
                                      type="button"
                                      className="cpm-hier-row-kebab"
                                      aria-label="Level actions"
                                      aria-haspopup="menu"
                                      aria-expanded={newMenuIndex === i}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setNewMenuIndex((cur) => (cur === i ? null : i));
                                      }}
                                    >
                                      <KebabIcon />
                                    </button>
                                    {newMenuIndex === i && (
                                      <div
                                        className={`cpm-hier-lvl-menu ${
                                          i === arr.length - 1 && arr.length > 1
                                            ? 'cpm-hier-lvl-menu--up'
                                            : ''
                                        }`}
                                        role="menu"
                                      >
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="cpm-hier-lvl-menu-item"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            addNewLevel(i);
                                          }}
                                        >
                                          Add Level
                                        </button>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="cpm-hier-lvl-menu-item"
                                          disabled={arr.length <= 1}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeNewLevel(i);
                                          }}
                                        >
                                          Remove Level
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {newDirty && (
                          <div className="cpm-hier-ct-footer">
                            <button
                              type="button"
                              className="cpm-btn cpm-btn--neutral-slds"
                              onClick={cancelNewHierarchy}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="cpm-btn cpm-btn--neutral-slds"
                              onClick={handleCreateHierarchy}
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="cpm-hier-footer">
              <div className="cpm-hier-footer-save">
                {saveError && hasUnsavedChanges && (
                  <div className="cpm-hier-save-warn">
                    <span className="cpm-hier-save-warn-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="8" fill="#ba0517" />
                        <rect x="7.2" y="3.6" width="1.6" height="5.4" rx="0.8" fill="#fff" />
                        <circle cx="8" cy="11.4" r="0.95" fill="#fff" />
                      </svg>
                    </span>
                    <div className="cpm-hier-save-warn-pop" role="tooltip">
                      Save your updates before saving the modal.
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="cpm-btn cpm-btn--brand"
                  onClick={() => {
                    if (hasUnsavedChanges) {
                      setSaveError(true);
                    } else {
                      setSaveError(false);
                      closeHierarchyModal();
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReviewMeasuresModal
        isOpen={measuresModalOpen}
        onClose={() => setMeasuresModalOpen(false)}
        measures={measures}
        setMeasures={setMeasures}
      />

      {userAccessModalOpen && (
        <ManageUserAccessModal onClose={() => setUserAccessModalOpen(false)} />
      )}
    </div>
  );
};

export default CpmFeaturePage;
