import { apiClient } from './apiClient';

export const authService = {
  async login(email, password, recaptchaToken = null) {
    const payload = { email, password };
    if (recaptchaToken) payload.recaptcha_token = recaptchaToken;
    return apiClient.post('/auth/login', payload);
  },

  async register(registrationData) {
    return apiClient.post('/auth/register', registrationData);
  },

  async loginWithGoogle(idToken) {
    return apiClient.post('/auth/google', { id_token: idToken });
  },

  async forgotPassword(email, recaptchaToken = null) {
    const payload = { email };
    if (recaptchaToken) payload.recaptcha_token = recaptchaToken;
    if (typeof window !== 'undefined' && window.location?.origin) {
      payload.client_app_url = window.location.origin;
    }
    return apiClient.post('/auth/forgot-password', payload);
  },

  async resetPassword(tokenOrData, newPasswordArg, emailArg) {
    if (typeof tokenOrData === 'object' && tokenOrData !== null) {
      const { email, pin, token, newPassword, new_password } = tokenOrData;
      return apiClient.post('/auth/reset-password', {
        email: email || undefined,
        pin: pin || token,
        token: token || pin,
        new_password: newPassword || new_password,
      });
    }
    return apiClient.post('/auth/reset-password', {
      email: emailArg || undefined,
      token: tokenOrData,
      pin: typeof tokenOrData === 'string' && /^\d{4}$/.test(tokenOrData.trim()) ? tokenOrData.trim() : undefined,
      new_password: newPasswordArg,
    });
  },

  async getMe() {
    return apiClient.get('/auth/me');
  },

  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Best-effort server notification; client logout continues regardless
    }
  },
};
