/**
 * Central Error Handler Middleware
 * Never includes stack traces in JSON responses.
 * Formats Mongoose, JWT, Multer, and application errors consistently.
 */
const { redactSensitiveUrl } = require('../helpers/urlRedactor');
const { ERROR_CODES, ERROR_CODES_BY_STATUS } = require('../config/constants');

/**
 * Choose a stable machine-readable code. Explicit uppercase codes (e.g.
 * MISSING_PROFILE_FIELDS, LOCKED, TOKEN_EXPIRED) are preserved; Mongoose and
 * framework error classes get a specific code, everything else falls back to
 * the HTTP status. Numeric driver codes such as E11000 are never echoed.
 */
function codeForError(err, statusCode) {
  if (err.code === 11000) return ERROR_CODES.DUPLICATE_KEY;
  if (err.name === 'ValidationError' || err.name === 'CastError') return ERROR_CODES.VALIDATION_ERROR;
  if (err.name === 'VersionError') return ERROR_CODES.VERSION_CONFLICT;
  if (err.name === 'TokenExpiredError') return ERROR_CODES.TOKEN_EXPIRED;
  if (err.name === 'JsonWebTokenError') return ERROR_CODES.TOKEN_INVALID;
  if (err.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? ERROR_CODES.UPLOAD_TOO_LARGE
      : ERROR_CODES.UPLOAD_LIMIT_EXCEEDED;
  }
  if (statusCode === 413) return ERROR_CODES.PAYLOAD_TOO_LARGE;
  if (typeof err.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(err.code)) return err.code;
  return (
    ERROR_CODES_BY_STATUS[statusCode] ||
    (statusCode >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST)
  );
}

function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // Handle Mongoose VersionError (Optimistic Concurrency Conflict)
  if (err.name === 'VersionError') {
    statusCode = 409;
    message = 'Conflict: The record was modified by someone else and should be reloaded.';
    try {
      const AuditLog = require('../models/AuditLog');
      AuditLog.create({
        user_id: req.user?._id || req.user?.id || null,
        actor_name: req.user?.full_name || req.user?.name || 'System / Anonymous',
        action: 'VERSION_CONFLICT',
        module: 'CONCURRENCY_CONTROL',
        target_id: req.params?.id || '',
        target_type: 'DocumentRequest',
        details: {
          path: redactSensitiveUrl(req.originalUrl),
          method: req.method,
          error: err.message,
        },
        ip_address: req.ip || '',
        user_agent: typeof req.get === 'function' ? req.get('User-Agent') : '',
      }).catch((e) => {
        console.warn('[AuditLog] Failed to record VERSION_CONFLICT:', e.message);
      });
    } catch (_) {}
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed. Please verify your input.';
    errors = {};
    for (const field of Object.keys(err.errors)) {
      errors[field] = err.errors[field].message;
    }
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId format)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid format for field '${err.path}': ${err.value}`;
  }

  // Handle MongoDB Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const duplicatedKeys = Object.keys(err.keyPattern || {});
    const fieldName = duplicatedKeys.join(', ') || 'field';
    message = `A record with this ${fieldName} already exists.`;
    errors = err.keyValue;
  }

  // Handle JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired.';
  }

  // Handle Multer Upload Errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed size (2MB).';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Uploaded files exceed the maximum allowed count (3 files).';
    } else {
      message = `File upload error: ${err.message}`;
    }
  }

  // Handle Body-Parser Payload Too Large Error (413)
  if (err.type === 'entity.too.large' || statusCode === 413) {
    statusCode = 413;
    message = 'Payload too large. Request body exceeds maximum allowed size of 100kb.';
  }

  // Full stack trace strictly for status 500+; one-line warning for 4xx
  if (statusCode >= 500) {
    console.error(`[Error] ${req.method} ${redactSensitiveUrl(req.originalUrl)} (${statusCode}):`, err);
    message = 'Internal Server Error. Please contact the administrator.';
  } else {
    console.warn(`[Warn] ${req.method} ${redactSensitiveUrl(req.originalUrl)} (${statusCode}): ${message}`);
  }

  // Forward cooldown/retry hints to clients (e.g. OTP resend cooldown).
  if (err.retryAfterSeconds) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Stable machine-readable code for every error, so clients can branch on
    // it instead of string-matching messages.
    code: codeForError(err, statusCode),
    ...(errors && { errors }),
    data: err.data !== undefined ? err.data : (err.lock ? { lock: err.lock } : null),
  });
}

module.exports = {
  errorHandler,
};

