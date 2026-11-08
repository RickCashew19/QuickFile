import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { staffService } from '../../../services/staffService';
import { printService } from '../../../services/printService';
import { Button } from '../../../components/shared/Button';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { formatDate } from '../../../utils/formatters';
import './CertificatePrintPage.css';

export function CertificatePrintPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [printData, setPrintData] = useState(null);
  const [error, setError] = useState(null);
  const [isSignatoryMissing, setIsSignatoryMissing] = useState(false);

  const loadPrintData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsSignatoryMissing(false);
    try {
      const data = await staffService.getPrintData(id);
      setPrintData(data);
    } catch (err) {
      if (err.status === 409) {
        setIsSignatoryMissing(true);
      }
      setError(err.message || 'Failed to load official certificate data for printing.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPrintData();
  }, [loadPrintData]);

  const handlePrint = () => {
    printService.print();
  };

  if (loading) {
    return (
      <div className="qf-page-loading">
        <Loader size="lg" text="Loading certificate print preview..." />
      </div>
    );
  }

  if (error || !printData) {
    return (
      <div className="qf-print-container">
        <div className="no-print" style={{ marginBottom: 'var(--space-4)' }}>
          <Link to={`/staff/requests/${id}`} className="qf-btn qf-btn--secondary">
            &larr; Back to Request
          </Link>
        </div>
        <Alert variant={isSignatoryMissing ? 'warning' : 'danger'}>
          {error}
          {isSignatoryMissing && (
            <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-sm)' }}>
              An administrator must configure the Barangay Captain and Barangay Secretary in System
              Settings before official certificates can be printed.
            </p>
          )}
        </Alert>
      </div>
    );
  }

  const { barangay, citizen, document, issued_document } = printData;

  return (
    <div className="qf-print-container">
      {/* Top Floating Controls Bar (Hidden during printing) */}
      <div className="qf-print-controls no-print" role="region" aria-label="Print controls">
        <div className="qf-print-controls__left">
          <Link to={`/staff/requests/${id}`} className="qf-btn qf-btn--secondary qf-btn--sm">
            &larr; Back to Request
          </Link>
          <span className="qf-print-controls__badge">
            Cert No: {issued_document?.certificate_number}
          </span>
        </div>
        <div className="qf-print-controls__right">
          <Button variant="primary" onClick={handlePrint} aria-label="Print official certificate">
            Print Certificate
          </Button>
        </div>
      </div>

      {/* Official Certificate Paper Sheet */}
      <div className="qf-certificate-sheet" id="official-certificate-sheet">
        {/* Header */}
        <header className="qf-certificate-header">
          <div className="qf-certificate-header__text">
            <p className="qf-cert-country">Republic of the Philippines</p>
            <p className="qf-cert-province">Province of {barangay?.province || 'Provinces'}</p>
            <p className="qf-cert-city">{barangay?.city_municipality || 'City / Municipality'}</p>
            <h2 className="qf-cert-barangay">BARANGAY {barangay?.barangay_name?.toUpperCase() || 'BARANGAY'}</h2>
            <p className="qf-cert-office">{barangay?.office_name || 'OFFICE OF THE BARANGAY CAPTAIN'}</p>
          </div>
          <div className="qf-cert-header-line" />
        </header>

        {/* Certificate Title */}
        <div className="qf-cert-title-section">
          <h1 className="qf-cert-title">{document?.name?.toUpperCase() || 'BARANGAY CERTIFICATION'}</h1>
          <div className="qf-cert-meta">
            <span>Certificate No.: <strong>{issued_document?.certificate_number}</strong></span>
            {issued_document?.expires_at && (
              <>
                <span>&bull;</span>
                <span>Valid Until: <strong>{formatDate(issued_document.expires_at)}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Certificate Body Text */}
        <div className="qf-cert-body">
          <p className="qf-cert-salutation">TO WHOM IT MAY CONCERN:</p>

          <p className="qf-cert-paragraph">
            THIS IS TO CERTIFY that <strong>{citizen?.full_name?.toUpperCase()}</strong>,
            {citizen?.civil_status ? ` ${citizen.civil_status},` : ''} is a bonafide resident of
            {citizen?.address ? ` ${citizen.address},` : ''}
            {citizen?.purok_zone ? ` ${citizen.purok_zone},` : ''} Barangay{' '}
            {barangay?.barangay_name}, {barangay?.city_municipality}.
          </p>

          <p className="qf-cert-paragraph">
            This certification is issued upon the request of the above-named person for the purpose
            of: <strong>{document?.purpose || 'official requirements'}</strong>.
          </p>

          <p className="qf-cert-paragraph">
            Issued this {formatDate(issued_document?.issued_at || new Date())} at the Barangay
            Hall of {barangay?.barangay_name}, {barangay?.city_municipality}, {barangay?.province}.
          </p>
        </div>

        {/* QR Code Verification Section */}
        <div className="qf-cert-qr-section">
          {issued_document?.qr_code_image && (
            <img
              src={issued_document.qr_code_image}
              alt="Official Document Verification QR Code"
              className="qf-cert-qr-image"
              width={120}
              height={120}
            />
          )}
          <div className="qf-cert-qr-details">
            <span className="qf-cert-qr-title">Official Document Verification</span>
            <span className="qf-cert-qr-code">Code: {issued_document?.verification_code}</span>
            <span className="qf-cert-qr-hint">
              Scan this QR code with any smartphone camera to verify the authenticity of this document
              directly from the Barangay QuickFile registry.
            </span>
          </div>
        </div>

        {/* Signatures Section */}
        <div className="qf-cert-signatures">
          <div className="qf-signature-block">
            <div className="qf-signature-line" />
            <span className="qf-signature-name">{barangay?.secretary_name}</span>
            <span className="qf-signature-title">Barangay Secretary</span>
            <span className="qf-signature-role">Prepared & Certified</span>
          </div>

          <div className="qf-signature-block">
            <div className="qf-signature-line" />
            <span className="qf-signature-name">{barangay?.captain_name}</span>
            <span className="qf-signature-title">Punong Barangay</span>
            <span className="qf-signature-role">Approved & Attested</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="qf-cert-footer">
          <span>Official Barangay Document</span>
          {issued_document?.expires_at && (
            <>
              <span>&bull;</span>
              <span>Valid Until: {formatDate(issued_document.expires_at)}</span>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
