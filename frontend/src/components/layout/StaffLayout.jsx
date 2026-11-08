import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { STAFF_PERMISSIONS } from '../../config/constants';
import { Icon } from '../shared/Icon';
import { Button } from '../shared/Button';
import './Layout.css';

export function StaffLayout() {
  const { user, hasPermission, logout } = useAuth();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);

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
    {
      to: '/staff/dashboard',
      label: 'Staff Dashboard',
      icon: 'building',
      end: true,
      allowed: true,
    },
    {
      to: '/staff/requests',
      label: 'Request Queue',
      icon: 'file',
      allowed: hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS),
    },
    {
      to: '/staff/requests/walk-in',
      label: 'Walk-In Filing',
      icon: 'upload',
      allowed: hasPermission(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS),
    },
    {
      to: '/staff/records',
      label: 'Historical Records',
      icon: 'calendar',
      allowed: hasPermission(STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS),
    },
    {
      to: '/staff/verify',
      label: 'Staff QR Scanner',
      icon: 'qr',
      allowed: hasPermission(STAFF_PERMISSIONS.CAN_VERIFY_QR),
    },
    {
      to: '/staff/reports',
      label: 'Reports & Analytics',
      icon: 'download',
      allowed: hasPermission(STAFF_PERMISSIONS.CAN_VIEW_REPORTS),
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.allowed);

  const renderNavLinks = () => (
    <ul className="qf-nav-menu">
      {visibleNavItems.map((item) => (
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
          <Link to="/staff/dashboard" className="qf-brand" aria-label="Staff Portal Home">
            <div className="qf-brand__logo">
              <Icon name="shield" size={22} />
            </div>
            <div className="qf-brand__text">
              <span className="qf-brand__title">QuickFile</span>
              <span className="qf-brand__subtitle">Staff Processing</span>
            </div>
          </Link>
        </div>

        <div className="qf-shell-header__right">
          <div className="qf-user-badge">
            <Icon name="user" size={16} />
            <span>{user?.full_name || 'Staff Member'}</span>
            <span className="qf-user-role-pill">{user?.role}</span>
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
            aria-label="Staff Navigation"
          >
            <div className="qf-drawer__header">
              <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text)' }}>
                Staff Workspace
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
        <aside className="qf-sidebar" aria-label="Staff Sidebar">
          {renderNavLinks()}
        </aside>

        <main id="main-content" className="qf-shell-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
