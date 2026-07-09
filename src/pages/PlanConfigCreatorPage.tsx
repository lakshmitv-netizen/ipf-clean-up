import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PlanningGridConfig from '../components/PlanningGridConfig';
import {
  initialMeasures,
  initialMeasureSubsets,
  initialTimeGranularities,
  type Measure,
  type MeasureSubset,
} from '../data/planConfigData';
import { loadPlanConfigHierarchies } from '../data/hierarchyStore';
import { mergeCustomMeasures } from '../data/measureStore';
import { savePlanConfigDetail, type PlanConfigDetail } from '../data/planConfigStore';
import '../styles/pages/PlanConfigCreatorPage.css';

type SavedConfigPayload = {
  name?: string;
  description?: string;
  detail?: Pick<PlanConfigDetail, 'levels' | 'measures' | 'subsets'>;
};

const SearchIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const Chevron: React.FC<{ expanded?: boolean }> = ({ expanded }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden="true"
    style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}
  >
    <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface NavNode {
  label: string;
  depth: number;
  hasChildren?: boolean;
  selected?: boolean;
}

const NAV_TREE: NavNode[] = [
  { label: 'Feature Settings', depth: 0, hasChildren: true },
  { label: 'Planning & Forecasting', depth: 1, hasChildren: true },
  { label: 'Measures & Categories', depth: 2 },
  { label: 'Plan Configuration', depth: 2, selected: true },
  { label: 'Procedure Plan', depth: 1, hasChildren: true },
  { label: 'Procedure Plan Definition Templates', depth: 2 },
  { label: 'Procedure Plan Definitions', depth: 2 },
];

const PlanConfigCreatorPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const planName = (location.state as { planName?: string })?.planName || '';
  const planDescription = (location.state as { description?: string })?.description || '';

  // Base measures plus any user-created ones persisted from the Review Measures
  // modal, so custom measures show up in the "Add Measures" picker. Read once on
  // mount (the page remounts on each navigation, picking up new measures).
  const [measures, setMeasures] = useState<Measure[]>(() => mergeCustomMeasures(initialMeasures));
  const [measureSubsets, setMeasureSubsets] = useState<MeasureSubset[]>(initialMeasureSubsets);

  // Hierarchies come from the shared store fed by the Setup Hierarchies modal, so
  // level names / counts and newly-created hierarchies stay in sync. Re-read when
  // the tab regains focus or another tab updates localStorage.
  const [hierarchies, setHierarchies] = useState(() => loadPlanConfigHierarchies());

  useEffect(() => {
    const refresh = () => setHierarchies(loadPlanConfigHierarchies());
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const goBackToList = (savedConfig?: SavedConfigPayload) => {
    if (savedConfig) {
      const id = String(Date.now());
      const now = new Date();
      const formatted = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      const name = planName || savedConfig.name || 'Untitled Configuration';
      const description = planDescription || savedConfig.description || '';
      // Persist the saved configuration so the (iframe) list view can render it.
      try {
        const raw = localStorage.getItem('cpm_saved_configs');
        const list: Array<Record<string, string>> = raw ? JSON.parse(raw) : [];
        list.push({ id, name, description, created: formatted, modified: formatted });
        localStorage.setItem('cpm_saved_configs', JSON.stringify(list));
      } catch {
        /* localStorage unavailable */
      }
      // Persist the full config shape (levels/measures/subsets) so a plan can render its grid.
      if (savedConfig.detail) {
        savePlanConfigDetail({
          id,
          name,
          description,
          createdOn: formatted,
          levels: savedConfig.detail.levels,
          measures: savedConfig.detail.measures,
          subsets: savedConfig.detail.subsets,
        });
      }
    }
    navigate('/setup/plan-configuration-list', savedConfig ? { state: { savedToast: true } } : undefined);
  };

  const handleNavClick = (node: NavNode) => {
    if (node.label === 'Plan Configuration') {
      navigate('/setup/plan-configuration-list');
    }
  };

  return (
    <div className="pcc-shell">
      {/* Global header strip */}
      <div className="pcc-globalbar">
        <span className="pcc-globalbar-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="pcc-globalbar-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9 12.5v.01M9 5.5a2 2 0 0 1 1 3.7c-.6.4-1 .8-1 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="pcc-globalbar-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2a4 4 0 0 0-4 4c0 4-1.5 5-1.5 5h11S13 10 13 6a4 4 0 0 0-4-4zM7.5 14a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="pcc-globalbar-avatar" aria-hidden="true" />
      </div>

      {/* Search Setup bar */}
      <div className="pcc-searchbar">
        <div className="pcc-search">
          <span className="pcc-search-icon"><SearchIcon /></span>
          <input type="text" placeholder="Search Setup" aria-label="Search Setup" />
        </div>
      </div>

      {/* Main row: leftmost nav pane + builder content */}
      <div className="pcc-main">
        <aside className="pcc-sidebar" aria-label="Setup navigation">
          <div className="pcc-quickfind">
            <span className="pcc-quickfind-icon"><SearchIcon /></span>
            <input type="text" placeholder="Quick Find" aria-label="Quick Find" />
          </div>

          <nav className="pcc-tree">
            {NAV_TREE.map((node) => (
              <button
                key={node.label}
                type="button"
                className={`pcc-tree-row${node.selected ? ' pcc-tree-row--selected' : ''}`}
                data-depth={node.depth}
                onClick={() => handleNavClick(node)}
              >
                <span className={`pcc-tree-chevron${node.hasChildren ? '' : ' pcc-tree-chevron--leaf'}`}>
                  <Chevron expanded />
                </span>
                <span className="pcc-tree-label">{node.label}</span>
              </button>
            ))}
          </nav>

          <p className="pcc-sidebar-hint">
            Didn't find what you're looking for?<br />Try using Global Search.
          </p>
        </aside>

        <div className="pcc-content">
          <PlanningGridConfig
            title={planName || undefined}
            onBack={goBackToList}
            onClose={goBackToList}
            hierarchies={hierarchies}
            measures={measures}
            setMeasures={setMeasures}
            measureSubsets={measureSubsets}
            setMeasureSubsets={setMeasureSubsets}
            timeGranularities={initialTimeGranularities}
          />
        </div>
      </div>
    </div>
  );
};

export default PlanConfigCreatorPage;
