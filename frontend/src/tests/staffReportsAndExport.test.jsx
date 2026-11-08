import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StaffExportButtons } from '../pages/staff/reports/StaffExportButtons';
import { StaffReportsPage } from '../pages/staff/reports/StaffReportsPage';
import { staffService } from '../services/staffService';
import { citizenService } from '../services/citizenService';
import * as downloadHelperModule from '../utils/downloadHelper';

describe('Staff Reports & Export Helper Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers PDF export and invokes downloadBlob with binary stream and filename', async () => {
    const fakeBlob = new Blob(['%PDF-1.4 Fake PDF Content'], { type: 'application/pdf' });
    const exportSpy = vi.spyOn(staffService, 'exportReport').mockResolvedValue({
      blob: fakeBlob,
      filename: 'quickfile_report_2026.pdf',
      truncated: false,
    });

    const downloadSpy = vi.spyOn(downloadHelperModule, 'downloadBlob').mockImplementation(() => {});

    const onNotice = vi.fn();
    const onError = vi.fn();

    render(
      <StaffExportButtons
        filters={{ from: '2026-01-01', to: '2026-01-31', document_type_id: 'doc123' }}
        onNotice={onNotice}
        onError={onError}
      />
    );

    const pdfBtn = screen.getByRole('button', { name: /export report as pdf document/i });
    expect(pdfBtn).toBeInTheDocument();

    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({
        format: 'pdf',
        from: '2026-01-01',
        to: '2026-01-31',
        document_type_id: 'doc123',
      });
      expect(downloadSpy).toHaveBeenCalledWith(fakeBlob, 'quickfile_report_2026.pdf');
    });

    expect(onNotice).toHaveBeenCalledWith(null);
    expect(onError).toHaveBeenCalledWith(null);
  });

  it('triggers DOCX and XLSX exports with correct format parameters', async () => {
    const fakeBlob = new Blob(['Fake binary content'], { type: 'application/octet-stream' });
    const exportSpy = vi.spyOn(staffService, 'exportReport').mockResolvedValue({
      blob: fakeBlob,
      filename: 'report.docx',
      truncated: false,
    });
    const downloadSpy = vi.spyOn(downloadHelperModule, 'downloadBlob').mockImplementation(() => {});

    render(
      <StaffExportButtons
        filters={{ from: '', to: '', document_type_id: '' }}
        onNotice={vi.fn()}
        onError={vi.fn()}
      />
    );

    // Test Word (.docx) export
    const docxBtn = screen.getByRole('button', { name: /export report as word document/i });
    fireEvent.click(docxBtn);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'docx' })
      );
      expect(downloadSpy).toHaveBeenCalledWith(fakeBlob, 'report.docx');
    });

    // Test Excel (.xlsx) export
    exportSpy.mockResolvedValueOnce({
      blob: fakeBlob,
      filename: 'report.xlsx',
      truncated: false,
    });

    const xlsxBtn = screen.getByRole('button', { name: /export report as excel spreadsheet/i });
    fireEvent.click(xlsxBtn);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'xlsx' })
      );
      expect(downloadSpy).toHaveBeenCalledWith(fakeBlob, 'report.xlsx');
    });
  });

  it('notifies user when export record limit is truncated', async () => {
    const fakeBlob = new Blob(['Truncated PDF'], { type: 'application/pdf' });
    vi.spyOn(staffService, 'exportReport').mockResolvedValue({
      blob: fakeBlob,
      filename: 'truncated.pdf',
      truncated: true,
    });
    vi.spyOn(downloadHelperModule, 'downloadBlob').mockImplementation(() => {});

    const onNotice = vi.fn();
    render(
      <StaffExportButtons
        filters={{ from: '', to: '', document_type_id: '' }}
        onNotice={onNotice}
        onError={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /export report as pdf document/i }));

    await waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith(
        expect.stringMatching(/export record limit reached/i)
      );
    });
  });

  it('StaffReportsPage renders summary KPI cards and breakdown table', async () => {
    vi.spyOn(citizenService, 'getCatalog').mockResolvedValue([
      { _id: 'doc1', name: 'Barangay Clearance', fee: 50 },
    ]);

    vi.spyOn(staffService, 'getReports').mockResolvedValue({
      summary: {
        total_requests: 42,
        released_count: 35,
        rejected_count: 4,
        total_revenue: 1750,
        waived_count: 3,
        waived_amount: 150,
      },
      by_document_type: [
        {
          document_code: 'BC',
          document_name: 'Barangay Clearance',
          count: 42,
          unit_fee: 50,
          collected_amount: 1750,
        },
      ],
    });

    render(<StaffReportsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('42').length).toBeGreaterThan(0); // Total requests
      expect(screen.getByText('35')).toBeInTheDocument(); // Released
      expect(screen.getByText('4')).toBeInTheDocument(); // Rejected
      expect(screen.getAllByText('Barangay Clearance').length).toBeGreaterThan(0);
    });
  });
});
