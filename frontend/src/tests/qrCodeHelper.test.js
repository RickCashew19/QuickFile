import { describe, it, expect } from 'vitest';
import { extractVerificationCode, QrExtractionError } from '../utils/qrCodeHelper';

describe('QR Code Helper Suite', () => {
  it('extracts bare alphanumeric verification code and converts to uppercase', () => {
    expect(extractVerificationCode('CERT-1234-ABCD')).toBe('CERT-1234-ABCD');
    expect(extractVerificationCode('cert-5678-efgh')).toBe('CERT-5678-EFGH');
  });

  it('extracts code from full https URL', () => {
    const url = 'https://portal.quickfile.gov.ph/verify/CERT-9999';
    expect(extractVerificationCode(url)).toBe('CERT-9999');
  });

  it('extracts code from URL with query parameters', () => {
    const url = 'https://quickfile.ph/verify/CERT-4321?source=qr&device=mobile';
    expect(extractVerificationCode(url)).toBe('CERT-4321');
  });

  it('extracts code from URL with trailing slash', () => {
    const url = 'https://quickfile.ph/verify/CERT-8888/';
    expect(extractVerificationCode(url)).toBe('CERT-8888');
  });

  it('extracts code from relative path', () => {
    expect(extractVerificationCode('/api/v1/verify/CERT-7777')).toBe('CERT-7777');
  });

  it('rejects bare tracking numbers (QF-...) with clear message', () => {
    expect(() => extractVerificationCode('QF-2026-0001')).toThrow(QrExtractionError);
    try {
      extractVerificationCode('QF-2026-0001');
    } catch (err) {
      expect(err.isTrackingNumber).toBe(true);
      expect(err.message).toContain('Request Tracking Number');
    }
  });

  it('rejects tracking numbers embedded in URLs', () => {
    expect(() => extractVerificationCode('https://quickfile.ph/verify/QF-2026-9999')).toThrow(
      QrExtractionError
    );
    try {
      extractVerificationCode('https://quickfile.ph/citizen/requests/QF-2026-9999');
    } catch (err) {
      expect(err.isTrackingNumber).toBe(true);
    }
  });

  it('rejects empty, whitespace, and garbage input', () => {
    expect(() => extractVerificationCode('')).toThrow(QrExtractionError);
    expect(() => extractVerificationCode('   ')).toThrow(QrExtractionError);
    expect(() => extractVerificationCode('???')).toThrow(QrExtractionError);
    expect(() => extractVerificationCode('https://invalid.com/')).toThrow(QrExtractionError);
  });
});
