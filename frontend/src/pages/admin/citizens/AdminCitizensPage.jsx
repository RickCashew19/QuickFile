import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { CitizenDetailModal } from './CitizenDetailModal';
import { TypedDeleteModal } from '../../../components/shared/TypedDeleteModal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Pagination } from '../../../components/shared/Pagination';
import { Icon } from '../../../components/shared/Icon';
import './AdminCitizensPage.css';

export function AdminCitizensPage() {
  const [citizens, setCitizens] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [detailCitizen, setDetailCitizen] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [citizenToDelete, setCitizenToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCitizens = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.listCitizens({
        page,
        limit: 10,
        search,
        is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
      });
      setCitizens(res.citizens || []);
      setPagination(res.pagination || { page: 1, limit: 10, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || 'Failed to retrieve citizen registry.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchCitizens(1);
  }, [fetchCitizens]);

  const handleToggleStatus = async (citizen) => {
    try {
      setError(null);
      await adminService.updateCitizenStatus(citizen._id, !citizen.is_active);
      setSuccessMsg(`Citizen "${citizen.full_name}" account ${!citizen.is_active ? 'activated' : 'deactivated'}.`);
      fetchCitizens(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to update citizen account status.');
    }
  };

  const handleOpenDelete = (citizen) => {
    setCitizenToDelete(citizen);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!citizenToDelete) return;
    setDeleting(true);
    try {
      await adminService.deleteCitizen(citizenToDelete._id);
      setSuccessMsg(`Citizen "${citizenToDelete.full_name}" and associated records deleted permanently.`);
      setDeleteModalOpen(false);
      setCitizenToDelete(null);
      fetchCitizens(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to delete citizen account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="qf-admin-citizens">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">Citizen Directory</h1>
          <p className="qf-admin-dashboard__subtitle">
            Barangay resident master registry, account statuses, and profile verification.
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
            placeholder="Search by resident name, email, or contact phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Icon name="search" size={18} />}
          />
        </div>
        <div style={{ width: '180px' }}>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'active', label: 'Active Only' },
              { value: 'inactive', label: 'Inactive Only' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <Loader label="Loading citizen registry..." />
      ) : citizens.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No resident records found.</p>
        </div>
      ) : (
        <div className="qf-admin-table-container">
          <table className="qf-admin-table">
            <thead>
              <tr>
                <th>Resident Name</th>
                <th>Purok / Zone</th>
                <th>Voter Status</th>
                <th style={{ textAlign: 'center' }}>Requests</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {citizens.map((c) => (
                <tr key={c._id}>
                  <td>
                    <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
                      {c.full_name}
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      {c.email} {c.phone ? `• ${c.phone}` : ''}
                    </div>
                  </td>
                  <td>{c.profile?.purok_zone || '—'}</td>
                  <td>
                    {c.profile?.is_registered_voter ? (
                      <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-xs)', fontWeight: 'var(--font-medium)' }}>
                        Registered
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-xs)' }}>
                        Non-Registered
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 'var(--font-semibold)' }}>
                    {c.request_count || 0}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-xs)',
                        fontWeight: 'var(--font-semibold)',
                        backgroundColor: c.is_active ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
                        color: c.is_active ? 'var(--color-success)' : 'var(--color-danger)',
                      }}
                    >
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="qf-admin-staff__actions" style={{ justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="sm" onClick={() => setDetailCitizen(c)} aria-label="View citizen profile">
                        Profile
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(c)}
                        aria-label={c.is_active ? 'Deactivate citizen' : 'Activate citizen'}
                      >
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDelete(c)}
                        style={{ color: 'var(--color-danger)' }}
                        aria-label="Delete citizen"
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
          onPageChange={(page) => fetchCitizens(page)}
        />
      )}

      {/* Citizen Profile Details Modal */}
      <CitizenDetailModal
        isOpen={Boolean(detailCitizen)}
        onClose={() => setDetailCitizen(null)}
        citizen={detailCitizen}
      />

      {/* Typed DELETE Confirmation Modal */}
      <TypedDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Resident Account"
        itemName={citizenToDelete?.full_name || 'this citizen'}
        warningMessage="This will permanently delete the resident account, profile, all submitted requests, and physical file attachments."
        isDeleting={deleting}
      />
    </div>
  );
}
