function requireRole(allowedRoles = []) {
  if (typeof allowedRoles === 'string') {
    allowedRoles = [allowedRoles];
  }

  return (req, res, next) => {
    if (!req.user) {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      return res.redirect('/');
    }

    if (!allowedRoles.includes(req.user.role)) {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`
        });
      }
      return res.status(403).render('layouts/error', {
        title: 'Access Denied',
        message: `Forbidden: You do not have permission to access this resource.`
      });
    }

    next();
  };
}

module.exports = {
  requireRole
};
