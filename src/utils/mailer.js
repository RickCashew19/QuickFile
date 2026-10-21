const nodemailer = require('nodemailer');
const config = require('../config');

class Mailer {
  static getTransporter() {
    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Verify SMTP credentials connection
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  static async verifyConnection() {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return { success: true, message: 'SMTP credentials verified successfully.' };
    } catch (err) {
      console.error('[SMTP Verify Error]', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generic send email method
   */
  static async sendMail({ to, subject, html, text }) {
    try {
      // Dynamic feature toggle check
      const SettingsService = require('../modules/settings/settings.service');
      if (!SettingsService.isFeatureEnabled('email_smtp_enabled')) {
        console.log(`[SMTP Mailer Disabled] Email to <${to}> skipped because email_smtp_enabled is off.`);
        return { success: false, skipped: true, message: 'SMTP email is currently disabled in App Settings.' };
      }

      if (!config.smtp.user || !config.smtp.pass) {
        console.warn(`[SMTP Mailer Notice] SMTP credentials missing in configuration.`);
        return { success: false, skipped: true, message: 'SMTP credentials not configured.' };
      }

      const transporter = this.getTransporter();
      const info = await transporter.sendMail({
        from: config.smtp.from,
        to,
        subject,
        text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        html
      });

      console.log(`[SMTP Email Dispatched] MessageId: ${info.messageId} -> To: <${to}> | Subject: "${subject}"`);
      return { success: true, messageId: info.messageId };
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
          <p style="margin: 4px 0 0;">This is an automated system dispatch from quickfile.notification@gmail.com.</p>
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
          <p style="margin: 4px 0 0;">This is an automated system dispatch from quickfile.notification@gmail.com.</p>
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
