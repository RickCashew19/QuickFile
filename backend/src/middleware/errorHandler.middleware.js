/**
 * Central Error Handler Middleware
 * Never includes stack traces in JSON responses.
 * Formats Mongoose, JWT, Multer, and application errors consistently.
 */
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

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
      message = 'Uploaded file exceeds the maximum allowed size (5MB).';
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
    console.error(`[Error] ${req.method} ${req.originalUrl} (${statusCode}):`, err);
    message = 'Internal Server Error. Please contact the administrator.';
  } else {
    console.warn(`[Warn] ${req.method} ${req.originalUrl} (${statusCode}): ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    data: null,
  });
}

module.exports = {
  errorHandler,
};

