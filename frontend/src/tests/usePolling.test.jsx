import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePolling } from '../hooks/usePolling';

describe('usePolling Hook Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('triggers immediate initial execution when enabled', async () => {
    const callback = vi.fn().mockResolvedValue({ status: 'ok' });
    renderHook(() => usePolling(callback, 5000, { enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not trigger callback when enabled is false', async () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 5000, { enabled: false }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('polls repeatedly at the specified interval', async () => {
    const callback = vi.fn().mockResolvedValue({});
    renderHook(() => usePolling(callback, 2000, { enabled: true }));

    // Flush initial execution
    await act(async () => {
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Advance timer to trigger second poll
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(2);

    // Advance timer to trigger third poll
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('backs off when callback throws a 429 rate limit error', async () => {
    const error429 = { status: 429, data: { retryAfterSeconds: 10 } };
    const callback = vi
      .fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue({});

    renderHook(() => usePolling(callback, 2000, { enabled: true, maxIntervalMs: 30000 }));

    // Flush initial failed execution
    await act(async () => {
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Advancing 2000ms should NOT call callback because of 10s retryAfter
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Advancing the remaining 8000ms (total 10000ms) triggers poll #2
    await act(async () => {
      vi.advanceTimersByTime(8000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
