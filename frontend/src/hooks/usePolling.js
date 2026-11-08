import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom Polling Hook
 * - Prevents overlapping requests
 * - Respects document visibility (pauses when tab is hidden)
 * - Applies exponential backoff on 429 (rate limits) and 500 errors
 * - Automatically tears down timers on unmount
 * - Returns { data } for consumers that capture polling results
 */
export function usePolling(callback, intervalMs = 10000, options = {}) {
  const { enabled = true, maxIntervalMs = 60000 } = options;
  const [data, setData] = useState(null);

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const currentIntervalRef = useRef(intervalMs);
  const isMountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const executePoll = useCallback(async () => {
    if (!enabled || !isMountedRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    try {
      const result = await callbackRef.current();
      if (result !== undefined && isMountedRef.current) {
        setData(result);
      }
      // On success, reset interval to original default
      currentIntervalRef.current = intervalMs;
    } catch (err) {
      // Exponential backoff on rate limits or server errors
      if (err && err.status === 429) {
        const retrySec = (err.data && err.data.retryAfterSeconds) || 30;
        currentIntervalRef.current = Math.min(retrySec * 1000, maxIntervalMs);
      } else if (err && err.status >= 500) {
        currentIntervalRef.current = Math.min(currentIntervalRef.current * 1.5, maxIntervalMs);
      }
    } finally {
      inFlightRef.current = false;
      if (enabled && isMountedRef.current && !(typeof document !== 'undefined' && document.hidden)) {
        clearTimer();
        timerRef.current = setTimeout(executePoll, currentIntervalRef.current);
      }
    }
  }, [enabled, intervalMs, maxIntervalMs, clearTimer]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      clearTimer();
      return;
    }

    // Trigger initial poll immediately
    executePoll();

    // Visibility listener
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else {
        // Tab restored to focus: poll immediately and restart schedule
        executePoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, executePoll, clearTimer]);

  return { data };
}
