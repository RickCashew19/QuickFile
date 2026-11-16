/**
 * NoSQL Injection Protection Middleware
 * Recursively scans request body, query parameters, and URL params.
 * Strictly rejects any object key starting with "$" (MongoDB operators), containing "." (path traversal in keys),
 * or prototype pollution keys (__proto__, constructor, prototype).
 */

const PROTOTYPE_POLLUTION_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

function hasInvalidNoSqlKeys(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (hasInvalidNoSqlKeys(item)) {
        return true;
      }
    }
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(obj, '__proto__')) {
    return true;
  }

  for (const key of Object.getOwnPropertyNames(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      key.startsWith('$') ||
      key.includes('.') ||
      PROTOTYPE_POLLUTION_KEYS.includes(lowerKey)
    ) {
      return true;
    }
    if (hasInvalidNoSqlKeys(obj[key])) {
      return true;
    }
  }

  return false;
}

function sanitizeNoSql(req, res, next) {
  if (
    hasInvalidNoSqlKeys(req.body) ||
    hasInvalidNoSqlKeys(req.query) ||
    hasInvalidNoSqlKeys(req.params)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid input: Object keys starting with "$", containing ".", or prototype properties are strictly prohibited.',
      data: null,
    });
  }
  next();
}

module.exports = {
  sanitizeNoSql,
  hasInvalidNoSqlKeys,
};
