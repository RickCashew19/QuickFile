import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StaffActionButtons } from '../pages/staff/queue/StaffActionButtons';
import { StaffRequestDetailPage } from '../pages/staff/queue/StaffRequestDetailPage';
import { staffService } from '../services/staffService';
import * as useAuthModule from '../hooks/useAuth';
import { REQUEST_STATUSES, STAFF_PERMISSIONS } from '../config/constants';
import { ApiError } from '../services/apiClient';
import realStaffRequestDetail from './fixtures/real/staffRequestDetail.json';

describe('Staff Action Buttons & Permissions Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders review and reject buttons for pending status when user has CAN_REVIEW_REQUESTS', () => {
    const hasPermission = (p) => p === STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS;
    const onReview = vi.fn();
    const onOpenReject = vi.fn();

    render(
      <MemoryRouter>
        <StaffActionButtons
          request={{ _id: 'req123', status: REQUEST_STATUSES.PENDING }}
          hasPermission={hasPermission}
          onReview={onReview}
          onApprove={vi.fn()}
          onOpenReject={onOpenReject}
          onPrepare={vi.fn()}
          onIssue={vi.fn()}
          onOpenRelease={vi.fn()}
          onArchive={vi.fn()}
          loadingAction={null}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /start review/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /prepare/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start review/i }));
    expect(onReview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(onOpenReject).toHaveBeenCalledTimes(1);
  });

  it('hides action buttons when user lacks required permission', () => {
    const hasPermission = () => false; // no permissions

    render(
      <MemoryRouter>
        <StaffActionButtons
          request={{ _id: 'req123', status: REQUEST_STATUSES.PENDING }}
          hasPermission={hasPermission}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onOpenReject={vi.fn()}
          onPrepare={vi.fn()}
          onIssue={vi.fn()}
          onOpenRelease={vi.fn()}
          onArchive={vi.fn()}
          loadingAction={null}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /start review/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
  });

  it('renders prepare button for approved status when user has CAN_PREPARE_DOCUMENTS', () => {
    const hasPermission = (p) => p === STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS;
    const onPrepare = vi.fn();

    render(
      <MemoryRouter>
        <StaffActionButtons
          request={{ _id: 'req123', status: REQUEST_STATUSES.APPROVED }}
          hasPermission={hasPermission}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onOpenReject={vi.fn()}
          onPrepare={onPrepare}
          onIssue={vi.fn()}
          onOpenRelease={vi.fn()}
          onArchive={vi.fn()}
          loadingAction={null}
        />
      </MemoryRouter>
    );

    const prepBtn = screen.getByRole('button', { name: /prepare document/i });
    expect(prepBtn).toBeInTheDocument();
    fireEvent.click(prepBtn);
    expect(onPrepare).toHaveBeenCalledTimes(1);
  });

  it('renders issue button for in_preparation status when user has CAN_PREPARE_DOCUMENTS', () => {
    const hasPermission = (p) => p === STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS;
    const onIssue = vi.fn();

    render(
      <MemoryRouter>
        <StaffActionButtons
          request={{ _id: 'req123', status: REQUEST_STATUSES.IN_PREPARATION }}
          hasPermission={hasPermission}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onOpenReject={vi.fn()}
          onPrepare={vi.fn()}
          onIssue={onIssue}
          onOpenRelease={vi.fn()}
          onArchive={vi.fn()}
          loadingAction={null}
        />
      </MemoryRouter>
    );

    const issueBtn = screen.getByRole('button', { name: /issue & generate certificate/i });
    expect(issueBtn).toBeInTheDocument();
    fireEvent.click(issueBtn);
    expect(onIssue).toHaveBeenCalledTimes(1);
  });

  it('renders print and release buttons for ready_for_pickup status with respective permissions', () => {
    const hasPermission = (p) =>
      p === STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS || p === STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS;

    render(
      <MemoryRouter>
        <StaffActionButtons
          request={{ _id: 'req123', status: REQUEST_STATUSES.READY_FOR_PICKUP }}
          hasPermission={hasPermission}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onOpenReject={vi.fn()}
          onPrepare={vi.fn()}
          onIssue={vi.fn()}
          onOpenRelease={vi.fn()}
          onArchive={vi.fn()}
          loadingAction={null}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /open certificate print view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /release document/i })).toBeInTheDocument();
  });

  it('renders archive button for terminal states (released, rejected, cancelled) with CAN_ARCHIVE_RECORDS', () => {
    const hasPermission = (p) => p === STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS;

    const { rerender } = render(
      <MemoryRouter>
        <StaffActionButtons
          request={{ _id: 'req123', status: REQUEST_STATUSES.RELEASED }}
          hasPermission={hasPermission}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onOpenReject={vi.fn()}
          onPrepare={vi.fn()}
          onIssue={vi.fn()}
          onOpenRelease={vi.fn()}
          onArchive={vi.fn()}
          loadingAction={null}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /archive record/i })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <StaffActionButtons
          request={{ _id: 'req123', status: REQUEST_STATUSES.REJECTED }}
          hasPermission={hasPermission}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onOpenReject={vi.fn()}
          onPrepare={vi.fn()}
          onIssue={vi.fn()}
          onOpenRelease={vi.fn()}
          onArchive={vi.fn()}
          loadingAction={null}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /archive record/i })).toBeInTheDocument();
  });
});

describe('StaffRequestDetailPage 409 Conflict Recovery Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('catches 409 Conflict during action, displays reload alert, and refetches request details using real fixture', async () => {
    const initialDetail = realStaffRequestDetail;
    const updatedDetail = {
      ...realStaffRequestDetail,
      request: {
        ...realStaffRequestDetail.request,
        status: REQUEST_STATUSES.UNDER_REVIEW, // state was changed concurrently
      },
    };

    let fetchCallCount = 0;
    vi.spyOn(staffService, 'getRequest').mockImplementation(async () => {
      fetchCallCount += 1;
      return fetchCallCount === 1 ? initialDetail : updatedDetail;
    });

    // Mock reviewRequest throwing a 409 Conflict
    vi.spyOn(staffService, 'reviewRequest').mockRejectedValueOnce(
      new ApiError('Status changed or request was modified by another user. Please refresh.', 409, 'CONFLICT')
    );

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { full_name: 'Staff Maria', role: 'staff' },
      hasPermission: () => true,
    });

    render(
      <MemoryRouter initialEntries={[`/staff/requests/${realStaffRequestDetail.request._id}`]}>
        <Routes>
          <Route path="/staff/requests/:id" element={<StaffRequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial load: shows Start Review button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start review/i })).toBeInTheDocument();
    });

    // Click Start Review -> triggers 409 conflict
    fireEvent.click(screen.getByRole('button', { name: /start review/i }));

    // Confirms conflict alert is rendered
    await waitFor(() => {
      expect(
        screen.getByText(/this request was updated by another staff member\. reloading latest state\.\.\./i)
      ).toBeInTheDocument();
    });

    // Confirms request details were refetched (fetchCallCount === 2) and state is updated to UNDER_REVIEW
    expect(fetchCallCount).toBe(2);

    await waitFor(() => {
      expect(screen.getByText(/under review/i)).toBeInTheDocument();
      // Start Review button is now gone, replaced by Approve Application for under_review
      expect(screen.queryByRole('button', { name: /start review/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /approve application/i })).toBeInTheDocument();
    });
  });
});
