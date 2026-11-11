import { Alert } from '../../../../components/shared/Alert';
import { Icon } from '../../../../components/shared/Icon';

/**
 * Server Template Validation Report View
 * Highlights errors (red), warnings (amber), valid found placeholders (green),
 * and unknown tags with server suggestions.
 */
export function TemplateValidationReport({ report, onClose = null }) {
  if (!report) return null;

  const { valid, errors = [], warnings = [], placeholders_found = [], unknown = [] } = report;

  return (
    <div className="qf-template-validation-report" style={{ marginTop: 'var(--space-3)' }}>
      {valid ? (
        <Alert variant="success" onClose={onClose}>
          <strong>Template validation passed!</strong> The uploaded DOCX structure, XML parts, and placeholder tags are verified. Click &quot;Activate&quot; in the version table when ready to make it live.
        </Alert>
      ) : (
        <Alert variant="danger" onClose={onClose}>
          <strong>Template validation failed.</strong> Please resolve the errors below in Microsoft Word and re-upload.
        </Alert>
      )}

      {/* Errors (Red) */}
      {errors.length > 0 && (
        <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-danger)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
            <Icon name="alert" size={16} />
            <span>Validation Errors ({errors.length})</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--color-danger)', fontSize: 'var(--font-sm)' }}>
            {errors.map((err, idx) => (
              <li key={idx} style={{ marginBottom: 'var(--space-1)' }}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Unknown Tags with Suggestions */}
      {unknown.length > 0 && (
        <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ color: 'var(--color-warning)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-1)' }}>
            Unknown Placeholders Found ({unknown.length})
          </div>
          <p style={{ margin: 0, fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
            Only allowlisted placeholders are supported. Unknown tags must be corrected or removed:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
            {unknown.map((tag, idx) => (
              <span key={idx} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', padding: '2px 6px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius-sm)' }}>
                {`{${tag}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings (Amber) */}
      {warnings.length > 0 && (
        <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-warning)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-1)' }}>
            <Icon name="info" size={16} />
            <span>Template Warnings ({warnings.length})</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)' }}>
            {warnings.map((warn, idx) => (
              <li key={idx} style={{ marginBottom: 'var(--space-1)' }}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Placeholders Found (Green) */}
      {placeholders_found.length > 0 && (
        <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ color: 'var(--color-success)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
            Recognized Allowlisted Placeholders ({placeholders_found.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {placeholders_found.map((tag) => (
              <span key={tag} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', padding: '2px 8px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-medium)' }}>
                {`{${tag}}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
