import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { staffService } from '../../../services/staffService';
import { STAFF_PERMISSIONS } from '../../../config/constants';
import { StaffActionButtons } from './StaffActionButtons';
import { StaffNotesSection } from './StaffNotesSection';
import { StaffRejectModal } from './StaffRejectModal';
import { StaffReleaseModal } from './StaffReleaseModal';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Icon } from '../../../components/shared/Icon';
import { formatDate, formatCurrency } from '../../../utils/formatters';
import './StaffRequestDetailPage.css';

export function StaffRequestDetailPage() {
  const { id } = useParams();
  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [error, setError] = useState(null);
  const [conflictNotice, setConflictNotice] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [loadingAction, setLoadingAction] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);

  const fetchRequestDetails = useCallback(async () => {
    try {
      const data = await staffService.getRequest(id);
      setRequest(data);
    } catch (err) {
      setError(err.message || 'Failed to load request details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRequestDetails();
  }, [fetchRequestDetails]);

  /**
   * Universal action wrapper: handles state transitions and 409 conflict reload
   */
  const handleWorkflowAction = async (actionFn, actionName, successText) => {
    setLoadingAction(actionName);
    setError(null);
    setConflictNotice(null);
    setSuccessMessage(null);
    try {
      await actionFn();
      setSuccessMessage(successText);
      await fetchRequestDetails();
    } catch (err) {
      if (err.status === 409 || err.code === 'CONFLICT') {
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
    handleWorkflowAction(
      () => staffService.reviewRequest(id),
      'review',
      'Request moved to Under Review.'
    );

  const handleApprove = () =>
    handleWorkflowAction(
      () => staffService.approveRequest(id),
      'approve',
      'Request approved successfully.'
    );

  const handleRejectConfirm = (rejectionReason) => {
    setRejectModalOpen(false);
    return handleWorkflowAction(
      () => staffService.rejectRequest(id, rejectionReason),
      'reject',
      'Request has been rejected.'
    );
  };

  const handlePrepare = () =>
    handleWorkflowAction(
      () => staffService.prepareRequest(id),
      'prepare',
      'Request moved to In Preparation.'
    );

  const handleIssue = () =>
    handleWorkflowAction(
      () => staffService.issueRequest(id),
      'issue',
      'Document issued and marked Ready for Pickup.'
    );

  const handleReleaseConfirm = (paymentData) => {
    setReleaseModalOpen(false);
    return handleWorkflowAction(
      () => staffService.releaseRequest(id, paymentData),
      'release',
      'Document officially released.'
    );
  };

  const handleArchive = () =>
    handleWorkflowAction(
      () => staffService.archiveRequest(id),
      'archive',
      'Document archived into historical records.'
    );

  const handleAddNote = async (noteText) => {
    setError(null);
    setConflictNotice(null);
    try {
      await staffService.appendNotes(id, noteText);
      await fetchRequestDetails();
      return true;
    } catch (err) {
      if (err.status === 409 || err.code === 'CONFLICT') {
        setConflictNotice(
          'This request was updated by another staff member. Reloading latest state...'
        );
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

  if (!request) {
    return (
      <div className="qf-staff-detail-page">
        <Alert variant="danger">Request not found or unavailable.</Alert>
        <Link to="/staff/requests" className="qf-btn qf-btn--secondary">
          Back to Queue
        </Link>
      </div>
    );
  }

  const citizen = request.citizen_id || {};
  const docType = request.document_type_id || {};

  return (
    <div className="qf-staff-detail-page">
      <div className="qf-detail-breadcrumb">
        <Link to="/staff/requests" className="qf-back-link">
          &larr; Back to Queue
        </Link>
      </div>

      {conflictNotice && (
        <Alert variant="warning" onClose={() => setConflictNotice(null)}>
          {conflictNotice}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Header Banner */}
      <div className="qf-staff-detail-header">
        <div className="qf-staff-detail-header__main">
          <div className="qf-staff-detail-tracking">
            <span className="qf-tracking-chip">{request.tracking_number}</span>
            <StatusBadge status={request.status} />
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

        {/* Action Buttons Bar */}
        <StaffActionButtons
          request={request}
          hasPermission={hasPermission}
          onReview={handleReview}
          onApprove={handleApprove}
          onOpenReject={() => setRejectModalOpen(true)}
          onPrepare={handlePrepare}
          onIssue={handleIssue}
          onOpenRelease={() => setReleaseModalOpen(true)}
          onArchive={handleArchive}
          loadingAction={loadingAction}
        />
      </div>

      <div className="qf-staff-detail-layout">
        {/* Main Application Details Column */}
        <div className="qf-staff-detail-column-main">
          {/* Resident Details Card */}
          <div className="qf-staff-card">
            <h2 className="qf-staff-card-title">
              <Icon name="user" size={18} /> Applicant Information
            </h2>
            <div className="qf-staff-grid-2">
              <div>
                <span className="qf-field-label">Full Name</span>
                <span className="qf-field-value">{citizen.full_name || 'N/A'}</span>
              </div>
              <div>
                <span className="qf-field-label">Email Address</span>
                <span className="qf-field-value">{citizen.email || 'N/A'}</span>
              </div>
              <div>
                <span className="qf-field-label">Contact Phone</span>
                <span className="qf-field-value">{citizen.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="qf-field-label">Purok / Zone</span>
                <span className="qf-field-value">{citizen.purok_zone || 'Not Specified'}</span>
              </div>
            </div>
          </div>

          {/* Document & Form Data Card */}
          <div className="qf-staff-card">
            <h2 className="qf-staff-card-title">
              <Icon name="file" size={18} /> Request Specifications
            </h2>
            <div className="qf-staff-grid-2">
              <div>
                <span className="qf-field-label">Stated Purpose</span>
                <span className="qf-field-value">{request.purpose}</span>
              </div>
              <div>
                <span className="qf-field-label">Number of Copies</span>
                <span className="qf-field-value">{request.copies || 1}</span>
              </div>
            </div>

            {request.form_data && Object.keys(request.form_data).length > 0 && (
              <div className="qf-staff-custom-fields">
                <span className="qf-field-label">Additional Form Fields</span>
                <div className="qf-custom-fields-table">
                  {Object.entries(request.form_data).map(([key, val]) => (
                    <div key={key} className="qf-custom-field-row">
                      <span className="qf-custom-field-key">{key}:</span>
                      <span className="qf-custom-field-val">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Attachments Card */}
          {request.attachments && request.attachments.length > 0 && (
            <div className="qf-staff-card">
              <h2 className="qf-staff-card-title">
                <Icon name="upload" size={18} /> Uploaded Requirements
              </h2>
              <ul className="qf-staff-attachments-list">
                {request.attachments.map((att, i) => (
                  <li key={i} className="qf-staff-attachment-item">
                    <Icon name="file" size={16} />
                    <span className="qf-attachment-name">{att.original_name}</span>
                    <span className="qf-attachment-meta">
                      ({Math.round((att.file_size || 0) / 1024)} KB)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar Column: Processing Notes & Audit Timeline */}
        <div className="qf-staff-detail-column-side">
          <StaffNotesSection
            notes={request.processing_notes}
            canAddNote={hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)}
            onAddNote={handleAddNote}
          />
        </div>
      </div>

      {/* Reject Modal */}
      <StaffRejectModal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onConfirm={handleRejectConfirm}
        loading={loadingAction === 'reject'}
      />

      {/* Release Modal */}
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
