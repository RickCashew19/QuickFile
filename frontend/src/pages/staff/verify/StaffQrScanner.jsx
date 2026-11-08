import { useState, useEffect, useRef } from 'react';
import { Input } from '../../../components/shared/Input';
import { Button } from '../../../components/shared/Button';
import { Icon } from '../../../components/shared/Icon';

export function StaffQrScanner({ onScan, loading = false }) {
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const scannerRef = useRef(null);
  const containerId = 'quickfile-qr-reader';

  const startScanner = async () => {
    setCameraError(null);
    try {
      if (!scannerRef.current) {
        const { Html5Qrcode } = await import('html5-qrcode');
        scannerRef.current = new Html5Qrcode(containerId);
      }
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Extract verification code if full URL was scanned
          const code = decodedText.includes('/verify/')
            ? decodedText.split('/verify/')[1].split(/[?#]/)[0]
            : decodedText;
          stopScanner();
          onScan(code.trim());
        },
        () => {
          // QR search frame scan ticks - ignore frame errors
        }
      );
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        'Unable to access camera or camera permission denied. Please enter verification code manually below.'
      );
      setCameraActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Ignore stop errors on unmount
      }
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    onScan(clean);
  };

  return (
    <div className="qf-qr-scanner-card">
      <div className="qf-qr-camera-section">
        <div id={containerId} className="qf-qr-reader-viewport" />

        {!cameraActive ? (
          <div className="qf-qr-start-prompt">
            <Icon name="qr" size={48} />
            <p className="qf-qr-hint-text">
              Use your device camera to scan physical or digital document QR codes.
            </p>
            <Button variant="primary" onClick={startScanner} disabled={loading}>
              Start Camera Scanner
            </Button>
          </div>
        ) : (
          <div className="qf-qr-active-controls">
            <Button variant="secondary" size="sm" onClick={stopScanner}>
              Stop Camera
            </Button>
          </div>
        )}

        {cameraError && <div className="qf-qr-camera-error">{cameraError}</div>}
      </div>

      <div className="qf-qr-divider">
        <span>OR ENTER CODE MANUALLY</span>
      </div>

      {/* Manual Input Fallback */}
      <form onSubmit={handleManualSubmit} className="qf-qr-manual-form">
        <Input
          label="Verification Code"
          name="manualCode"
          value={manualCode}
          placeholder="e.g. VCD-7A2F-98E1 or 24-character code"
          onChange={(e) => setManualCode(e.target.value)}
          disabled={loading}
          required
        />
        <Button
          type="submit"
          variant="secondary"
          loading={loading}
          disabled={!manualCode.trim() || loading}
        >
          Verify Code
        </Button>
      </form>
    </div>
  );
}
