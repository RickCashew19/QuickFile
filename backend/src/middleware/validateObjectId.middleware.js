/**
 * Middleware to strictly validate route parameter as a 24-character hexadecimal ObjectId.
 * Returns 400 Bad Request without echoing raw input values.
 */
function validateObjectIdParam(paramName = 'id') {
  return (req, res, next) => {
    const val = req.params[paramName];
    if (!val || typeof val !== 'string' || !/^[0-9a-fA-F]{24}$/.test(val)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID parameter. Must be a 24-character hexadecimal ObjectId.',
        data: null,
      });
    }
    next();
  };
}

module.exports = {
  validateObjectIdParam,
};

