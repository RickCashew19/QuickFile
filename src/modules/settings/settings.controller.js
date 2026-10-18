const SettingsService = require('./settings.service');

class SettingsController {
  // GET: Admin App Settings Page
  static renderSettings(req, res) {
    const settings = SettingsService.getIntegrationSettings();
    res.render('admin/settings', {
      title: 'App Settings & Pluggable Integrations - QuickFile',
      admin: req.user,
      settings,
      success: req.query.success || null,
      error: req.query.error || null
    });
  }

  // POST: Update App Settings
  static handleUpdateSettings(req, res) {
    try {
      const updated = SettingsService.updateIntegrationSettings(req.user, req.body);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: 'App integration settings updated successfully!',
          settings: updated
        });
      }

      res.redirect('/admin/settings?success=' + encodeURIComponent('App settings updated successfully! Integrations are now configured.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/settings?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: JSON API endpoint
  static apiGetSettings(req, res) {
    const settings = SettingsService.getIntegrationSettings();
    res.json({
      success: true,
      settings
    });
  }
}

module.exports = SettingsController;

