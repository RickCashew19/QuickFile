import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';
import './MissingProfileInfoModal.css';

/**
 * Warning shown when a document request is blocked because the profile is
 * missing values the document's template actually prints.
 *
 * variant="citizen": offers "Update my information" (navigates to the citizen
 * profile page) and "Later" (dismisses; the request remains blocked).
 * variant="staff": informational only -- staff cannot edit a resident's profile.
 */
export function MissingProfileInfoModal({
  isOpen,
  onClose,
  onUpdateProfile,
  missingFields = [],
  variant = 'citizen',
}) {
  const fields = Array.isArray(missingFields) ? missingFields : [];
  const labels = fields.map((field) => field.label || field.key).filter(Boolean);
  const isStaff = variant === 'staff';

  const footer = isStaff ? (
    <Button variant="primary" onClick={onClose}>
      Close
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>
        Later
      </Button>
      <Button variant="primary" onClick={onUpdateProfile} iconLeft={<Icon name="user" size={15} />}>
        Update my information
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isStaff ? 'Resident profile is incomplete' : 'Some information is missing'}
      size="sm"
      footer={footer}
    >
      <div className="qf-missing-info">
        <div className="qf-missing-info__icon" aria-hidden="true">
          <Icon name="alert" size={22} />
        </div>
        <p className="qf-missing-info__text">
          {isStaff
            ? 'This resident is missing information required for the selected document. Please have them update their profile before filing this request.'
            : 'Your profile is missing information required for this document. Please update it before you can submit your request.'}
        </p>
        {labels.length > 0 && (
          <>
            <p className="qf-missing-info__subtitle">Missing information:</p>
            <ul className="qf-missing-info__list">
              {labels.map((label) => (
                <li key={label} className="qf-missing-info__chip">
                  <Icon name="close" size={12} /> {label}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="qf-missing-info__hint">
          Only the information used by this document is required — other profile details can stay as they are.
        </p>
      </div>
    </Modal>
  );
}
