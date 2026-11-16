import { apiClient } from './apiClient';

let cachedConfig = null;

export const publicService = {
  /**
   * Fetches public system configuration (branding, feature flags, public keys)
   */
  async getConfig(forceRefresh = false) {
    if (cachedConfig && !forceRefresh) {
      return cachedConfig;
    }
    const data = await apiClient.get('/public/config');
    cachedConfig = data;
    return data;
  },

  /**
   * Dynamically loads Google Identity Services script if enabled
   */
  loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (document.getElementById('google-gsi-script')) {
        return resolve(window.google);
      }
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  },

  /**
   * Dynamically loads Google reCAPTCHA v2 script if enabled
   */
  loadRecaptchaScript() {
    return new Promise((resolve, reject) => {
      if (document.getElementById('recaptcha-script')) {
        return resolve(window.grecaptcha);
      }
      const script = document.createElement('script');
      script.id = 'recaptcha-script';
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.grecaptcha);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  },
};
