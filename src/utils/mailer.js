const nodemailer = require('nodemailer');
const config = require('../config');

class Mailer {
  /**
   * Create nodemailer transporter dynamically using active configuration or override
   * @param {object} [overrideConfig]
   */
  static getTransporter(overrideConfig = null) {
    const SettingsService = require('../modules/settings/settings.service');
    const activeSmtp = overrideConfig || SettingsService.getActiveSmtpConfig();

    return nodemailer.createTransport({
      host: activeSmtp.host,
      port: activeSmtp.port,
      secure: activeSmtp.secure,
      auth: {
        user: activeSmtp.user,
        pass: (activeSmtp.pass || '').replace(/\s+/g, '')
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Verify SMTP credentials connection (dynamically against active or specified config)
   * @param {object} [overrideConfig]
   * @returns {Promise<{success: boolean, message?: string, error?: string, source?: string}>}
   */
  static async verifyConnection(overrideConfig = null) {
    try {
      const SettingsService = require('../modules/settings/settings.service');
      const activeSmtp = overrideConfig || SettingsService.getActiveSmtpConfig();
      const transporter = this.getTransporter(activeSmtp);
      await transporter.verify();
      return { 
        success: true, 
        message: `SMTP connection established and verified successfully (${activeSmtp.source.toUpperCase()} API).`,
        source: activeSmtp.source
      };
    } catch (err) {
      console.error('[SMTP Verify Error]', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generic send email method using dynamic active configuration
   * @param {object} emailOptions
   * @param {object} [overrideConfig]
   */
  static async sendMail({ to, subject, html, text }, overrideConfig = null) {
    try {
      const SettingsService = require('../modules/settings/settings.service');
      if (!SettingsService.isFeatureEnabled('email_smtp_enabled')) {
        console.log(`[SMTP Mailer Disabled] Email to <${to}> skipped because email_smtp_enabled is off.`);
        return { success: false, skipped: true, message: 'SMTP email is currently disabled in App Settings.' };
      }

      const activeSmtp = overrideConfig || SettingsService.getActiveSmtpConfig();

      if (!activeSmtp.user || !activeSmtp.pass) {
        console.warn(`[SMTP Mailer Notice] SMTP credentials missing in active configuration (${activeSmtp.source}).`);
        return { success: false, skipped: true, message: `SMTP credentials not configured in ${activeSmtp.source} configuration.` };
      }

      const transporter = this.getTransporter(activeSmtp);
      const senderHeader = activeSmtp.from || `"QuickFile Barangay Central" <${activeSmtp.user}>`;

      const info = await transporter.sendMail({
        from: senderHeader,
        to,
        subject,
        text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        html
      });

      console.log(`[SMTP Email Dispatched] MessageId: ${info.messageId} -> To: <${to}> | Subject: "${subject}" (via ${activeSmtp.source.toUpperCase()} API: ${activeSmtp.user})`);
      return { success: true, messageId: info.messageId, source: activeSmtp.source };
    } catch (err) {
      console.error(`[SMTP Mailer Error] Failed sending to <${to}>:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send Password Recovery Email
   */
  static async sendPasswordResetEmail(toEmail, resetUrl, recipientName = 'Resident') {
    const fullResetUrl = resetUrl.startsWith('http') 
      ? resetUrl 
      : `http://localhost:${config.port}${resetUrl}`;

    const SettingsService = require('../modules/settings/settings.service');
    const activeSmtp = SettingsService.getActiveSmtpConfig();
    const senderEmail = activeSmtp.user || 'quickfile.notification@gmail.com';

    const subject = 'QuickFile: Password Reset Request';
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background-color: #1e3a8a; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">QuickFile</h1>
          <p style="margin: 4px 0 0; font-size: 13px; color: #93c5fd; text-transform: uppercase; letter-spacing: 1px;">Barangay Central Document Management</p>
        </div>
        
        <div style="padding: 32px 28px; color: #334155; line-height: 1.6;">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Password Reset Request</h2>
          <p style="font-size: 15px; margin-bottom: 20px;">
            Hello <strong>${recipientName}</strong>,
          </p>
          <p style="font-size: 15px; margin-bottom: 24px;">
            We received a request to reset the password for your QuickFile account. Click the button below to establish a new password for your resident portal:
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${fullResetUrl}" style="background-color: #1e3a8a; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.25);">
              Reset My Password
            </a>
          </div>

          <p style="font-size: 13px; color: #64748b; margin-top: 24px; margin-bottom: 8px;">
            Button not working? Copy and paste this URL into your browser:
          </p>
          <p style="font-size: 12px; color: #0284c7; word-break: break-all; background-color: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
            <a href="${fullResetUrl}" style="color: #0284c7; text-decoration: none;">${fullResetUrl}</a>
          </p>

          <div style="border-left: 4px solid #f59e0b; background-color: #fef3c7; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 13px; color: #92400e;">
              <strong>Security Note:</strong> This password reset link is valid for <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email; your account remains secure.
            </p>
          </div>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
          <p style="margin: 0;">QuickFile &bull; Automated Barangay Public Service System</p>
          <p style="margin: 4px 0 0;">This is an automated system dispatch from ${senderEmail}.</p>
        </div>
      </div>
    `;

    return this.sendMail({
      to: toEmail,
      subject,
      html
    });
  }

  /**
   * Send Document Status Notification Email
   */
  static async sendNotificationEmail(toEmail, title, message, link = null, recipientName = 'Resident') {
    const fullActionUrl = link 
      ? (link.startsWith('http') ? link : `http://localhost:${config.port}${link}`)
      : null;

    const SettingsService = require('../modules/settings/settings.service');
    const activeSmtp = SettingsService.getActiveSmtpConfig();
    const senderEmail = activeSmtp.user || 'quickfile.notification@gmail.com';

    const subject = `QuickFile: ${title}`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background-color: #1e3a8a; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">QuickFile</h1>
          <p style="margin: 4px 0 0; font-size: 13px; color: #93c5fd; text-transform: uppercase; letter-spacing: 1px;">Barangay Document Update</p>
        </div>

        <div style="padding: 32px 28px; color: #334155; line-height: 1.6;">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">${title}</h2>
          <p style="font-size: 15px; margin-bottom: 16px;">
            Hello <strong>${recipientName}</strong>,
          </p>
          
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #166534; line-height: 1.5;">
              ${message}
            </p>
          </div>

          ${fullActionUrl ? `
            <div style="text-align: center; margin: 28px 0 16px;">
              <a href="${fullActionUrl}" style="background-color: #1e3a8a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-weight: 600; font-size: 14px; display: inline-block;">
                View Request in Portal
              </a>
            </div>
          ` : ''}

          <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
            You can also track your requests anytime by logging into the QuickFile citizen portal.
          </p>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
          <p style="margin: 0;">QuickFile &bull; Automated Barangay Public Service System</p>
          <p style="margin: 4px 0 0;">This is an automated system dispatch from ${senderEmail}.</p>
        </div>
      </div>
    `;

    return this.sendMail({
      to: toEmail,
      subject,
      html
    });
  }
}

module.exports = Mailer;
