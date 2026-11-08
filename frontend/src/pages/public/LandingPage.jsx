import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { publicService } from '../../services/publicService';
import { Button } from '../../components/shared/Button';
import { Icon } from '../../components/shared/Icon';
import './LandingPage.css';

export function LandingPage() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    publicService
      .getConfig()
      .then((data) => setConfig(data))
      .catch(() => {
        // Fallback default
        setConfig({
          system_name: 'QuickFile Barangay Portal',
          barangay_name: 'Barangay Central',
          city_municipality: 'City Hall',
          province: 'Metro Manila',
        });
      });
  }, []);

  const systemName = config?.system_name || 'QuickFile';
  const barangayName = config?.barangay_name || 'Barangay Portal';
  const jurisdiction = config ? `${config.city_municipality}, ${config.province}` : '';

  return (
    <div className="qf-landing">
      {/* Top Navbar */}
      <header className="qf-navbar">
        <Link to="/" className="qf-brand" aria-label="QuickFile Home">
          <div className="qf-brand__logo">
            <Icon name="building" size={24} />
          </div>
          <div className="qf-brand__text">
            <span className="qf-brand__title">{systemName}</span>
            <span className="qf-brand__subtitle">{barangayName}</span>
          </div>
        </Link>

        <nav className="qf-nav-actions">
          <Link to="/verify">
            <Button variant="ghost" size="sm" iconLeft={<Icon name="qr" size={16} />}>
              Verify QR
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" size="sm">
              Log In
            </Button>
          </Link>
          <Link to="/register">
            <Button variant="primary" size="sm">
              Sign Up
            </Button>
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main>
        <section className="qf-hero">
          <div className="container">
            <div className="qf-hero__badge">
              <Icon name="shield" size={14} />
              <span>Official Barangay Document Services</span>
            </div>

            <h1 className="qf-hero__title">
              Request & Verify Official Barangay Documents Online
            </h1>

            <p className="qf-hero__subtitle">
              Fast, paperless, and transparent document processing for all residents of {barangayName} ({jurisdiction}).
            </p>

            <div className="qf-hero__actions">
              <Link to="/login?redirect=/citizen/requests/new">
                <Button size="lg" iconRight={<Icon name="arrow-right" size={18} />}>
                  Request Document
                </Button>
              </Link>
              <Link to="/verify">
                <Button variant="outline" size="lg" iconLeft={<Icon name="qr" size={18} />}>
                  Verify Certificate
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Available Services */}
        <section className="qf-features">
          <div className="container">
            <div className="qf-section-header">
              <h2 className="qf-section-title">Popular Document Services</h2>
              <p className="qf-section-subtitle">
                Apply online anytime from your phone or computer. Track progress in real-time.
              </p>
            </div>

            <div className="qf-grid">
              <div className="qf-card">
                <div className="qf-card__icon">
                  <Icon name="file" size={24} />
                </div>
                <h3 className="qf-card__title">Barangay Clearance</h3>
                <p className="qf-card__desc">
                  Required for employment, postal ID, government applications, and utility connections.
                </p>
                <Link to="/login?redirect=/citizen/requests/new">
                  <Button variant="outline" size="sm" fullWidth>
                    Apply Now
                  </Button>
                </Link>
              </div>

              <div className="qf-card">
                <div className="qf-card__icon">
                  <Icon name="file" size={24} />
                </div>
                <h3 className="qf-card__title">Certificate of Residency</h3>
                <p className="qf-card__desc">
                  Official verification proving continuous residency within the barangay jurisdiction.
                </p>
                <Link to="/login?redirect=/citizen/requests/new">
                  <Button variant="outline" size="sm" fullWidth>
                    Apply Now
                  </Button>
                </Link>
              </div>

              <div className="qf-card">
                <div className="qf-card__icon">
                  <Icon name="file" size={24} />
                </div>
                <h3 className="qf-card__title">Certificate of Indigency</h3>
                <p className="qf-card__desc">
                  For scholarship assistance, medical aid, social welfare, or legal aid representation.
                </p>
                <Link to="/login?redirect=/citizen/requests/new">
                  <Button variant="outline" size="sm" fullWidth>
                    Apply Now
                  </Button>
                </Link>
              </div>

              <div className="qf-card">
                <div className="qf-card__icon">
                  <Icon name="shield" size={24} />
                </div>
                <h3 className="qf-card__title">Business Clearance</h3>
                <p className="qf-card__desc">
                  Barangay endorsement and operational clearance for local commercial establishments.
                </p>
                <Link to="/login?redirect=/citizen/requests/new">
                  <Button variant="outline" size="sm" fullWidth>
                    Apply Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="qf-footer">
        <p>
          &copy; {new Date().getFullYear()} {systemName} &bull; {barangayName}, {jurisdiction}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
