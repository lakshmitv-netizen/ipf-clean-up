import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useIndustry, type IndustryType } from '../contexts/IndustryContext';
import { useCurrentUser } from '../contexts/UserContext';
import {
  useNotifications,
  formatNotificationTimestamp,
} from '../contexts/NotificationsContext';
import { getAppUserInitialsStyle } from '../utils/appUserAvatar';
import '../styles/components/Header.css';
import '../styles/components/HeaderNotificationsPanel.css';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const { industry, setIndustry } = useIndustry();
  const { currentUser, users, setCurrentUserByName } = useCurrentUser();
  const {
    notifications,
    markAllReadForUser,
    markNotificationRead,
    notificationsPanelOpenRequest,
    consumeNotificationsPanelOpenRequest,
  } = useNotifications();
  const currentAvatar = getAppUserInitialsStyle(currentUser.name);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const notificationsPanelRef = useRef<HTMLDivElement>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationsPosition, setNotificationsPosition] = useState<{ top: number; left: number } | null>(null);

  const myNotifications = useMemo(
    () =>
      notifications
        .filter((n) => n.recipientUserId === currentUser.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [notifications, currentUser.id]
  );

  const unreadNotificationCount = useMemo(
    () => myNotifications.filter((n) => !n.read).length,
    [myNotifications]
  );
  
  const tabs = [
    'Home',
    'Analytics',
    'Opportunities',
    'Leads',
    'Tasks',
    'Planning & Forecasting',
    'Accounts',
    'Contacts',
    'Dashboards',
    'More',
  ];

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isDropdownOpen && avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right
      });
    } else {
      setDropdownPosition(null);
    }
  }, [isDropdownOpen]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(event.target as Node) &&
          dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isNotificationsOpen || !bellRef.current) {
      setNotificationsPosition(null);
      return;
    }
    const rect = bellRef.current.getBoundingClientRect();
    const panelWidth = Math.min(420, window.innerWidth - 24);
    let left = rect.right - panelWidth;
    if (left < 12) left = 12;
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - panelWidth - 12);
    }
    setNotificationsPosition({
      top: rect.bottom + 6,
      left,
    });
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (bellRef.current?.contains(t)) return;
      if (notificationsPanelRef.current?.contains(t)) return;
      setIsNotificationsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNotificationsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!notificationsPanelOpenRequest) return;
    if (notificationsPanelOpenRequest.userId !== currentUser.id) return;
    setIsNotificationsOpen(true);
    consumeNotificationsPanelOpenRequest();
  }, [notificationsPanelOpenRequest, currentUser.id, consumeNotificationsPanelOpenRequest]);

  const handleIndustrySwitch = (selectedIndustry: IndustryType) => {
    setIndustry(selectedIndustry);
    if (selectedIndustry === 'manufacturing') {
      navigate('/home/manufacturing');
    } else if (selectedIndustry === 'consumer-goods') {
      navigate('/home/consumergoods');
    } else {
      navigate('/home/grid-264');
    }
    setIsDropdownOpen(false);
  };

  const navigateToForecastingGrid = useCallback(() => {
    if (industry === 'consumer-goods') {
      navigate('/home/consumergoods');
      return;
    }
    if (industry === 'grid-264') {
      navigate('/home/grid-264');
      return;
    }
    if (industry !== 'manufacturing') {
      setIndustry('manufacturing');
    }
    navigate('/home/manufacturing');
  }, [industry, navigate, setIndustry]);

  return (
    <div className="header-wrapper">
      {/* Top Row */}
      <header className="header-top">
        <div className="header-top-left">
          <div className="salesforce-cloud-logo">
            <svg width="40" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04Z" fill="#00A1E0"/>
            </svg>
          </div>
        </div>
        
        <div className="header-top-center">
          <div className="search-bar">
            <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" className="search-input" placeholder="Search..." />
          </div>
        </div>
        
        <div className="header-top-right">
          <div className="header-icon-group">
            <div className="header-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="header-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="header-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="header-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="header-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <button
              type="button"
              ref={bellRef}
              className={`header-icon header-bell-trigger${isNotificationsOpen ? ' header-bell-trigger--open' : ''}${unreadNotificationCount > 0 ? ' header-icon--with-badge' : ''}`}
              aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
              aria-expanded={isNotificationsOpen}
              aria-haspopup="dialog"
              onClick={() => setIsNotificationsOpen((open) => !open)}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadNotificationCount > 0 && (
                <span className="header-notification-badge" aria-hidden>
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </button>
          </div>
          <div className="user-avatar" ref={avatarRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="user-avatar-trigger"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
              aria-label={`Account menu, ${currentUser.name}`}
            >
              <span
                className="user-avatar-initials-face"
                style={{ backgroundColor: currentAvatar.backgroundColor }}
              >
                {currentAvatar.initials}
              </span>
            </button>
            {isDropdownOpen && dropdownPosition && createPortal(
              <div 
                ref={dropdownRef}
                style={{
                  position: 'fixed',
                  top: `${dropdownPosition.top}px`,
                  right: `${dropdownPosition.right}px`,
                  backgroundColor: 'var(--color-surface-white)',
                  border: '1px solid #c9c9c9',
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                  minWidth: '200px',
                  zIndex: 10000,
                  padding: '8px 0'
                }}
              >
                <div style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '700',
                  color: 'var(--color-interactive-border)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e5e5e5'
                }}>
                  Switch Industry
                </div>
                <div
                  onClick={() => handleIndustrySwitch('manufacturing')}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: industry === 'manufacturing' ? 'var(--color-accent-blue)' : 'var(--color-on-surface-strong)',
                    backgroundColor: industry === 'manufacturing' ? 'var(--color-surface-gray)' : 'transparent',
                    fontWeight: industry === 'manufacturing' ? '600' : '400',
                    transition: 'background-color 0.1s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (industry !== 'manufacturing') {
                      e.currentTarget.style.backgroundColor = 'var(--slds-g-color-surface-container-1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (industry !== 'manufacturing') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  Manufacturing
                </div>
                <div
                  onClick={() => handleIndustrySwitch('consumer-goods')}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: industry === 'consumer-goods' ? 'var(--color-accent-blue)' : 'var(--color-on-surface-strong)',
                    backgroundColor: industry === 'consumer-goods' ? 'var(--color-surface-gray)' : 'transparent',
                    fontWeight: industry === 'consumer-goods' ? '600' : '400',
                    transition: 'background-color 0.1s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (industry !== 'consumer-goods') {
                      e.currentTarget.style.backgroundColor = 'var(--slds-g-color-surface-container-1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (industry !== 'consumer-goods') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  Consumer Goods
                </div>
                <div
                  onClick={() => handleIndustrySwitch('grid-264')}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: industry === 'grid-264' ? 'var(--color-accent-blue)' : 'var(--color-on-surface-strong)',
                    backgroundColor: industry === 'grid-264' ? 'var(--color-surface-gray)' : 'transparent',
                    fontWeight: industry === 'grid-264' ? '600' : '400',
                    transition: 'background-color 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (industry !== 'grid-264') {
                      e.currentTarget.style.backgroundColor = 'var(--slds-g-color-surface-container-1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (industry !== 'grid-264') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  264 Updated Grid
                </div>
                <div style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '700',
                  color: 'var(--color-interactive-border)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderTop: '1px solid #e5e5e5',
                  marginTop: '4px'
                }}>
                  Switch User
                </div>
                {users.map((user) => {
                  const rowAvatar = getAppUserInitialsStyle(user.name);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className="header-user-switch-row"
                      onClick={() => {
                        if (currentUser.id !== user.id) {
                          setCurrentUserByName(user.name);
                          navigate('/planning-forecasting-list');
                        }
                        setIsDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: currentUser.name === user.name ? 'var(--color-accent-blue)' : 'var(--color-on-surface-strong)',
                        backgroundColor: currentUser.name === user.name ? 'var(--color-surface-gray)' : 'transparent',
                        fontWeight: currentUser.name === user.name ? '600' : '400',
                        transition: 'background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (currentUser.name !== user.name) {
                          e.currentTarget.style.backgroundColor = 'var(--slds-g-color-surface-container-1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (currentUser.name !== user.name) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <span
                        className="header-user-switch-initials"
                        style={{ backgroundColor: rowAvatar.backgroundColor }}
                        aria-hidden
                      >
                        {rowAvatar.initials}
                      </span>
                      <span>{user.name}</span>
                    </button>
                  );
                })}
              </div>,
              document.body
            )}
          </div>
        </div>
      </header>

      {isNotificationsOpen &&
        notificationsPosition &&
        createPortal(
          <div
            ref={notificationsPanelRef}
            className="header-notifications-panel"
            role="dialog"
            aria-labelledby="header-notifications-title"
            style={{
              top: `${notificationsPosition.top}px`,
              left: `${notificationsPosition.left}px`,
            }}
          >
            <div className="header-notifications-panel__header">
              <h2 id="header-notifications-title" className="header-notifications-panel__title">
                Notifications
              </h2>
              <div className="header-notifications-panel__header-actions">
                <button
                  type="button"
                  className="header-notifications-panel__mark-read"
                  disabled={unreadNotificationCount === 0}
                  onClick={() => markAllReadForUser(currentUser.id)}
                >
                  Mark all as read
                </button>
                <button
                  type="button"
                  className="header-notifications-panel__close"
                  aria-label="Close notifications"
                  onClick={() => setIsNotificationsOpen(false)}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {myNotifications.length === 0 ? (
              <p className="header-notifications-panel__empty">You have no notifications yet.</p>
            ) : (
              <ul className="header-notifications-panel__list">
                {myNotifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`header-notifications-panel__item${n.read ? '' : ' header-notifications-panel__item--unread'}`}
                      onClick={() => {
                        markNotificationRead(n.id);
                        setIsNotificationsOpen(false);
                        if (n.kind === 'plan_approver_decision') {
                          navigate('/planning-forecasting');
                        } else {
                          navigateToForecastingGrid();
                        }
                      }}
                    >
                      <span className="header-notifications-panel__item-icon" aria-hidden>
                        {n.kind === 'plan_approver_decision' ? (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                            <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
                            <path d="m9 12 2 2 4-4" />
                          </svg>
                        )}
                      </span>
                      <span className="header-notifications-panel__item-body">
                        <span className="header-notifications-panel__item-title">{n.title}</span>
                        <span className="header-notifications-panel__item-text">{n.body}</span>
                        <span className="header-notifications-panel__item-meta">
                          {!n.read && (
                            <span className="header-notifications-panel__unread-dot" aria-hidden />
                          )}
                          <span>{formatNotificationTimestamp(n.createdAt)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
      
      {/* Bottom Row - Navigation */}
      <nav className="header-bottom">
        <div className="header-bottom-left">
          <div className="app-launcher">
            <div className="app-launcher-icon">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <span className="app-name">Manufacturing Cloud</span>
        </div>
        
        <div className="header-nav-tabs">
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={`header-nav-tab ${tab === 'Planning & Forecasting' ? 'active' : ''}`}
              onClick={() => {
                if (tab === 'Planning & Forecasting') {
                  navigate('/planning-forecasting-list');
                }
              }}
            >
              {tab}
              {['Opportunities', 'Leads', 'Tasks', 'Accounts', 'Contacts', 'Dashboards', 'More'].includes(tab) && (
                <svg className="tab-dropdown-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          ))}
        </div>
        
        <div className="header-bottom-right">
          <button className="pencil-button">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Header;
