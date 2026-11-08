import { useState, useEffect, useCallback } from 'react';
import { notificationService } from '../../../services/notificationService';
import { NotificationCard } from './NotificationCard';
import { Button } from '../../../components/shared/Button';
import { Modal } from '../../../components/shared/Modal';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';
import { Icon } from '../../../components/shared/Icon';
import './CitizenNotificationsPage.css';

export function CitizenNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Directly derive unread count from notifications to guarantee the toggle always decrements
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Sync unreadCount with CitizenLayout header bell badge in real-time
  useEffect(() => {
    if (!loading) {
      window.dispatchEvent(
        new CustomEvent('quickfile:notifications:count', {
          detail: { unreadCount },
        })
      );
    }
  }, [unreadCount, loading]);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationService.listNotifications();
      const items = data?.notifications || [];
      setNotifications(items);
      const count = typeof data?.unread_count === 'number'
        ? data.unread_count
        : items.filter((n) => !n.is_read).length;
      window.dispatchEvent(
        new CustomEvent('quickfile:notifications:count', {
          detail: { unreadCount: count },
        })
      );
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkOneRead = async (id) => {
    try {
      await notificationService.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      setErrorMessage(err.message || 'Failed to mark notification as read.');
    }
  };

  const handleMarkAllRead = async () => {
    setActionLoading(true);
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      setErrorMessage(err.message || 'Failed to mark all as read.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOne = async (id) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch (err) {
      setErrorMessage(err.message || 'Failed to delete notification.');
    }
  };

  const handleClearAll = async () => {
    setActionLoading(true);
    try {
      await notificationService.clearAll();
      setNotifications([]);
      setClearModalOpen(false);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to clear notifications.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredItems = filter === 'unread'
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  if (loading) {
    return (
      <div className="qf-notif-loading">
        <Loader size="lg" text="Loading notifications..." />
      </div>
    );
  }

  return (
    <div className="qf-notif-page">
      <div className="qf-notif-header">
        <div>
          <h1 className="qf-notif-title">Notifications</h1>
          <p className="qf-notif-subtitle">
            Updates and status notifications regarding your document requests.
          </p>
        </div>

        <div className="qf-notif-header__actions">
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkAllRead}
              loading={actionLoading}
              iconLeft={<Icon name="check" size={14} />}
            >
              Mark All Read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClearModalOpen(true)}
              iconLeft={<Icon name="trash" size={14} />}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Filter Tabs */}
      <div className="qf-notif-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`qf-notif-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'unread'}
          className={`qf-notif-tab ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      {filteredItems.length === 0 ? (
        <div className="qf-notif-empty">
          <div className="qf-notif-empty__icon">
            <Icon name="info" size={48} />
          </div>
          <h2 className="qf-notif-empty__title">No notifications</h2>
          <p className="qf-notif-empty__text">
            {filter === 'unread'
              ? 'You have caught up with all your notifications!'
              : 'You do not have any notification alerts yet.'}
          </p>
        </div>
      ) : (
        <div className="qf-notif-list">
          {filteredItems.map((n) => (
            <NotificationCard
              key={n._id}
              notification={n}
              onMarkRead={handleMarkOneRead}
              onDelete={handleDeleteOne}
            />
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={clearModalOpen}
        onClose={() => setClearModalOpen(false)}
        title="Clear All Notifications"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleClearAll} loading={actionLoading}>
              Clear All
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to permanently clear all notifications? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
