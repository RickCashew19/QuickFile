/**
 * Template Mode Badge
 * Displays "Built-in" or "Custom v#" status for a document type.
 */
export function TemplateModeBadge({ docType, activeVersion = null }) {
  const mode = docType?.template_mode || 'builtin';
  const isCustom = mode === 'custom';

  const version =
    activeVersion ??
    docType?.active_template?.version ??
    docType?.active_template_version ??
    docType?.active_version ??
    (docType?.active_template_id && typeof docType.active_template_id === 'object'
      ? docType.active_template_id.version
      : null);

  const label = isCustom
    ? version ? `Custom v${version}` : 'Custom'
    : 'Built-in';

  const style = isCustom
    ? {
        backgroundColor: '#e0e7ff',
        color: '#3730a3',
        border: '1px solid #c7d2fe',
      }
    : {
        backgroundColor: 'var(--color-surface-active)',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
      };

  return (
    <span
      className="qf-template-mode-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-xs)',
        fontWeight: 'var(--font-semibold)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  );
}
