import React from 'react';

const PlanConfigPage: React.FC = () => (
  <iframe
    title="Plan Configuration"
    src={`${import.meta.env.BASE_URL}plan_config_page.html`}
    style={{
      position: 'fixed',
      inset: 0,
      width: '100%',
      height: '100%',
      border: 'none',
    }}
  />
);

export default PlanConfigPage;
