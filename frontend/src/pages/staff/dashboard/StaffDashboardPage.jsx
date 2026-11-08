import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { usePolling } from '../../../hooks/usePolling';
import { staffService } from '../../../services/staffService';
import { STAFF_PERMISSIONS } from '../../../config/constants';
import { StaffStatCards } from './StaffStatCards';
import { StaffRecentTable } from './StaffRecentTable';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Icon } from '../../../components/shared/Icon';
import './StaffDashboardPage.css';

export function StaffDashboardPage() {
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [liveStats, setLiveStats] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const data = await staffService.getDashboard();
      setDashboardData(data);
    } catch (err) {
      setError(err.message || 'Failed to load staff dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Poll live stats every 10 seconds (using dedicated polling route exempt from userApiLimiter)
  usePolling(
    async () => {
      try {
        const stats = await staffService.getLiveStats();
        setLiveStats(stats);
      } catch {
        // Polling errors fail silently and back off automatically
      }
    },
    10000,
    { enabled: !loading }
  );

  if (loading) {
    return (
      <div className="qf-page-loading">
        <Loader size="lg" text="Loading staff workspace..." />
      </div>
    );
  }

  const kpis = dashboardData?.kpis || {};
  const pendingQueue = dashboardData?.pending_queue || [];

  return (
    <div className="qf-staff-dashboard">
      <div className="qf-page-header">
        <div>
          <h1 className="qf-page-title">Staff Workspace</h1>
          <p className="qf-page-subtitle">
            Welcome back, {user?.full_name}. Real-time overview of document queue and active transactions.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* KPI Stat Cards */}
      <section aria-label="Queue Metrics">
        <StaffStatCards stats={kpis} liveCounts={liveStats} />
      </section>

      {/* Quick Actions Bar */}
      <section className="qf-staff-quick-actions" aria-label="Quick Actions">
        <h2 className="qf-staff-section-title">Quick Actions</h2>
        <div className="qf-staff-quick-actions__grid">
          {hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS) && (
            <Link to="/staff/requests" className="qf-staff-action-card">
              <Icon name="file" size={24} />
              <div>
                <span className="qf-staff-action-card__label">Review Queue</span>
                <span className="qf-staff-action-card__desc">Examine and verify pending requests</span>
              </div>
            </Link>
          )}

          {hasPermission(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS) && (
            <Link to="/staff/requests/walk-in" className="qf-staff-action-card">
              <Icon name="upload" size={24} />
              <div>
                <span className="qf-staff-action-card__label">Walk-In Filing</span>
                <span className="qf-staff-action-card__desc">File request for on-premise resident</span>
              </div>
            </Link>
          )}

          {hasPermission(STAFF_PERMISSIONS.CAN_VERIFY_QR) && (
            <Link to="/staff/verify" className="qf-staff-action-card">
              <Icon name="qr" size={24} />
              <div>
                <span className="qf-staff-action-card__label">QR Scanner</span>
                <span className="qf-staff-action-card__desc">Scan certificate QR code for authenticity</span>
              </div>
            </Link>
          )}

          {hasPermission(STAFF_PERMISSIONS.CAN_VIEW_REPORTS) && (
            <Link to="/staff/reports" className="qf-staff-action-card">
              <Icon name="download" size={24} />
              <div>
                <span className="qf-staff-action-card__label">Reports & Exports</span>
                <span className="qf-staff-action-card__desc">Generate stats & download PDF/DOCX/XLSX</span>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* Pending Requests Queue */}
      <section className="qf-staff-recent-section" aria-label="Pending Requests">
        <div className="qf-staff-recent-header">
          <h2 className="qf-staff-section-title">Pending Document Queue</h2>
          {hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS) && (
            <Link to="/staff/requests" className="qf-btn qf-btn--ghost qf-btn--sm">
              View All in Queue &rarr;
            </Link>
          )}
        </div>
        <StaffRecentTable requests={pendingQueue} />
      </section>
    </div>
  );
}
