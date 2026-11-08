import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CertificatePrintPage } from '../pages/staff/print/CertificatePrintPage';
import { StaffVerifyPage } from '../pages/staff/verify/StaffVerifyPage';
import { staffService } from '../services/staffService';
import { printService } from '../services/printService';
import { ApiError } from '../services/apiClient';
import realPrintData from './fixtures/real/staffPrintData.json';
import realVerifyResult from './fixtures/real/staffVerifyResult.json';

describe('Certificate Print & Staff Verification Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('CertificatePrintPage', () => {
    it('renders official certificate data using real fixture and triggers printService.print()', async () => {
      vi.spyOn(staffService, 'getPrintData').mockResolvedValue(realPrintData);
      const printSpy = vi.spyOn(printService, 'print').mockImplementation(() => {});

      render(
        <MemoryRouter initialEntries={['/staff/requests/req-print-1/print']}>
          <Routes>
            <Route path="/staff/requests/:id/print" element={<CertificatePrintPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText(new RegExp(realPrintData.barangay.barangay_name, 'i')).length).toBeGreaterThan(0);
        expect(screen.getByText(new RegExp(realPrintData.citizen.full_name, 'i'))).toBeInTheDocument();
        expect(screen.getByText(realPrintData.issued_document.certificate_number)).toBeInTheDocument();
        expect(screen.getByText(realPrintData.barangay.captain_name)).toBeInTheDocument();
        expect(screen.getByText(realPrintData.barangay.secretary_name)).toBeInTheDocument();
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
    it('verifies code via manual fallback input and displays full audit result using real fixture', async () => {
      const verifySpy = vi.spyOn(staffService, 'verifyCode').mockResolvedValue(realVerifyResult);

      render(
        <MemoryRouter>
          <StaffVerifyPage />
        </MemoryRouter>
      );

      const codeInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(codeInput, { target: { value: realVerifyResult.verification_code } });

      const verifyBtn = screen.getByRole('button', { name: /verify code/i });
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(verifySpy).toHaveBeenCalledWith(realVerifyResult.verification_code);
        expect(screen.getByText('VALID')).toBeInTheDocument();
        expect(screen.getByText(realVerifyResult.issued_to_name)).toBeInTheDocument();
        expect(screen.getByText(realVerifyResult.certificate_number)).toBeInTheDocument();
      });

      // Reset to scan another document
      const resetBtn = screen.getByRole('button', { name: /scan another document/i });
      fireEvent.click(resetBtn);

      expect(screen.queryByText('VALID')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });
  });
});
