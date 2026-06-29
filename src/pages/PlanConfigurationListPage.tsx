import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const BASE_URL = import.meta.env.BASE_URL as string;

function resolveTabUrl(path: string): string {
  // Normalize BASE_URL: './' or '.' -> '/' for absolute URL construction
  const base = BASE_URL === './' || BASE_URL === '.' ? '/' : BASE_URL;
  const cleanBase = base.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return window.location.origin + cleanBase + cleanPath;
}

const PlanConfigurationListPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === 'navigate' && e.data.path) {
        navigate(e.data.path);
      }
      if (e.data.type === 'openTab' && e.data.path) {
        window.open(resolveTabUrl(e.data.path), '_blank', 'noopener,noreferrer');
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
