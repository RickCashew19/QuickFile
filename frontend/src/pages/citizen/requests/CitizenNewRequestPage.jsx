import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { citizenService } from '../../../services/citizenService';
import { requestService } from '../../../services/requestService';
import { validateRequestForm } from '../../../utils/validators';
import { calculateDisplayFee } from '../../../utils/feeCalculator';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';
import { FileDropzone } from '../../../components/shared/FileDropzone';
import { Icon } from '../../../components/shared/Icon';
import './CitizenNewRequestPage.css';

export function CitizenNewRequestPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTypeId = searchParams.get('type') || '';

  const [catalog, setCatalog] = useState([]);
  const [reuseData, setReuseData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [documentTypeId, setDocumentTypeId] = useState(initialTypeId);
  const [purpose, setPurpose] = useState('');
  const [copies, setCopies] = useState(1);
  const [attachments, setAttachments] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success State
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [catData, reuseRes] = await Promise.all([
          citizenService.getCatalog().catch(() => []),
          citizenService.getProfileReuseData().catch(() => null),
        ]);
        setCatalog(Array.isArray(catData) ? catData : []);
        setReuseData(reuseRes);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const selectedDocType = catalog.find((d) => (d._id || d.id) === documentTypeId);
  const feeSummary = calculateDisplayFee(selectedDocType?.fee || 0, copies);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    const validation = validateRequestForm({
      document_type_id: documentTypeId,
      purpose,
      copies,
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});

    // Build multipart/form-data payload
    const formData = new FormData();
    formData.append('document_type_id', documentTypeId);
    formData.append('purpose', purpose.trim());
    formData.append('copies', String(copies));

    // Optional dynamic form data prefilled from citizen profile
    if (reuseData) {
      formData.append(
        'form_data',
        JSON.stringify({
          resident_name: reuseData.full_name || `${reuseData.first_name} ${reuseData.last_name}`,
          civil_status: reuseData.civil_status,
          address: `${reuseData.purok_zone || ''} ${reuseData.street_address || ''}, ${reuseData.barangay || ''}`.trim(),
        })
      );
    }

    attachments.forEach((file) => {
      formData.append('attachments', file);
    });

    setIsSubmitting(true);
    try {
      const result = await requestService.createRequest(formData);
      setSubmittedRequest(result);
    } catch (err) {
      if (err.errors && typeof err.errors === 'object') {
        setFieldErrors(err.errors);
      }
      setServerError(err.message || 'Failed to submit document request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTrackingNumber = () => {
    if (!submittedRequest?.tracking_number) return;
    navigator.clipboard.writeText(submittedRequest.tracking_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
        <Loader size="lg" text="Preparing application form..." />
      </div>
    );
  }

  // Confirmation Success View
  if (submittedRequest) {
    return (
      <div className="qf-success-card">
        <div style={{ color: 'var(--color-success)', marginBottom: 'var(--space-4)', display: 'inline-block' }}>
          <Icon name="check" size={56} />
        </div>
        <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>
          Request Successfully Submitted!
        </h1>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          Your document application for <strong>{submittedRequest.document_type?.name}</strong> has been received by barangay staff.
        </p>

        <div className="qf-success-tracking-box">
          <span className="qf-success-tracking-number">{submittedRequest.tracking_number}</span>
          <Button variant="secondary" size="sm" onClick={handleCopyTrackingNumber} iconLeft={<Icon name="file" size={14} />}>
            {copied ? 'Copied!' : 'Copy Code'}
          </Button>
        </div>

        <p style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
          Please keep this tracking number to follow your application progress or present it during release at the barangay hall.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <Link to={`/citizen/requests/${submittedRequest.tracking_number}`}>
            <Button iconRight={<Icon name="arrow-right" size={16} />}>Track Live Status</Button>
          </Link>
          <Link to="/citizen/requests">
            <Button variant="outline">View All Requests</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="qf-request-form-card">
      <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}>
        Apply for Document
      </h1>
      <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
        Complete the details below to submit your official document request to barangay staff
      </p>

      {serverError && (
        <Alert variant="danger" onDismiss={() => setServerError(null)}>
          {serverError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Document Selection */}
        <Select
          label="Document Type"
          value={documentTypeId}
          onChange={(e) => setDocumentTypeId(e.target.value)}
          required
          error={fieldErrors.document_type_id}
          options={catalog.map((d) => ({
            value: d._id || d.id,
            label: `${d.name} (${d.code})`,
          }))}
          placeholder="-- Select a Document Service --"
        />

        {/* Purpose */}
        <Input
          label="Purpose of Request"
          name="purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="e.g. Local employment requirement, scholarship, bank opening..."
          required
          error={fieldErrors.purpose}
          helperText={`${purpose.length}/500 characters`}
        />

        {/* Copies */}
        <Input
          label="Number of Copies"
          type="number"
          name="copies"
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
          min={1}
          max={10}
          required
          error={fieldErrors.copies}
        />

        {/* Attachments Dropzone */}
        <FileDropzone
          files={attachments}
          onChange={setAttachments}
          maxFiles={3}
          label="Supporting Attachments (Optional, max 3 files)"
        />

        {/* Estimated Fee Summary */}
        <div className="qf-fee-summary-box">
          <div className="qf-fee-summary-row">
            <span>Unit Fee</span>
            <span>{feeSummary.displayUnitFee}</span>
          </div>
          <div className="qf-fee-summary-row">
            <span>Requested Copies</span>
            <span>&times; {feeSummary.copies}</span>
          </div>
          <div className="qf-fee-summary-row" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>Estimated Total Fee</span>
            <span className="qf-fee-summary-total">{feeSummary.displayFee}</span>
          </div>
          <p className="qf-fee-disclaimer">
            * Note: Fees are verified and assessed by the barangay treasury upon processing. Official receipts are issued upon release.
          </p>
        </div>

        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Submit Document Request
        </Button>
      </form>
    </div>
  );
}
