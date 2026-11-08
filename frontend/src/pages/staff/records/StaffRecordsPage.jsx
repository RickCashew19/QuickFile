import { useState, useEffect, useCallback } from 'react';
import { staffService } from '../../../services/staffService';
import { citizenService } from '../../../services/citizenService';
import { StaffRecordsTable } from './StaffRecordsTable';
import { Select } from '../../../components/shared/Select';
import { Input } from '../../../components/shared/Input';
import { Button } from '../../../components/shared/Button';
import { Pagination } from '../../../components/shared/Pagination';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { REQUEST_STATUSES } from '../../../config/constants';
import './StaffRecordsPage.css';

const DEFAULT_RECORD_FILTERS = {
  status: 'all',
  document_type_id: '',
  search: '',
  from: '',
  to: '',
};

export function StaffRecordsPage() {
  const [filters, setFilters] = useState(DEFAULT_RECORD_FILTERS);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [error, setError] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  // Load document types for filter
  useEffect(() => {
    let isMounted = true;
    citizenService
      .getCatalog()
      .then((data) => {
        if (isMounted && Array.isArray(data)) setDocumentTypes(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await staffService.listRecords({
        page,
        limit,
        ...filters,
      });
      setRecords(data?.requests || []);
      setTotalPages(data?.pagination?.total_pages || 1);
      setTotalItems(data?.pagination?.total_items || 0);
    } catch (err) {
      setError(err.message || 'Failed to load historical records.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleFilterChange = (field, val) => {
    setFilters((prev) => ({ ...prev, [field]: val }));
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_RECORD_FILTERS);
    setPage(1);
  };

  const handleArchive = async (id) => {
    setArchivingId(id);
    setError(null);
    try {
      await staffService.archiveRequest(id);
      await loadRecords();
    } catch (err) {
      setError(err.message || 'Failed to archive record.');
    } finally {
      setArchivingId(null);
    }
  };

  const docTypeOptions = [
    { value: '', label: 'All Document Types' },
    ...documentTypes.map((dt) => ({ value: dt._id, label: dt.name })),
  ];

  return (
    <div className="qf-staff-records-page">
      <div className="qf-page-header">
        <div>
          <h1 className="qf-page-title">Historical Barangay Records</h1>
          <p className="qf-page-subtitle">
            Search and maintain repository of completed, released, and archived civil documents.
          </p>
        </div>
        <div className="qf-queue-count-badge">
          <span>{totalItems} records</span>
        </div>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filter Bar */}
      <div className="qf-records-filter-card">
        <div className="qf-records-filter-grid">
          <Input
            label="Search Tracking / Resident"
            name="search"
            value={filters.search}
            placeholder="Search keyword..."
            onChange={(e) => handleFilterChange('search', e.target.value)}
            disabled={loading}
          />
          <Select
            label="Record Status"
            name="status"
            value={filters.status}
            options={[
              { value: 'all', label: 'All (Released & Archived)' },
              { value: REQUEST_STATUSES.RELEASED, label: 'Released Only' },
              { value: REQUEST_STATUSES.ARCHIVED, label: 'Archived Only' },
            ]}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            disabled={loading}
          />
          <Select
            label="Document Type"
            name="document_type_id"
            value={filters.document_type_id}
            options={docTypeOptions}
            onChange={(e) => handleFilterChange('document_type_id', e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="qf-records-filter-actions">
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={loading}>
            Reset Filters
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="qf-page-loading">
          <Loader size="lg" text="Loading civil records..." />
        </div>
      ) : (
        <>
          <StaffRecordsTable
            records={records}
            onArchiveRecord={handleArchive}
            archivingId={archivingId}
          />
          {totalPages > 1 && (
            <div className="qf-queue-pagination">
              <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
