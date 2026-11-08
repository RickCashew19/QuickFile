import { describe, it, expect } from 'vitest';
import { buildStatusTimeline } from '../utils/statusTimelineBuilder';

describe('Status Timeline Builder Suite', () => {
  it('constructs progressive completed and current stages for in_preparation request', () => {
    const mockRequest = {
      status: 'in_preparation',
      created_at: '2026-11-01T08:00:00.000Z',
      reviewed_at: '2026-11-02T09:00:00.000Z',
      approved_at: '2026-11-03T10:00:00.000Z',
      prepared_at: '2026-11-04T11:00:00.000Z',
    };

    const timeline = buildStatusTimeline(mockRequest);
    expect(timeline.length).toBe(6);

    // Stages before in_preparation should be completed
    expect(timeline[0].state).toBe('completed'); // submitted
    expect(timeline[1].state).toBe('completed'); // reviewed
    expect(timeline[2].state).toBe('completed'); // approved
    expect(timeline[3].state).toBe('current');   // prepared
    expect(timeline[4].state).toBe('upcoming');  // ready
    expect(timeline[5].state).toBe('upcoming');  // released
  });

  it('builds terminal rejected timeline with rejection note', () => {
    const mockRequest = {
      status: 'rejected',
      created_at: '2026-11-01T08:00:00.000Z',
      reviewed_at: '2026-11-02T09:00:00.000Z',
      rejected_at: '2026-11-02T10:00:00.000Z',
      rejection_reason: 'Missing proof of residency document.',
    };

    const timeline = buildStatusTimeline(mockRequest);
    expect(timeline.length).toBe(3);
    const rejectedStep = timeline[2];
    expect(rejectedStep.state).toBe('rejected');
    expect(rejectedStep.note).toBe('Missing proof of residency document.');
  });

  it('builds terminal cancelled timeline with cancellation note', () => {
    const mockRequest = {
      status: 'cancelled',
      created_at: '2026-11-01T08:00:00.000Z',
      cancelled_at: '2026-11-01T09:00:00.000Z',
      cancellation_reason: 'Requested by mistake.',
    };

    const timeline = buildStatusTimeline(mockRequest);
    expect(timeline.length).toBe(2);
    const cancelledStep = timeline[1];
    expect(cancelledStep.state).toBe('cancelled');
    expect(cancelledStep.note).toBe('Requested by mistake.');
  });

  it('returns empty array when request is null', () => {
    expect(buildStatusTimeline(null)).toEqual([]);
  });
});
