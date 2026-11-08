import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePolling } from '../../hooks/usePolling';
import { apiClient } from '../../services/apiClient';
import { Icon } from '../shared/Icon';
import { Button } from '../shared/Button';
import './Layout.css';

export function CitizenLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const drawerRef = useRef(null);

  // Synchronize unread count immediately whenever notifications are read, deleted, or cleared
  useEffect(() => {
    const handleCountUpdate = (e) => {
      if (typeof e.detail?.unreadCount === 'number') {
        setUnreadCount(e.detail.unreadCount);
      }
    };
    window.addEventListener('quickfile:notifications:count', handleCountUpdate);
    return () => window.removeEventListener('quickfile:notifications:count', handleCountUpdate);
  }, []);

  // Poll notification unread count every 30 seconds
  usePolling(
    async () => {
      try {
        const data = await apiClient.get('/citizen/notifications');
        if (data && typeof data.unread_count === 'number') {
          setUnreadCount(data.unread_count);
        }
      } catch {
        // Ignore polling errors
      }
    },
    30000,
    { enabled: Boolean(user) }
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { to: '/citizen/dashboard', label: 'Dashboard', icon: 'building', end: true },
    { to: '/citizen/catalog', label: 'Browse Catalog', icon: 'file' },
    { to: '/citizen/requests/new', label: 'New Request', icon: 'upload' },
    { to: '/citizen/requests', label: 'Request History', icon: 'calendar', end: true },
    { to: '/citizen/notifications', label: 'Notifications', icon: 'info' },
    { to: '/citizen/profile', label: 'My Profile', icon: 'user' },
  ];

  const renderNavLinks = () => (
    <ul className="qf-nav-menu">
      {navItems.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) => `qf-nav-link ${isActive ? 'active' : ''}`}
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="qf-shell">
      <a href="#main-content" className="qf-skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <header className="qf-shell-header">
        <div className="qf-shell-header__left">
          <button
            type="button"
            className="qf-hamburger-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Icon name="search" size={20} />
          </button>
          <Link to="/citizen/dashboard" className="qf-brand" aria-label="Citizen Portal Home">
            <div className="qf-brand__logo">
              <Icon name="building" size={22} />
            </div>
            <div className="qf-brand__text">
              <span className="qf-brand__title">QuickFile</span>
              <span className="qf-brand__subtitle">Resident Portal</span>
            </div>
          </Link>
        </div>

        <div className="qf-shell-header__right">
          <Link
            to="/citizen/notifications"
            className="qf-bell-btn"
            aria-label={`Notifications, ${unreadCount} unread`}
          >
            <Icon name="info" size={20} />
            {unreadCount > 0 && (
              <span className="qf-bell-count" aria-hidden="true">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          <div className="qf-user-badge">
            <Icon name="user" size={16} />
            <span>{user?.full_name || 'Resident'}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            iconLeft={<Icon name="logout" size={16} />}
            aria-label="Log out"
          >
            Log Out
          </Button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <>
          <div
            className="qf-drawer-overlay"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            className="qf-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Citizen Navigation"
          >
            <div className="qf-drawer__header">
              <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text)' }}>
                Citizen Portal
              </span>
              <button
                type="button"
                className="qf-modal__close-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {renderNavLinks()}
          </div>
        </>
      )}

      {/* Body with Sidebar and Main */}
      <div className="qf-shell-body">
        <aside className="qf-sidebar" aria-label="Citizen Sidebar">
          {renderNavLinks()}
        </aside>

        <main id="main-content" className="qf-shell-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
