/**
 * Higher-order function that catches rejected promises and passes them to Express next()
 * Eliminates repetitive try-catch boilerplate in route handlers and controllers
 * 
 * @param {Function} fn - Async controller function (req, res, next)
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
