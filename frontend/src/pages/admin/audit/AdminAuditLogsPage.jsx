import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { Modal } from '../../../components/shared/Modal';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Pagination } from '../../../components/shared/Pagination';
import { Icon } from '../../../components/shared/Icon';
import { formatDate } from '../../../utils/formatters';
import './AdminAuditLogsPage.css';

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionInput, setActionInput] = useState('');
  const [actorNameInput, setActorNameInput] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Selected Log for JSON Viewer
  const [viewedLog, setViewedLog] = useState(null);

  const fetchLogs = useCallback(async (page = 1) => {
    if (fromDate && toDate && fromDate > toDate) {
      setError("Start date ('From') cannot be after end date ('To').");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await adminService.listAuditLogs({
        page,
        limit: 20,
        module: moduleFilter === 'all' ? undefined : moduleFilter,
        action: actionInput || undefined,
        actor_name: actorNameInput || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      setLogs(res.logs || []);
      setPagination(res.pagination || { page: 1, limit: 20, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || 'Failed to retrieve system audit logs.');
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, actionInput, actorNameInput, fromDate, toDate]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  return (
    <div className="qf-admin-audit">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">System Audit Trail</h1>
          <p className="qf-admin-dashboard__subtitle">
            Immutable security ledger recording administrative access, transitions, and system events.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fetchLogs(pagination.page)}
          iconLeft={<Icon name="refresh" size={16} />}
        >
          Refresh Trail
        </Button>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filter Row */}
      <div className="qf-admin-staff__controls" style={{ flexWrap: 'wrap' }}>
        <div style={{ width: '160px' }}>
          <Select
            label="Module"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Modules' },
              { value: 'AUTH', label: 'AUTH' },
              { value: 'STAFF', label: 'STAFF' },
              { value: 'CITIZEN', label: 'CITIZEN' },
              { value: 'REQUEST', label: 'REQUEST' },
              { value: 'DOCUMENT', label: 'DOCUMENT' },
              { value: 'SETTINGS', label: 'SETTINGS' },
              { value: 'ADMIN', label: 'ADMIN' },
            ]}
          />
        </div>

        <div style={{ flex: 1, minWidth: '160px' }}>
          <Input
            label="Action Code"
            placeholder="E.g., STAFF_CREATE..."
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
          />
        </div>

        <div style={{ flex: 1, minWidth: '160px' }}>
          <Input
            label="Actor Name"
            placeholder="Search actor..."
            value={actorNameInput}
            onChange={(e) => setActorNameInput(e.target.value)}
          />
        </div>

        <div style={{ width: '150px' }}>
          <Input
            label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div style={{ width: '150px' }}>
          <Input
            label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Loader label="Loading audit logs..." />
      ) : logs.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No audit log entries match the search criteria.</p>
        </div>
      ) : (
        <div className="qf-admin-table-container">
          <table className="qf-admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Module</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id}>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-xs)', whiteSpace: 'nowrap' }}>
                    {formatDate(l.created_at)}
                  </td>
                  <td style={{ fontWeight: 'var(--font-semibold)' }}>
                    {l.actor_name || 'System / Guest'}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'var(--color-surface-subtle)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--font-xs)',
                      }}
                    >
                      {l.module || 'SYSTEM'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-xs)' }}>
                    {l.action}
                  </td>
                  <td style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                    {l.target_type || '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="qf-audit-details-code"
                      onClick={() => setViewedLog(l)}
                      title="Click to view full log details"
                    >
                      {JSON.stringify(l.details || {})}
                    </button>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                    {l.ip_address || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={(page) => fetchLogs(page)}
        />
      )}

      {/* JSON Viewer Modal */}
      {viewedLog && (
        <Modal
          isOpen={Boolean(viewedLog)}
          onClose={() => setViewedLog(null)}
          title={`Audit Event: ${viewedLog.action}`}
          size="md"
          footer={
            <Button variant="secondary" onClick={() => setViewedLog(null)}>
              Close
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
              Logged on {formatDate(viewedLog.created_at)} by <strong>{viewedLog.actor_name}</strong> (IP: {viewedLog.ip_address || 'N/A'})
            </div>
            <pre
              style={{
                backgroundColor: 'var(--color-surface-subtle)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                overflowX: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                margin: 0,
              }}
            >
              {JSON.stringify(viewedLog.details, null, 2)}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
