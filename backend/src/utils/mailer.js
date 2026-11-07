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
 * Bypasses gracefully when email notifications are disabled in settings
 */
async function sendMail({ to, subject, html, text }) {
  // 1. Check if email notifications are enabled in system settings
  const setting = await AppSetting.findOne({ key: 'enable_email_notifications' });
  const isEnabled = setting && (setting.value === true || setting.value === 'true');

  if (!isEnabled) {
    return {
      success: true,
      bypassed: true,
      message: 'Email notifications are currently disabled in settings.',
    };
  }

  // 2. Resolve transporter (injected mock transport or live SMTP transporter)
  const transporter = customTransport || createTransporter();

  // 3. Resolve sender info and send email
  const fromName = config.smtp.resolveFromName().value || 'QuickFile';
  const fromEmail = config.smtp.resolveFromEmail().value || 'no-reply@quickfile.gov.ph';

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text: text || (html ? html.replace(/<[^>]*>?/gm, '') : ''),
    html,
  });

  return {
    success: true,
    messageId: info ? info.messageId : undefined,
  };
}

module.exports = {
  sendMail,
  createTransporter,
  setMailTransport,
  getMailTransport,
};
