import React from 'react';

const PlanConfigCreatorPage: React.FC = () => (
  <iframe
    title="Plan Config Creator"
    src={`${import.meta.env.BASE_URL}cc_page.html`}
    style={{
      position: 'fixed',
      inset: 0,
      width: '100%',
      height: '100%',
      border: 'none',
    }}
  />
);

export default PlanConfigCreatorPage;
