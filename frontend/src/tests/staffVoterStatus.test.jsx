import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StaffRequestDetailPage } from '../pages/staff/queue/StaffRequestDetailPage';
import { staffService } from '../api/staffService';
import * as useAuthModule from '../hooks/useAuth';
import realStaffRequestDetail from './fixtures/real/staffRequestDetail.json';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/staff/requests/req-1']}>
      <Routes>
        <Route path="/staff/requests/:id" element={<StaffRequestDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Staff voter status verification on request detail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'staff-1', full_name: 'Staff User' },
      hasPermission: () => true,
    });
    vi.spyOn(staffService, 'getRequest').mockResolvedValue(realStaffRequestDetail);
    vi.spyOn(staffService, 'acquireOrRenewLock').mockResolvedValue({});
    vi.spyOn(staffService, 'releaseLock').mockResolvedValue({});
    vi.spyOn(staffService, 'updateResidentVoterStatus').mockResolvedValue({
      voter_status: 'unregistered',
    });
  });

  it('shows the voter status editor and saves the new value through the staff service', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Voter Registration Status')).toBeTruthy());
    const selector = screen.getByLabelText(/Voter Registration Status/i);
    expect(selector.value).toBe('registered');

    fireEvent.change(selector, { target: { value: 'unregistered' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Voter Status/i }));

    await waitFor(() => {
      expect(staffService.updateResidentVoterStatus).toHaveBeenCalledWith(
        realStaffRequestDetail.request.citizen_id._id,
        'unregistered'
      );
    });
  });

  it('hides the editor when the staff member lacks both relevant permissions', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'staff-1', full_name: 'Staff User' },
      hasPermission: () => false,
    });

    renderPage();

    await waitFor(() => expect(staffService.getRequest).toHaveBeenCalled());
    expect(screen.queryByText('Voter Registration Status')).toBeNull();
  });
});
