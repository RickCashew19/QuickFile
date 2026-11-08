import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { verifyService } from '../../services/verifyService';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Alert } from '../../components/shared/Alert';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Icon } from '../../components/shared/Icon';
import { formatDateTime } from '../../utils/formatters';
import './PublicVerifyPage.css';

export function PublicVerifyPage() {
  const { code: urlCode } = useParams();

  const [code, setCode] = useState(urlCode || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  const performVerification = async (targetCode) => {
    if (!targetCode || !targetCode.trim()) {
      setErrorInfo({ message: 'Please enter a certificate verification code.' });
      setResult(null);
      return;
    }

    setLoading(true);
    setErrorInfo(null);
    setResult(null);

    try {
      const data = await verifyService.verifyCode(targetCode);
      setResult(data);
    } catch (err) {
      setErrorInfo({
        message: err.message || 'Unable to verify code. Please check the code and try again.',
        code: err.code,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urlCode) {
      setCode(urlCode);
      performVerification(urlCode);
    }
  }, [urlCode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    performVerification(code);
  };

  return (
    <div className="qf-landing">
      {/* Mini Header */}
      <header className="qf-navbar">
        <Link to="/" className="qf-brand" aria-label="QuickFile Home">
          <div className="qf-brand__logo">
            <Icon name="building" size={24} />
          </div>
          <div className="qf-brand__text">
            <span className="qf-brand__title">QuickFile</span>
            <span className="qf-brand__subtitle">Official Certificate Verification</span>
          </div>
        </Link>
        <Link to="/login">
          <Button variant="secondary" size="sm">
            Sign In
          </Button>
        </Link>
      </header>

      <main className="qf-verify-container">
        <div className="qf-verify-card">
          <div className="qf-verify-header">
            <div className="qf-verify-header__icon">
              <Icon name="qr" size={32} />
            </div>
            <h1 className="qf-verify-header__title">Verify Certificate Authenticity</h1>
            <p className="qf-verify-header__subtitle">
              Enter the unique verification code or scan the QR code printed on the official barangay certificate.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="qf-verify-form" noValidate>
            <div style={{ flex: 1 }}>
              <Input
                name="verification_code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CERT-A1B2C3D4"
                required
                prefix={<Icon name="search" size={18} />}
              />
            </div>
            <Button type="submit" loading={loading} iconLeft={<Icon name="shield" size={18} />}>
              Verify
            </Button>
          </form>

          {errorInfo && (
            <Alert
              variant={errorInfo.code === 'IS_TRACKING_NUMBER' ? 'warning' : 'danger'}
              title={errorInfo.code === 'IS_TRACKING_NUMBER' ? 'Request Tracking Number' : 'Verification Unsuccessful'}
            >
              {errorInfo.message}
              {errorInfo.code === 'IS_TRACKING_NUMBER' && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Link to="/login">Click here to sign in to your Citizen Portal</Link>
                </div>
              )}
            </Alert>
          )}

          {result && (
            <div className="qf-verify-result">
              <div className="qf-verify-badge-container">
                <StatusBadge status={result.validity_status} />
              </div>

              <div className="qf-verify-details">
                <div className="qf-verify-row">
                  <span className="qf-verify-label">Document Name</span>
                  <span className="qf-verify-value">{result.document_name}</span>
                </div>
                <div className="qf-verify-row">
                  <span className="qf-verify-label">Certificate Number</span>
                  <span className="qf-verify-value">{result.certificate_number}</span>
                </div>
                <div className="qf-verify-row">
                  <span className="qf-verify-label">Issued Date</span>
                  <span className="qf-verify-value">{formatDateTime(result.issued_at)}</span>
                </div>
                {result.expires_at && (
                  <div className="qf-verify-row">
                    <span className="qf-verify-label">Validity Expiration</span>
                    <span className="qf-verify-value">{formatDateTime(result.expires_at)}</span>
                  </div>
                )}
              </div>

              <p
                style={{
                  fontSize: 'var(--font-xs)',
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  marginTop: 'var(--space-4)',
                }}
              >
                In compliance with Philippine Data Privacy regulations, resident personal information is protected and not displayed publicly.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
