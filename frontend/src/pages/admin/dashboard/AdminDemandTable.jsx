import { formatCurrency } from '../../../utils/formatters';

export function AdminDemandTable({ demand = [] }) {
  if (!demand || demand.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)', margin: 0 }}>
        No document request activity recorded yet.
      </p>
    );
  }

  return (
    <div className="qf-admin-table-container">
      <table className="qf-admin-table">
        <thead>
          <tr>
            <th>Document Type</th>
            <th style={{ textAlign: 'right' }}>Requests</th>
            <th style={{ textAlign: 'right' }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {demand.map((item) => (
            <tr key={item.document_type_id || item.code}>
              <td>
                <div style={{ fontWeight: 'var(--font-medium)' }}>{item.name}</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Code: {item.code}
                </div>
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>
                {item.count}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>
                {formatCurrency(item.collected_revenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
