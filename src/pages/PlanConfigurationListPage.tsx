import React from 'react';

const PlanConfigurationListPage: React.FC = () => (
  <iframe
    title="Plan Configuration List"
    src="/plc_list.html"
    style={{
      position: 'fixed',
      inset: 0,
      width: '100%',
      height: '100%',
      border: 'none',
    }}
  />
);

export default PlanConfigurationListPage;
