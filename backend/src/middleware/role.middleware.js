/**
 * Role-Based Access Control (RBAC) Middleware
 * @param {string|string[]} roles - Allowed role or array of allowed roles (e.g. ['admin', 'staff'])
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Authentication required before checking role privileges.',
      });
    }

    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. This action requires one of the following roles: [${allowed.join(', ')}].`,
      });
    }

    next();
  };
}

module.exports = {
  requireRole,
};

