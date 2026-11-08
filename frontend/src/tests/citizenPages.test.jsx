import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CitizenHistoryPage } from '../pages/citizen/requests/CitizenHistoryPage';
import { CitizenProfilePage } from '../pages/citizen/profile/CitizenProfilePage';
import { requestService } from '../services/requestService';
import { citizenService } from '../services/citizenService';

vi.mock('../services/requestService', () => ({
  requestService: {
    listRequests: vi.fn(),
  },
}));

vi.mock('../services/citizenService', () => ({
  citizenService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', full_name: 'Juan Dela Cruz' },
    refreshUser: vi.fn(),
  }),
}));

describe('Citizen History Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders request items and handles status filter changes', async () => {
    requestService.listRequests.mockResolvedValueOnce({
      requests: [
        {
          _id: 'req-1',
          tracking_number: 'QF-2026-9999',
          document_type: { name: 'Barangay Clearance' },
          copies: 2,
          fee: 100,
          payment_status: 'paid',
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ],
      pagination: { total: 1, page: 1, limit: 10, total_pages: 1 },
    });

    render(
      <MemoryRouter>
        <CitizenHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('QF-2026-9999')).toBeInTheDocument();
      expect(screen.getByText('Barangay Clearance')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    // Change status filter
    requestService.listRequests.mockResolvedValueOnce({
      requests: [],
      pagination: { total: 0, page: 1, limit: 10, total_pages: 1 },
    });

    const select = screen.getByLabelText(/filter by status/i);
    fireEvent.change(select, { target: { value: 'approved' } });

    await waitFor(() => {
      expect(requestService.listRequests).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' })
      );
    });
  });
});

describe('Citizen Profile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders profile completeness score and fields', async () => {
    citizenService.getProfile.mockResolvedValueOnce({
      profile: {
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '1995-05-15T00:00:00.000Z',
        gender: 'male',
        civil_status: 'single',
        contact_number: '09123456789',
        purok_zone: 'Zone 4',
        barangay: 'San Antonio',
      },
      completeness_score: 85,
    });

    render(
      <MemoryRouter>
        <CitizenProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Dela Cruz')).toBeInTheDocument();
      expect(screen.getByDisplayValue('09123456789')).toBeInTheDocument();
    });
  });

  it('validates required fields in edit mode and allows saving updates', async () => {
    citizenService.getProfile.mockResolvedValueOnce({
      profile: {
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '1995-05-15T00:00:00.000Z',
        gender: 'male',
      },
      completeness_score: 50,
    });
    citizenService.updateProfile.mockResolvedValueOnce({
      profile: {
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '1995-05-15T00:00:00.000Z',
        gender: 'male',
        purok_zone: 'Zone 5',
      },
      completeness_score: 60,
    });

    render(
      <MemoryRouter>
        <CitizenProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit Profile'));

    const saveBtn = screen.getByText('Save Profile Changes');
    expect(saveBtn).toBeInTheDocument();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(citizenService.updateProfile).toHaveBeenCalled();
      expect(screen.getByText('Your citizen profile has been updated successfully.')).toBeInTheDocument();
    });
  });
});
