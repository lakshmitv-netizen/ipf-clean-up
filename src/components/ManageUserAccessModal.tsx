import React, { useState } from 'react';
import '../styles/components/ManageUserAccessModal.css';

interface Props {
  onClose: () => void;
}

const USERS = [
  { name: 'Chatter Expert',  username: 'chatty.00d5f000005xd9weac@c...',  profile: 'Chatter Free User',      role: '--' },
  { name: 'Edna Frank',      username: 'Ed.frank@gmail.com',               profile: 'Sales',                  role: 'Eastern Sales' },
  { name: 'Jane Grey',       username: 'Jane.Grey@salesforce.com',         profile: 'Standard Platform User', role: '--' },
  { name: 'Jason Kim',       username: 'Jason.Myoung.Kim11@uog.com',       profile: 'Marketing',              role: 'US Sales' },
  { name: 'John Bond',       username: 'John.Bond@uog.com',                profile: 'Standard Platform User', role: '--' },
  { name: 'Josh David',      username: 'Josh.D.1990@gmail.com',            profile: 'Marketing',              role: '--' },
  { name: 'Lauren Boyle',    username: 'Lauren.Boyle@uog.com',             profile: 'Sales',                  role: 'US Sales' },
  { name: 'Matt Chung',      username: 'Matt.Chung1999@gmail.com',         profile: 'Marketing',              role: '--' },
];

const METRICS = [
  { label: 'Enablement PSL',           available: 98,  assigned: 2 },
  { label: 'Enablement Resources PSL', available: 100, assigned: 0 },
  { label: 'Walkthroughs PSL',         available: 100, assigned: 0 },
];

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 4l8 8M12 4l-8 8" stroke="#747474" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SearchIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="9" cy="9" r="6" stroke="#747474" strokeWidth="1.6" />
    <path d="M13.5 13.5l3 3" stroke="#747474" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const FilterIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 4h12M5 8h6M7 12h2" stroke="#747474" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const RefreshIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M13 8a5 5 0 1 1-1.5-3.5" stroke="#747474" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M13 2v3h-3" stroke="#747474" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="2.5" stroke="#747474" strokeWidth="1.3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" stroke="#747474" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const LightbulbIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 2a4 4 0 0 1 2.5 7.1V11H5.5V9.1A4 4 0 0 1 8 2z" stroke="#706e6b" strokeWidth="1.2" fill="none" />
    <path d="M5.5 12.5h5M6.5 14h3" stroke="#706e6b" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ExternalLinkIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M5.5 2.5H2.5v9h9v-3" stroke="#0176d3" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 2.5h3.5V6" stroke="#0176d3" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.5 2.5L7 7" stroke="#0176d3" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="7" stroke="#0176d3" strokeWidth="1.3" />
    <circle cx="8" cy="5" r="1" fill="#0176d3" />
    <path d="M8 7.5v4" stroke="#0176d3" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ManageUserAccessModal: React.FC<Props> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'pslA' | 'pslB'>('pslA');
  const [userFilter, setUserFilter] = useState<'all' | 'assigned'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filteredUsers = USERS.filter(u => {
    const matchesFilter = userFilter === 'all' || (userFilter === 'assigned' && selected.has(USERS.indexOf(u)));
    const matchesSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const toggleRow = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredUsers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUsers.map((_, i) => i)));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container mua-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header modal-header-simple">
          <h2 className="modal-title">Manage User Access</h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="mua-tabs">
          <button
            className={`mua-tab ${activeTab === 'pslA' ? 'mua-tab--active' : ''}`}
            onClick={() => setActiveTab('pslA')}
          >
            PSL A (2)
          </button>
          <button
            className={`mua-tab ${activeTab === 'pslB' ? 'mua-tab--active' : ''}`}
            onClick={() => setActiveTab('pslB')}
          >
            PSL B (0)
          </button>
        </div>

        {/* Body */}
        <div className="mua-body">

          {/* Left sidebar */}
          <aside className="mua-sidebar">
            <div className="mua-sidebar-filters">
              <p className="mua-filter-heading">Filters</p>
              <p className="mua-filter-label">Users</p>
              <label className="mua-radio-item">
                <input type="radio" name="userFilter" checked={userFilter === 'all'} onChange={() => setUserFilter('all')} />
                All
              </label>
              <label className="mua-radio-item">
                <input type="radio" name="userFilter" checked={userFilter === 'assigned'} onChange={() => setUserFilter('assigned')} />
                Assigned ({selected.size})
              </label>
            </div>

            <div className="mua-insight-card">
              <LightbulbIcon />
              <div className="mua-insight-text">
                <p>Alternatively, you can always go to the permission setup page.</p>
                <button className="mua-insight-link" type="button">
                  Go to Permission Set <ExternalLinkIcon />
                </button>
              </div>
            </div>
          </aside>

          {/* Right content */}
          <div className="mua-content">
            <p className="mua-content-desc">
              Assign and Manage End User Perm Set. <button className="mua-info-btn" type="button"><InfoIcon /></button>
            </p>

            {/* Metric cards */}
            <div className="mua-metrics">
              {METRICS.map(m => (
                <div className="mua-metric-card" key={m.label}>
                  <p className="mua-metric-label">{m.label}</p>
                  <div className="mua-metric-values">
                    <div>
                      <span className="mua-metric-sub">Available</span>
                      <span className="mua-metric-num">{m.available}</span>
                    </div>
                    <div>
                      <span className="mua-metric-sub">Assigned</span>
                      <span className="mua-metric-num">{m.assigned}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Table toolbar */}
            <div className="mua-table-toolbar">
              <div className="mua-table-title-row">
                <span className="mua-table-title">All Users ▾</span>
                <span className="mua-table-meta">50+ Items · Sorted by Full Name · Last refreshed just now</span>
              </div>
              <div className="mua-table-actions">
                <div className="mua-search">
                  <SearchIcon />
                  <input
                    type="text"
                    placeholder="Search this list..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <button className="mua-icon-btn" type="button" aria-label="Settings"><SettingsIcon /></button>
                <button className="mua-icon-btn" type="button" aria-label="Refresh"><RefreshIcon /></button>
                <button className="mua-icon-btn" type="button" aria-label="Filter"><FilterIcon /></button>
              </div>
            </div>

            {/* Table */}
            <div className="mua-table-wrap">
              <table className="mua-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selected.size === filteredUsers.length && filteredUsers.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>Full Name ↓</th>
                    <th>Username</th>
                    <th>Profile</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, i) => (
                    <tr key={i} className={selected.has(i) ? 'mua-row--selected' : ''}>
                      <td><input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} /></td>
                      <td><button className="mua-link" type="button">{u.name}</button></td>
                      <td>{u.username}</td>
                      <td><button className="mua-link" type="button">{u.profile}</button></td>
                      <td>{u.role === '--' ? <span className="mua-dash">--</span> : <button className="mua-link" type="button">{u.role}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Assign button */}
            <div className="mua-assign-row">
              <button className="mua-btn-assign" type="button">Assign</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer mua-footer">
          <button className="mua-btn-done" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

export default ManageUserAccessModal;
