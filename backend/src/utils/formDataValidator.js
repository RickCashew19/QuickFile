/**
 * Validates and safely parses form_data according to strict system invariants:
 * - Must be a plain JSON object (not array, primitive, or class instance)
 * - Maximum serialized length: 10 KB (10240 bytes)
 * - Maximum nesting depth: 3 levels
 * - Keys: alphanumeric and underscore only (/^[A-Za-z0-9_]{1,50}$/)
 * - Values: string (<=500 chars), number (finite), boolean, or null
 */

const KEY_REGEX = /^[A-Za-z0-9_]{1,50}$/;
const MAX_SERIALIZED_BYTES = 10240;
const MAX_NESTING_DEPTH = 3;
const MAX_STRING_LENGTH = 500;

function validateObjectStructure(obj, currentDepth = 1) {
  if (currentDepth > MAX_NESTING_DEPTH) {
    const error = new Error(`form_data nesting exceeds maximum allowed depth of ${MAX_NESTING_DEPTH} levels.`);
    error.statusCode = 400;
    throw error;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (!KEY_REGEX.test(key)) {
      const error = new Error(
        `Invalid key "${key}" in form_data. Keys must be alphanumeric with underscores and 1 to 50 characters long.`
      );
      error.statusCode = 400;
      throw error;
    }

    if (value === null) {
      continue;
    }

    const valType = typeof value;
    if (valType === 'string') {
      if (value.length > MAX_STRING_LENGTH) {
        const error = new Error(`Value for key "${key}" in form_data exceeds maximum length of ${MAX_STRING_LENGTH} characters.`);
        error.statusCode = 400;
        throw error;
      }
    } else if (valType === 'number') {
      if (!Number.isFinite(value)) {
        const error = new Error(`Value for key "${key}" in form_data must be a finite number.`);
        error.statusCode = 400;
        throw error;
      }
    } else if (valType === 'boolean') {
      continue;
    } else if (valType === 'object') {
      if (Array.isArray(value)) {
        const error = new Error(`Array values are not permitted in form_data (key: "${key}").`);
        error.statusCode = 400;
        throw error;
      }
      validateObjectStructure(value, currentDepth + 1);
    } else {
      const error = new Error(`Unsupported value type "${valType}" for key "${key}" in form_data.`);
      error.statusCode = 400;
      throw error;
    }
  }
}

function validateAndParseFormData(rawInput) {
  if (rawInput === undefined || rawInput === null || rawInput === '') {
    return {};
  }

  let parsed = rawInput;
  if (typeof rawInput === 'string') {
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      const error = new Error('Invalid JSON format in form_data.');
      error.statusCode = 400;
      throw error;
    }
  }

  // Must be a plain object (not null, not array, not primitive)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    const error = new Error('form_data must be a plain JSON object.');
    error.statusCode = 400;
    throw error;
  }

  // Check serialized length
  const serialized = JSON.stringify(parsed);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES) {
    const error = new Error(`form_data payload exceeds maximum allowed size of 10 KB.`);
    error.statusCode = 400;
    throw error;
  }

  // Recursively validate key patterns, values, and depth
  validateObjectStructure(parsed, 1);

  return parsed;
}

module.exports = {
  validateAndParseFormData,
};

