const SettingsService = require('./settings.service');

class SettingsController {
  // GET: Admin App Settings Page
  static renderSettings(req, res) {
    const settings = SettingsService.getIntegrationSettings();
    res.render('admin/settings', {
      title: 'App Settings & Dual-Tier API Management - QuickFile',
      admin: req.user,
      settings,
      success: req.query.success || null,
      error: req.query.error || null
    });
  }

  // POST: Update App Settings & Dual-Tier API Credentials
  static handleUpdateSettings(req, res) {
    try {
      const updated = SettingsService.updateIntegrationSettings(req.user, req.body);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: 'App integration & API settings updated successfully!',
          settings: updated
        });
      }

      res.redirect('/admin/settings?success=' + encodeURIComponent('App settings updated successfully! Active API configurations applied immediately.'));
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

  // POST: Send Live Test Email via Configured SMTP (Active, Default, or Custom)
  static async handleTestEmail(req, res) {
    try {
      const Mailer = require('../../utils/mailer');
      const targetEmail = req.body.testEmail || req.user?.email || 'quickfile.notification@gmail.com';

      let configOverride = null;
      if (req.body.testSource === 'default') {
        const config = require('../../config');
        configOverride = { ...config.defaultSmtp, source: 'default' };
      } else if (req.body.testSource === 'custom' && req.body.custom_smtp_host && req.body.custom_smtp_user) {
        configOverride = {
          host: req.body.custom_smtp_host,
          port: parseInt(req.body.custom_smtp_port || '465', 10),
          secure: req.body.custom_smtp_secure === 'true' || req.body.custom_smtp_secure === '1',
          user: req.body.custom_smtp_user,
          pass: (req.body.custom_smtp_pass || '').replace(/\s+/g, ''),
          from: req.body.custom_smtp_from || `"QuickFile Barangay Central" <${req.body.custom_smtp_user}>`,
          source: 'custom'
        };
      }

      const activeSmtp = configOverride || SettingsService.getActiveSmtpConfig();

      const result = await Mailer.sendMail({
        to: targetEmail,
        subject: `QuickFile: SMTP Test Verification (${activeSmtp.source.toUpperCase()} API)`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #1e3a8a; margin-top: 0;">QuickFile SMTP Verification</h2>
            <p style="font-size: 15px; color: #334155;">Congratulations! Your SMTP integration is working successfully.</p>
            <p style="font-size: 13px; color: #64748b;"><strong>Active Source:</strong> ${activeSmtp.source.toUpperCase()} Configuration</p>
            <p style="font-size: 13px; color: #64748b;"><strong>Configured Sender:</strong> ${activeSmtp.user}</p>
            <p style="font-size: 13px; color: #64748b;"><strong>SMTP Host:</strong> ${activeSmtp.host}:${activeSmtp.port}</p>
            <p style="font-size: 13px; color: #64748b;"><strong>Time Dispatched:</strong> ${new Date().toLocaleString()}</p>
          </div>
        `
      }, configOverride);

      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to dispatch test email.');
      }

      const msg = `Live test email successfully delivered to ${targetEmail} via ${activeSmtp.source.toUpperCase()} SMTP!`;
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: msg, source: activeSmtp.source });
      }
      res.redirect('/admin/settings?success=' + encodeURIComponent(msg));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/settings?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Verify SMTP Connection without sending email
  static async handleTestSmtpConnection(req, res) {
    try {
      const Mailer = require('../../utils/mailer');
      let configOverride = null;

      if (req.body.host && req.body.user) {
        configOverride = {
          host: req.body.host,
          port: parseInt(req.body.port || '465', 10),
          secure: req.body.secure === 'true' || req.body.secure === '1' || req.body.secure === true,
          user: req.body.user,
          pass: (req.body.pass || '').replace(/\s+/g, ''),
          source: req.body.source || 'custom'
        };
      }

      const result = await Mailer.verifyConnection(configOverride);
      if (!result.success) {
        return res.status(400).json({ success: false, message: result.error || 'Connection verification failed.' });
      }

      return res.json({
        success: true,
        message: result.message || 'SMTP connection verified successfully!'
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // POST: Check SMS Gateway Balance and Status
  static async handleCheckSmsBalance(req, res) {
    try {
      const SmsSender = require('../../utils/sms');
      let configOverride = null;

      if (req.body.source === 'custom' && req.body.apiKey) {
        configOverride = {
          provider: req.body.provider || 'PhilSMS',
          apiEndpoint: req.body.apiEndpoint || 'https://dashboard.philsms.com/api/v3/',
          apiKey: req.body.apiKey.trim(),
          senderId: req.body.senderId || 'PhilSMS',
          source: 'custom'
        };
      }

      const result = await SmsSender.checkBalance(configOverride);
      if (!result.success) {
        return res.status(400).json({ success: false, message: result.error || 'Failed to verify SMS Gateway status.' });
      }

      return res.json(result);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // POST: Send Test SMS
  static async handleTestSms(req, res) {
    try {
      const SmsSender = require('../../utils/sms');
      const targetPhone = req.body.phone || req.user?.phone || '09170000001';
      let configOverride = null;

      if (req.body.source === 'custom' && req.body.apiKey) {
        configOverride = {
          provider: req.body.provider || 'PhilSMS',
          apiEndpoint: req.body.apiEndpoint || 'https://dashboard.philsms.com/api/v3/',
          apiKey: req.body.apiKey.trim(),
          senderId: req.body.senderId || 'PhilSMS',
          source: 'custom'
        };
      }

      const result = await SmsSender.sendSms({
        to: targetPhone,
        message: 'QuickFile: SMS Gateway test dispatch from Barangay Central.'
      }, configOverride);

      if (!result.success && !result.skipped) {
        return res.status(400).json({ success: false, message: result.error || 'Failed to dispatch test SMS.' });
      }

      return res.json({
        success: true,
        message: `Test SMS request dispatched to ${targetPhone} via ${result.provider} (${result.source.toUpperCase()})!`
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
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
