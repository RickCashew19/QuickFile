const notificationService = require('./notification.service');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * List citizen notifications + unread count
 * GET /api/v1/citizen/notifications
 */
const listNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getCitizenNotifications(req.user._id);

  return res.status(200).json({
    success: true,
    message: 'Notifications retrieved successfully.',
    data: result,
  });
});

/**
 * Mark all notifications as read
 * PATCH /api/v1/citizen/notifications/read-all
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllNotificationsRead(req.user._id);

  return res.status(200).json({
    success: true,
    message: result.message,
    data: { updated_count: result.updated_count },
  });
});

/**
 * Mark a single notification as read
 * PATCH /api/v1/citizen/notifications/:id/read
 */
const markOneAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markNotificationRead(req.user._id, req.params.id);

  return res.status(200).json({
    success: true,
    message: 'Notification marked as read.',
    data: result,
  });
});

/**
 * Delete a single notification (ownership check)
 * DELETE /api/v1/citizen/notifications/:id
 */
const deleteOne = asyncHandler(async (req, res) => {
  const result = await notificationService.deleteNotification(req.user._id, req.params.id);

  return res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

/**
 * Delete all notifications for current user
 * DELETE /api/v1/citizen/notifications
 */
const deleteAll = asyncHandler(async (req, res) => {
  const result = await notificationService.clearAllNotifications(req.user._id);

  return res.status(200).json({
    success: true,
    message: result.message,
    data: { deleted_count: result.deleted_count },
  });
});

module.exports = {
  listNotifications,
  markAllAsRead,
  markOneAsRead,
  deleteOne,
  deleteAll,
};

