import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffService } from '../../../services/staffService';
import { citizenService } from '../../../services/citizenService';
import { ResidentSearchInput } from './ResidentSearchInput';
import { Select } from '../../../components/shared/Select';
import { Input } from '../../../components/shared/Input';
import { Button } from '../../../components/shared/Button';
import { FileDropzone } from '../../../components/shared/FileDropzone';
import { Alert } from '../../../components/shared/Alert';
import { formatCurrency } from '../../../utils/formatters';
import './StaffWalkInPage.css';

export function StaffWalkInPage() {
  const navigate = useNavigate();

  const [documentTypes, setDocumentTypes] = useState([]);
  const [selectedResident, setSelectedResident] = useState(null);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [copies, setCopies] = useState(1);
  const [attachments, setAttachments] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let isMounted = true;
    citizenService
      .getCatalog()
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setDocumentTypes(data);
          if (data.length > 0) {
            setDocumentTypeId(data[0]._id);
          }
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedDocType = documentTypes.find((d) => d._id === documentTypeId);
  const calculatedFee = (selectedDocType?.fee || 0) * (Number(copies) || 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!selectedResident) {
      errors.resident = 'Please search and select a resident citizen.';
    }
    if (!documentTypeId) {
      errors.documentType = 'Please select a document type.';
    }
    if (!purpose.trim() || purpose.trim().length < 3) {
      errors.purpose = 'Purpose must be at least 3 characters long.';
    }
    if (Number(copies) < 1 || Number(copies) > 10) {
      errors.copies = 'Number of copies must be between 1 and 10.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('citizen_id', selectedResident._id);
      formData.append('document_type_id', documentTypeId);
      formData.append('purpose', purpose.trim());
      formData.append('copies', String(copies));

      attachments.forEach((file) => {
        formData.append('attachments', file);
      });

      const result = await staffService.createWalkIn(formData);
      navigate(`/staff/requests/${result._id}`, {
        state: { message: `Walk-in request ${result.tracking_number} created successfully.` },
      });
    } catch (err) {
      setError(err.message || 'Failed to submit walk-in document request.');
    } finally {
      setLoading(false);
    }
  };

  const docTypeOptions = documentTypes.map((dt) => ({
    value: dt._id,
    label: `${dt.name} - ${formatCurrency(dt.fee)}`,
  }));

  return (
    <div className="qf-staff-walkin-page">
      <div className="qf-page-header">
        <div>
          <h1 className="qf-page-title">File Walk-In Request</h1>
          <p className="qf-page-subtitle">
            Submit a document request on behalf of an in-person resident at the Barangay Hall.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="qf-walkin-form">
        {/* Step 1: Resident Search */}
        <section className="qf-walkin-section">
          <h2 className="qf-staff-card-title">1. Resident Identification</h2>
          <ResidentSearchInput
            selectedResident={selectedResident}
            onSelectResident={(res) => {
              setSelectedResident(res);
              if (fieldErrors.resident) {
                setFieldErrors((prev) => ({ ...prev, resident: null }));
              }
            }}
            error={fieldErrors.resident}
            disabled={loading}
          />
        </section>

        {/* Step 2: Document Details */}
        <section className="qf-walkin-section">
          <h2 className="qf-staff-card-title">2. Document Specifications</h2>
          <div className="qf-walkin-grid-2">
            <Select
              label="Document Type *"
              name="documentTypeId"
              value={documentTypeId}
              options={docTypeOptions}
              onChange={(e) => setDocumentTypeId(e.target.value)}
              error={fieldErrors.documentType}
              disabled={loading}
              required
            />

            <Input
              label="Number of Copies (1 - 10) *"
              name="copies"
              type="number"
              min={1}
              max={10}
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
              error={fieldErrors.copies}
              disabled={loading}
              required
            />
          </div>

          <Input
            label="Specific Purpose / Reason for Application *"
            name="purpose"
            value={purpose}
            placeholder="e.g. Local employment requirement, scholarship application, bank account opening"
            onChange={(e) => setPurpose(e.target.value)}
            error={fieldErrors.purpose}
            disabled={loading}
            required
          />

          <div className="qf-fee-summary-banner">
            <span>Estimated Fee: <strong>{formatCurrency(calculatedFee)}</strong></span>
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
              ({copies} {copies === 1 ? 'copy' : 'copies'} @ {formatCurrency(selectedDocType?.fee || 0)} each)
            </span>
          </div>
        </section>

        {/* Step 3: Supporting Requirements */}
        <section className="qf-walkin-section">
          <h2 className="qf-staff-card-title">3. Physical Document Scans / Attachments (Up to 3)</h2>
          <FileDropzone
            maxFiles={3}
            files={attachments}
            onFilesSelected={(newFiles) => setAttachments(newFiles)}
            onFileRemove={(index) => setAttachments((prev) => prev.filter((_, i) => i !== index))}
            disabled={loading}
          />
        </section>

        <div className="qf-walkin-actions">
          <Button type="submit" variant="primary" loading={loading} disabled={loading}>
            Create Walk-In Request
          </Button>
        </div>
      </form>
    </div>
  );
}
