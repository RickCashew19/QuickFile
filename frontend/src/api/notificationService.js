import { apiClient } from './apiClient';

export const notificationService = {
  /**
   * Retrieves all notifications and unread count for current citizen
   */
  async listNotifications() {
    return apiClient.get('/citizen/notifications');
  },

  /**
   * Marks all citizen notifications as read
   */
  async markAllRead() {
    return apiClient.patch('/citizen/notifications/read-all');
  },

  /**
   * Marks a single notification as read
   */
  async markRead(id) {
    return apiClient.patch(`/citizen/notifications/${encodeURIComponent(id)}/read`);
  },

  /**
   * Deletes a single notification
   */
  async deleteNotification(id) {
    return apiClient.delete(`/citizen/notifications/${encodeURIComponent(id)}`);
  },

  /**
   * Clears all notifications for citizen
   */
  async clearAll() {
    return apiClient.delete('/citizen/notifications');
  },
};
