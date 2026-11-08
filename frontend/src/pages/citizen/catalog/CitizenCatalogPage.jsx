import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { citizenService } from '../../../services/citizenService';
import { Button } from '../../../components/shared/Button';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Icon } from '../../../components/shared/Icon';
import { formatCurrency } from '../../../utils/formatters';
import './CitizenCatalogPage.css';

export function CitizenCatalogPage() {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let isMounted = true;
    citizenService
      .getCatalog()
      .then((data) => {
        if (isMounted) {
          setCatalog(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMessage(err.message || 'Unable to load document catalog.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
        <Loader size="lg" text="Loading available document services..." />
      </div>
    );
  }

  return (
    <div>
      <div className="qf-dashboard-header">
        <div>
          <h1 className="qf-dashboard-title">Official Document Catalog</h1>
          <p className="qf-dashboard-subtitle">
            Browse available barangay certificates, view required supporting documents, and file an application online
          </p>
        </div>
      </div>

      {errorMessage && (
        <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {catalog.length === 0 ? (
        <EmptyState
          icon="file"
          title="No Active Documents"
          description="There are currently no active document types available in the barangay catalog."
        />
      ) : (
        <div className="qf-catalog-grid">
          {catalog.map((doc) => {
            const docId = doc._id || doc.id;
            const reqs = Array.isArray(doc.requirements) ? doc.requirements : [];

            return (
              <div key={docId} className="qf-catalog-card">
                <div className="qf-catalog-card__badge-row">
                  <span className="qf-catalog-card__code">{doc.code}</span>
                  <span className="qf-catalog-card__fee">{formatCurrency(doc.fee)}</span>
                </div>

                <h2 className="qf-catalog-card__title">{doc.name}</h2>

                <div className="qf-catalog-card__meta">
                  <Icon name="calendar" size={14} />
                  <span>
                    Estimated Processing: {doc.processing_days || 1} business day(s)
                  </span>
                </div>

                <span className="qf-catalog-card__reqs-title">Standard Requirements</span>
                <ul className="qf-catalog-card__reqs-list">
                  {reqs.length === 0 ? (
                    <li className="qf-catalog-card__req-item">None specified</li>
                  ) : (
                    reqs.map((req, idx) => (
                      <li key={idx} className="qf-catalog-card__req-item">
                        <span style={{ color: 'var(--color-primary)', marginTop: 2 }}>&bull;</span>
                        <span>{req}</span>
                      </li>
                    ))
                  )}
                </ul>

                <Link to={`/citizen/requests/new?type=${encodeURIComponent(docId)}`}>
                  <Button fullWidth iconRight={<Icon name="arrow-right" size={16} />}>
                    Apply for this Document
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
