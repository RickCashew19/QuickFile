import { Link } from 'react-router-dom';
import { Button } from '../../../components/shared/Button';
import { REQUEST_STATUSES, STAFF_PERMISSIONS } from '../../../config/constants';

export function StaffActionButtons({
  request,
  hasPermission,
  onReview,
  onApprove,
  onOpenReject,
  onPrepare,
  onIssue,
  onOpenRelease,
  onArchive,
  loadingAction,
}) {
  const status = request?.status;
  const canReview = hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS);
  const canPrepare = hasPermission(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS);
  const canPrint = hasPermission(STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS);
  const canRelease = hasPermission(STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS);
  const canArchive = hasPermission(STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS);

  return (
    <div className="qf-staff-actions-bar" role="toolbar" aria-label="Request Workflow Actions">
      {/* 1. Review Action: pending -> under_review */}
      {status === REQUEST_STATUSES.PENDING && canReview && (
        <Button
          variant="primary"
          onClick={onReview}
          loading={loadingAction === 'review'}
          disabled={Boolean(loadingAction)}
        >
          Start Review
        </Button>
      )}

      {/* 2. Approve Action: under_review -> approved */}
      {status === REQUEST_STATUSES.UNDER_REVIEW && canReview && (
        <Button
          variant="primary"
          onClick={onApprove}
          loading={loadingAction === 'approve'}
          disabled={Boolean(loadingAction)}
        >
          Approve Application
        </Button>
      )}

      {/* 3. Reject Action: allowed during pending or under_review */}
      {(status === REQUEST_STATUSES.PENDING || status === REQUEST_STATUSES.UNDER_REVIEW) && canReview && (
        <Button
          variant="danger"
          onClick={onOpenReject}
          disabled={Boolean(loadingAction)}
        >
          Reject
        </Button>
      )}

      {/* 4. Prepare Action: approved -> in_preparation */}
      {status === REQUEST_STATUSES.APPROVED && canPrepare && (
        <Button
          variant="primary"
          onClick={onPrepare}
          loading={loadingAction === 'prepare'}
          disabled={Boolean(loadingAction)}
        >
          Prepare Document
        </Button>
      )}

      {/* 5. Issue Action: in_preparation -> ready_for_pickup */}
      {status === REQUEST_STATUSES.IN_PREPARATION && canPrepare && (
        <Button
          variant="primary"
          onClick={onIssue}
          loading={loadingAction === 'issue'}
          disabled={Boolean(loadingAction)}
        >
          Issue & Generate Certificate
        </Button>
      )}

      {/* 6. Print Certificate Page: ready_for_pickup or released */}
      {(status === REQUEST_STATUSES.READY_FOR_PICKUP || status === REQUEST_STATUSES.RELEASED) && canPrint && (
        <Link
          to={`/staff/requests/${request._id}/print`}
          className="qf-btn qf-btn--secondary"
          aria-label="Open Certificate Print View"
        >
          Print Certificate
        </Link>
      )}

      {/* 7. Release Action: ready_for_pickup -> released */}
      {status === REQUEST_STATUSES.READY_FOR_PICKUP && canRelease && (
        <Button
          variant="primary"
          onClick={onOpenRelease}
          loading={loadingAction === 'release'}
          disabled={Boolean(loadingAction)}
        >
          Release Document
        </Button>
      )}

      {/* 8. Archive Action: released, rejected, or cancelled */}
      {(status === REQUEST_STATUSES.RELEASED ||
        status === REQUEST_STATUSES.REJECTED ||
        status === REQUEST_STATUSES.CANCELLED) &&
        canArchive && (
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
