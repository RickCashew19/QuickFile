import { Select } from '../../../components/shared/Select';
import { Input } from '../../../components/shared/Input';
import { Button } from '../../../components/shared/Button';
import { REQUEST_STATUSES, STATUS_METADATA } from '../../../config/constants';

export function StaffQueueFilters({
  filters,
  documentTypes = [],
  onChange,
  onReset,
  loading = false,
}) {
  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    ...Object.values(REQUEST_STATUSES).map((status) => ({
      value: status,
      label: STATUS_METADATA[status]?.label || status,
    })),
  ];

  const docTypeOptions = [
    { value: '', label: 'All Document Types' },
    ...documentTypes.map((dt) => ({
      value: dt._id,
      label: dt.name,
    })),
  ];

  const handleInputChange = (field, value) => {
    const cleanValue = field === 'search' ? (value || '').slice(0, 100) : value;
    onChange({ ...filters, [field]: cleanValue });
  };

  return (
    <div className="qf-queue-filters">
      <div className="qf-queue-filters__grid">
        <Input
          label="Search Tracking / Resident"
          name="search"
          value={filters.search || ''}
          placeholder="e.g. TRK-2026 or Juan..."
          maxLength={100}
          onChange={(e) => handleInputChange('search', e.target.value)}
          disabled={loading}
        />

        <Select
          label="Status"
          name="status"
          value={filters.status || 'all'}
          options={statusOptions}
          onChange={(e) => handleInputChange('status', e.target.value)}
          disabled={loading}
        />

        <Select
          label="Document Type"
          name="document_type_id"
          value={filters.document_type_id || ''}
          options={docTypeOptions}
          onChange={(e) => handleInputChange('document_type_id', e.target.value)}
          disabled={loading}
        />

        <Input
          label="From Date"
          name="from"
          type="date"
          value={filters.from || ''}
          onChange={(e) => handleInputChange('from', e.target.value)}
          disabled={loading}
        />

        <Input
          label="To Date"
          name="to"
          type="date"
          value={filters.to || ''}
          onChange={(e) => handleInputChange('to', e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="qf-queue-filters__actions">
        <Button variant="outline" size="sm" onClick={onReset} disabled={loading}>
          Reset Filters
        </Button>
      </div>
    </div>
  );
}
