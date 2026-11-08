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
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Pagination } from '../../../components/shared/Pagination';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import './StaffReportsPage.css';

/**
 * Returns the current month range (YYYY-MM-01 to YYYY-MM-lastDay) in Asia/Manila
 */
function getManilaCurrentMonthRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
  });
  const [year, month] = formatter.format(now).split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

/**
 * Validates date range constraints (from <= to, both required, max 366 days)
 */
function validateDateRange(from, to) {
  if (!from || !to) {
    return { valid: false, error: 'Both Start Date ("From") and End Date ("To") are required.' };
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return { valid: false, error: 'Please enter valid dates.' };
  }
  if (fromDate > toDate) {
    return { valid: false, error: 'Start Date ("From") cannot be after End Date ("To").' };
  }
  const diffDays = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));
  if (diffDays > 366) {
    return { valid: false, error: 'Date range cannot exceed 366 days (1 year).' };
  }
  return { valid: true, error: null };
}

export function StaffReportsPage() {
  const initialRange = getManilaCurrentMonthRange();

  const [filters, setFilters] = useState({
    from: initialRange.from,
    to: initialRange.to,
    document_type_id: '',
  });

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [txPage, setTxPage] = useState(1);

  const dateValidation = validateDateRange(filters.from, filters.to);

  // Load document types for catalog filter
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
    if (!dateValidation.valid) {
      setLoading(false);
      return;
    }

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
  }, [filters, dateValidation.valid]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFilterChange = (field, val) => {
    setFilters((prev) => ({ ...prev, [field]: val }));
    setTxPage(1);
  };

  const handleResetFilters = () => {
    const defaultRange = getManilaCurrentMonthRange();
    setFilters({ from: defaultRange.from, to: defaultRange.to, document_type_id: '' });
    setTxPage(1);
  };

  const docTypeOptions = [
    { value: '', label: 'All Document Types' },
    ...documentTypes.map((dt) => ({ value: dt._id, label: dt.name })),
  ];

  // Paginated transactions (limit max 50 items per view)
  const txItems = reportData?.transactions?.items || [];
  const txPerPage = 10;
  const totalTxPages = Math.ceil(txItems.length / txPerPage) || 1;
  const displayedTx = txItems.slice((txPage - 1) * txPerPage, txPage * txPerPage);

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
          disabled={loading || !dateValidation.valid}
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

      {!dateValidation.valid && (
        <Alert variant="warning">{dateValidation.error}</Alert>
      )}

      {/* Date & Filter Controls */}
      <div className="qf-reports-filter-card">
        <div className="qf-reports-filter-grid">
          <Input
            label="From Date *"
            name="from"
            type="date"
            value={filters.from}
            onChange={(e) => handleFilterChange('from', e.target.value)}
            disabled={loading}
            required
          />
          <Input
            label="To Date *"
            name="to"
            type="date"
            value={filters.to}
            onChange={(e) => handleFilterChange('to', e.target.value)}
            disabled={loading}
            required
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
            Reset to Manila Month
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

          {/* Breakdown By Status Table */}
          <div className="qf-staff-card" style={{ marginTop: 'var(--space-4)' }}>
            <h2 className="qf-staff-card-title">Requests Breakdown by Status</h2>
            <div className="qf-table-container">
              <table className="qf-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total Applications</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportData?.by_status || []).map((row) => (
                    <tr key={row.status}>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.count}</td>
                    </tr>
                  ))}
                  {(!reportData?.by_status || reportData.by_status.length === 0) && (
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        No status metrics recorded for the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Breakdown By Document Type */}
          <div className="qf-staff-card" style={{ marginTop: 'var(--space-4)' }}>
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

          {/* Paginated Transactions Table (max 50) */}
          <div className="qf-staff-card" style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="qf-staff-card-title" style={{ margin: 0 }}>
                Period Transactions ({txItems.length} records)
              </h2>
            </div>
            <div className="qf-table-container">
              <table className="qf-table">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Fee</th>
                    <th>Payment</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTx.map((tx, idx) => (
                    <tr key={idx}>
                      <td>{tx.applicant_name}</td>
                      <td>{tx.document_name}</td>
                      <td>
                        <StatusBadge status={tx.status} />
                      </td>
                      <td>{formatCurrency(tx.fee || 0)}</td>
                      <td>{tx.payment_status?.toUpperCase() || 'UNPAID'}</td>
                      <td>{formatDate(tx.created_at)}</td>
                    </tr>
                  ))}
                  {displayedTx.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        No individual transactions found in this date window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalTxPages > 1 && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Pagination
                  currentPage={txPage}
                  totalPages={totalTxPages}
                  onPageChange={setTxPage}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
