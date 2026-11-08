import { Link } from 'react-router-dom';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { EmptyState } from '../../../components/shared/EmptyState';
import { formatDate } from '../../../utils/formatters';

export function StaffQueueTable({ requests = [] }) {
  if (!requests || requests.length === 0) {
    return (
      <EmptyState
        icon="file"
        title="No requests match your filter"
        description="Try adjusting your status, date range, or search keyword."
      />
    );
  }

  return (
    <div className="qf-table-container">
      <table className="qf-table">
        <thead>
          <tr>
            <th>Tracking No.</th>
            <th>Resident / Citizen</th>
            <th>Document Type</th>
            <th>Copies</th>
            <th>Status</th>
            <th>Date Requested</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr key={req._id}>
              <td>
                <span className="qf-table__tracking">{req.tracking_number}</span>
              </td>
              <td>
                <div className="qf-table__cell-title">{req.citizen_id?.full_name || 'Resident Citizen'}</div>
                <div className="qf-table__cell-sub">{req.citizen_id?.email || ''}</div>
              </td>
              <td>{req.document_type_id?.name || 'Document'}</td>
              <td>{req.copies || 1}</td>
              <td>
                <StatusBadge status={req.status} />
              </td>
              <td>{formatDate(req.created_at)}</td>
              <td style={{ textAlign: 'right' }}>
                <Link
                  to={`/staff/requests/${req._id}`}
                  className="qf-btn qf-btn--secondary qf-btn--sm"
                  aria-label={`Open details for ${req.tracking_number}`}
                >
                  View Details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
