import { Icon } from '../../../components/shared/Icon';
import { formatCurrency } from '../../../utils/formatters';

export function AdminStatCards({ dashboard, liveStats }) {
  const revToday = liveStats?.today_revenue ?? dashboard?.revenue_today ?? 0;
  const revMonth = dashboard?.revenue_this_month ?? 0;
  const activeCitizens = dashboard?.active_citizens_count ?? 0;
  const activeStaff = dashboard?.active_staff_count ?? 0;
  const pendingRequests = liveStats?.queue?.pending ?? dashboard?.status_counts?.pending ?? 0;
  const liveProcessing =
    (liveStats?.queue?.under_review ?? 0) +
    (liveStats?.queue?.in_preparation ?? 0);

  return (
    <div className="qf-admin-dashboard__grid">
      <div className="qf-admin-stat-card">
        <div className="qf-admin-stat-card__header">
          <span>Today's Collections</span>
          <Icon name="download" size={18} />
        </div>
        <div className="qf-admin-stat-card__value">
          {formatCurrency(revToday)}
        </div>
        <div className="qf-admin-stat-card__footer">
          Month Total: {formatCurrency(revMonth)}
        </div>
      </div>

      <div className="qf-admin-stat-card">
        <div className="qf-admin-stat-card__header">
          <span>Active Citizens</span>
          <Icon name="user" size={18} />
        </div>
        <div className="qf-admin-stat-card__value">
          {activeCitizens.toLocaleString()}
        </div>
        <div className="qf-admin-stat-card__footer">
          Registered barangay residents
        </div>
      </div>

      <div className="qf-admin-stat-card">
        <div className="qf-admin-stat-card__header">
          <span>Staff Accounts</span>
          <Icon name="shield" size={18} />
        </div>
        <div className="qf-admin-stat-card__value">
          {activeStaff}
        </div>
        <div className="qf-admin-stat-card__footer">
          Active service personnel
        </div>
      </div>

      <div className="qf-admin-stat-card">
        <div className="qf-admin-stat-card__header">
          <span>Queue Backlog</span>
          <Icon name="refresh" size={18} />
        </div>
        <div className="qf-admin-stat-card__value" style={{ color: pendingRequests > 0 ? 'var(--color-primary)' : 'inherit' }}>
          {pendingRequests}
        </div>
        <div className="qf-admin-stat-card__footer">
          {liveProcessing} currently in preparation
        </div>
      </div>
    </div>
  );
}
