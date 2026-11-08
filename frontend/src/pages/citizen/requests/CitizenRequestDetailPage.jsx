import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { requestService } from '../../../services/requestService';
import { downloadBlob } from '../../../utils/downloadHelper';
import { usePolling } from '../../../hooks/usePolling';
import { buildStatusTimeline } from '../../../utils/statusTimelineBuilder';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Button } from '../../../components/shared/Button';
import { Modal } from '../../../components/shared/Modal';
import { Input } from '../../../components/shared/Input';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';
import { Icon } from '../../../components/shared/Icon';
import './CitizenRequestDetailPage.css';

export function CitizenRequestDetailPage() {
  const { trackingNumber } = useParams();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [downloadingFile, setDownloadingFile] = useState(null);

  // Cancellation Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Track created object URLs for clean unmount revocation
  const activeObjectUrlsRef = useRef([]);

  const loadRequest = useCallback(async () => {
    try {
      const data = await requestService.getRequest(trackingNumber);
      setRequest(data);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to retrieve request details.');
    } finally {
      setLoading(false);
    }
  }, [trackingNumber]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  // 8-second status polling: refetch full request if status transitioned
  usePolling(
    async () => {
      if (!trackingNumber || !request) return;
      try {
        const liveStatus = await requestService.getStatus(trackingNumber);
        if (liveStatus && liveStatus.status !== request.status) {
          await loadRequest();
        }
      } catch {
        // Ignore polling errors
      }
    },
    8000,
    { enabled: Boolean(request && request.status !== 'released' && request.status !== 'cancelled' && request.status !== 'rejected') }
  );

  // Clean up any object URLs on component unmount
  useEffect(() => {
    const urls = activeObjectUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        try {
          window.URL.revokeObjectURL(url);
        } catch {
          // Ignore
        }
      });
    };
  }, []);

  const handleDownloadAttachment = async (attachment) => {
    setDownloadingFile(attachment.stored_filename);
    try {
      const result = await requestService.downloadAttachment(attachment.stored_filename);
      const filename = result.filename || attachment.original_name || 'document';
      downloadBlob(result.blob, filename);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to download attachment.');
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelError('Please provide a reason for cancelling this request.');
      return;
    }

    setCancelLoading(true);
    setCancelError(null);
    try {
      await requestService.cancelRequest(trackingNumber, cancelReason.trim());
      setCancelModalOpen(false);
      setCancelReason('');
      await loadRequest();
    } catch (err) {
      if (err.status === 409) {
        setCancelError('This request status was already updated by barangay staff and can no longer be cancelled.');
        loadRequest();
      } else {
        setCancelError(err.message || 'Failed to cancel request.');
      }
    } finally {
      setCancelLoading(false);
    }
  };

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
        <Alert variant="danger">Request not found or access denied.</Alert>
        <Link to="/citizen/requests">
          <Button variant="secondary">&larr; Return to Requests</Button>
        </Link>
      </div>
    );
  }

  const timelineSteps = buildStatusTimeline(request);
  const isPending = request.status === 'pending';

  return (
    <div>
      <div className="qf-dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
            <h1 className="qf-dashboard-title" style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
              {request.tracking_number}
            </h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="qf-dashboard-subtitle">
            {request.document_type?.name} &bull; Submitted on {formatDate(request.created_at)}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {isPending && (
            <>
              <Link to={`/citizen/requests/${request.tracking_number}/edit`}>
                <Button variant="outline" size="sm" iconLeft={<Icon name="file" size={16} />}>
                  Edit Request
                </Button>
              </Link>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setCancelModalOpen(true)}
                iconLeft={<Icon name="close" size={16} />}
              >
                Cancel Request
              </Button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <div className="qf-detail-layout">
        {/* Left Column: Information & Attachments */}
        <div>
          <div className="qf-detail-card">
            <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)' }}>
              Application Overview
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Document Service</span>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>{request.document_type?.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Purpose</span>
                <span style={{ fontWeight: 'var(--font-medium)', textAlign: 'right', maxWidth: '60%' }}>{request.purpose}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Copies</span>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>{request.copies}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Assessed Fee</span>
                <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-primary)' }}>{formatCurrency(request.fee)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Payment Status</span>
                <span style={{ textTransform: 'capitalize', fontWeight: 'var(--font-medium)' }}>{request.payment_status || 'Unpaid'}</span>
              </div>
            </div>
          </div>

          {/* Attachments Card */}
          <div className="qf-detail-card">
            <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)' }}>
              Supporting Attachments ({request.attachments?.length || 0})
            </h2>

            {!request.attachments || request.attachments.length === 0 ? (
              <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
                No attachments uploaded for this request.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {request.attachments.map((att, idx) => (
                  <li
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-surface-hover)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--font-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Icon name="file" size={16} />
                      <span style={{ fontWeight: 'var(--font-medium)' }}>{att.original_name}</span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadAttachment(att)}
                      loading={downloadingFile === att.stored_filename}
                      iconLeft={<Icon name="download" size={14} />}
                    >
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Live Status Timeline */}
        <div>
          <div className="qf-detail-card">
            <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)' }}>
              Processing Timeline
            </h2>

            <ol className="qf-timeline">
              {timelineSteps.map((step) => (
                <li key={step.key} className={`qf-timeline-item qf-timeline-item--${step.state}`}>
                  <span className="qf-timeline-node">
                    {step.state === 'completed' && <Icon name="check" size={10} />}
                  </span>
                  <div className="qf-timeline-title">{step.title}</div>
                  {step.timestamp && <div className="qf-timeline-time">{step.timestamp}</div>}
                  {step.note && <div className="qf-timeline-note">{step.note}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Document Request"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModalOpen(false)} disabled={cancelLoading}>
              Keep Request
            </Button>
            <Button variant="danger" onClick={handleConfirmCancel} loading={cancelLoading}>
              Confirm Cancel
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          Are you sure you want to cancel this pending request? This action cannot be undone.
        </p>

        {cancelError && (
          <Alert variant="danger" onDismiss={() => setCancelError(null)}>
            {cancelError}
          </Alert>
        )}

        <Input
          label="Cancellation Reason"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Please explain why you are cancelling this request..."
          required
          helperText={`${cancelReason.length}/500 characters`}
        />
      </Modal>
    </div>
  );
}
