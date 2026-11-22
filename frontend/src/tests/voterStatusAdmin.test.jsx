import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CitizenDetailModal } from '../pages/admin/citizens/CitizenDetailModal';
import { AdminCitizensPage } from '../pages/admin/citizens/AdminCitizensPage';
import { adminService } from '../api/adminService';

vi.mock('../api/adminService', () => ({
  adminService: {
    listCitizens: vi.fn(),
    deleteCitizen: vi.fn(),
    updateCitizenStatus: vi.fn(),
    updateCitizenVoterStatus: vi.fn(),
  },
}));

const citizen = {
  _id: 'citizen-1',
  full_name: 'Juan Dela Cruz',
  email: 'juan@citizen.test',
  phone: '09171234567',
  created_at: new Date('2026-01-10T00:00:00.000Z').toISOString(),
  is_active: true,
  request_count: 3,
  profile: {
    voter_status: 'registered',
    purok_zone: 'Zone 4',
    civil_status: 'single',
  },
};

describe('Admin voter status management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the real voter_status value in the resident detail modal', () => {
    render(<CitizenDetailModal isOpen onClose={() => {}} citizen={citizen} />);

    const detailField = screen.getByText('Voter Status').closest('.qf-detail-field');
    expect(within(detailField).getByText('Registered Barangay Voter')).toBeTruthy();
  });

  it('saves a changed voter status through the admin service and refreshes the list', async () => {
    adminService.updateCitizenVoterStatus.mockResolvedValue({ voter_status: 'unregistered' });
    const onUpdated = vi.fn();

    render(
      <CitizenDetailModal
        isOpen
        onClose={() => {}}
        citizen={citizen}
        onUpdated={onUpdated}
      />
    );

    const selector = screen.getByLabelText(/Voter Registration Status/i);
    fireEvent.change(selector, { target: { value: 'unregistered' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Voter Status/i }));

    await waitFor(() => {
      expect(adminService.updateCitizenVoterStatus).toHaveBeenCalledWith('citizen-1', 'unregistered');
      expect(onUpdated).toHaveBeenCalledTimes(1);
    });
  });

  it('does not offer a save action until the value changes', () => {
    render(<CitizenDetailModal isOpen onClose={() => {}} citizen={citizen} />);
    const save = screen.getByRole('button', { name: /Save Voter Status/i });
    expect(save.disabled).toBe(true);
  });

  it('lists the real voter_status value in the residents table', async () => {
    adminService.listCitizens.mockResolvedValue({
      citizens: [citizen],
      pagination: { page: 1, limit: 10, totalPages: 1, total: 1 },
    });

    render(
      <MemoryRouter>
        <AdminCitizensPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Juan Dela Cruz')).toBeTruthy());
    expect(screen.getByText('Registered')).toBeTruthy();
  });
});
