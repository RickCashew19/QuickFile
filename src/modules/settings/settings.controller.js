const SettingsService = require('./settings.service');
const { testConnection } = require('../../config/supabase');
const SupabaseSyncService = require('../../services/supabaseSync.service');

class SettingsController {
  // GET: Admin App Settings Page
  static async renderSettings(req, res) {
    const settings = SettingsService.getIntegrationSettings();
    const supabaseStatus = await testConnection();

    res.render('admin/settings', {
      title: 'App Settings & Pluggable Integrations - QuickFile',
      admin: req.user,
      settings,
      supabaseStatus,
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

  // POST: Quick Toggle API Enable/Disable
  static toggleApi(req, res) {
    try {
      const isCurrentlyEnabled = SettingsService.isApiEnabled();
      const newStatus = isCurrentlyEnabled ? '0' : '1';

      const updated = SettingsService.updateIntegrationSettings(req.user, {
        ...SettingsService.getIntegrationSettings().raw,
        api_enabled: newStatus
      });

      const message = `REST API service has been successfully ${updated.apiEnabled ? 'ENABLED' : 'DISABLED'}.`;

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message,
          apiEnabled: updated.apiEnabled
        });
      }

      res.redirect('/admin/settings?success=' + encodeURIComponent(message));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/settings?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Send Live Test Email via Configured SMTP
  static async handleTestEmail(req, res) {
    try {
      const Mailer = require('../../utils/mailer');
      const targetEmail = req.body.testEmail || req.user?.email || 'quickfile.notification@gmail.com';

      const result = await Mailer.sendMail({
        to: targetEmail,
        subject: 'QuickFile: SMTP Test Verification Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #1e3a8a; margin-top: 0;">QuickFile SMTP Verification</h2>
            <p style="font-size: 15px; color: #334155;">Congratulations! Your Gmail SMTP integration is working successfully.</p>
            <p style="font-size: 13px; color: #64748b;"><strong>Configured Sender:</strong> quickfile.notification@gmail.com</p>
            <p style="font-size: 13px; color: #64748b;"><strong>Time Dispatched:</strong> ${new Date().toLocaleString()}</p>
          </div>
        `
      });

      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to dispatch test email.');
      }

      const msg = `Live test email successfully delivered to ${targetEmail}!`;
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: msg });
      }
      res.redirect('/admin/settings?success=' + encodeURIComponent(msg));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/settings?error=' + encodeURIComponent(err.message));
    }
  }

  // GET / POST: Test Supabase Cloud Connection
  static async handleTestSupabase(req, res) {
    try {
      const result = await testConnection();

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json(result);
      }

      const msg = result.connected 
        ? result.message 
        : `Supabase Connection Failed: ${result.message}`;
      res.redirect(`/admin/settings?${result.connected ? 'success' : 'error'}=` + encodeURIComponent(msg));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ connected: false, message: err.message });
      }
      res.redirect('/admin/settings?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Sync Local Database Records to Supabase Cloud
  static async handleSyncSupabase(req, res) {
    try {
      const result = await SupabaseSyncService.syncAllToSupabase();

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json(result);
      }

      res.redirect(`/admin/settings?${result.success ? 'success' : 'error'}=` + encodeURIComponent(result.message));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ success: false, message: err.message });
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
