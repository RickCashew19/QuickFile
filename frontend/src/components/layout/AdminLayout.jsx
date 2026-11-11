import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Icon } from '../shared/Icon';
import { Button } from '../shared/Button';
import './Layout.css';

export function AdminLayout() {
  const { user, logout } = useAuth();
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
    { to: '/admin/dashboard', label: 'Executive Dashboard', icon: 'building', end: true },
    { to: '/admin/staff', label: 'Staff Accounts', icon: 'user' },
    { to: '/admin/citizens', label: 'Citizen Directory', icon: 'user' },
    { to: '/admin/document-types', label: 'Document Types', icon: 'file' },
    { to: '/admin/records', label: 'All Records', icon: 'calendar' },
    { to: '/admin/issued-documents', label: 'Issued Certificates', icon: 'qr' },
    { to: '/admin/audit-logs', label: 'Activity Log', icon: 'shield' },
    { to: '/admin/settings', label: 'System Settings', icon: 'refresh' },
    { to: '/admin/reports', label: 'Executive Reports', icon: 'download' },
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
          <Link to="/admin/dashboard" className="qf-brand" aria-label="Admin Portal Home">
            <div className="qf-brand__logo" style={{ backgroundColor: 'var(--color-text)' }}>
              <Icon name="shield" size={22} />
            </div>
            <div className="qf-brand__text">
              <span className="qf-brand__title">QuickFile</span>
              <span className="qf-brand__subtitle">System Administration</span>
            </div>
          </Link>
        </div>

        <div className="qf-shell-header__right">
          <div className="qf-user-badge">
            <Icon name="shield" size={16} />
            <span>{user?.full_name || 'System Admin'}</span>
            <span
              className="qf-user-role-pill"
              style={{
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                fontWeight: 'var(--font-semibold)',
              }}
            >
              Administrator
            </span>
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
            aria-label="Admin Navigation"
          >
            <div className="qf-drawer__header">
              <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text)' }}>
                Admin Console
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
        <aside className="qf-sidebar" aria-label="Admin Sidebar">
          {renderNavLinks()}
        </aside>

        <main id="main-content" className="qf-shell-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
