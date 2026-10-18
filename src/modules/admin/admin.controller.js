const AdminService = require('./admin.service');

class AdminController {
  // GET: Admin Login Page (ADM-IAM-01)
  static renderLogin(req, res) {
    res.render('admin/login', {
      title: 'Barangay Administrator Login - QuickFile',
      error: req.query.error || null,
      success: req.query.success || null
    });
  }

  // POST: Admin Login Handler (ADM-IAM-01)
  static async handleLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await AdminService.login(email, password);

      res.cookie('quickfile_token', result.token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      req.session.user = result.admin;

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Admin login successful', ...result });
      }

      res.redirect('/admin/dashboard');
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('admin/login', {
        title: 'Barangay Administrator Login - QuickFile',
        error: err.message,
        success: null,
        email: req.body.email
      });
    }
  }

  // POST / GET: Admin Logout (ADM-IAM-02)
  static logout(req, res) {
    res.clearCookie('quickfile_token');
    if (req.session) {
      req.session.destroy();
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Admin logged out successfully.' });
    }

    res.redirect('/admin/login?success=' + encodeURIComponent('Administrator logged out successfully.'));
  }

  // GET: Admin Portal Dashboard
  static async renderDashboard(req, res) {
    try {
      const staffList = await AdminService.getAllStaff();
      res.render('admin/dashboard', {
        title: 'Administrator Dashboard - QuickFile',
        admin: req.user,
        staffList,
        totalStaff: staffList.length,
        activeStaff: staffList.filter(s => s.is_active === 1).length,
        deactivatedStaff: staffList.filter(s => s.is_active === 0).length,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/admin/login?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Staff & User Role Management Page (ADM-URM)
  static async renderStaffManagement(req, res) {
    try {
      const staffList = await AdminService.getAllStaff();
      res.render('admin/staff-management', {
        title: 'Staff & Role Management (ADM-URM) - QuickFile',
        admin: req.user,
        staffList,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Create Staff Account (ADM-URM-01)
  static async handleCreateStaff(req, res) {
    try {
      const newStaff = await AdminService.createStaffAccount(req.user, req.body);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(201).json({
          success: true,
          message: 'Staff account created successfully!',
          staff: newStaff
        });
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(`Staff account for ${newStaff.full_name} created successfully.`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Edit Staff Account (ADM-URM-02)
  static async handleUpdateStaff(req, res) {
    try {
      const { staffId } = req.params;
      const updatedStaff = await AdminService.updateStaffAccount(req.user, staffId, req.body);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: 'Staff account updated successfully!',
          staff: updatedStaff
        });
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(`Staff details for ${updatedStaff.full_name} updated successfully.`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Deactivate / Activate Staff Account (ADM-URM-03)
  static async handleToggleStaffStatus(req, res) {
    try {
      const { staffId } = req.params;
      const { isActive } = req.body;
      const result = await AdminService.toggleStaffStatus(req.user, staffId, isActive === 'true' || isActive === true || isActive === 1 || isActive === '1');

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json(result);
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(result.message));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Access Control Management (ADM-URM-04)
  static async handleUpdateAccessControl(req, res) {
    try {
      const { staffId } = req.params;
      const permissions = {
        can_review_requests: req.body.can_review_requests === '1' || req.body.can_review_requests === true || req.body.can_review_requests === 'on',
        can_prepare_documents: req.body.can_prepare_documents === '1' || req.body.can_prepare_documents === true || req.body.can_prepare_documents === 'on',
        can_print_documents: req.body.can_print_documents === '1' || req.body.can_print_documents === true || req.body.can_print_documents === 'on',
        can_release_documents: req.body.can_release_documents === '1' || req.body.can_release_documents === true || req.body.can_release_documents === 'on',
        can_verify_qr: req.body.can_verify_qr === '1' || req.body.can_verify_qr === true || req.body.can_verify_qr === 'on',
        can_view_reports: req.body.can_view_reports === '1' || req.body.can_view_reports === true || req.body.can_view_reports === 'on',
        can_archive_records: req.body.can_archive_records === '1' || req.body.can_archive_records === true || req.body.can_archive_records === 'on'
      };

      const updated = await AdminService.updateStaffAccessControl(req.user, staffId, permissions);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: `Permissions updated for ${updated.full_name}`,
          staff: updated
        });
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(`Access permissions for ${updated.full_name} updated successfully.`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }
}

module.exports = AdminController;

