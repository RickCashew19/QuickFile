import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { requestService } from '../../../services/requestService';
import { CitizenRequestCard } from './CitizenRequestCard';
import { HistoryPagination } from './HistoryPagination';
import { Button } from '../../../components/shared/Button';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';
import { Icon } from '../../../components/shared/Icon';
import './CitizenHistoryPage.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_preparation', label: 'In Preparation' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup' },
  { value: 'released', label: 'Released' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function CitizenHistoryPage() {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchHistory = useCallback(async (page = 1, limit = 10, status = 'all') => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await requestService.listRequests({ page, limit, status });
      setRequests(response?.requests || []);
      if (response?.pagination) {
        setPagination(response.pagination);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load request history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(pagination.page, pagination.limit, statusFilter);
  }, [fetchHistory, pagination.page, pagination.limit, statusFilter]);

  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  return (
    <div className="qf-history-page">
      <div className="qf-history-header">
        <div>
          <h1 className="qf-history-title">Request History</h1>
          <p className="qf-history-subtitle">
            Track and monitor the status of your barangay document applications.
          </p>
        </div>
        <Link to="/citizen/requests/new">
          <Button variant="primary" iconLeft={<Icon name="upload" size={16} />}>
            New Request
          </Button>
        </Link>
      </div>

      {errorMessage && (
        <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Filter Toolbar */}
      <div className="qf-history-toolbar">
        <div className="qf-history-toolbar__filter">
          <label htmlFor="history-status-select" className="qf-history-toolbar__label">
            Filter by Status:
          </label>
          <select
            id="history-status-select"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="qf-history-select"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="qf-history-loading">
          <Loader size="lg" text="Loading your requests..." />
        </div>
      ) : requests.length === 0 ? (
        <div className="qf-history-empty">
          <div className="qf-history-empty__icon">
            <Icon name="file" size={48} />
          </div>
          <h2 className="qf-history-empty__title">No document requests found</h2>
          <p className="qf-history-empty__text">
            {statusFilter !== 'all'
              ? `No requests currently match the "${statusFilter}" filter.`
              : 'You have not submitted any barangay document requests yet.'}
          </p>
          {statusFilter !== 'all' ? (
            <Button variant="secondary" onClick={() => handleStatusChange('all')}>
              Show All Requests
            </Button>
          ) : (
            <Link to="/citizen/requests/new">
              <Button variant="primary" iconLeft={<Icon name="upload" size={16} />}>
                Submit Your First Request
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="qf-history-list">
          {requests.map((item) => (
            <CitizenRequestCard key={item._id || item.tracking_number} item={item} />
          ))}

          <HistoryPagination
            pagination={pagination}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </div>
      )}
    </div>
  );
}
