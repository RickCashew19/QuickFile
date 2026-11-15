import { apiClient, ApiError } from './apiClient';

export const verifyService = {
  /**
   * Verifies public certificate code
   * Excludes citizen PII
   */
  async verifyCode(code) {
    if (!code || typeof code !== 'string') {
      throw new ApiError('Please enter a verification code.', 400);
    }

    const clean = code.trim().toUpperCase();

    // Check for citizen tracking number pattern
    if (clean.startsWith('QF-')) {
      const err = new ApiError(
        'The code you entered starts with QF-, which is a Request Tracking Number. Tracking numbers are private to residents and can be tracked inside the Citizen Portal.',
        400,
        'IS_TRACKING_NUMBER'
      );
      throw err;
    }

    return apiClient.get(`/verify/${encodeURIComponent(clean)}`);
  },
};
