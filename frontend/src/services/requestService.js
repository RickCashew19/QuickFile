import { apiClient } from './apiClient';

export const requestService = {
  /**
   * Lightweight status polling
   */
  async getStatus(trackingNumber) {
    return apiClient.get(`/citizen/requests/${encodeURIComponent(trackingNumber)}/status`);
  },

  /**
   * Full request record
   */
  async getRequest(trackingNumber) {
    return apiClient.get(`/citizen/requests/${encodeURIComponent(trackingNumber)}`);
  },

  /**
   * List citizen requests
   */
  async listRequests(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = `/citizen/requests${query ? `?${query}` : ''}`;
    return apiClient.get(endpoint);
  },

  /**
   * Catalog of active document types
   */
  async getCatalog() {
    return apiClient.get('/citizen/catalog');
  },
};
