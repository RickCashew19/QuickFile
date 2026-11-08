import { Link } from 'react-router-dom';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Button } from '../../../components/shared/Button';
import { EmptyState } from '../../../components/shared/EmptyState';
import { REQUEST_STATUSES } from '../../../config/constants';
import { formatDate } from '../../../utils/formatters';

export function StaffRecordsTable({ records = [], onArchiveRecord, archivingId = null }) {
  if (!records || records.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="No historical records found"
        description="There are no released or archived records matching your query."
      />
    );
  }

  return (
    <div className="qf-table-container">
      <table className="qf-table">
        <thead>
          <tr>
            <th>Tracking No.</th>
            <th>Resident</th>
            <th>Document</th>
            <th>Status</th>
            <th>Date Completed</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => (
            <tr key={rec._id}>
              <td>
                <span className="qf-table__tracking">{rec.tracking_number}</span>
              </td>
              <td>
                <div className="qf-table__cell-title">{rec.citizen_id?.full_name || 'Resident'}</div>
                <div className="qf-table__cell-sub">{rec.citizen_id?.email || ''}</div>
              </td>
              <td>{rec.document_type_id?.name || 'Document'}</td>
              <td>
                <StatusBadge status={rec.status} />
              </td>
              <td>{formatDate(rec.released_at || rec.updated_at)}</td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                  <Link
                    to={`/staff/requests/${rec._id}`}
                    className="qf-btn qf-btn--ghost qf-btn--sm"
                    aria-label={`View record ${rec.tracking_number}`}
                  >
                    View
                  </Link>

                  {rec.status === REQUEST_STATUSES.RELEASED && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onArchiveRecord(rec._id)}
                      loading={archivingId === rec._id}
                      disabled={Boolean(archivingId)}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
