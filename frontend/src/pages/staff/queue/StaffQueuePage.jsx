import { useState, useEffect, useCallback } from 'react';
import { staffService } from '../../../services/staffService';
import { citizenService } from '../../../services/citizenService';
import { StaffQueueFilters } from './StaffQueueFilters';
import { StaffQueueTable } from './StaffQueueTable';
import { Pagination } from '../../../components/shared/Pagination';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import './StaffQueuePage.css';

const DEFAULT_FILTERS = {
  status: 'all',
  document_type_id: '',
  from: '',
  to: '',
  search: '',
};

export function StaffQueuePage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [documentTypes, setDocumentTypes] = useState([]);

  // Fetch document types for filter dropdown
  useEffect(() => {
    let isMounted = true;
    citizenService
      .getCatalog()
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setDocumentTypes(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await staffService.listRequests({
        page,
        limit,
        ...filters,
      });
      setRequests(response?.requests || []);
      setTotalPages(response?.pagination?.total_pages || 1);
      setTotalItems(response?.pagination?.total_items || 0);
    } catch (err) {
      setError(err.message || 'Failed to retrieve document requests.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  return (
    <div className="qf-queue-page">
      <div className="qf-page-header">
        <div>
          <h1 className="qf-page-title">Document Request Queue</h1>
          <p className="qf-page-subtitle">
            Manage incoming citizen applications and advance requests through each verification phase.
          </p>
        </div>
        <div className="qf-queue-count-badge">
          <span>{totalItems} total requests</span>
        </div>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <StaffQueueFilters
        filters={filters}
        documentTypes={documentTypes}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
        loading={loading}
      />

      {loading ? (
        <div className="qf-page-loading">
          <Loader size="lg" text="Loading requests queue..." />
        </div>
      ) : (
        <>
          <StaffQueueTable requests={requests} />
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
