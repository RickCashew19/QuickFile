import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminRecordsPage } from '../pages/admin/records/AdminRecordsPage';
import { adminService } from '../api/adminService';

describe('Admin All Records detail view', () => {
  const record = {
    _id: '507f1f77bcf86cd799439011',
    tracking_number: 'QF-2026-001',
    citizen_id: { full_name: 'Juan Dela Cruz' },
    document_type_id: { name: 'Barangay Clearance' },
    status: 'released',
    created_at: '2026-11-08T06:03:27.952Z',
    purpose: 'Local employment',
    fee: 50,
    payment_status: 'paid',
    copies: 2,
    processing_notes: '[2026-11-08T06:03:27.952Z] Juan Dela Cruz: Verified applicant identity.',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(adminService, 'listRecords').mockResolvedValue({
      items: [record],
      pagination: { page: 1, limit: 15, total: 1, total_pages: 1 },
    });
    // Matches GET /admin/requests/:id: body.data = { request, citizen_profile, issued_document }.
    vi.spyOn(adminService, 'getRequestDetails').mockResolvedValue({
      request: record,
      citizen_profile: { first_name: 'Juan' },
      issued_document: null,
    });
  });

  it('renders actual request values from the wrapped detail response', async () => {
    render(
      <MemoryRouter>
        <AdminRecordsPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'View record' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Request Details: QF-2026-001' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(within(dialog).getByText('Barangay Clearance')).toBeInTheDocument();
    expect(within(dialog).getByText('Local employment')).toBeInTheDocument();
    expect(within(dialog).getByText(/₱50\.00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Verified applicant identity/)).toBeInTheDocument();
    expect(within(dialog).queryByText('—')).toBeNull();

    await waitFor(() => {
      expect(adminService.getRequestDetails).toHaveBeenCalledWith(record._id);
    });
  });
});
