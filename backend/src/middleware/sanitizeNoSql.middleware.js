/**
 * NoSQL Injection Protection Middleware
 * Recursively scans request body, query parameters, and URL params.
 * Strictly rejects any object key starting with "$" (MongoDB operators) or containing "." (path traversal in keys).
 */

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

  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
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
      message: 'Invalid input: Object keys starting with "$" or containing "." are strictly prohibited.',
      data: null,
    });
  }
  next();
}

module.exports = {
  sanitizeNoSql,
  hasInvalidNoSqlKeys,
};
