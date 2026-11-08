import { formatFileSize } from './formatters';
import { normalizePhilippinePhone } from './phoneUtil';

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ATTACHMENT_COUNT = 3;

/**
 * Validates document request creation / edit form
 */
export function validateRequestForm({ document_type_id, purpose, copies }) {
  const errors = {};

  if (!document_type_id || typeof document_type_id !== 'string') {
    errors.document_type_id = 'Please select a document type.';
  }

  const cleanPurpose = typeof purpose === 'string' ? purpose.trim() : '';
  if (!cleanPurpose) {
    errors.purpose = 'Please provide the specific purpose for this document request.';
  } else if (cleanPurpose.length > 500) {
    errors.purpose = `Purpose cannot exceed 500 characters (currently ${cleanPurpose.length}).`;
  }

  const numCopies = parseInt(copies, 10);
  if (isNaN(numCopies) || numCopies < 1 || numCopies > 10) {
    errors.copies = 'Number of copies must be between 1 and 10.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates citizen profile data
 */
export function validateProfileForm(formData) {
  const errors = {};

  if (!formData.first_name || !String(formData.first_name).trim()) {
    errors.first_name = 'First name is required.';
  }

  if (!formData.last_name || !String(formData.last_name).trim()) {
    errors.last_name = 'Last name is required.';
  }

  if (!formData.birthdate) {
    errors.birthdate = 'Birthdate is required.';
  } else {
    const bday = new Date(formData.birthdate);
    if (isNaN(bday.getTime())) {
      errors.birthdate = 'Please enter a valid birthdate.';
    } else if (bday > new Date()) {
      errors.birthdate = 'Birthdate cannot be in the future.';
    }
  }

  if (!formData.gender || !['male', 'female', 'other'].includes(formData.gender)) {
    errors.gender = 'Please select a valid gender option.';
  }

  if (formData.contact_number && String(formData.contact_number).trim()) {
    const norm = normalizePhilippinePhone(String(formData.contact_number));
    if (!norm.isValid) {
      errors.contact_number = 'Please enter a valid Philippine mobile number (e.g. 0917 123 4567 or +639171234567).';
    }
  }

  if (formData.emergency_contact_number && String(formData.emergency_contact_number).trim()) {
    const norm = normalizePhilippinePhone(String(formData.emergency_contact_number));
    if (!norm.isValid) {
      errors.emergency_contact_number = 'Please enter a valid Philippine mobile number (e.g. 0917 123 4567 or +639171234567).';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates incoming attachment files for upload
 */
export function validateAttachments(incomingFiles, currentFiles = []) {
  const validFiles = [];
  const errors = [];

  const totalCount = currentFiles.length + incomingFiles.length;
  if (totalCount > MAX_ATTACHMENT_COUNT) {
    errors.push(`You can upload at most ${MAX_ATTACHMENT_COUNT} attachments (attempted ${totalCount}).`);
  }

  for (const file of incomingFiles) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      errors.push(`"${file.name}" has an unsupported format. Only JPG, PNG, WEBP, and PDF files are allowed.`);
      continue;
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      errors.push(
        `"${file.name}" exceeds the maximum allowable file size of ${formatFileSize(MAX_ATTACHMENT_SIZE_BYTES)}.`
      );
      continue;
    }

    if (currentFiles.length + validFiles.length < MAX_ATTACHMENT_COUNT) {
      validFiles.push(file);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    validFiles,
  };
}
