import { Icon } from './Icon';
import './DocumentRequirementsPanel.css';

/**
 * Reminds a requester which supporting documents/IDs are expected for the
 * selected document type. The data comes straight from the catalog response
 * (DocumentType.requirements), already loaded by both request forms.
 */
export function DocumentRequirementsPanel({
  requirements = [],
  title = 'Standard Requirements',
}) {
  const items = Array.isArray(requirements) ? requirements.filter(Boolean) : [];

  return (
    <div className="qf-doc-reqs" data-testid="document-requirements">
      <div className="qf-doc-reqs__heading">
        <Icon name="file" size={16} />
        <span>{title}</span>
      </div>
      {items.length > 0 ? (
        <ul className="qf-doc-reqs__list">
          {items.map((req, idx) => (
            <li key={`${idx}-${req}`} className="qf-doc-reqs__item">
              <Icon name="check" size={13} />
              <span>{req}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="qf-doc-reqs__empty">No special requirements for this document.</p>
      )}
    </div>
  );
}
