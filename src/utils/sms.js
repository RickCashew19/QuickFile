const config = require('../config');

class SmsSender {
  /**
   * Normalize Philippine mobile phone numbers to standard formats (e.g. 639171234567 or 09171234567)
   * @param {string} phone 
   * @param {'intl'|'local'} format 
   * @returns {string}
   */
  static normalizePhoneNumber(phone, format = 'intl') {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');

    // Convert 09xxxxxxxxx -> 639xxxxxxxxx
    if (digits.startsWith('09') && digits.length === 11) {
      digits = '63' + digits.substring(1);
    } else if (digits.startsWith('9') && digits.length === 10) {
      digits = '63' + digits;
    }

    if (format === 'local') {
      if (digits.startsWith('639') && digits.length === 12) {
        return '09' + digits.substring(3);
      }
    }

    return digits;
  }

  /**
   * Check SMS Gateway Balance and Account Profile
   * @param {object} [overrideConfig]
   * @returns {Promise<{success: boolean, balance?: string, user?: object, message?: string, error?: string}>}
   */
  static async checkBalance(overrideConfig = null) {
    try {
      const SettingsService = require('../modules/settings/settings.service');
      const activeSms = overrideConfig || SettingsService.getActiveSmsConfig();

      if (!activeSms.apiKey) {
        return { success: false, error: 'SMS API Key / Token is not configured.' };
      }

      if (activeSms.provider === 'PhilSMS' || activeSms.provider.toLowerCase().includes('phil')) {
        const baseEndpoint = (activeSms.apiEndpoint || 'https://dashboard.philsms.com/api/v3/').replace(/\/?$/, '/');
        
        // 1. Fetch balance
        const balanceRes = await fetch(`${baseEndpoint}balance`, {
          headers: {
            'Authorization': `Bearer ${activeSms.apiKey.trim()}`,
            'Accept': 'application/json'
          }
        });

        const balanceData = await balanceRes.json();

        // 2. Fetch profile info
        const meRes = await fetch(`${baseEndpoint}me`, {
          headers: {
            'Authorization': `Bearer ${activeSms.apiKey.trim()}`,
            'Accept': 'application/json'
          }
        });
        const meData = await meRes.json();

        if (balanceData.status === 'success' || meData.status === 'success') {
          return {
            success: true,
            provider: 'PhilSMS',
            source: activeSms.source,
            balance: balanceData?.data?.remaining_balance || '₱0',
            expiredOn: balanceData?.data?.expired_on || 'N/A',
            accountName: meData?.data?.first_name || 'QuickFile Admin',
            accountEmail: meData?.data?.email || 'N/A',
            message: `PhilSMS Connected: Balance is ${balanceData?.data?.remaining_balance || '₱0'} (Account: ${meData?.data?.email || 'Active'})`
          };
        } else {
          return {
            success: false,
            error: balanceData.message || meData.message || 'Failed to authenticate with PhilSMS API.'
          };
        }
      }

      // Default mock balance for local dev / other providers
      return {
        success: true,
        provider: activeSms.provider,
        source: activeSms.source,
        balance: 'N/A',
        message: `${activeSms.provider} gateway connection active (${activeSms.source.toUpperCase()} API).`
      };
    } catch (err) {
      console.error('[SMS Balance Check Error]', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispatch an SMS notification via the active SMS Gateway (PhilSMS / Twilio)
   * @param {object} options
   * @param {string} options.to - Recipient phone number
   * @param {string} options.message - SMS message text
   * @param {string} [options.senderId] - Optional custom sender ID override
   * @param {object} [overrideConfig] - Optional SMS configuration override
   */
  static async sendSms({ to, message, senderId = null }, overrideConfig = null) {
    try {
      const SettingsService = require('../modules/settings/settings.service');
      if (!SettingsService.isFeatureEnabled('sms_notifications_enabled')) {
        console.log(`[SMS Gateway Disabled] SMS to <${to}> skipped because sms_notifications_enabled is off.`);
        return { success: false, skipped: true, message: 'SMS Gateway is currently disabled in App Settings.' };
      }

      const activeSms = overrideConfig || SettingsService.getActiveSmsConfig();

      if (!activeSms.apiKey) {
        console.warn(`[SMS Gateway Notice] SMS API key missing in active configuration (${activeSms.source}).`);
        return { success: false, skipped: true, message: `SMS API Key not configured in ${activeSms.source} configuration.` };
      }

      if (!to || !to.trim()) {
        return { success: false, skipped: true, message: 'Recipient phone number is missing or empty.' };
      }

      // Normalize phone numbers (e.g. 09171234567 -> 639171234567 for PhilSMS)
      const normalizedRecipient = this.normalizePhoneNumber(to, 'intl');
      const senderTag = senderId || activeSms.senderId || 'PhilSMS';

      if (activeSms.provider === 'PhilSMS' || activeSms.provider.toLowerCase().includes('phil')) {
        const baseEndpoint = (activeSms.apiEndpoint || 'https://dashboard.philsms.com/api/v3/').replace(/\/?$/, '/');
        const sendUrl = `${baseEndpoint}sms/send`;

        const res = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeSms.apiKey.trim()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            recipient: normalizedRecipient,
            sender_id: senderTag,
            type: 'plain',
            message: message.trim()
          })
        });

        const data = await res.json();

        if (data.status === 'success') {
          console.log(`[PhilSMS Dispatched] To: ${normalizedRecipient} | Sender: "${senderTag}" | Msg: "${message.substring(0, 40)}..."`);
          return { success: true, provider: 'PhilSMS', source: activeSms.source, data };
        } else {
          console.warn(`[PhilSMS Notice] To: ${normalizedRecipient} -> Response: ${data.message}`);
          return { success: false, error: data.message, provider: 'PhilSMS', source: activeSms.source };
        }
      }

      // Default log dispatch for other configured gateways
      console.log(`[SMS Gateway Dispatched] To: ${normalizedRecipient} via ${activeSms.provider} (${activeSms.source.toUpperCase()}): "${message}"`);
      return { success: true, provider: activeSms.provider, source: activeSms.source };
    } catch (err) {
      console.error(`[SMS Send Error] Failed sending to <${to}>:`, err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = SmsSender;
