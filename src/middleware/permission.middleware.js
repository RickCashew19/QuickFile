const { getDatabase } = require('../config/db');

function requirePermission(permissionColumn) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Administrators always have full system access
    if (req.user.role === 'admin') {
      return next();
    }

    // Only staff roles are subject to staff permissions check
    if (req.user.role === 'staff') {
      const db = getDatabase();
      const perms = db.prepare('SELECT * FROM staff_permissions WHERE user_id = ?').get(req.user.id);

      if (!perms || perms[permissionColumn] !== 1) {
        if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Missing required permission: [${permissionColumn}].`
          });
        }
        return res.status(403).render('layouts/error', {
          title: 'Permission Denied',
          message: `Your staff account lacks permission [${permissionColumn}] to perform this action.`
        });
      }

      req.staffPermissions = perms;
      return next();
    }

    // Non-staff, non-admin denied
    return res.status(403).json({ success: false, message: 'Access denied.' });
  };
}

module.exports = {
  requirePermission
};
