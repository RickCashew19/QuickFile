import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { verifyService } from '../../services/verifyService';
import { extractVerificationCode, QrExtractionError } from '../../utils/qrCodeHelper';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Alert } from '../../components/shared/Alert';
import { Modal } from '../../components/shared/Modal';
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

  // QR Camera Scanner States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const [isScannerStarting, setIsScannerStarting] = useState(false);
  const scannerInstanceRef = useRef(null);

  const performVerification = useCallback(async (rawCode) => {
    let cleanCode = '';
    try {
      cleanCode = extractVerificationCode(rawCode);
    } catch (err) {
      setErrorInfo({
        message: err.message,
        code: err.isTrackingNumber ? 'IS_TRACKING_NUMBER' : 'INVALID_FORMAT',
      });
      setResult(null);
      return;
    }

    setLoading(true);
    setErrorInfo(null);
    setResult(null);

    try {
      const data = await verifyService.verifyCode(cleanCode);
      setResult(data);
    } catch (err) {
      setErrorInfo({
        message: err.message || 'Unable to verify code. Please check the code and try again.',
        code: err.code,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (urlCode) {
      setCode(urlCode);
      performVerification(urlCode);
    }
  }, [urlCode, performVerification]);

  const handleSubmit = (e) => {
    e.preventDefault();
    performVerification(code);
  };

  const stopCamera = useCallback(async () => {
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          await scannerInstanceRef.current.stop();
        }
        await scannerInstanceRef.current.clear();
      } catch {
        // Ignore cleanup errors
      } finally {
        scannerInstanceRef.current = null;
      }
    }
  }, []);

  const handleCloseScanner = useCallback(() => {
    stopCamera();
    setIsScannerOpen(false);
    setScannerError(null);
    setIsScannerStarting(false);
  }, [stopCamera]);

  const handleOpenScanner = async () => {
    setScannerError(null);
    setIsScannerOpen(true);
    setIsScannerStarting(true);

    // Check secure context requirement (camera requires HTTPS or localhost)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setScannerError('Camera scanning requires a secure connection (HTTPS or localhost). Please enter the code manually.');
      setIsScannerStarting(false);
      return;
    }

    try {
      // Lazy-load html5-qrcode only when user explicitly requests camera scanning
      const { Html5Qrcode } = await import('html5-qrcode');

      // Wait a tick for the modal DOM element to mount
      setTimeout(async () => {
        const element = document.getElementById('qr-camera-stream');
        if (!element) {
          setIsScannerStarting(false);
          return;
        }

        try {
          const scanner = new Html5Qrcode('qr-camera-stream');
          scannerInstanceRef.current = scanner;

          await scanner.start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText) => {
              // Successfully decoded QR code
              handleCloseScanner();
              try {
                const extracted = extractVerificationCode(decodedText);
                setCode(extracted);
                performVerification(extracted);
              } catch (err) {
                setErrorInfo({
                  message: err.message,
                  code: err instanceof QrExtractionError && err.isTrackingNumber ? 'IS_TRACKING_NUMBER' : 'INVALID_FORMAT',
                });
              }
            },
            () => {
              // Scan frame failure ignored (camera continuously scanning)
            }
          );
        } catch (err) {
          const errMsg = String(err?.message || err);
          if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
            setScannerError('Camera permission was denied. Please allow camera access in your browser settings or enter the code manually.');
          } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
            setScannerError('No camera was detected on this device. Please enter the verification code manually.');
          } else {
            setScannerError(`Unable to start camera: ${errMsg}. Please enter the code manually.`);
          }
        } finally {
          setIsScannerStarting(false);
        }
      }, 100);
    } catch {
      setScannerError('Failed to load camera scanner component. Please use manual entry.');
      setIsScannerStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="qf-landing">
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
                placeholder="e.g. CERT-A1B2C3D4 or paste URL"
                required
                prefix={<Icon name="search" size={18} />}
              />
            </div>
            <Button type="submit" loading={loading} iconLeft={<Icon name="shield" size={18} />}>
              Verify
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenScanner}
              iconLeft={<Icon name="qr" size={18} />}
            >
              Scan QR Code
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

      {/* QR Camera Scanner Dialog */}
      <Modal
        isOpen={isScannerOpen}
        onClose={handleCloseScanner}
        title="Scan Certificate QR Code"
        size="md"
        footer={
          <Button variant="secondary" onClick={handleCloseScanner}>
            Close Camera
          </Button>
        }
      >
        {scannerError ? (
          <Alert variant="danger" title="Camera Unavailable">
            {scannerError}
          </Alert>
        ) : (
          <div>
            <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
              Point your camera at the QR code printed on the official certificate.
            </p>
            {isScannerStarting && (
              <p style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                Starting camera video feed...
              </p>
            )}
            <div
              id="qr-camera-stream"
              style={{
                width: '100%',
                minHeight: '260px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                backgroundColor: 'var(--color-surface-hover)',
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
