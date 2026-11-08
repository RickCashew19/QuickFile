import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboardPage } from '../pages/admin/dashboard/AdminDashboardPage';
import { adminService } from '../services/adminService';
import realDashboardFixture from './fixtures/real/adminDashboard.json';
import realLiveStatsFixture from './fixtures/real/adminLiveStats.json';

describe('AdminDashboardPage Component Test', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dashboard with data successfully', async () => {
    vi.spyOn(adminService, 'getDashboard').mockResolvedValue(realDashboardFixture);
    vi.spyOn(adminService, 'getLiveStats').mockResolvedValue(realLiveStatsFixture);

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    // Initial state has loader
    expect(screen.getByRole('status')).toBeInTheDocument();

    // After loading, dashboard title appears
    await waitFor(() => {
      expect(screen.getByText('Executive Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText("Today's Collections")).toBeInTheDocument();
    expect(screen.getByText('Active Citizens')).toBeInTheDocument();
    expect(screen.getByText('Staff Accounts')).toBeInTheDocument();
    expect(screen.getByText('Queue Backlog')).toBeInTheDocument();
  });

  it('renders when dashboard data is empty', async () => {
    vi.spyOn(adminService, 'getDashboard').mockResolvedValue({
      status_counts: {},
      revenue_today: 0,
      revenue_this_month: 0,
      active_citizens_count: 0,
      active_staff_count: 0,
      demand_by_type: [],
      recent_requests: [],
    });
    vi.spyOn(adminService, 'getLiveStats').mockResolvedValue(null);

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Executive Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('No document request activity recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('No recent requests to display.')).toBeInTheDocument();
  });

  it('renders when getDashboard rejects with error', async () => {
    vi.spyOn(adminService, 'getDashboard').mockRejectedValue(new Error('Network error'));
    vi.spyOn(adminService, 'getLiveStats').mockResolvedValue(null);

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
