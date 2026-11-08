import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Icon } from '../../../components/shared/Icon';
import { formatCurrency } from '../../../utils/formatters';
import './AdminReportsPage.css';

export function AdminReportsPage() {
  const [reportData, setReportData] = useState(null);
  const [docTypes, setDocTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportingFormat, setExportingFormat] = useState(null);
  const [truncatedNotice, setTruncatedNotice] = useState(false);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [docTypeId, setDocTypeId] = useState('all');

  // Load document types for dropdown
  useEffect(() => {
    adminService.getAllDocumentTypes().then((types) => {
      setDocTypes(types || []);
    }).catch(() => {});
  }, []);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getReports({
        from: fromDate || undefined,
        to: toDate || undefined,
        document_type_id: docTypeId === 'all' ? undefined : docTypeId,
      });
      setReportData(res);
    } catch (err) {
      setError(err.message || 'Failed to generate admin reports.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, docTypeId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleExport = async (format) => {
    try {
      setExportingFormat(format);
      setError(null);
      setTruncatedNotice(false);

      const result = await adminService.exportReport({
        format,
        from: fromDate || undefined,
        to: toDate || undefined,
        document_type_id: docTypeId === 'all' ? undefined : docTypeId,
      });

      if (result.truncated) {
        setTruncatedNotice(true);
      }

      // Trigger browser download via object URL
      const url = window.URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message || `Failed to export ${format.toUpperCase()} report.`);
    } finally {
      setExportingFormat(null);
    }
  };

  const summary = reportData?.summary || {};

  return (
    <div className="qf-admin-reports">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">Executive Reports & Intelligence</h1>
          <p className="qf-admin-dashboard__subtitle">
            Consolidated fiscal collections, request volume trends, and formal administrative exports.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleExport('pdf')}
            loading={exportingFormat === 'pdf'}
            iconLeft={<Icon name="download" size={16} />}
          >
            PDF Export
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleExport('xlsx')}
            loading={exportingFormat === 'xlsx'}
            iconLeft={<Icon name="download" size={16} />}
          >
            Excel Export
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleExport('docx')}
            loading={exportingFormat === 'docx'}
            iconLeft={<Icon name="download" size={16} />}
          >
            Word Export
          </Button>
        </div>
      </div>

      {truncatedNotice && (
        <Alert variant="warning" onClose={() => setTruncatedNotice(false)}>
          Report export volume exceeded single-batch limit (5,000 transactions). Output was safely truncated.
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filter Row */}
      <div className="qf-admin-staff__controls">
        <div style={{ width: '160px' }}>
          <Input
            label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div style={{ width: '160px' }}>
          <Input
            label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Select
            label="Document Type Filter"
            value={docTypeId}
            onChange={(e) => setDocTypeId(e.target.value)}
            options={[
              { value: 'all', label: 'All Document Types' },
              ...docTypes.map((dt) => ({ value: dt._id, label: `${dt.name} (${dt.code})` })),
            ]}
          />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <Button variant="secondary" onClick={fetchReports}>
            Filter
          </Button>
        </div>
      </div>

      {loading ? (
        <Loader label="Generating executive reports..." />
      ) : (
        <>
          <div className="qf-admin-dashboard__grid">
            <div className="qf-admin-stat-card">
              <div className="qf-admin-stat-card__header">
                <span>Total Collections</span>
                <Icon name="download" size={18} />
              </div>
              <div className="qf-admin-stat-card__value" style={{ color: 'var(--color-success)' }}>
                {formatCurrency(summary.total_revenue || 0)}
              </div>
              <div className="qf-admin-stat-card__footer">
                Paid transactions in range
              </div>
            </div>

            <div className="qf-admin-stat-card">
              <div className="qf-admin-stat-card__header">
                <span>Total Filings</span>
                <Icon name="file" size={18} />
              </div>
              <div className="qf-admin-stat-card__value">
                {summary.total_requests || 0}
              </div>
              <div className="qf-admin-stat-card__footer">
                Citizen and walk-in requests
              </div>
            </div>

            <div className="qf-admin-stat-card">
              <div className="qf-admin-stat-card__header">
                <span>Completed / Released</span>
                <Icon name="check" size={18} />
              </div>
              <div className="qf-admin-stat-card__value" style={{ color: 'var(--color-primary)' }}>
                {summary.completed_requests || 0}
              </div>
              <div className="qf-admin-stat-card__footer">
                Successfully issued certificates
              </div>
            </div>

            <div className="qf-admin-stat-card">
              <div className="qf-admin-stat-card__header">
                <span>Rejections / Cancels</span>
                <Icon name="alert" size={18} />
              </div>
              <div className="qf-admin-stat-card__value" style={{ color: 'var(--color-danger)' }}>
                {summary.rejected_requests || 0}
              </div>
              <div className="qf-admin-stat-card__footer">
                Denied filings or cancellations
              </div>
            </div>
          </div>

          <div className="qf-admin-panel">
            <h2 className="qf-admin-panel__title">
              <Icon name="file" size={18} />
              Document Volume Breakdown
            </h2>
            <div className="qf-admin-table-container">
              <table className="qf-admin-table">
                <thead>
                  <tr>
                    <th>Document Type</th>
                    <th>Code</th>
                    <th style={{ textAlign: 'right' }}>Total Count</th>
                    <th style={{ textAlign: 'right' }}>Revenue Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportData?.by_document_type || []).map((dt) => (
                    <tr key={dt.document_type_id || dt.code}>
                      <td style={{ fontWeight: 'var(--font-semibold)' }}>{dt.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{dt.code}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{dt.count}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>
                        {formatCurrency(dt.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
