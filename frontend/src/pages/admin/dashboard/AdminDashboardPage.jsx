import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { usePolling } from '../../../hooks/usePolling';
import { AdminStatCards } from './AdminStatCards';
import { AdminDemandTable } from './AdminDemandTable';
import { AdminRecentTable } from './AdminRecentTable';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Button } from '../../../components/shared/Button';
import { Icon } from '../../../components/shared/Icon';
import './AdminDashboardPage.css';

export function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveStats, setLiveStats] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const data = await adminService.getDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err.message || 'Failed to load executive dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Real-time live stats polling (15s interval)
  usePolling(
    async () => {
      try {
        const stats = await adminService.getLiveStats();
        if (stats) setLiveStats(stats);
        return stats;
      } catch {
        // Polling errors fail silently and back off automatically
      }
    },
    15000,
    { enabled: !loading }
  );

  if (loading) {
    return <Loader label="Loading executive administration dashboard..." fullPage />;
  }

  return (
    <div className="qf-admin-dashboard">
      <div className="qf-admin-dashboard__header">
        <div>
          <h1 className="qf-admin-dashboard__title">Executive Dashboard</h1>
          <p className="qf-admin-dashboard__subtitle">
            Barangay service metrics, real-time demand, and administrative oversight.
          </p>
        </div>
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchDashboard}
            iconLeft={<Icon name="refresh" size={16} />}
          >
            Refresh Metrics
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <AdminStatCards dashboard={dashboard} liveStats={liveStats} />

      <div className="qf-admin-sections">
        <div className="qf-admin-panel">
          <h2 className="qf-admin-panel__title">
            <Icon name="file" size={18} />
            Document Demand Breakdown
          </h2>
          <AdminDemandTable demand={dashboard?.demand_by_type} />
        </div>

        <div className="qf-admin-panel">
          <h2 className="qf-admin-panel__title">
            <Icon name="calendar" size={18} />
            Recent Citizen Requests
          </h2>
          <AdminRecentTable requests={dashboard?.recent_requests} />
        </div>
      </div>
    </div>
  );
}
