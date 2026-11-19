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

  /**
   * Resend a 6-digit verification code (60s cooldown enforced by the server).
   */
  async resendResetOtp(email, recaptchaToken = null) {
    const payload = { email };
    if (recaptchaToken) payload.recaptcha_token = recaptchaToken;
    return apiClient.post('/auth/resend-reset-otp', payload);
  },

  /**
   * Step 2: verify the 6-digit OTP and receive a short-lived single-use reset token.
   */
  async verifyResetOtp(email, otp) {
    return apiClient.post('/auth/verify-reset-otp', { email, otp });
  },

  /** Backwards-compatible alias for older clients. */
  async verifyResetPin(email, pin) {
    return this.verifyResetOtp(email, pin);
  },

  /**
   * Step 3: set a new password with the single-use token from verifyResetPin.
   * Accepts { email, resetToken, newPassword }.
   */
  async resetPassword(tokenOrData, newPasswordArg, emailArg) {
    if (typeof tokenOrData === 'object' && tokenOrData !== null) {
      const { email, resetToken, reset_token, newPassword, new_password } = tokenOrData;
      return apiClient.post('/auth/reset-password', {
        email: email || undefined,
        reset_token: resetToken || reset_token,
        new_password: newPassword || new_password,
      });
    }
    return apiClient.post('/auth/reset-password', {
      email: emailArg || undefined,
      reset_token: tokenOrData,
      new_password: newPasswordArg,
    });
  },

  async getMe() {
    return apiClient.get('/auth/me');
  },

  /**
   * Silently rotates the httpOnly refresh cookie and returns a fresh session.
   * Used on app boot when the in-memory access token was lost (page reload)
   * but the longer-lived refresh cookie may still be valid.
   */
  async refresh() {
    return apiClient.post('/auth/refresh');
  },

  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Best-effort server notification; client logout continues regardless
    }
  },
};
