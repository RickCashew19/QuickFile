import { Link } from 'react-router-dom';
import { Button } from '../../../components/shared/Button';
import { getAvailableActions } from '../../../utils/actionLogic';
import { STAFF_PERMISSIONS } from '../../../config/constants';

export function StaffActionButtons({
  request,
  hasPermission,
  permissions,
  role = 'staff',
  onReview,
  onApprove,
  onOpenReject,
  onPrepare,
  onIssue,
  onOpenRelease,
  onArchive,
  loadingAction,
}) {
  const resolvedPerms = typeof hasPermission === 'function'
    ? {
        [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS),
        [STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS]: hasPermission(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS),
        [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: hasPermission(STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS),
        [STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS]: hasPermission(STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS),
        [STAFF_PERMISSIONS.CAN_VERIFY_QR]: hasPermission(STAFF_PERMISSIONS.CAN_VERIFY_QR),
        [STAFF_PERMISSIONS.CAN_VIEW_REPORTS]: hasPermission(STAFF_PERMISSIONS.CAN_VIEW_REPORTS),
        [STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS]: hasPermission(STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS),
      }
    : permissions;

  const available = getAvailableActions(request, resolvedPerms, role);

  return (
    <div className="qf-staff-actions-bar" role="toolbar" aria-label="Request Workflow Actions">
      {available.includes('review') && (
        <Button
          variant="primary"
          onClick={onReview}
          loading={loadingAction === 'review'}
          disabled={Boolean(loadingAction)}
        >
          Start Review
        </Button>
      )}

      {available.includes('approve') && (
        <Button
          variant="primary"
          onClick={onApprove}
          loading={loadingAction === 'approve'}
          disabled={Boolean(loadingAction)}
        >
          Approve Application
        </Button>
      )}

      {available.includes('reject') && (
        <Button
          variant="danger"
          onClick={onOpenReject}
          disabled={Boolean(loadingAction)}
        >
          Reject
        </Button>
      )}

      {available.includes('prepare') && (
        <Button
          variant="primary"
          onClick={onPrepare}
          loading={loadingAction === 'prepare'}
          disabled={Boolean(loadingAction)}
        >
          Prepare Document
        </Button>
      )}

      {available.includes('issue') && (
        <Button
          variant="primary"
          onClick={onIssue}
          loading={loadingAction === 'issue'}
          disabled={Boolean(loadingAction)}
        >
          Issue & Generate Certificate
        </Button>
      )}

      {available.includes('print') && (
        <Link
          to={`/staff/requests/${request?._id}/print`}
          className="qf-btn qf-btn--secondary"
          aria-label="Open Certificate Print View"
        >
          Print Certificate
        </Link>
      )}

      {available.includes('release') && (
        <Button
          variant="primary"
          onClick={onOpenRelease}
          loading={loadingAction === 'release'}
          disabled={Boolean(loadingAction)}
        >
          Release Document
        </Button>
      )}

      {available.includes('archive') && (
        <Button
          variant="outline"
          onClick={onArchive}
          loading={loadingAction === 'archive'}
          disabled={Boolean(loadingAction)}
        >
          Archive Record
        </Button>
      )}
    </div>
  );
}
