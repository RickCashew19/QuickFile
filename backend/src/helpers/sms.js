const { config } = require('../config');
const { AppSetting } = require('../models');
const { normalizePhilippinePhone } = require('./phoneUtil');

// Pluggable transport for testing / dependency injection without NODE_ENV branching
let customSmsSender = null;

function setSmsSender(sender) {
  customSmsSender = sender;
}

function getSmsSender() {
  return customSmsSender;
}

/**
 * Sends an SMS message via PhilSMS Gateway or injected sender
 *
 * @param {Object} options
 * @param {string} options.recipient - Mobile phone number (0917..., +639..., 639...)
 * @param {string} options.message - Text content of the SMS
 * @param {boolean} [options.isTransactional=false] - If true, bypasses enable_sms_notifications check
 * @returns {Promise<{ success: boolean, messageId?: string, bypassed?: boolean, error?: string }>}
 */
async function sendSms({ recipient, message, isTransactional = false }) {
  if (!recipient || !message) {
    return {
      success: false,
      error: 'Recipient phone number and message are required.',
    };
  }

  // 1. Check if SMS notifications are enabled in system settings (unless transactional)
  if (!isTransactional) {
    const setting = await AppSetting.findOne({ key: 'enable_sms_notifications' });
    const isEnabled = setting && (setting.value === true || setting.value === 'true');

    if (!isEnabled) {
      return {
        success: true,
        bypassed: true,
        message: 'SMS notifications are currently disabled in settings.',
      };
    }
  }

  // 2. Validate and normalize Philippine phone number format
  const normalizedPhone = normalizePhilippinePhone(recipient);
  if (!normalizedPhone.isValid) {
    console.warn(`[SMS] Warning: Cannot send SMS to invalid Philippine number "${recipient}"`);
    return {
      success: false,
      error: `Invalid Philippine mobile number: "${recipient}". Expected 11-digit local (09XX) or 12-digit intl (639XX).`,
    };
  }

  // 3. If mock/custom sender is injected, delegate to it
  if (customSmsSender) {
    try {
      return await customSmsSender({
        recipient: normalizedPhone.intl,
        message: message.trim(),
        isTransactional,
      });
    } catch (err) {
      console.warn('[SMS] Custom SMS sender error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // 4. Resolve gateway credentials from config
  const rawGatewayUrl = config.sms.resolveGatewayUrl().value || 'https://dashboard.philsms.com/api/v3/';
  const apiToken = config.sms.resolveApiToken().value;
  const configuredSenderId = config.sms.resolveSenderId().value || 'PhilSMS';

  if (!apiToken) {
    console.warn('[SMS] Warning: PhilSMS API token is not configured in .env. Skipping SMS send.');
    return {
      success: false,
      bypassed: true,
      error: 'PhilSMS API token is not configured.',
    };
  }

  // Ensure gateway URL ends cleanly without duplicate slashes
  const baseUrl = rawGatewayUrl.replace(/\/+$/, '');
  const sendEndpoint = `${baseUrl}/sms/send`;

  // 5. Send POST request to PhilSMS Gateway
  try {
    const payload = {
      recipient: normalizedPhone.intl,
      sender_id: configuredSenderId,
      type: 'plain',
      message: message.trim(),
    };

    const response = await fetch(sendEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || (data && data.status === 'error')) {
      const errMsg = data?.message || `HTTP ${response.status} ${response.statusText}`;
      console.warn(`[SMS] Gateway returned non-success for ${normalizedPhone.display}:`, errMsg);

      // If the error was an unapproved custom sender_id, retry once with default 'PhilSMS'
      if (
        configuredSenderId !== 'PhilSMS' &&
        typeof errMsg === 'string' &&
        errMsg.toLowerCase().includes('sender')
      ) {
        console.log('[SMS] Retrying with default sender_id "PhilSMS"...');
        payload.sender_id = 'PhilSMS';
        const retryRes = await fetch(sendEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const retryData = await retryRes.json().catch(() => null);
        if (retryRes.ok && retryData?.status !== 'error') {
          return {
            success: true,
            messageId: retryData?.data?.uid || 'ok',
          };
        }
      }

      return {
        success: false,
        error: errMsg,
      };
    }

    return {
      success: true,
      messageId: data?.data?.uid || 'ok',
    };
  } catch (error) {
    console.warn(`[SMS] Failed to send SMS to ${normalizedPhone.display}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  sendSms,
  setSmsSender,
  getSmsSender,
};
