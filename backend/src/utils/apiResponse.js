/**
 * Standard API Response Utilities
 * Enforces consistent JSON envelope across all endpoints: { success, message, data }
 */

function successResponse(res, statusCode = 200, message = 'Success', data = null) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function errorResponse(res, statusCode = 400, message = 'Error', errors = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    data: null,
  });
}

module.exports = {
  successResponse,
  errorResponse,
};
