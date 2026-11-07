/**
 * 404 Not Found Middleware
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Central Error Handler Middleware
 * Guarantees every error returns JSON: { success: false, message, errors }
 * Never renders HTML, never leaks stack traces in production.
 */
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // Handle Mongoose Validation Error (e.g. required fields, enum mismatch)
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed. Please verify your input.';
    errors = {};
    for (const field of Object.keys(err.errors)) {
      errors[field] = err.errors[field].message;
    }
  }

  // Handle Mongoose CastError (e.g. invalid MongoDB ObjectId format)
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
    } else {
      message = `File upload error: ${err.message}`;
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
