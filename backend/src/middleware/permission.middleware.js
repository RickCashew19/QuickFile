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

module.exports = {
  requirePermission,
};
