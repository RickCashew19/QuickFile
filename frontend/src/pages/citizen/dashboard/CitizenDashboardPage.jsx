import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { citizenService } from '../../../services/citizenService';
import { requestService } from '../../../services/requestService';
import { StatusSummaryCards } from './StatusSummaryCards';
import { IncompleteProfileBanner } from './IncompleteProfileBanner';
import { Button } from '../../../components/shared/Button';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Loader } from '../../../components/shared/Loader';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Icon } from '../../../components/shared/Icon';
import { formatDate } from '../../../utils/formatters';
import './CitizenDashboardPage.css';

export function CitizenDashboardPage() {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const [profileRes, requestsRes] = await Promise.all([
          citizenService.getProfile().catch(() => null),
          requestService.listRequests({ limit: 50 }).catch(() => null),
        ]);

        if (!isMounted) return;

        if (profileRes) {
          setProfileData(profileRes);
        }

        if (requestsRes && Array.isArray(requestsRes.requests)) {
          const reqs = requestsRes.requests;
          // Calculate status counts
          const counts = {};
          reqs.forEach((r) => {
            const st = r.status || 'pending';
            counts[st] = (counts[st] || 0) + 1;
          });
          setStatusCounts(counts);
          setRecentRequests(reqs.slice(0, 5));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
        <Loader size="lg" text="Loading citizen dashboard..." />
      </div>
    );
  }

  const profile = profileData?.profile || profileData;
  const completenessScore = profileData?.completeness_score ?? 0;

  // A profile is considered complete if marked complete, if score is 100%,
  // or if the required personal details (birthdate and gender) are provided.
  const isProfileComplete = Boolean(
    profile &&
      (profile.profile_complete ||
        completenessScore >= 100 ||
        (profile.birthdate && profile.gender))
  );

  const isProfileIncomplete = Boolean(profileData && !isProfileComplete);

  return (
    <div>
      <div className="qf-dashboard-header">
        <div>
          <h1 className="qf-dashboard-title">
            Welcome, {user?.full_name || 'Resident'}
          </h1>
          <p className="qf-dashboard-subtitle">
            Manage your document requests, track applications, and view official certificates
          </p>
        </div>

        <Link to="/citizen/requests/new">
          <Button iconLeft={<Icon name="upload" size={18} />}>
            Request Document
          </Button>
        </Link>
      </div>

      {isProfileIncomplete && (
        <IncompleteProfileBanner completenessScore={profileData.completeness_score || 0} />
      )}

      <StatusSummaryCards counts={statusCounts} />

      {/* Recent Requests Section */}
      <section className="qf-dashboard-section">
        <div className="qf-dashboard-section__header">
          <h2 className="qf-dashboard-section__title">Recent Requests</h2>
          <Link to="/citizen/requests">
            <Button variant="ghost" size="sm">
              View All History &rarr;
            </Button>
          </Link>
        </div>

        {recentRequests.length === 0 ? (
          <EmptyState
            icon="file"
            title="No Document Requests Yet"
            description="You haven't submitted any document requests. Click below to apply for a Barangay Clearance or other certificate."
            action={
              <Link to="/citizen/requests/new">
                <Button size="sm">Create First Request</Button>
              </Link>
            }
          />
        ) : (
          <div className="qf-table-container">
            <table className="qf-table">
              <thead>
                <tr>
                  <th>Tracking Number</th>
                  <th>Document Type</th>
                  <th>Purpose</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((req) => (
                  <tr key={req.tracking_number}>
                    <td style={{ fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>
                      {req.tracking_number}
                    </td>
                    <td>{req.document_type?.name || 'Document'}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.purpose}
                    </td>
                    <td>{formatDate(req.created_at)}</td>
                    <td>
                      <StatusBadge status={req.status} />
                    </td>
                    <td>
                      <Link to={`/citizen/requests/${req.tracking_number}`}>
                        <Button variant="secondary" size="sm">
                          Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
