import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { staffService } from '../../../api/staffService';
import { API_BASE_URL } from '../../../api/apiClient';
import { authStorage } from '../../../api/authStorage';
import { STAFF_PERMISSIONS } from '../../../config/constants';
import { StaffActionButtons } from './StaffActionButtons';
import { StaffNotesSection } from './StaffNotesSection';
import { StaffRejectModal } from './StaffRejectModal';
import { StaffReleaseModal } from './StaffReleaseModal';
import { ApplicantInfoCard } from './ApplicantInfoCard';
import { RequestSpecsCard } from './RequestSpecsCard';
import { PaymentIssuanceCard } from './PaymentIssuanceCard';
import { AttachmentListCard } from './AttachmentListCard';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { formatDate, formatCurrency } from '../../../utils/formatters';
import { downloadBlob } from '../../../utils/downloadHelper';
import './StaffRequestDetailPage.css';

export function StaffRequestDetailPage() {
  const { id } = useParams();
  const { user, hasPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [detailData, setDetailData] = useState(null);
  const [error, setError] = useState(null);
  const [conflictNotice, setConflictNotice] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [dataWarnings, setDataWarnings] = useState([]);

  const [loadingAction, setLoadingAction] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);

  // Concurrency control: Lock state
  const [lockState, setLockState] = useState({
    isLockedByOther: false,
    holderName: '',
    expiresAt: null,
  });

  const acquireOrRenewLock = useCallback(async () => {
    try {
      const res = await staffService.acquireOrRenewLock(id);
      setLockState({
        isLockedByOther: false,
        holderName: '',
        expiresAt: res?.data?.expires_at || null,
      });
    } catch (err) {
      if (err.status === 423 || err.code === 'LOCKED') {
        const holder = err.data?.lock?.locked_by_name || 'another staff member';
        const expires = err.data?.lock?.expires_at || null;
        setLockState({
          isLockedByOther: true,
          holderName: holder,
          expiresAt: expires,
        });
      }
    }
  }, [id]);

  const fetchRequestDetails = useCallback(async () => {
    try {
      // Backend returns { request, citizen_profile, issued_document }
      const data = await staffService.getRequest(id);
      setDetailData(data);
    } catch (err) {
      setError(err.message || 'Failed to load request details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRequestDetails();
  }, [fetchRequestDetails]);

  // Lock lifecycle: Acquire on mount, renew every 2 minutes, release on unmount and beforeunload
  useEffect(() => {
    acquireOrRenewLock();

    const renewInterval = setInterval(() => {
      acquireOrRenewLock();
    }, 2 * 60 * 1000);

    const handleBeforeUnload = () => {
      try {
        const token = authStorage.getToken();
        const url = `${API_BASE_URL}/staff/requests/${encodeURIComponent(id)}/lock`;
        fetch(url, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          keepalive: true,
        }).catch(() => null);
      } catch (_) {
        // ignore unload error
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(renewInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      staffService.releaseLock(id).catch(() => null);
    };
  }, [id, acquireOrRenewLock]);

  const handleWorkflowAction = async (actionFn, actionName, successText) => {
    setLoadingAction(actionName);
    setError(null);
    setConflictNotice(null);
    setSuccessMessage(null);
    try {
      await actionFn();
      setSuccessMessage(successText);
      await fetchRequestDetails();
      acquireOrRenewLock();
    } catch (err) {
      if (err.status === 423 || err.code === 'LOCKED') {
        const holder = err.data?.lock?.locked_by_name || 'another staff member';
        const expires = err.data?.lock?.expires_at || null;
        setLockState({
          isLockedByOther: true,
          holderName: holder,
          expiresAt: expires,
        });
        setError(err.message || `Request is currently locked by ${holder}.`);
      } else if (err.status === 409 || err.code === 'CONFLICT') {
        setConflictNotice(
          'This request was updated by another staff member. Reloading latest state...'
        );
        await fetchRequestDetails();
      } else {
        setError(err.message || `Failed to perform action: ${actionName}`);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReview = () =>
    handleWorkflowAction(() => staffService.reviewRequest(id), 'review', 'Request moved to Under Review.');

  const handleApprove = () =>
    handleWorkflowAction(() => staffService.approveRequest(id), 'approve', 'Request approved successfully.');

  const handleRejectConfirm = (reason) => {
    setRejectModalOpen(false);
    return handleWorkflowAction(() => staffService.rejectRequest(id, reason), 'reject', 'Request has been rejected.');
  };

  const handlePrepare = () =>
    handleWorkflowAction(() => staffService.prepareRequest(id), 'prepare', 'Request moved to In Preparation.');

  const handleIssue = async () => {
    setLoadingAction('issue');
    setError(null);
    setConflictNotice(null);
    setSuccessMessage(null);
    setDataWarnings([]);
    try {
      const res = await staffService.issueRequest(id);
      setSuccessMessage('Document issued and marked Ready for Pickup.');
      if (res?.data_warnings && Array.isArray(res.data_warnings) && res.data_warnings.length > 0) {
        setDataWarnings(res.data_warnings);
      }
      await fetchRequestDetails();
      acquireOrRenewLock();
    } catch (err) {
      if (err.status === 423 || err.code === 'LOCKED') {
        const holder = err.data?.lock?.locked_by_name || 'another staff member';
        const expires = err.data?.lock?.expires_at || null;
        setLockState({
          isLockedByOther: true,
          holderName: holder,
          expiresAt: expires,
        });
        setError(err.message || `Request is currently locked by ${holder}.`);
      } else if (err.status === 409 || err.code === 'CONFLICT') {
        setConflictNotice(
          'This request was updated by another staff member. Reloading latest state...'
        );
        await fetchRequestDetails();
      } else {
        setError(err.message || 'Failed to issue request.');
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDownloadDocx = async () => {
    setLoadingAction('download_docx');
    setError(null);
    try {
      const { blob, filename } = await staffService.downloadCertificateDocx(id);
      downloadBlob(blob, filename);
    } catch (err) {
      setError(err.message || 'Failed to download certificate DOCX.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReleaseConfirm = (paymentData) => {
    setReleaseModalOpen(false);
    return handleWorkflowAction(() => staffService.releaseRequest(id, paymentData), 'release', 'Document officially released.');
  };

  const handleArchive = () =>
    handleWorkflowAction(() => staffService.archiveRequest(id), 'archive', 'Document archived into historical records.');

  const handleAddNote = async (noteText) => {
    setError(null);
    setConflictNotice(null);
    try {
      await staffService.appendNotes(id, noteText);
      await fetchRequestDetails();
      return true;
    } catch (err) {
      if (err.status === 423 || err.code === 'LOCKED') {
        const holder = err.data?.lock?.locked_by_name || 'another staff member';
        const expires = err.data?.lock?.expires_at || null;
        setLockState({
          isLockedByOther: true,
          holderName: holder,
          expiresAt: expires,
        });
        setError(err.message || `Request is currently locked by ${holder}.`);
      } else if (err.status === 409 || err.code === 'CONFLICT') {
        setConflictNotice('This request was updated by another staff member. Reloading latest state...');
        await fetchRequestDetails();
      } else {
        setError(err.message || 'Failed to append note.');
      }
      return false;
    }
  };

  if (loading) {
    return (
      <div className="qf-page-loading">
        <Loader size="lg" text="Loading request details..." />
      </div>
    );
  }

  // Unpack backend response shape: { request, citizen_profile, issued_document }
  const request = detailData?.request || detailData;
  const citizenProfile = detailData?.citizen_profile || {};
  const issuedDocument = detailData?.issued_document || null;

  if (!request || !request._id) {
    return (
      <div className="qf-staff-detail-page">
        <Alert variant="danger">Request not found or unavailable.</Alert>
        <Link to="/staff/requests" className="qf-btn qf-btn--secondary">Back to Queue</Link>
      </div>
    );
  }

  const citizen = request.citizen_id || {};
  const docType = request.document_type_id || {};

  return (
    <div className="qf-staff-detail-page">
      <div className="qf-detail-breadcrumb">
        <Link to="/staff/requests" className="qf-back-link">&larr; Back to Queue</Link>
      </div>

      {lockState.isLockedByOther && (
        <Alert variant="warning" className="qf-lock-banner">
          <strong>Locked by {lockState.holderName}</strong> until{' '}
          {lockState.expiresAt
            ? new Date(lockState.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'active session expires'}
          . Actions and modifications are temporarily disabled to prevent conflicting changes.
        </Alert>
      )}

      {conflictNotice && <Alert variant="warning" onClose={() => setConflictNotice(null)}>{conflictNotice}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError(null)}>{error}</Alert>}
      {successMessage && <Alert variant="success" onClose={() => setSuccessMessage(null)}>{successMessage}</Alert>}
      {dataWarnings.length > 0 && (
        <Alert variant="warning" onClose={() => setDataWarnings([])}>
          Notice: The certificate template contains placeholders that were empty in the resident&apos;s record at issue time: <strong>{dataWarnings.join(', ')}</strong>.
        </Alert>
      )}

      {/* Header Banner */}
      <div className="qf-staff-detail-header">
        <div className="qf-staff-detail-header__main">
          <div className="qf-staff-detail-tracking">
            <span className="qf-tracking-chip">{request.tracking_number}</span>
            <StatusBadge status={request.status} />
            {request.lock?.is_locked && (
              <span className="qf-lock-chip" title="This request is currently locked by a staff member">
                &#128274; Locked
              </span>
            )}
          </div>
          <h1 className="qf-staff-detail-title">{docType.name || 'Document Request'}</h1>
          <div className="qf-staff-detail-meta">
            <span>Requested: {formatDate(request.created_at)}</span>
            <span>&bull;</span>
            <span>Fee: {formatCurrency(request.fee)}</span>
            <span>&bull;</span>
            <span>Payment: {request.payment_status?.toUpperCase() || 'UNPAID'}</span>
          </div>
        </div>

        <StaffActionButtons
          request={request}
          hasPermission={hasPermission}
          role={user?.role}
          issuedDocument={issuedDocument}
          disabled={lockState.isLockedByOther}
          onReview={handleReview}
          onApprove={handleApprove}
          onOpenReject={() => setRejectModalOpen(true)}
          onPrepare={handlePrepare}
          onIssue={handleIssue}
          onOpenRelease={() => setReleaseModalOpen(true)}
          onArchive={handleArchive}
          onDownloadDocx={handleDownloadDocx}
          loadingAction={loadingAction}
        />
      </div>

      <div className="qf-staff-detail-layout">
        {/* Main Application Details Column */}
        <div className="qf-staff-detail-column-main">
          <ApplicantInfoCard citizen={citizen} citizenProfile={citizenProfile} />
          <RequestSpecsCard request={request} />
          <PaymentIssuanceCard
            request={request}
            issuedDocument={issuedDocument}
            onDownloadDocx={handleDownloadDocx}
          />
          <AttachmentListCard attachments={request.attachments} />
        </div>

        {/* Sidebar Column: Processing Notes */}
        <div className="qf-staff-detail-column-side">
          <StaffNotesSection
            notes={request.processing_notes}
            canAddNote={hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)}
            onAddNote={handleAddNote}
          />
        </div>
      </div>

      <StaffRejectModal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onConfirm={handleRejectConfirm}
        loading={loadingAction === 'reject'}
      />

      <StaffReleaseModal
        isOpen={releaseModalOpen}
        onClose={() => setReleaseModalOpen(false)}
        onConfirm={handleReleaseConfirm}
        request={request}
        loading={loadingAction === 'release'}
      />
    </div>
  );
}
