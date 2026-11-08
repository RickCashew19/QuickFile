import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { StaffFormModal } from './StaffFormModal';
import { StaffPermissionsModal } from './StaffPermissionsModal';
import { StaffPasswordResetModal } from './StaffPasswordResetModal';
import { TypedDeleteModal } from '../../../components/shared/TypedDeleteModal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Pagination } from '../../../components/shared/Pagination';
import { Icon } from '../../../components/shared/Icon';
import './AdminStaffPage.css';

export function AdminStaffPage() {
  const [staffList, setStaffList] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [savingStaff, setSavingStaff] = useState(false);

  const [permModalOpen, setPermModalOpen] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStaff = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.listStaff({
        page,
        limit: 10,
        search,
        is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
      });
      setStaffList(res.staff || []);
      setPagination(res.pagination || { page: 1, limit: 10, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || 'Failed to retrieve staff directory.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchStaff(1);
  }, [fetchStaff]);

  const handleCreate = () => {
    setSelectedStaff(null);
    setFormModalOpen(true);
  };

  const handleEdit = (staff) => {
    setSelectedStaff(staff);
    setFormModalOpen(true);
  };

  const handleSaveStaff = async (formData) => {
    setSavingStaff(true);
    try {
      if (selectedStaff) {
        await adminService.updateStaff(selectedStaff._id, formData);
        setSuccessMsg(`Staff "${formData.full_name}" updated successfully.`);
      } else {
        await adminService.createStaff(formData);
        setSuccessMsg(`Staff "${formData.full_name}" created successfully.`);
      }
      fetchStaff(pagination.page);
    } finally {
      setSavingStaff(false);
    }
  };

  const handleOpenPermissions = (staff) => {
    setSelectedStaff(staff);
    setPermModalOpen(true);
  };

  const handleSavePermissions = async (staffId, perms) => {
    setSavingPerms(true);
    try {
      await adminService.updateStaffPermissions(staffId, perms);
      setSuccessMsg('Permissions updated successfully.');
      fetchStaff(pagination.page);
    } finally {
      setSavingPerms(false);
    }
  };

  const handleOpenReset = (staff) => {
    setSelectedStaff(staff);
    setResetModalOpen(true);
  };

  const handleResetPassword = async (staffId, newPassword) => {
    setResettingPw(true);
    try {
      await adminService.resetStaffPassword(staffId, newPassword);
      setSuccessMsg('Staff password has been reset.');
    } finally {
      setResettingPw(false);
    }
  };

  const handleToggleStatus = async (staff) => {
    try {
      setError(null);
      await adminService.updateStaffStatus(staff._id, !staff.is_active);
      setSuccessMsg(`Staff "${staff.full_name}" ${!staff.is_active ? 'activated' : 'deactivated'}.`);
      fetchStaff(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to update staff status.');
    }
  };

  const handleOpenDelete = (staff) => {
    setStaffToDelete(staff);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!staffToDelete) return;
    setDeleting(true);
    try {
      await adminService.deleteStaff(staffToDelete._id);
      setSuccessMsg(`Staff "${staffToDelete.full_name}" deleted permanently.`);
      setDeleteModalOpen(false);
      setStaffToDelete(null);
      fetchStaff(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to delete staff member.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="qf-admin-staff">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">Staff Management</h1>
          <p className="qf-admin-dashboard__subtitle">
            Administer desk officers, workflow permissions, and system access.
          </p>
        </div>
        <Button variant="primary" onClick={handleCreate} iconLeft={<Icon name="user" size={16} />}>
          Provision Staff Account
        </Button>
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
            placeholder="Search by name, email, phone, or employee ID..."
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
        <Loader label="Loading staff directory..." />
      ) : staffList.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No staff members match the current filter criteria.</p>
        </div>
      ) : (
        <div className="qf-admin-table-container">
          <table className="qf-admin-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Employee ID</th>
                <th>Position / Dept</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
                      {s.full_name}
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      {s.email} {s.phone ? `• ${s.phone}` : ''}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
                    {s.detail?.employee_id || '—'}
                  </td>
                  <td>
                    <div>{s.detail?.position || 'Staff'}</div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      {s.detail?.department || 'General'}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-xs)',
                        fontWeight: 'var(--font-semibold)',
                        backgroundColor: s.is_active ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
                        color: s.is_active ? 'var(--color-success)' : 'var(--color-danger)',
                      }}
                    >
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="qf-admin-staff__actions" style={{ justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(s)} aria-label="Edit staff">
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenPermissions(s)} aria-label="Permissions">
                        Permissions
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenReset(s)} aria-label="Reset password">
                        Reset PW
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(s)}
                        aria-label={s.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDelete(s)}
                        style={{ color: 'var(--color-danger)' }}
                        aria-label="Delete staff"
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
          onPageChange={(page) => fetchStaff(page)}
        />
      )}

      {/* Staff Form Modal (Create / Edit) */}
      <StaffFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSave={handleSaveStaff}
        staff={selectedStaff}
        isSaving={savingStaff}
      />

      {/* Staff Permissions Modal */}
      <StaffPermissionsModal
        isOpen={permModalOpen}
        onClose={() => setPermModalOpen(false)}
        onSave={handleSavePermissions}
        staff={selectedStaff}
        isSaving={savingPerms}
      />

      {/* Staff Password Reset Modal */}
      <StaffPasswordResetModal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onReset={handleResetPassword}
        staff={selectedStaff}
        isResetting={resettingPw}
      />

      {/* Typed DELETE Modal for Staff */}
      <TypedDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Staff Member Account"
        itemName={staffToDelete?.full_name || 'this staff account'}
        warningMessage="This account will be permanently expunged. Note: Staff with existing document processing history cannot be deleted; deactivate them instead."
        isDeleting={deleting}
      />
    </div>
  );
}
