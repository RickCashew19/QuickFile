/**
 * Profile-completeness requirements for document requests.
 *
 * A document only requires the profile values its active template actually
 * prints. Custom templates declare these via `placeholders_found`; the built-in
 * layout always renders the resident's address lines, so it has a fixed set.
 *
 * This helper is the single source of truth used by both the catalog preview
 * (to show citizens which fields are missing) and the request creation/update
 * gate (to block requests server-side). Sensitive profile fields (phone, valid
 * ID, voter status) are deliberately never included.
 */
const { CitizenProfile, DocumentTemplate } = require('../models');

// Placeholder -> profile field needed to fill it, plus a friendly label for users.
const CITIZEN_FIELD_REQUIREMENTS = Object.freeze({
  age: { field: 'birthdate', label: 'Age' },
  birthdate_long: { field: 'birthdate', label: 'Birthdate' },
  address: { field: 'street_address', label: 'Address' },
  purok_zone: { field: 'purok_zone', label: 'Purok / Zone' },
  gender: { field: 'gender', label: 'Gender' },
  occupation: { field: 'occupation', label: 'Occupation' },
});

// Placeholders that are always fillable: names are required at registration,
// civil_status defaults to 'single', and jurisdiction values fall back to config.
const ALWAYS_FILLABLE_PLACEHOLDERS = Object.freeze([
  'full_name',
  'full_name_upper',
  'first_name',
  'middle_name',
  'last_name',
  'suffix',
  'civil_status',
  'barangay',
  'city',
  'province',
]);

// The built-in web certificate always prints these two lines.
const BUILTIN_REQUIRED_FIELDS = Object.freeze([
  { field: 'street_address', label: 'Address' },
  { field: 'purok_zone', label: 'Purok / Zone' },
]);

function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim() !== '';
}

/**
 * Derives required profile fields for one document type from its active template.
 * @param {object} docType - DocumentType document/lean object
 * @param {object|null} activeTemplate - the active DocumentTemplate (lean), if any
 * @returns {Array<{field: string, label: string}>} unique required fields
 */
function deriveRequiredFields(docType, activeTemplate = null) {
  if (docType && docType.template_mode === 'custom' && activeTemplate) {
    const found = Array.isArray(activeTemplate.placeholders_found)
      ? activeTemplate.placeholders_found
      : [];
    const byField = new Map();
    for (const placeholder of found) {
      // Loop/expression tags are rejected at upload, so only plain keys occur here.
      const requirement = CITIZEN_FIELD_REQUIREMENTS[placeholder];
      if (requirement) byField.set(requirement.field, requirement);
    }
    if (byField.size > 0) return Array.from(byField.values());
    // A custom template using only names / server-generated values needs no profile data.
    return [];
  }

  // Builtin mode (or custom mode without a valid active template): the built-in
  // layout always renders the address lines.
  return BUILTIN_REQUIRED_FIELDS.map((item) => ({ ...item }));
}

/**
 * Batch-loads active templates for a list of document types (one query instead
 * of one per type) and returns a Map keyed by document type id.
 */
async function loadActiveTemplates(documentTypes) {
  const ids = documentTypes
    .filter((dt) => dt.template_mode === 'custom' && dt.active_template_id)
    .map((dt) => dt.active_template_id.toString());
  if (ids.length === 0) return new Map();

  const templates = await DocumentTemplate.find({ _id: { $in: ids } }).lean();
  const byType = new Map();
  for (const template of templates) {
    // A template belongs to exactly one document type; key by its owner so the
    // caller can look it up from the DocumentType.
    byType.set(template.document_type_id.toString(), template);
  }
  return byType;
}

/**
 * Convenience: required fields for a single document type (one template query).
 */
async function getRequiredFieldsForDocType(docType) {
  let template = null;
  if (docType && docType.template_mode === 'custom' && docType.active_template_id) {
    template = await DocumentTemplate.findById(docType.active_template_id).lean();
  }
  return deriveRequiredFields(docType, template);
}

/**
 * Returns the subset of required fields that are empty in the profile.
 * @param {object|null} profile - CitizenProfile document/lean object
 * @param {Array<{field: string, label: string}>} requiredFields
 * @returns {Array<{key: string, label: string}>}
 */
function getMissingProfileFields(profile, requiredFields) {
  const missing = [];
  for (const requirement of requiredFields) {
    const value = profile ? profile[requirement.field] : null;
    if (!isPresent(value)) {
      missing.push({ key: requirement.field, label: requirement.label });
    }
  }
  return missing;
}

/**
 * Convenience: missing fields for a single document type and citizen.
 */
async function getMissingFieldsForDocType(docType, citizenUserId) {
  const required = await getRequiredFieldsForDocType(docType);
  if (required.length === 0) return [];
  const profile = await CitizenProfile.findOne({ user_id: citizenUserId }).lean();
  return getMissingProfileFields(profile, required);
}

/**
 * Builds the standard 409 error used to block a request with incomplete data.
 */
function missingFieldsError(missingFields) {
  const error = new Error(
    `Your profile is missing information required for this document: ${missingFields
      .map((f) => f.label)
      .join(', ')}. Please update your profile and try again.`
  );
  error.statusCode = 409;
  error.code = 'MISSING_PROFILE_FIELDS';
  error.data = { missing_fields: missingFields };
  return error;
}

module.exports = {
  CITIZEN_FIELD_REQUIREMENTS,
  ALWAYS_FILLABLE_PLACEHOLDERS,
  BUILTIN_REQUIRED_FIELDS,
  deriveRequiredFields,
  loadActiveTemplates,
  getRequiredFieldsForDocType,
  getMissingProfileFields,
  getMissingFieldsForDocType,
  missingFieldsError,
};
