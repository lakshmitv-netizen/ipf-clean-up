import React from 'react';

/**
 * Renders the Salesforce Go Setup page exactly as captured from the source org.
 * The snapshot is a fully self-contained HTML (CSS + images inlined) served as a
 * static asset from `public/sfgo.html`; embedding it in a full-viewport iframe
 * reproduces the original pixel-for-pixel.
 */
const SetupSalesforceGoPage: React.FC = () => {
  return (
    <iframe
      title="Salesforce Go"
      src="/sfgo.html"
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

export default SetupSalesforceGoPage;
