import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffQueuePage } from '../pages/staff/queue/StaffQueuePage';
import { StaffRecordsPage } from '../pages/staff/records/StaffRecordsPage';
import { staffService } from '../api/staffService';
import { citizenService } from '../api/citizenService';

describe('StaffQueuePage filters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps focus while typing during refreshes and ignores stale responses', async () => {
    const listRequests = vi.spyOn(staffService, 'listRequests').mockResolvedValue({
      items: [],
      pagination: { total_pages: 1, total: 0 },
    });
    vi.spyOn(citizenService, 'getCatalog').mockResolvedValue([]);

    render(<StaffQueuePage />);
    const searchInput = await screen.findByRole('textbox', {
      name: /search tracking \/ resident/i,
    });
    await waitFor(() => expect(listRequests).toHaveBeenCalledTimes(1));

    const pendingResponses = [];
    listRequests.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingResponses.push(resolve);
        })
    );

    await userEvent.type(searchInput, 'QF');

    expect(searchInput).toHaveValue('QF');
    expect(searchInput).toHaveFocus();
    expect(searchInput).toBeEnabled();
    await waitFor(() => expect(pendingResponses).toHaveLength(2));

    pendingResponses[1]({ items: [], pagination: { total_pages: 1, total: 2 } });
    pendingResponses[0]({ items: [], pagination: { total_pages: 1, total: 1 } });
    await waitFor(() => expect(screen.queryByText(/loading requests queue/i)).not.toBeInTheDocument());
    expect(screen.getByText('2 total requests')).toBeInTheDocument();
  });

  it('keeps historical record search focused during refreshes and ignores stale responses', async () => {
    const listRecords = vi.spyOn(staffService, 'listRecords').mockResolvedValue({
      items: [],
      pagination: { total_pages: 1, total: 0 },
    });
    vi.spyOn(citizenService, 'getCatalog').mockResolvedValue([]);

    render(<StaffRecordsPage />);
    const searchInput = await screen.findByRole('textbox', {
      name: /search tracking \/ resident/i,
    });
    await waitFor(() => expect(listRecords).toHaveBeenCalledTimes(1));

    const pendingResponses = [];
    listRecords.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingResponses.push(resolve);
        })
    );

    await userEvent.type(searchInput, 'QF');

    expect(searchInput).toHaveValue('QF');
    expect(searchInput).toHaveFocus();
    expect(searchInput).toBeEnabled();
    await waitFor(() => expect(pendingResponses).toHaveLength(2));

    pendingResponses[1]({ items: [], pagination: { total_pages: 1, total: 2 } });
    pendingResponses[0]({ items: [], pagination: { total_pages: 1, total: 1 } });
    await waitFor(() => expect(screen.queryByText(/loading civil records/i)).not.toBeInTheDocument());
    expect(screen.getByText('2 records')).toBeInTheDocument();
  });
});
