const StaffService = require('./staff.service');

class StaffController {
  // GET: Render staff login page (STF-IAM-01)
  static renderLogin(req, res) {
    res.render('staff/login', {
      title: 'Barangay Staff Login - QuickFile',
      error: req.query.error || null,
      success: req.query.success || null
    });
  }

  // POST: Process staff login (STF-IAM-01)
  static async handleLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await StaffService.login(email, password);

      res.cookie('quickfile_token', result.token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      req.session.user = result.user;
      req.session.permissions = result.permissions;

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Staff login successful', ...result });
      }

      res.redirect('/staff/dashboard');
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('staff/login', {
        title: 'Barangay Staff Login - QuickFile',
        error: err.message,
        success: null,
        email: req.body.email
      });
    }
  }

  // POST / GET: Process staff logout (STF-IAM-02)
  static logout(req, res) {
    res.clearCookie('quickfile_token');
    if (req.session) {
      req.session.destroy();
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Staff logged out successfully.' });
    }

    res.redirect('/staff/login?success=' + encodeURIComponent('Staff logged out successfully.'));
  }

  // GET: Staff Dashboard (overview with permissions)
  static async renderDashboard(req, res) {
    try {
      const { staff, permissions } = await StaffService.getStaffProfile(req.user.id);
      res.render('staff/dashboard', {
        title: 'Barangay Staff Portal - QuickFile',
        staff,
        permissions: permissions || {},
        success: req.query.success || null
      });
    } catch (err) {
      res.redirect('/staff/login?error=' + encodeURIComponent(err.message));
    }
  }
}

module.exports = StaffController;

