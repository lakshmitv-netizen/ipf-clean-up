import React from 'react';
import '../styles/components/ScopedNotification.css';

interface ScopedNotificationProps {
  icon?: React.ReactNode;
  /** Omit when `omitHeaderRow` is true (body is only `children`). */
  message?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  /** Fires before click (e.g. keep cell editor open when focus moves to CTA). */
  onCtaMouseDown?: (e: React.MouseEvent) => void;
  onClose?: () => void;
  /** Label for close button. If not provided, shows × symbol. */
  closeLabel?: string;
  /** `inline` = embedded in panels (no fixed positioning). Default matches legacy toast-style banner. */
  variant?: 'toast' | 'inline';
  /** Extra class on the root (e.g. tone modifiers). */
  className?: string;
  /** Renders below the main row (e.g. toggles). Use with `scoped-notification--stack` via className. */
  children?: React.ReactNode;
  /** Banner body is only `children` (no icon / message / CTA row). */
  omitHeaderRow?: boolean;
}

const ScopedNotification: React.FC<ScopedNotificationProps> = ({
  icon,
  message,
  ctaLabel,
  onCtaClick,
  onCtaMouseDown,
  onClose,
  closeLabel,
  variant = 'toast',
  className = '',
  children,
  omitHeaderRow = false,
}) => {
  const root =
    `scoped-notification${variant === 'inline' ? ' scoped-notification--inline' : ''}` +
    (omitHeaderRow ? ' scoped-notification--children-only' : '') +
    (className ? ` ${className}` : '');

  if (omitHeaderRow) {
    return children ? <div className={root}>{children}</div> : null;
  }

  return (
    <div className={root}>
      <div className="scoped-notification-content">
        {icon ?? (
          <svg className="scoped-notification-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <circle cx="10" cy="10" r="9" fill="currentColor" />
            <circle cx="10" cy="6.25" r="1.15" fill="var(--color-surface-white)" />
            <rect x="9.2" y="8.45" width="1.6" height="6" rx="0.45" fill="var(--color-surface-white)" />
          </svg>
        )}
        <span className="scoped-notification-text">{message ?? ''}</span>
        {ctaLabel && onCtaClick && (
          <button
            type="button"
            className="scoped-notification-cta-btn"
            onMouseDown={onCtaMouseDown}
            onClick={onCtaClick}
          >
            {ctaLabel}
          </button>
        )}
        {onClose && (
          <button 
            type="button" 
            className={`scoped-notification-close-btn${closeLabel ? ' scoped-notification-close-btn--labeled' : ''}`}
            onClick={onClose} 
            aria-label={closeLabel || "Close notification"}
          >
            {closeLabel || '×'}
          </button>
        )}
      </div>
      {children ? <div className="scoped-notification-slot">{children}</div> : null}
    </div>
  );
};

export default ScopedNotification;

