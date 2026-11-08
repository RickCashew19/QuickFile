import { formatDateTime } from './formatters';

/**
 * Builds chronological stage timeline for document request tracking
 */
export function buildStatusTimeline(request) {
  if (!request) return [];

  const currentStatus = String(request.status || '').toLowerCase().trim();

  // If request was terminal rejected or cancelled
  if (currentStatus === 'rejected') {
    return [
      {
        key: 'submitted',
        title: 'Request Submitted',
        timestamp: request.created_at ? formatDateTime(request.created_at) : null,
        state: 'completed',
      },
      {
        key: 'reviewed',
        title: 'Under Review',
        timestamp: request.reviewed_at ? formatDateTime(request.reviewed_at) : null,
        state: 'completed',
      },
      {
        key: 'rejected',
        title: 'Request Rejected',
        timestamp: request.rejected_at ? formatDateTime(request.rejected_at) : null,
        state: 'rejected',
        note: request.rejection_reason || 'Discrepancy in requirements or records.',
      },
    ];
  }

  if (currentStatus === 'cancelled') {
    return [
      {
        key: 'submitted',
        title: 'Request Submitted',
        timestamp: request.created_at ? formatDateTime(request.created_at) : null,
        state: 'completed',
      },
      {
        key: 'cancelled',
        title: 'Request Cancelled',
        timestamp: request.cancelled_at ? formatDateTime(request.cancelled_at) : null,
        state: 'cancelled',
        note: request.cancellation_reason || 'Cancelled by resident.',
      },
    ];
  }

  // Standard progressive lifecycle: pending -> under_review -> approved -> in_preparation -> ready_for_pickup -> released
  const stages = [
    {
      key: 'submitted',
      title: 'Request Submitted',
      timestamp: request.created_at ? formatDateTime(request.created_at) : null,
      statusCode: 'pending',
    },
    {
      key: 'reviewed',
      title: 'Under Review',
      timestamp: request.reviewed_at ? formatDateTime(request.reviewed_at) : null,
      statusCode: 'under_review',
    },
    {
      key: 'approved',
      title: 'Approved',
      timestamp: request.approved_at ? formatDateTime(request.approved_at) : null,
      statusCode: 'approved',
    },
    {
      key: 'prepared',
      title: 'Document Prepared',
      timestamp: request.prepared_at ? formatDateTime(request.prepared_at) : null,
      statusCode: 'in_preparation',
    },
    {
      key: 'ready',
      title: 'Ready for Pickup',
      timestamp: request.ready_at ? formatDateTime(request.ready_at) : null,
      statusCode: 'ready_for_pickup',
    },
    {
      key: 'released',
      title: 'Officially Released',
      timestamp: request.released_at ? formatDateTime(request.released_at) : null,
      statusCode: 'released',
    },
  ];

  const statusOrder = [
    'pending',
    'under_review',
    'approved',
    'in_preparation',
    'ready_for_pickup',
    'released',
  ];

  const currentIndex = statusOrder.indexOf(currentStatus);

  return stages.map((stage, idx) => {
    let state = 'upcoming';
    if (idx < currentIndex) {
      state = 'completed';
    } else if (idx === currentIndex) {
      state = 'current';
    }

    return {
      ...stage,
      state,
    };
  });
}
