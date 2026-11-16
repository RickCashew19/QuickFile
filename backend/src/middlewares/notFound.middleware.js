/**
 * 404 Not Found Middleware
 * Returns consistent JSON response for unmapped endpoints
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
    data: null,
  });
}

module.exports = {
  notFoundHandler,
};

