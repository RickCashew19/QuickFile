import { describe, it, expect } from 'vitest';
import {
  validateRequestForm,
  validateProfileForm,
  validateAttachments,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '../utils/validators';

describe('Citizen Validation Suite', () => {
  describe('validateRequestForm', () => {
    it('validates required fields successfully', () => {
      const result = validateRequestForm({
        document_type_id: 'doc_123',
        purpose: 'Employment application',
        copies: 2,
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('flags missing document type and purpose', () => {
      const result = validateRequestForm({
        document_type_id: '',
        purpose: '',
        copies: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.document_type_id).toBeDefined();
      expect(result.errors.purpose).toBeDefined();
    });

    it('enforces purpose length limit of 500 characters', () => {
      const longPurpose = 'A'.repeat(501);
      const result = validateRequestForm({
        document_type_id: 'doc_123',
        purpose: longPurpose,
        copies: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.purpose).toContain('cannot exceed 500 characters');
    });

    it('enforces copies between 1 and 10', () => {
      expect(
        validateRequestForm({ document_type_id: 'doc_1', purpose: 'test', copies: 0 }).isValid
      ).toBe(false);
      expect(
        validateRequestForm({ document_type_id: 'doc_1', purpose: 'test', copies: 11 }).isValid
      ).toBe(false);
      expect(
        validateRequestForm({ document_type_id: 'doc_1', purpose: 'test', copies: 5 }).isValid
      ).toBe(true);
    });
  });

  describe('validateProfileForm', () => {
    it('validates a complete citizen profile', () => {
      const result = validateProfileForm({
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        birthdate: '1990-05-12',
        gender: 'male',
      });
      expect(result.isValid).toBe(true);
    });

    it('flags missing first/last name, invalid birthdate, or invalid gender', () => {
      const result = validateProfileForm({
        first_name: '',
        last_name: '',
        birthdate: 'invalid-date',
        gender: 'unknown_option',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.first_name).toBeDefined();
      expect(result.errors.last_name).toBeDefined();
      expect(result.errors.birthdate).toBeDefined();
      expect(result.errors.gender).toBeDefined();
    });

    it('rejects future birthdates', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 2);

      const result = validateProfileForm({
        first_name: 'Maria',
        last_name: 'Clara',
        birthdate: future.toISOString(),
        gender: 'female',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.birthdate).toContain('cannot be in the future');
    });
  });

  describe('validateAttachments', () => {
    it('accepts valid PDF and image files within limits', () => {
      const validFiles = [
        new File(['fake pdf content'], 'test.pdf', { type: 'application/pdf' }),
        new File(['fake img content'], 'id.png', { type: 'image/png' }),
      ];

      const result = validateAttachments(validFiles, []);
      expect(result.isValid).toBe(true);
      expect(result.validFiles.length).toBe(2);
      expect(result.errors.length).toBe(0);
    });

    it('rejects files exceeding 5MB limit', () => {
      const oversized = new File(['a'], 'giant.pdf', { type: 'application/pdf' });
      Object.defineProperty(oversized, 'size', { value: MAX_ATTACHMENT_SIZE_BYTES + 100 });

      const result = validateAttachments([oversized], []);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('exceeds the maximum allowable file size');
    });

    it('rejects unsupported MIME types', () => {
      const badFile = new File(['exe'], 'virus.exe', { type: 'application/x-msdownload' });
      const result = validateAttachments([badFile], []);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('unsupported format');
    });

    it('enforces total attachment cap of 3 files', () => {
      const existing = [
        new File(['1'], 'f1.pdf', { type: 'application/pdf' }),
        new File(['2'], 'f2.pdf', { type: 'application/pdf' }),
      ];
      const incoming = [
        new File(['3'], 'f3.pdf', { type: 'application/pdf' }),
        new File(['4'], 'f4.pdf', { type: 'application/pdf' }),
      ];

      const result = validateAttachments(incoming, existing);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('at most 3 attachments');
    });
  });
});
