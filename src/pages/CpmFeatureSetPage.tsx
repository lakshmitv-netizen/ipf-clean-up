import React from 'react';

/**
 * Renders the Commercial Planning for Manufacturing feature-set page exactly as
 * captured from the source org. The snapshot is a fully self-contained HTML
 * (CSS + images inlined) served as a static asset from `public/fs_page.html`;
 * embedding it in a full-viewport iframe reproduces the original.
 */
const CpmFeatureSetPage: React.FC = () => {
  return (
    <iframe
      title="CPM feature set"
      src={`${import.meta.env.BASE_URL}fs_page.html`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
      }}
    />
  );
};

export default CpmFeatureSetPage;
