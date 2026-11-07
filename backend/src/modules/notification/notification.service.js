const { Notification } = require('../../models');
const { NOTIFICATION_CHANNELS } = require('../../config/constants');

/**
 * Creates and delivers an in-app notification to a user
 */
async function sendNotification({
  user_id,
  title,
  message,
  type = 'info',
  channel = NOTIFICATION_CHANNELS.SYSTEM,
  metadata = {},
}) {
  if (!user_id || !title || !message) {
    throw new Error('user_id, title, and message are required to send a notification.');
  }

  const notification = await Notification.create({
    user_id,
    title: title.trim(),
    message: message.trim(),
    type,
    channel,
    metadata,
    is_read: false,
  });

  return notification;
}

/**
 * Retrieves all notifications and unread count for a citizen
 */
async function getCitizenNotifications(userId) {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user_id: userId }).sort({ created_at: -1 }).lean(),
    Notification.countDocuments({ user_id: userId, is_read: false }),
  ]);

  return {
    notifications,
    unread_count: unreadCount,
  };
}

/**
 * Marks all notifications for a citizen as read
 */
async function markAllNotificationsRead(userId) {
  const result = await Notification.updateMany(
    { user_id: userId, is_read: false },
    { $set: { is_read: true, read_at: new Date() } }
  );

  return {
    updated_count: result.modifiedCount,
    message: 'All notifications marked as read.',
  };
}

/**
 * Marks a single notification as read with strict ownership check
 */
async function markNotificationRead(userId, notificationId) {
  const notification = await Notification.findOne({
    _id: notificationId,
    user_id: userId,
  });

  if (!notification) {
    const error = new Error('Notification not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!notification.is_read) {
    notification.is_read = true;
    notification.read_at = new Date();
    await notification.save();
  }

  return notification;
}

/**
 * Deletes a single notification with strict ownership check
 */
async function deleteNotification(userId, notificationId) {
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    user_id: userId,
  });

  if (!notification) {
    const error = new Error('Notification not found.');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Notification deleted successfully.',
  };
}

/**
 * Clears all notifications for a user
 */
async function clearAllNotifications(userId) {
  const result = await Notification.deleteMany({ user_id: userId });

  return {
    deleted_count: result.deletedCount,
    message: 'All notifications cleared successfully.',
  };
}

module.exports = {
  sendNotification,
  getCitizenNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  clearAllNotifications,
};
