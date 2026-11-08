import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractFilenameFromHeader, downloadBlob } from '../utils/downloadHelper';
import { apiClient } from '../services/apiClient';
import { authStorage } from '../services/authStorage';

describe('Download Helper & Export Streaming Suite', () => {
  beforeEach(() => {
    authStorage.clearAll();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractFilenameFromHeader', () => {
    it('parses RFC 5987 UTF-8 encoded filename correctly', () => {
      const header = "attachment; filename*=UTF-8''Barangay%20Report%202026.pdf";
      expect(extractFilenameFromHeader(header)).toBe('Barangay Report 2026.pdf');
    });

    it('prefers RFC 5987 filename* over legacy quoted ASCII filename', () => {
      const header = 'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'Official%20Clearance.pdf';
      expect(extractFilenameFromHeader(header)).toBe('Official Clearance.pdf');
    });

    it('parses standard double-quoted ASCII filename', () => {
      const header = 'attachment; filename="monthly_records.xlsx"';
      expect(extractFilenameFromHeader(header)).toBe('monthly_records.xlsx');
    });

    it('parses bare unquoted filename', () => {
      const header = 'attachment; filename=summary.docx; size=1234';
      expect(extractFilenameFromHeader(header)).toBe('summary.docx');
    });

    it('returns provided fallback name when header is null, empty, or unparseable', () => {
      expect(extractFilenameFromHeader(null, 'default.pdf')).toBe('default.pdf');
      expect(extractFilenameFromHeader('', 'default.pdf')).toBe('default.pdf');
      expect(extractFilenameFromHeader('attachment; size=500', 'default.pdf')).toBe('default.pdf');
    });
  });

  describe('downloadBlob', () => {
    it('creates object URL, triggers download click, and revokes object URL', async () => {
      vi.useFakeTimers();

      const createObjectUrlSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-download');
      const revokeObjectUrlSpy = vi.spyOn(window.URL, 'revokeObjectURL');
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        // Prevent jsdom not-implemented navigation warning
      });

      const mockBlob = new Blob(['sample content'], { type: 'application/pdf' });
      downloadBlob(mockBlob, 'certificate.pdf');

      expect(createObjectUrlSpy).toHaveBeenCalledWith(mockBlob);
      expect(clickSpy).toHaveBeenCalled();

      // Advancing timer triggers cleanup revoke
      vi.advanceTimersByTime(150);
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:mock-download');

      vi.useRealTimers();
    });
  });

  describe('apiClient.download integration', () => {
    it('sends Authorization Bearer token and parses X-Export-Truncated notice', async () => {
      authStorage.setToken('auth_token_for_export');

      const mockBlob = new Blob(['excel data']);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="staff_report.xlsx"',
          'X-Export-Truncated': 'true',
        }),
        blob: async () => mockBlob,
      });

      const result = await apiClient.download('/staff/reports/export?format=xlsx');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/staff/reports/export'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer auth_token_for_export',
          }),
        })
      );

      expect(result.filename).toBe('staff_report.xlsx');
      expect(result.truncated).toBe(true);
      expect(result.blob).toBe(mockBlob);
    });
  });
});
