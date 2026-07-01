import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PlanConfigurationListPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'navigate' && e.data.path) {
        navigate(e.data.path, { state: { planName: e.data.planName } });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate]);

  return (
    <iframe
      title="Plan Configuration List"
      src={`${import.meta.env.BASE_URL}plc_list.html`}
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

export default PlanConfigurationListPage;
