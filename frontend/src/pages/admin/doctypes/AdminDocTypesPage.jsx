import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { DocTypeFormModal } from './DocTypeFormModal';
import { TypedDeleteModal } from '../../../components/shared/TypedDeleteModal';
import { Button } from '../../../components/shared/Button';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Icon } from '../../../components/shared/Icon';
import { formatCurrency } from '../../../utils/formatters';
import './AdminDocTypesPage.css';

export function AdminDocTypesPage() {
  const [docTypes, setDocTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [docTypeToDelete, setDocTypeToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getAllDocumentTypes();
      setDocTypes(res || []);
    } catch (err) {
      setError(err.message || 'Failed to retrieve document types.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocTypes();
  }, [fetchDocTypes]);

  const handleCreate = () => {
    setSelectedDocType(null);
    setFormModalOpen(true);
  };

  const handleEdit = (dt) => {
    setSelectedDocType(dt);
    setFormModalOpen(true);
  };

  const handleSaveDocType = async (payload) => {
    setSaving(true);
    try {
      if (selectedDocType) {
        await adminService.updateDocumentType(selectedDocType._id, payload);
        setSuccessMsg(`Document type "${payload.name}" updated successfully.`);
      } else {
        await adminService.createDocumentType(payload);
        setSuccessMsg(`Document type "${payload.name}" created successfully.`);
      }
      fetchDocTypes();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (dt) => {
    try {
      setError(null);
      await adminService.updateDocumentType(dt._id, { is_active: !dt.is_active });
      setSuccessMsg(`Document "${dt.name}" ${!dt.is_active ? 'activated' : 'deactivated'}.`);
      fetchDocTypes();
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    }
  };

  const handleOpenDelete = (dt) => {
    setDocTypeToDelete(dt);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!docTypeToDelete) return;
    setDeleting(true);
    try {
      await adminService.deleteDocumentType(docTypeToDelete._id);
      setSuccessMsg(`Document type "${docTypeToDelete.name}" deleted successfully.`);
      setDeleteModalOpen(false);
      setDocTypeToDelete(null);
      fetchDocTypes();
    } catch (err) {
      setError(err.message || 'Failed to delete document type.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="qf-admin-doctypes">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">Document Types Catalog</h1>
          <p className="qf-admin-dashboard__subtitle">
            Configure certificate templates, processing turnaround times, statutory fees, and requirements.
          </p>
        </div>
        <Button variant="primary" onClick={handleCreate} iconLeft={<Icon name="file" size={16} />}>
          New Document Type
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

      {loading ? (
        <Loader label="Loading document types catalog..." />
      ) : docTypes.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No document types configured.</p>
        </div>
      ) : (
        <div className="qf-admin-table-container">
          <table className="qf-admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Document Name</th>
                <th>Standard Fee</th>
                <th>Turnaround</th>
                <th>Requirements</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docTypes.map((dt) => (
                <tr key={dt._id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary)' }}>
                    {dt.code}
                  </td>
                  <td>
                    <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
                      {dt.name}
                    </div>
                    {dt.description && (
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                        {dt.description}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 'var(--font-semibold)' }}>
                    {formatCurrency(dt.fee)}
                  </td>
                  <td>
                    {dt.processing_days} {dt.processing_days === 1 ? 'day' : 'days'}
                  </td>
                  <td>
                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      {dt.requirements?.length || 0} required items
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-xs)',
                        fontWeight: 'var(--font-semibold)',
                        backgroundColor: dt.is_active ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
                        color: dt.is_active ? 'var(--color-success)' : 'var(--color-danger)',
                      }}
                    >
                      {dt.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="qf-admin-staff__actions" style={{ justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(dt)} aria-label="Edit document type">
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(dt)}
                        aria-label={dt.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {dt.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDelete(dt)}
                        style={{ color: 'var(--color-danger)' }}
                        aria-label="Delete document type"
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

      {/* DocType Editor Modal */}
      <DocTypeFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSave={handleSaveDocType}
        docType={selectedDocType}
        isSaving={saving}
      />

      {/* Typed DELETE Modal for DocType */}
      <TypedDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Document Type"
        itemName={docTypeToDelete?.name || 'this document type'}
        warningMessage="This will delete the document type definition. Deletion will be rejected if existing citizen requests reference it."
        isDeleting={deleting}
      />
    </div>
  );
}
