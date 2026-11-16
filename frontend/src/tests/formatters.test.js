import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDateTime,
  formatDateTimeMs,
  formatDate,
  formatFileSize,
  getStatusMeta,
} from '../utils/formatters';
import { REQUEST_STATUSES } from '../config/constants';

describe('Formatters Utility Suite', () => {
  describe('formatCurrency', () => {
    it('formats numbers to Philippine Peso currency with 2 decimals', () => {
      const formatted = formatCurrency(150);
      expect(formatted).toContain('150.00');
      expect(formatted).toContain('₱');
    });

    it('returns "Free" for zero or nullish values', () => {
      expect(formatCurrency(0)).toBe('Free');
      expect(formatCurrency(null)).toBe('Free');
      expect(formatCurrency('abc')).toBe('Free');
    });
  });

  describe('formatDateTime & formatDate', () => {
    it('formats ISO timestamps to Asia/Manila readable string', () => {
      const iso = '2026-11-08T00:00:00.000Z'; // 8:00 AM Manila
      const dt = formatDateTime(iso);
      expect(dt).toContain('2026');
      expect(dt).toContain('Nov');

      const d = formatDate(iso);
      expect(d).toContain('2026');
      expect(d).toContain('Nov');
    });

    it('formats timestamps down to milliseconds with formatDateTimeMs', () => {
      const isoWithMs = '2026-11-08T00:00:00.789Z'; // 8:00:00.789 AM Manila
      const formatted = formatDateTimeMs(isoWithMs);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('Nov');
      expect(formatted).toContain('.789');

      const dateObj = new Date(1731746112456);
      const formattedFromObj = formatDateTimeMs(dateObj);
      expect(formattedFromObj).toMatch(/\.\d{3}/); // Exactly 3 fractional second digits
    });

    it('returns fallback dash for invalid dates', () => {
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime('invalid-date')).toBe('—');
      expect(formatDateTimeMs(null)).toBe('—');
      expect(formatDateTimeMs('invalid-date')).toBe('—');
      expect(formatDate(undefined)).toBe('—');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes to KB and MB correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });

    it('handles zero or negative sizes gracefully', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(-5)).toBe('0 B');
    });
  });

  describe('getStatusMeta', () => {
    it('returns correct badge label and variant for each status', () => {
      expect(getStatusMeta(REQUEST_STATUSES.PENDING)).toEqual(
        expect.objectContaining({ label: 'Pending', variant: 'warning' })
      );
      expect(getStatusMeta(REQUEST_STATUSES.READY_FOR_PICKUP)).toEqual(
        expect.objectContaining({ label: 'Ready for Pickup', variant: 'success' })
      );
      expect(getStatusMeta(REQUEST_STATUSES.REJECTED)).toEqual(
        expect.objectContaining({ label: 'Rejected', variant: 'danger' })
      );
      expect(getStatusMeta(REQUEST_STATUSES.APPROVED)).toEqual(
        expect.objectContaining({ label: 'Approved', variant: 'info' })
      );
    });

    it('handles unknown status gracefully', () => {
      const meta = getStatusMeta('custom_unknown');
      expect(meta.label).toBe('custom unknown');
      expect(meta.variant).toBe('neutral');
    });
  });
});
