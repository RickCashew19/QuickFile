import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TypedDeleteModal } from '../components/shared/TypedDeleteModal';
import { AdminStaffPage } from '../pages/admin/staff/AdminStaffPage';
import { AdminCitizensPage } from '../pages/admin/citizens/AdminCitizensPage';
import { adminService } from '../services/adminService';

vi.mock('../services/adminService', () => ({
  adminService: {
    listStaff: vi.fn(),
    deleteStaff: vi.fn(),
    updateStaffStatus: vi.fn(),
    listCitizens: vi.fn(),
    deleteCitizen: vi.fn(),
    updateCitizenStatus: vi.fn(),
  },
}));

describe('Typed DELETE Confirmation & Destructive Action Safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TypedDeleteModal Component', () => {
    it('disables confirm button until exact keyword "DELETE" is typed', () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      const { rerender } = render(
        <TypedDeleteModal
          isOpen={true}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title="Delete Staff Member"
          itemName="Juan Dela Cruz"
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /Delete Permanently/i });
      const input = screen.getByLabelText(/Type DELETE to confirm/i);

      // Initially disabled
      expect(confirmBtn).toBeDisabled();

      // Lowercase "delete" -> still disabled
      fireEvent.change(input, { target: { value: 'delete' } });
      expect(confirmBtn).toBeDisabled();

      // Incomplete "DELET" -> still disabled
      fireEvent.change(input, { target: { value: 'DELET' } });
      expect(confirmBtn).toBeDisabled();

      // Exact uppercase "DELETE" -> enabled!
      fireEvent.change(input, { target: { value: 'DELETE' } });
      expect(confirmBtn).not.toBeDisabled();

      // Click confirm
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);

      // Reopening clears the input
      rerender(
        <TypedDeleteModal
          isOpen={false}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title="Delete Staff Member"
          itemName="Juan Dela Cruz"
        />
      );
      rerender(
        <TypedDeleteModal
          isOpen={true}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title="Delete Staff Member"
          itemName="Juan Dela Cruz"
        />
      );

      const freshInput = screen.getByLabelText(/Type DELETE to confirm/i);
      expect(freshInput.value).toBe('');
      expect(screen.getByRole('button', { name: /Delete Permanently/i })).toBeDisabled();
    });
  });

  describe('Staff Deletion Flow', () => {
    it('requires typed DELETE and calls adminService.deleteStaff with confirmation', async () => {
      adminService.listStaff.mockResolvedValue({
        staff: [
          {
            _id: 'staff_123',
            full_name: 'Maria Dela Cruz',
            email: 'maria@quickfile.gov.ph',
            is_active: true,
            detail: { employee_id: 'EMP-001', position: 'Officer', department: 'Records' },
          },
        ],
        pagination: { page: 1, limit: 10, totalPages: 1, total: 1 },
      });
      adminService.deleteStaff.mockResolvedValue(true);

      render(
        <MemoryRouter>
          <AdminStaffPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Maria Dela Cruz')).toBeInTheDocument();
      });

      // Click trash / delete button
      const deleteButtons = screen.getAllByLabelText(/Delete staff/i);
      fireEvent.click(deleteButtons[0]);

      // Typed delete modal opens
      await waitFor(() => {
        expect(screen.getByText(/Delete Staff Member Account/i)).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: /Delete Permanently/i });
      expect(confirmBtn).toBeDisabled();

      // Type DELETE
      const input = screen.getByLabelText(/Type DELETE to confirm/i);
      fireEvent.change(input, { target: { value: 'DELETE' } });
      expect(confirmBtn).not.toBeDisabled();

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(adminService.deleteStaff).toHaveBeenCalledWith('staff_123');
      });
    });
  });

  describe('Citizen Deletion Flow', () => {
    it('requires typed DELETE and calls adminService.deleteCitizen with confirmation', async () => {
      adminService.listCitizens.mockResolvedValue({
        citizens: [
          {
            _id: 'citizen_456',
            full_name: 'Pedro Penduko',
            email: 'pedro@quickfile.gov.ph',
            phone: '09171234567',
            is_active: true,
            profile: { purok_zone: 'Purok 1', is_registered_voter: true },
            request_count: 2,
          },
        ],
        pagination: { page: 1, limit: 10, totalPages: 1, total: 1 },
      });
      adminService.deleteCitizen.mockResolvedValue(true);

      render(
        <MemoryRouter>
          <AdminCitizensPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pedro Penduko')).toBeInTheDocument();
      });

      // Click delete citizen button
      const deleteButtons = screen.getAllByLabelText(/Delete citizen/i);
      fireEvent.click(deleteButtons[0]);

      // Typed delete modal opens
      await waitFor(() => {
        expect(screen.getByText(/Delete Resident Account/i)).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: /Delete Permanently/i });
      expect(confirmBtn).toBeDisabled();

      // Type DELETE
      const input = screen.getByLabelText(/Type DELETE to confirm/i);
      fireEvent.change(input, { target: { value: 'DELETE' } });
      expect(confirmBtn).not.toBeDisabled();

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(adminService.deleteCitizen).toHaveBeenCalledWith('citizen_456');
      });
    });
  });
});
