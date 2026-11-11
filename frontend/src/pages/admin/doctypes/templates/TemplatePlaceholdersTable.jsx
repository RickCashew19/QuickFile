import { useState, useMemo } from 'react';
import { Button } from '../../../../components/shared/Button';
import { Icon } from '../../../../components/shared/Icon';

/**
 * Allowlisted Template Placeholders Reference Table
 * Provides searchable catalog and one-click `{key}` copy button for easy template drafting.
 */
export function TemplatePlaceholdersTable({ placeholders = [] }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');

  const handleCopy = (key) => {
    const textToCopy = `{${key}}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {});
    } else {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return placeholders;
    return placeholders.filter(
      (p) =>
        p.key.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.group.toLowerCase().includes(q)
    );
  }, [placeholders, filterQuery]);

  return (
    <div className="qf-template-placeholders-table" style={{ marginTop: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 'var(--font-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
            Allowlisted Placeholder Tags Reference ({placeholders.length})
          </h4>
          <p style={{ margin: 0, fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
            Click &quot;Copy&quot; to copy the exact placeholder tag with braces (e.g. &#123;full_name&#125;) for your DOCX template.
          </p>
        </div>
        <input
          type="search"
          placeholder="Filter placeholders..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          aria-label="Filter placeholders"
          style={{
            fontSize: 'var(--font-xs)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            minWidth: '200px',
          }}
        />
      </div>

      <div className="qf-admin-table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
        <table className="qf-admin-table" style={{ fontSize: 'var(--font-xs)' }}>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Field Label</th>
              <th>Group</th>
              <th>Example Output</th>
              <th style={{ textAlign: 'right' }}>Copy</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const isCopied = copiedKey === item.key;
              return (
                <tr key={`${item.group}-${item.key}`}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                    {`{${item.key}}`}
                  </td>
                  <td>{item.label}</td>
                  <td>
                    <span style={{ padding: '2px 6px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', fontSize: '11px', textTransform: 'capitalize' }}>
                      {item.group}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {String(item.example)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      size="sm"
                      variant={isCopied ? 'primary' : 'ghost'}
                      onClick={() => handleCopy(item.key)}
                      iconLeft={<Icon name={isCopied ? 'check' : 'copy'} size={12} />}
                      aria-label={`Copy placeholder {${item.key}}`}
                    >
                      {isCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
