const nodemailer = require('nodemailer');
const { config } = require('../config');
const { AppSetting } = require('../models');

// Pluggable transport for testing / dependency injection without NODE_ENV branching
let customTransport = null;

function setMailTransport(transport) {
  customTransport = transport;
}

function getMailTransport() {
  return customTransport;
}

/**
 * Creates a nodemailer transporter from resolved configuration
 */
function createTransporter() {
  const host = config.smtp.resolveHost().value;
  const port = config.smtp.resolvePort().value;
  const secure = config.smtp.resolveSecure().value;
  const user = config.smtp.resolveUser().value;
  const pass = config.smtp.resolvePass().value;

  return nodemailer.createTransport({
    host: host || 'localhost',
    port: port || 587,
    secure: Boolean(secure),
    auth: user ? { user, pass } : undefined,
  });
}

/**
 * Sends an email notification using SMTP configuration or injected transport
 * Bypasses gracefully when email notifications are disabled in settings (unless isTransactional is true)
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plaintext body
 * @param {boolean} [options.isTransactional=false] - If true, bypasses the enable_email_notifications setting check (e.g. for password resets)
 * @param {Array} [options.attachments] - Optional nodemailer attachments (e.g. a calendar .ics file)
 */
async function sendMail({ to, subject, html, text, isTransactional = false, attachments }) {
  if (!to || !subject) {
    return {
      success: false,
      error: 'Recipient email and subject are required.',
    };
  }

  // 1. Check if email notifications are enabled in system settings (unless transactional)
  if (!isTransactional) {
    const setting = await AppSetting.findOne({ key: 'enable_email_notifications' });
    const isEnabled = setting && (setting.value === true || setting.value === 'true');

    if (!isEnabled) {
      return {
        success: true,
        bypassed: true,
        message: 'Email notifications are currently disabled in settings.',
      };
    }
  }

  // 2. Resolve transporter (injected mock transport or live SMTP transporter)
  const transporter = customTransport || createTransporter();

  // 3. Resolve sender info and strip surrounding quotes
  const rawFromName = config.smtp.resolveFromName().value || 'QuickFile';
  const fromName = rawFromName.replace(/^"|"$/g, '').trim();
  const fromEmail = config.smtp.resolveFromEmail().value || 'quickfile.notification@gmail.com';

  try {
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: text || (html ? html.replace(/<[^>]*>?/gm, '') : ''),
      html,
    };
    // Passed straight through to nodemailer; absent means no change in behavior.
    if (Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info ? info.messageId : undefined,
    };
  } catch (err) {
    console.warn(`[Mailer] Error sending email to ${to}:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  sendMail,
  createTransporter,
  setMailTransport,
  getMailTransport,
};
