import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '../../../services/adminService';
import { AdminRequestDetailModal } from './AdminRequestDetailModal';
import { TypedDeleteModal } from '../../../components/shared/TypedDeleteModal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Pagination } from '../../../components/shared/Pagination';
import { Icon } from '../../../components/shared/Icon';
import { formatDate } from '../../../utils/formatters';
import './AdminRecordsPage.css';

export function AdminRecordsPage() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('all');

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRecords = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.listRecords({
        page,
        limit: 15,
        search: (search || '').slice(0, 100),
        status: statusFilter,
      });
      const list = res.items || res.requests || [];
      setRecords(list);
      setPagination({
        page: res.pagination?.page || page,
        limit: res.pagination?.limit || 15,
        totalPages: res.pagination?.total_pages || res.pagination?.totalPages || 1,
        total: res.pagination?.total ?? res.pagination?.total_items ?? 0,
      });
    } catch (err) {
      setError(err.message || 'Failed to retrieve records.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  const handleView = async (rec) => {
    try {
      const details = await adminService.getRequestDetails(rec._id);
      setSelectedRecord(details);
      setDetailModalOpen(true);
    } catch {
      setSelectedRecord(rec);
      setDetailModalOpen(true);
    }
  };

  const handleOpenDelete = (rec) => {
    setRecordToDelete(rec);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    setDeleting(true);
    try {
      await adminService.deleteRequest(recordToDelete._id);
      setSuccessMsg(`Document request "${recordToDelete.tracking_number}" deleted permanently.`);
      setDeleteModalOpen(false);
      setRecordToDelete(null);
      fetchRecords(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to delete record.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="qf-admin-records">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">Master Request Records</h1>
          <p className="qf-admin-dashboard__subtitle">
            Universal archive of all citizen document requests, history, and processing records.
          </p>
        </div>
      </div>

      {successMsg && (
        <Alert variant="success" onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="qf-admin-staff__controls">
        <div style={{ flex: 1 }}>
          <Input
            placeholder="Search by tracking number, resident name, or document..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Icon name="search" size={18} />}
          />
        </div>
        <div style={{ width: '200px' }}>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'under_review', label: 'Under Review' },
              { value: 'approved', label: 'Approved' },
              { value: 'in_preparation', label: 'In Preparation' },
              { value: 'ready_for_pickup', label: 'Ready for Pickup' },
              { value: 'released', label: 'Released' },
              { value: 'archived', label: 'Archived' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <Loader label="Loading master records..." />
      ) : records.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No request records match the filter criteria.</p>
        </div>
      ) : (
        <div className="qf-admin-table-container">
          <table className="qf-admin-table">
            <thead>
              <tr>
                <th>Tracking #</th>
                <th>Citizen</th>
                <th>Document</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r._id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary)' }}>
                    {r.tracking_number}
                  </td>
                  <td>{r.citizen_id?.full_name || r.citizen_name || '—'}</td>
                  <td>{r.document_type_id?.name || r.document_type_name || '—'}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-xs)', whiteSpace: 'nowrap' }}>
                    {formatDate(r.created_at)}
                  </td>
                  <td>
                    <div className="qf-admin-staff__actions" style={{ justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleView(r)} aria-label="View record">
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDelete(r)}
                        style={{ color: 'var(--color-danger)' }}
                        aria-label="Delete record"
                      >
                        <Icon name="trash" size={16} />
                      </Button>
                    </div>
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
          onPageChange={(page) => fetchRecords(page)}
        />
      )}

      {/* Record Details Modal */}
      <AdminRequestDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        request={selectedRecord}
      />

      {/* Typed DELETE Modal for Records */}
      <TypedDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Request Record"
        itemName={recordToDelete?.tracking_number || 'this request record'}
        warningMessage="This will permanently delete the filing record and remove any uploaded supporting document attachments."
        isDeleting={deleting}
      />
    </div>
  );
}
