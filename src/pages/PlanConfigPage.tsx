import React from 'react';
import { useSearchParams } from 'react-router-dom';

const PlanConfigPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const planName = searchParams.get('name') || 'New Plan Configuration';

  return (
    <iframe
      title="Plan Configuration"
      src={`${import.meta.env.BASE_URL}plan_config_page.html?name=${encodeURIComponent(planName)}`}
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

export default PlanConfigPage;
