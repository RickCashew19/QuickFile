import { useState, useEffect, useCallback } from 'react';
import { staffService } from '../../../services/staffService';
import { citizenService } from '../../../services/citizenService';
import { StaffExportButtons } from './StaffExportButtons';
import { StaffReportSummaryCards } from './StaffReportSummaryCards';
import { Select } from '../../../components/shared/Select';
import { Input } from '../../../components/shared/Input';
import { Button } from '../../../components/shared/Button';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { formatCurrency } from '../../../utils/formatters';
import './StaffReportsPage.css';

export function StaffReportsPage() {
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    document_type_id: '',
  });

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

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

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await staffService.getReports(filters);
      setReportData(data);
    } catch (err) {
      setError(err.message || 'Failed to generate reports data.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFilterChange = (field, val) => {
    setFilters((prev) => ({ ...prev, [field]: val }));
  };

  const handleResetFilters = () => {
    setFilters({ from: '', to: '', document_type_id: '' });
  };

  const docTypeOptions = [
    { value: '', label: 'All Document Types' },
    ...documentTypes.map((dt) => ({ value: dt._id, label: dt.name })),
  ];

  return (
    <div className="qf-staff-reports-page">
      <div className="qf-page-header">
        <div>
          <h1 className="qf-page-title">Reports & Export Analytics</h1>
          <p className="qf-page-subtitle">
            Aggregate transaction volume, revenue reconciliation, and generate official audit
            exports in PDF, DOCX, or Excel.
          </p>
        </div>
        <StaffExportButtons
          filters={filters}
          onNotice={(msg) => setNotice(msg)}
          onError={(err) => setError(err)}
          disabled={loading}
        />
      </div>

      {notice && (
        <Alert variant="warning" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Date & Filter Controls */}
      <div className="qf-reports-filter-card">
        <div className="qf-reports-filter-grid">
          <Input
            label="From Date"
            name="from"
            type="date"
            value={filters.from}
            onChange={(e) => handleFilterChange('from', e.target.value)}
            disabled={loading}
          />
          <Input
            label="To Date"
            name="to"
            type="date"
            value={filters.to}
            onChange={(e) => handleFilterChange('to', e.target.value)}
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
        <div className="qf-reports-filter-actions">
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={loading}>
            Reset Range
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="qf-page-loading">
          <Loader size="lg" text="Aggregating transaction reports..." />
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <StaffReportSummaryCards summary={reportData?.summary || {}} />

          {/* Breakdown By Document Type */}
          <div className="qf-staff-card">
            <h2 className="qf-staff-card-title">Transaction Volume by Document Type</h2>
            <div className="qf-table-container">
              <table className="qf-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Document Name</th>
                    <th style={{ textAlign: 'center' }}>Total Requests</th>
                    <th style={{ textAlign: 'right' }}>Unit Fee</th>
                    <th style={{ textAlign: 'right' }}>Collected Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportData?.by_document_type || []).map((row) => (
                    <tr key={row.document_code}>
                      <td className="font-mono">{row.document_code}</td>
                      <td>{row.document_name}</td>
                      <td style={{ textAlign: 'center' }}>{row.count}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(row.unit_fee || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(row.collected_amount || 0)}
                      </td>
                    </tr>
                  ))}
                  {(!reportData?.by_document_type || reportData.by_document_type.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        No transactions recorded for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
