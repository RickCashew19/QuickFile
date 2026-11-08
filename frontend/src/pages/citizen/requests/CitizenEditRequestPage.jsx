import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { requestService } from '../../../services/requestService';
import { validateRequestForm } from '../../../utils/validators';
import { calculateDisplayFee } from '../../../utils/feeCalculator';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';
import { FileDropzone } from '../../../components/shared/FileDropzone';
import { Icon } from '../../../components/shared/Icon';
import './CitizenNewRequestPage.css';

export function CitizenEditRequestPage() {
  const { trackingNumber } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [purpose, setPurpose] = useState('');
  const [copies, setCopies] = useState(1);
  const [replaceAttachments, setReplaceAttachments] = useState(false);
  const [newAttachments, setNewAttachments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    async function fetchRequest() {
      try {
        const data = await requestService.getRequest(trackingNumber);
        setRequest(data);
        setPurpose(data.purpose || '');
        setCopies(data.copies || 1);
      } catch (err) {
        setErrorMessage(err.message || 'Failed to retrieve request details.');
      } finally {
        setLoading(false);
      }
    }
    fetchRequest();
  }, [trackingNumber]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
        <Loader size="lg" text="Loading request details..." />
      </div>
    );
  }

  if (!request) {
    return (
      <div>
        <Alert variant="danger">Request not found.</Alert>
        <Link to="/citizen/requests">
          <Button variant="secondary">&larr; Return to Requests</Button>
        </Link>
      </div>
    );
  }

  if (request.status !== 'pending') {
    return (
      <div className="qf-request-form-card" style={{ textAlign: 'center' }}>
        <Alert variant="warning" title="Cannot Modify Request">
          This document request has already entered processing (status: <strong>{request.status}</strong>). Only pending requests can be modified.
        </Alert>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Link to={`/citizen/requests/${trackingNumber}`}>
            <Button>View Request Details</Button>
          </Link>
        </div>
      </div>
    );
  }

  const feeSummary = calculateDisplayFee(request.unit_fee || request.fee / (request.copies || 1), copies);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = validateRequestForm({
      document_type_id: request.document_type?.id || 'doc',
      purpose,
      copies,
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});

    const formData = new FormData();
    formData.append('purpose', purpose.trim());
    formData.append('copies', String(copies));

    if (replaceAttachments) {
      formData.append('replace_attachments', 'true');
      newAttachments.forEach((f) => formData.append('attachments', f));
    }

    setIsSaving(true);
    try {
      await requestService.updateRequest(trackingNumber, formData);
      navigate(`/citizen/requests/${trackingNumber}`, { replace: true });
    } catch (err) {
      if (err.status === 409) {
        setErrorMessage('Cannot update request: the request status was already changed by barangay staff.');
      } else {
        setErrorMessage(err.message || 'Failed to update request.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="qf-request-form-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
        <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text)', margin: 0 }}>
          Edit Pending Request
        </h1>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
          ({request.tracking_number})
        </span>
      </div>

      <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
        You may update your purpose, number of copies, or replacement attachments while your application is still pending review.
      </p>

      {errorMessage && (
        <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="Purpose of Request"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          required
          error={fieldErrors.purpose}
          helperText={`${purpose.length}/500 characters`}
        />

        <Input
          label="Number of Copies"
          type="number"
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
          min={1}
          max={10}
          required
          error={fieldErrors.copies}
        />

        <div style={{ margin: 'var(--space-4) 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-sm)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={replaceAttachments}
              onChange={(e) => setReplaceAttachments(e.target.checked)}
            />
            <span>Replace existing attachments with new files</span>
          </label>
        </div>

        {replaceAttachments && (
          <FileDropzone
            files={newAttachments}
            onChange={setNewAttachments}
            maxFiles={3}
            label="New Attachments (Replaces previous uploads)"
          />
        )}

        <div className="qf-fee-summary-box">
          <div className="qf-fee-summary-row">
            <span>Requested Copies</span>
            <span>&times; {feeSummary.copies}</span>
          </div>
          <div className="qf-fee-summary-row" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>Estimated Total Fee</span>
            <span className="qf-fee-summary-total">{feeSummary.displayFee}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
          <Link to={`/citizen/requests/${trackingNumber}`} style={{ flex: 1 }}>
            <Button variant="secondary" fullWidth disabled={isSaving}>
              Cancel Edit
            </Button>
          </Link>
          <Button type="submit" fullWidth loading={isSaving} style={{ flex: 1 }} iconLeft={<Icon name="check" size={16} />}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
