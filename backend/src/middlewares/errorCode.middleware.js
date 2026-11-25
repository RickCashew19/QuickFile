const { ERROR_CODES, ERROR_CODES_BY_STATUS } = require('../config/constants');

/**
 * Guarantees that every error envelope carries a stable machine-readable code.
 * Many route handlers write their own 400 responses instead of throwing, so a
 * single res.json wrapper is more reliable than editing each handler.
 * Explicit codes set by handlers or errorHandler are never overwritten.
 */
function withErrorCode(req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && body.success === false && typeof body.code !== 'string') {
      const status = res.statusCode;
      const code =
        ERROR_CODES_BY_STATUS[status] ||
        (status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST);
      return sendJson({ ...body, code });
    }
    return sendJson(body);
  };
  next();
}

module.exports = { withErrorCode };
