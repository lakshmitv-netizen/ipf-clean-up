import React from 'react';
import { useLocation } from 'react-router-dom';

const PlanConfigCreatorPage: React.FC = () => {
  const location = useLocation();
  const planName = (location.state as { planName?: string })?.planName || '';
  const src = `${import.meta.env.BASE_URL}cc_page.html?planName=${encodeURIComponent(planName)}`;

  return (
    <iframe
      title="Plan Config Creator"
      src={src}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 'none',
      }}
    />
  );
};

export default PlanConfigCreatorPage;
