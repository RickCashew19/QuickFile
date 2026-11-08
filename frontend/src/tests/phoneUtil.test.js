import { describe, it, expect } from 'vitest';
import { cleanPhoneInput, normalizePhilippinePhone, formatPhoneDisplay } from '../utils/phoneUtil';

describe('Phone Utility Suite (Philippine Mobile Normalization)', () => {
  describe('cleanPhoneInput', () => {
    it('strips letters and disallowed punctuation while keeping digits, +, spaces, and dashes', () => {
      expect(cleanPhoneInput('abc0917xyz 123-4567')).toBe('0917 123-4567');
      expect(cleanPhoneInput('+63 (917) 123-4567')).toBe('+63 917 123-4567');
      expect(cleanPhoneInput('0917.123.4567')).toBe('09171234567');
      expect(cleanPhoneInput('')).toBe('');
      expect(cleanPhoneInput(null)).toBe('');
    });
  });

  describe('normalizePhilippinePhone', () => {
    it('normalizes standard 11-digit local format (09XXXXXXXXX)', () => {
      const res = normalizePhilippinePhone('09171234567');
      expect(res.isValid).toBe(true);
      expect(res.local).toBe('09171234567');
      expect(res.intl).toBe('639171234567');
      expect(res.e164).toBe('+639171234567');
      expect(res.display).toBe('0917 123 4567');
    });

    it('normalizes local numbers with spaces or dashes', () => {
      const spaced = normalizePhilippinePhone('0917 123 4567');
      expect(spaced.isValid).toBe(true);
      expect(spaced.local).toBe('09171234567');
      expect(spaced.intl).toBe('639171234567');

      const dashed = normalizePhilippinePhone('0917-123-4567');
      expect(dashed.isValid).toBe(true);
      expect(dashed.local).toBe('09171234567');
      expect(dashed.intl).toBe('639171234567');
    });

    it('normalizes international format with + (+63 9XXXXXXXXX)', () => {
      const res = normalizePhilippinePhone('+639171234567');
      expect(res.isValid).toBe(true);
      expect(res.local).toBe('09171234567');
      expect(res.intl).toBe('639171234567');

      const spaced = normalizePhilippinePhone('+63 917 123 4567');
      expect(spaced.isValid).toBe(true);
      expect(spaced.local).toBe('09171234567');
    });

    it('normalizes international format without + (639XXXXXXXXX)', () => {
      const res = normalizePhilippinePhone('639171234567');
      expect(res.isValid).toBe(true);
      expect(res.local).toBe('09171234567');
      expect(res.intl).toBe('639171234567');
    });

    it('normalizes 10-digit format without leading 0 (9XXXXXXXXX)', () => {
      const res = normalizePhilippinePhone('9171234567');
      expect(res.isValid).toBe(true);
      expect(res.local).toBe('09171234567');
      expect(res.intl).toBe('639171234567');

      const spaced = normalizePhilippinePhone('917 123 4567');
      expect(spaced.isValid).toBe(true);
      expect(spaced.local).toBe('09171234567');
    });

    it('rejects invalid, short, or wrong-prefix phone numbers', () => {
      expect(normalizePhilippinePhone('12345').isValid).toBe(false);
      expect(normalizePhilippinePhone('08171234567').isValid).toBe(false); // 08 prefix is invalid for PH mobile
      expect(normalizePhilippinePhone('09171234567890').isValid).toBe(false); // Too long
      expect(normalizePhilippinePhone('').isValid).toBe(false);
      expect(normalizePhilippinePhone(null).isValid).toBe(false);
    });
  });

  describe('formatPhoneDisplay', () => {
    it('formats raw digits to clean 09XX XXX XXXX representation', () => {
      expect(formatPhoneDisplay('+639171234567')).toBe('0917 123 4567');
      expect(formatPhoneDisplay('9171234567')).toBe('0917 123 4567');
      expect(formatPhoneDisplay('09171234567')).toBe('0917 123 4567');
    });
  });
});
