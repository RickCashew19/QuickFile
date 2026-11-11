import { Link } from 'react-router-dom';
import { Button } from '../../../components/shared/Button';
import { getAvailableActions } from '../../../utils/actionLogic';
import { STAFF_PERMISSIONS } from '../../../config/constants';

/**
 * Staff Action Buttons Bar
 * Driven directly by the getAvailableActions pure function.
 * Completely free of inline status checks; dynamically renders transition
 * buttons and link actions strictly matching backend permissions.
 */
export function StaffActionButtons({
  request,
  hasPermission,
  permissions,
  role = 'staff',
  issuedDocument = null,
  onReview,
  onApprove,
  onOpenReject,
  onPrepare,
  onIssue,
  onOpenRelease,
  onArchive,
  onDownloadDocx,
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

  const actions = getAvailableActions(request, resolvedPerms, role, issuedDocument);

  if (!actions || actions.length === 0) {
    return null;
  }

  const handlers = {
    review: onReview,
    approve: onApprove,
    reject: onOpenReject,
    prepare: onPrepare,
    issue: onIssue,
    release: onOpenRelease,
    archive: onArchive,
    download_docx: onDownloadDocx,
  };

  const requestId = request?._id || request?.id;

  return (
    <div className="qf-staff-actions-bar" role="toolbar" aria-label="Request Workflow Actions">
      {actions.map((act) => {
        if (act.kind === 'link') {
          const href = act.href || (requestId ? `/staff/requests/${requestId}/print` : '#');
          return (
            <Link
              key={act.id}
              to={href}
              className={`qf-btn qf-btn--${act.variant || 'secondary'}`}
              aria-label="Open Certificate Print View"
            >
              {act.label}
            </Link>
          );
        }

        if (act.id === 'download_docx') {
          return (
            <Button
              key={act.id}
              variant={act.variant || 'secondary'}
              onClick={handlers.download_docx}
              loading={loadingAction === 'download_docx'}
              disabled={Boolean(loadingAction)}
              aria-label={act.label}
              title={act.hint || 'Open in Word to print'}
            >
              {act.label}
            </Button>
          );
        }

        const handler = handlers[act.id];
        return (
          <Button
            key={act.id}
            variant={act.variant || 'primary'}
            onClick={handler}
            loading={loadingAction === act.id}
            disabled={Boolean(loadingAction)}
            aria-label={act.label}
          >
            {act.label}
          </Button>
        );
      })}
    </div>
  );
}
