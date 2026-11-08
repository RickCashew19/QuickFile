import { apiClient } from './apiClient';

export const citizenService = {
  /**
   * Retrieves citizen profile with completeness score
   */
  async getProfile() {
    return apiClient.get('/citizen/profile');
  },

  /**
   * Updates citizen profile
   */
  async updateProfile(profileData) {
    return apiClient.put('/citizen/profile', profileData);
  },

  /**
   * Retrieves profile reuse pre-fill data for requests
   */
  async getProfileReuseData() {
    return apiClient.get('/citizen/profile/reuse');
  },

  /**
   * Retrieves active document types catalog
   */
  async getCatalog() {
    return apiClient.get('/citizen/catalog');
  },
};
