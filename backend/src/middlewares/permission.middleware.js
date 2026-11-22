const { StaffPermission } = require('../models');
const { ROLES } = require('../config/constants');

/**
 * Granular Staff Permission Middleware
 * Admin always bypasses specific permission checks.
 * Staff members are evaluated against their assigned StaffPermission document.
 * 
 * @param {string} permissionKey - e.g. 'can_review_requests', 'can_approve_requests'
 */
function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized. Authentication required.',
        });
      }

      // Administrators have full privileges across all operations
      if (req.user.role === ROLES.ADMIN) {
        return next();
      }

      // For staff members, check granular permissions in StaffPermission
      if (req.user.role === ROLES.STAFF) {
        const perms = await StaffPermission.findOne({ user_id: req.user._id });

        if (!perms || !perms[permissionKey]) {
          return res.status(403).json({
            success: false,
            message: `Forbidden. You lack the required permission (${permissionKey}) to perform this action.`,
          });
        }

        return next();
      }

      // Citizens cannot access staff-guarded operations
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Insufficient privileges.',
      });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Passes if the user holds ANY of the supplied permission keys. Admins always
 * pass. Used for actions (e.g. verifying voter status) that can be performed by
 * staff in more than one role/function.
 */
function requireAnyPermission(permissionKeys) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized. Authentication required.',
        });
      }

      if (req.user.role === ROLES.ADMIN) {
        return next();
      }

      if (req.user.role === ROLES.STAFF) {
        const perms = await StaffPermission.findOne({ user_id: req.user._id });
        if (perms && keys.some((key) => perms[key])) {
          return next();
        }
        return res.status(403).json({
          success: false,
          message: `Forbidden. You lack one of the required permissions (${keys.join(', ')}).`,
        });
      }

      return res.status(403).json({
        success: false,
        message: 'Forbidden. Insufficient privileges.',
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requirePermission,
  requireAnyPermission,
};

