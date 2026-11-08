import { useState } from 'react';
import { staffService } from '../../../services/staffService';
import { StaffQrScanner } from './StaffQrScanner';
import { StaffVerificationResult } from './StaffVerificationResult';
import { Alert } from '../../../components/shared/Alert';
import './StaffVerifyPage.css';

export function StaffVerifyPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleVerify = async (code) => {
    setLoading(true);
    setError(null);
    try {
      const data = await staffService.verifyCode(code);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to verify code. Document may not exist or code is invalid.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="qf-staff-verify-page">
      <div className="qf-page-header">
        <div>
          <h1 className="qf-page-title">Staff Document Verification</h1>
          <p className="qf-page-subtitle">
            Scan document QR code or enter certificate verification code to inspect validity and
            audit status.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {result ? (
        <StaffVerificationResult result={result} onReset={handleReset} />
      ) : (
        <StaffQrScanner onScan={handleVerify} loading={loading} />
      )}
    </div>
  );
}
