import { Link } from 'react-router-dom';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { formatDate } from '../../../utils/formatters';

export function AdminRecentTable({ requests = [] }) {
  if (!requests || requests.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)', margin: 0 }}>
        No recent requests to display.
      </p>
    );
  }

  return (
    <div className="qf-admin-table-container">
      <table className="qf-admin-table">
        <thead>
          <tr>
            <th>Tracking #</th>
            <th>Citizen</th>
            <th>Document</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id || r.tracking_number}>
              <td>
                <Link
                  to={`/admin/records?search=${r.tracking_number}`}
                  style={{
                    color: 'var(--color-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 'var(--font-semibold)',
                    textDecoration: 'none',
                  }}
                >
                  {r.tracking_number}
                </Link>
              </td>
              <td>{r.citizen_name}</td>
              <td>{r.document_type_name}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {formatDate(r.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
