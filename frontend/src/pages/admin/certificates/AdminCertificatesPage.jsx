import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { RevokeModal } from './RevokeModal';
import { TypedDeleteModal } from '../../../components/shared/TypedDeleteModal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Pagination } from '../../../components/shared/Pagination';
import { Icon } from '../../../components/shared/Icon';
import { formatDate } from '../../../utils/formatters';
import './AdminCertificatesPage.css';

export function AdminCertificatesPage() {
  const [documents, setDocuments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [certToRevoke, setCertToRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [certToDelete, setCertToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCerts = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.listIssuedDocuments({
        page,
        limit: 10,
        search,
        status: statusFilter,
      });
      setDocuments(res.documents || []);
      setPagination(res.pagination || { page: 1, limit: 10, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || 'Failed to retrieve issued certificates.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchCerts(1);
  }, [fetchCerts]);

  const handleOpenRevoke = (cert) => {
    setCertToRevoke(cert);
    setRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async (id, reason) => {
    setRevoking(true);
    try {
      await adminService.revokeIssuedDocument(id, reason);
      setSuccessMsg(`Certificate "${certToRevoke?.certificate_number}" revoked successfully.`);
      fetchCerts(pagination.page);
    } finally {
      setRevoking(false);
    }
  };

  const handleReinstate = async (cert) => {
    try {
      setError(null);
      await adminService.reinstateIssuedDocument(cert._id);
      setSuccessMsg(`Certificate "${cert.certificate_number}" reinstated successfully.`);
      fetchCerts(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to reinstate certificate.');
    }
  };

  const handleOpenDelete = (cert) => {
    setCertToDelete(cert);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!certToDelete) return;
    setDeleting(true);
    try {
      await adminService.deleteIssuedDocument(certToDelete._id);
      setSuccessMsg(`Certificate record "${certToDelete.certificate_number}" deleted permanently.`);
      setDeleteModalOpen(false);
      setCertToDelete(null);
      fetchCerts(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to delete certificate.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="qf-admin-certs">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">Issued Certificates Registry</h1>
          <p className="qf-admin-dashboard__subtitle">
            Universal registry of certified documents, validity monitoring, and revocation control.
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
            placeholder="Search by certificate number, recipient name, or document..."
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
              { value: 'valid', label: 'Valid Only' },
              { value: 'expired', label: 'Expired Only' },
              { value: 'revoked', label: 'Revoked Only' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <Loader label="Loading issued certificates..." />
      ) : documents.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No issued certificates found.</p>
        </div>
      ) : (
        <div className="qf-admin-table-container">
          <table className="qf-admin-table">
            <thead>
              <tr>
                <th>Certificate #</th>
                <th>Recipient</th>
                <th>Document</th>
                <th>Issued Date</th>
                <th>Expires</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => {
                const status = d.effective_status || d.validity_status;
                const isValid = status === 'valid';
                const isRevoked = status === 'revoked';

                return (
                  <tr key={d._id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary)' }}>
                      {d.certificate_number}
                    </td>
                    <td>{d.issued_to_name}</td>
                    <td>{d.document_name}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-xs)', whiteSpace: 'nowrap' }}>
                      {formatDate(d.issued_at)}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-xs)', whiteSpace: 'nowrap' }}>
                      {d.expires_at ? formatDate(d.expires_at) : 'No Expiry'}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: 'var(--font-xs)',
                          fontWeight: 'var(--font-semibold)',
                          backgroundColor: isValid
                            ? 'var(--color-success-subtle)'
                            : isRevoked
                            ? 'var(--color-danger-subtle)'
                            : 'var(--color-surface-subtle)',
                          color: isValid
                            ? 'var(--color-success)'
                            : isRevoked
                            ? 'var(--color-danger)'
                            : 'var(--color-text-secondary)',
                        }}
                      >
                        {status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="qf-admin-staff__actions" style={{ justifyContent: 'flex-end' }}>
                        {isValid && (
                          <Button variant="ghost" size="sm" onClick={() => handleOpenRevoke(d)} aria-label="Revoke certificate">
                            Revoke
                          </Button>
                        )}
                        {isRevoked && (
                          <Button variant="ghost" size="sm" onClick={() => handleReinstate(d)} aria-label="Reinstate certificate">
                            Reinstate
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDelete(d)}
                          style={{ color: 'var(--color-danger)' }}
                          aria-label="Delete certificate"
                        >
                          <Icon name="trash" size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={(page) => fetchCerts(page)}
        />
      )}

      {/* Revocation Modal */}
      <RevokeModal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        onRevoke={handleConfirmRevoke}
        cert={certToRevoke}
        isRevoking={revoking}
      />

      {/* Typed DELETE Modal for Certificates */}
      <TypedDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Certificate Record"
        itemName={certToDelete?.certificate_number || 'this certificate'}
        warningMessage="This will expunge the certificate record from the verification registry."
        isDeleting={deleting}
      />
    </div>
  );
}
