import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import { Icon } from '../shared/Icon';
import { Button } from '../shared/Button';
import './Layout.css';
import '../../pages/public/LandingPage.css';

export function PublicLayout() {
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
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
          >
            <Icon name="search" size={20} />
          </button>
          <Link to="/" className="qf-brand" aria-label="QuickFile Portal Home">
            <div className="qf-brand__logo">
              <Icon name="building" size={22} />
            </div>
            <div className="qf-brand__text">
              <span className="qf-brand__title">QuickFile</span>
              <span className="qf-brand__subtitle">Barangay Portal</span>
            </div>
          </Link>
        </div>

        <nav className="qf-nav-actions">
          <NavLink to="/verify">
            <Button variant="ghost" size="sm" iconLeft={<Icon name="qr" size={16} />}>
              Verify QR
            </Button>
          </NavLink>
          <Link to="/login">
            <Button variant="secondary" size="sm">
              Sign In
            </Button>
          </Link>
          <Link to="/register">
            <Button variant="primary" size="sm">
              Sign Up
            </Button>
          </Link>
        </nav>
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
            aria-label="Mobile Navigation"
          >
            <div className="qf-drawer__header">
              <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text)' }}>
                Navigation
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
            <ul className="qf-nav-menu">
              <li>
                <NavLink
                  to="/"
                  className={({ isActive }) => `qf-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setDrawerOpen(false)}
                  end
                >
                  <Icon name="building" size={18} />
                  <span>Home</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/verify"
                  className={({ isActive }) => `qf-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setDrawerOpen(false)}
                >
                  <Icon name="qr" size={18} />
                  <span>Verify Certificate</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/login"
                  className={({ isActive }) => `qf-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setDrawerOpen(false)}
                >
                  <Icon name="user" size={18} />
                  <span>Sign In</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/register"
                  className={({ isActive }) => `qf-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setDrawerOpen(false)}
                >
                  <Icon name="shield" size={18} />
                  <span>Sign Up</span>
                </NavLink>
              </li>
            </ul>
          </div>
        </>
      )}

      {/* Main Outlet */}
      <main id="main-content" className="qf-shell-main" style={{ padding: 0 }}>
        <Outlet />
      </main>

      <footer className="qf-footer">
        <p>&copy; {new Date().getFullYear()} QuickFile Barangay Portal. All rights reserved.</p>
      </footer>
    </div>
  );
}
