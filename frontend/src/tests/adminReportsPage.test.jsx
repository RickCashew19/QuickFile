import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AdminReportsPage } from '../pages/admin/reports/AdminReportsPage';
import { adminService } from '../services/adminService';

describe('AdminReportsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders document volume fields from the report API contract', async () => {
    vi.spyOn(adminService, 'getAllDocumentTypes').mockResolvedValue([]);
    vi.spyOn(adminService, 'getReports').mockResolvedValue({
      summary: { total_revenue: 150, total_requests: 3, completed_requests: 1, rejected_requests: 0 },
      by_document_type: [
        {
          document_code: 'BC',
          document_name: 'Barangay Clearance',
          count: 3,
          unit_fee: 50,
          collected_amount: 150,
        },
      ],
    });

    render(<AdminReportsPage />);

    expect(await screen.findByText('Barangay Clearance')).toBeInTheDocument();
    expect(screen.getByText('BC')).toBeInTheDocument();
    const documentRow = screen.getByRole('row', { name: /Barangay Clearance BC 3/ });
    expect(within(documentRow).getByText('₱150.00')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Filter' }).parentElement).toHaveClass(
      'qf-admin-reports__filter-action'
    );
  });
});
