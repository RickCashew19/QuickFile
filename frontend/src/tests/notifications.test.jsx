import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CitizenNotificationsPage } from '../pages/citizen/notifications/CitizenNotificationsPage';
import { notificationService } from '../services/notificationService';

vi.mock('../services/notificationService', () => ({
  notificationService: {
    listNotifications: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    deleteNotification: vi.fn(),
    clearAll: vi.fn(),
  },
}));

describe('Citizen Notifications', () => {
  const mockNotifications = [
    {
      _id: 'notif-1',
      title: 'Request Approved',
      message: 'Your Barangay Clearance has been approved.',
      type: 'success',
      is_read: false,
      created_at: new Date().toISOString(),
      metadata: { tracking_number: 'QF-2026-0001' },
    },
    {
      _id: 'notif-2',
      title: 'Document Ready',
      message: 'Your certificate is ready for pickup.',
      type: 'info',
      is_read: true,
      created_at: new Date().toISOString(),
      metadata: { tracking_number: 'QF-2026-0002' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notifications list and displays unread indicator', async () => {
    notificationService.listNotifications.mockResolvedValueOnce({
      notifications: mockNotifications,
      unread_count: 1,
    });

    render(
      <MemoryRouter>
        <CitizenNotificationsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('Request Approved')).toBeInTheDocument();
      expect(screen.getByText('Document Ready')).toBeInTheDocument();
    });

    expect(screen.getByText('All (2)')).toBeInTheDocument();
    expect(screen.getByText('Unread (1)')).toBeInTheDocument();
  });

  it('filters to unread notifications when unread tab is clicked', async () => {
    notificationService.listNotifications.mockResolvedValueOnce({
      notifications: mockNotifications,
      unread_count: 1,
    });

    render(
      <MemoryRouter>
        <CitizenNotificationsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Document Ready')).toBeInTheDocument();
    });

    const unreadTab = screen.getByText('Unread (1)');
    fireEvent.click(unreadTab);

    // Read item should not be visible in unread tab
    expect(screen.queryByText('Document Ready')).not.toBeInTheDocument();
    // Unread item should still be visible
    expect(screen.getByText('Request Approved')).toBeInTheDocument();
  });

  it('marks a single notification as read', async () => {
    notificationService.listNotifications.mockResolvedValueOnce({
      notifications: mockNotifications,
      unread_count: 1,
    });
    notificationService.markRead.mockResolvedValueOnce({ success: true });

    render(
      <MemoryRouter>
        <CitizenNotificationsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mark Read')).toBeInTheDocument();
    });

    const markReadBtn = screen.getByText('Mark Read');
    fireEvent.click(markReadBtn);

    await waitFor(() => {
      expect(notificationService.markRead).toHaveBeenCalledWith('notif-1');
      expect(screen.getByText('Unread (0)')).toBeInTheDocument();
    });
  });

  it('marks all notifications as read', async () => {
    notificationService.listNotifications.mockResolvedValueOnce({
      notifications: mockNotifications,
      unread_count: 1,
    });
    notificationService.markAllRead.mockResolvedValueOnce({ updated_count: 1 });

    render(
      <MemoryRouter>
        <CitizenNotificationsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mark All Read')).toBeInTheDocument();
    });

    const markAllBtn = screen.getByText('Mark All Read');
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(notificationService.markAllRead).toHaveBeenCalled();
      expect(screen.getByText('Unread (0)')).toBeInTheDocument();
    });
  });

  it('marks notification as read when clicking tracking number link', async () => {
    notificationService.listNotifications.mockResolvedValueOnce({
      notifications: [
        {
          _id: 'notif-tracking',
          title: 'Request Ready',
          message: 'Ready for pickup',
          type: 'info',
          is_read: false,
          created_at: new Date().toISOString(),
          metadata: { tracking_number: 'QF-20261108-999999' },
        },
      ],
      unread_count: 1,
    });
    notificationService.markRead.mockResolvedValueOnce({ success: true });

    render(
      <MemoryRouter>
        <CitizenNotificationsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('View Request QF-20261108-999999')).toBeInTheDocument();
    });

    const trackingLink = screen.getByText('View Request QF-20261108-999999');
    fireEvent.click(trackingLink);

    await waitFor(() => {
      expect(notificationService.markRead).toHaveBeenCalledWith('notif-tracking');
      expect(screen.getByText('Unread (0)')).toBeInTheDocument();
    });
  });

  it('deletes a single notification', async () => {
    notificationService.listNotifications.mockResolvedValueOnce({
      notifications: mockNotifications,
      unread_count: 1,
    });
    notificationService.deleteNotification.mockResolvedValueOnce({ success: true });

    render(
      <MemoryRouter>
        <CitizenNotificationsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Request Approved')).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteBtns[0]);

    await waitFor(() => {
      expect(notificationService.deleteNotification).toHaveBeenCalledWith('notif-1');
    });
  });

  it('opens confirmation modal and clears all notifications', async () => {
    notificationService.listNotifications.mockResolvedValueOnce({
      notifications: mockNotifications,
      unread_count: 1,
    });
    notificationService.clearAll.mockResolvedValueOnce({ success: true });

    render(
      <MemoryRouter>
        <CitizenNotificationsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Clear All')).toBeInTheDocument();
    });

    const clearAllBtn = screen.getByRole('button', { name: /^clear all$/i });
    fireEvent.click(clearAllBtn);

    // Modal opens
    expect(screen.getByText(/Are you sure you want to permanently clear all notifications/i)).toBeInTheDocument();

    const confirmClearBtn = screen.getAllByRole('button', { name: /^clear all$/i }).find(
      (b) => b.className.includes('qf-btn--danger')
    );
    fireEvent.click(confirmClearBtn);

    await waitFor(() => {
      expect(notificationService.clearAll).toHaveBeenCalled();
    });
  });
});
