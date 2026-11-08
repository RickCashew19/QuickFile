import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CertificatePrintPage } from '../pages/staff/print/CertificatePrintPage';
import { StaffVerifyPage } from '../pages/staff/verify/StaffVerifyPage';
import { staffService } from '../services/staffService';
import { ApiError } from '../services/apiClient';
import { VALIDITY_STATUSES } from '../config/constants';

describe('Certificate Print & Staff Verification Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('CertificatePrintPage', () => {
    it('renders official certificate data and triggers window.print()', async () => {
      const mockPrintData = {
        barangay: {
          barangay_name: 'San Isidro',
          city_municipality: 'Makati City',
          province: 'Metro Manila',
          office_name: 'Office of the Barangay Captain',
          captain_name: 'Hon. Captain Antonio Luna',
          secretary_name: 'Sec. Emilio Aguinaldo',
        },
        citizen: {
          full_name: 'Maria Clara Santos',
          address: 'Block 4 Lot 12 Daisy St.',
          purok_zone: 'Zone 2',
          civil_status: 'Single',
        },
        document: {
          name: 'Barangay Clearance',
          purpose: 'Employment requirement',
        },
        issued_document: {
          certificate_number: 'BC-2026-0001',
          verification_code: 'VCD-7A2F-98E1-XYZ12345',
          issued_at: '2026-03-15T08:00:00.000Z',
          qr_code_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        },
      };

      vi.spyOn(staffService, 'getPrintData').mockResolvedValue(mockPrintData);
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      render(
        <MemoryRouter initialEntries={['/staff/requests/req-print-1/print']}>
          <Routes>
            <Route path="/staff/requests/:id/print" element={<CertificatePrintPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText(/BARANGAY SAN ISIDRO/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/MARIA CLARA SANTOS/i)).toBeInTheDocument();
        expect(screen.getByText('BC-2026-0001')).toBeInTheDocument();
        expect(screen.getByText('Hon. Captain Antonio Luna')).toBeInTheDocument();
        expect(screen.getByText('Sec. Emilio Aguinaldo')).toBeInTheDocument();
      });

      const printBtn = screen.getByRole('button', { name: /print official certificate/i });
      fireEvent.click(printBtn);
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('displays warning alert when signatories are unconfigured (409 conflict)', async () => {
      vi.spyOn(staffService, 'getPrintData').mockRejectedValue(
        new ApiError(
          'Cannot print certificate: Signatories (Barangay Captain and Secretary) are not configured. Please configure them in Settings before printing.',
          409,
          'CONFLICT'
        )
      );

      render(
        <MemoryRouter initialEntries={['/staff/requests/req-unconf/print']}>
          <Routes>
            <Route path="/staff/requests/:id/print" element={<CertificatePrintPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText(/cannot print certificate: signatories/i)
        ).toBeInTheDocument();
        expect(
          screen.getByText(/an administrator must configure the barangay captain/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('StaffVerifyPage', () => {
    it('verifies code via manual fallback input and displays full audit result', async () => {
      const mockResult = {
        certificate_number: 'BC-2026-0099',
        verification_code: 'VERIFY-CODE-99',
        validity_status: VALIDITY_STATUSES.VALID,
        document_name: 'Certificate of Indigency',
        issued_to_name: 'Pedro Penduko',
        issued_at: '2026-02-10T10:00:00.000Z',
        expires_at: null,
        tracking_number: 'TRK-2026-0099',
        issuing_staff_name: 'Staff Maria',
        status_history: {
          created_at: '2026-02-09T08:00:00.000Z',
          approved_at: '2026-02-09T14:00:00.000Z',
          ready_at: '2026-02-10T09:00:00.000Z',
          released_at: '2026-02-10T10:00:00.000Z',
        },
      };

      const verifySpy = vi.spyOn(staffService, 'verifyCode').mockResolvedValue(mockResult);

      render(
        <MemoryRouter>
          <StaffVerifyPage />
        </MemoryRouter>
      );

      const codeInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(codeInput, { target: { value: 'VERIFY-CODE-99' } });

      const verifyBtn = screen.getByRole('button', { name: /verify code/i });
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(verifySpy).toHaveBeenCalledWith('VERIFY-CODE-99');
        expect(screen.getByText('VALID')).toBeInTheDocument();
        expect(screen.getByText('Pedro Penduko')).toBeInTheDocument();
        expect(screen.getByText('BC-2026-0099')).toBeInTheDocument();
        expect(screen.getByText('Staff Maria')).toBeInTheDocument();
      });

      // Reset to scan another document
      const resetBtn = screen.getByRole('button', { name: /scan another document/i });
      fireEvent.click(resetBtn);

      expect(screen.queryByText('VALID')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });
  });
});
