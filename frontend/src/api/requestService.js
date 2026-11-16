import { apiClient } from './apiClient';

export const requestService = {
  /**
   * Submits a new document request with multipart/form-data attachments
   */
  async createRequest(formData) {
    return apiClient.post('/citizen/requests', formData);
  },

  /**
   * Updates an existing request (only permitted while status is pending)
   */
  async updateRequest(trackingNumber, formData) {
    return apiClient.put(`/citizen/requests/${encodeURIComponent(trackingNumber)}`, formData);
  },

  /**
   * Cancels a pending request
   */
  async cancelRequest(trackingNumber, cancellationReason) {
    return apiClient.post(`/citizen/requests/${encodeURIComponent(trackingNumber)}/cancel`, {
      cancellation_reason: cancellationReason,
    });
  },

  /**
   * Retrieves single request details by tracking number
   */
  async getRequest(trackingNumber) {
    return apiClient.get(`/citizen/requests/${encodeURIComponent(trackingNumber)}`);
  },

  /**
   * Lightweight status polling endpoint
   */
  async getStatus(trackingNumber) {
    return apiClient.get(`/citizen/requests/${encodeURIComponent(trackingNumber)}/status`);
  },

  /**
   * Lists citizen requests with pagination and optional status filter
   */
  async listRequests(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.status && params.status !== 'all') query.set('status', params.status);

    const qs = query.toString();
    return apiClient.get(`/citizen/requests${qs ? `?${qs}` : ''}`);
  },

  /**
   * Downloads an attachment blob securely with token
   */
  async downloadAttachment(storedFilename) {
    return apiClient.download(`/files/attachments/${encodeURIComponent(storedFilename)}`);
  },
};
