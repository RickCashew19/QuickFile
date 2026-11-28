import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { publicService } from '../../api/publicService';
import { Button } from '../../components/shared/Button';
import { Icon } from '../../components/shared/Icon';
import './LandingPage.css';

const FALLBACK_CONFIG = {
  system_name: 'QuickFile Barangay Portal',
  barangay_name: 'Barangay Central',
  city_municipality: 'City Hall',
  province: 'Metro Manila',
};

export function LandingPage() {
  const [config, setConfig] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    publicService
      .getConfig()
      .then((data) => {
        if (isMounted) setConfig(data);
      })
      .catch(() => {
        if (isMounted) setConfig(FALLBACK_CONFIG);
      });

    publicService
      .getDocumentTypes()
      .then((data) => {
        if (isMounted) setDocumentTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (isMounted) setDocumentTypes([]);
      })
      .finally(() => {
        if (isMounted) setServicesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const barangayName = config?.barangay_name || 'Barangay Portal';
  const jurisdiction = config ? `${config.city_municipality}, ${config.province}` : '';

  return (
    <div className="qf-landing">
      {/* Hero Section */}
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

          {servicesLoading ? (
            <p className="qf-section-subtitle">Loading available document services...</p>
          ) : documentTypes.length === 0 ? (
            <p className="qf-section-subtitle">
              No document services are currently available. Please check back later.
            </p>
          ) : (
            <div className="qf-grid">
              {documentTypes.map((doc) => (
                <div className="qf-card" key={doc._id || doc.code}>
                  <div className="qf-card__icon">
                    <Icon name="file" size={24} />
                  </div>
                  <h3 className="qf-card__title">{doc.name}</h3>
                  <p className="qf-card__desc">
                    {doc.description ||
                      `Estimated processing: ${doc.processing_days || 1} business day(s).`}
                  </p>
                  <Link to="/login?redirect=/citizen/requests/new">
                    <Button variant="outline" size="sm" fullWidth>
                      Apply Now
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
