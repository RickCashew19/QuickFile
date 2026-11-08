import { useState, useEffect, useRef, useCallback } from 'react';
import { publicService } from '../services/publicService';

/**
 * Custom Hook for Google reCAPTCHA v2 Integration
 * - Loads reCAPTCHA script safely
 * - Waits for grecaptcha.ready() before executing render
 * - Renders exactly once per container
 * - Tracks widgetId for explicit reset(widgetId)
 * - Surfaces clear load error if script fails
 */
export function useRecaptcha({ containerRef, siteKey, enabled, onVerify, onExpire }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const widgetIdRef = useRef(null);

  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!enabled || !siteKey || !containerRef.current) return;
    if (widgetIdRef.current !== null) return; // Render exactly once

    let isMounted = true;

    publicService
      .loadRecaptchaScript()
      .then((grecaptcha) => {
        if (!isMounted) return;
        if (!grecaptcha || typeof grecaptcha.ready !== 'function') {
          throw new Error('reCAPTCHA library not initialized properly.');
        }

        grecaptcha.ready(() => {
          if (!isMounted || !containerRef.current || widgetIdRef.current !== null) return;

          try {
            // Clear any stale children before mounting widget
            containerRef.current.innerHTML = '';
            const id = grecaptcha.render(containerRef.current, {
              sitekey: siteKey,
              callback: (token) => onVerifyRef.current?.(token),
              'expired-callback': () => onExpireRef.current?.(),
            });
            widgetIdRef.current = id;
            setIsLoaded(true);
          } catch (renderErr) {
            // Widget might already be rendered in container
            setIsLoaded(true);
          }
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setLoadError(
          err.message || 'Unable to load security verification (reCAPTCHA). Please check your internet connection.'
        );
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, siteKey, containerRef]);

  const reset = useCallback(() => {
    if (
      widgetIdRef.current !== null &&
      typeof window !== 'undefined' &&
      window.grecaptcha &&
      typeof window.grecaptcha.reset === 'function'
    ) {
      try {
        window.grecaptcha.reset(widgetIdRef.current);
      } catch {
        // Ignore reset failures
      }
    }
  }, []);

  return { isLoaded, loadError, reset };
}
