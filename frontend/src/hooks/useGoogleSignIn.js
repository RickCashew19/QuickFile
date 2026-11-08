import { useState, useEffect, useRef } from 'react';
import { publicService } from '../services/publicService';

/**
 * Custom Hook for Google Identity Services (GIS) OAuth
 * - Loads GSI client script
 * - Initializes GIS client once
 * - Keeps callback in a ref to always access latest auth state & navigation
 * - Dynamically sizes the button to container width, capped at 360px
 * - Cleans up existing nodes to avoid duplicate buttons on re-render
 */
export function useGoogleSignIn({ containerRef, clientId, enabled, onCredential }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !clientId || !containerRef.current) return;
    if (initializedRef.current) return;

    let isMounted = true;

    publicService
      .loadGoogleScript()
      .then((google) => {
        if (!isMounted || !containerRef.current) return;
        if (!google?.accounts?.id) {
          throw new Error('Google Identity Services client unavailable.');
        }

        // Initialize Google Identity Services once
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response && response.credential) {
              onCredentialRef.current?.(response.credential);
            }
          },
        });

        // Compute button width: responsive to container but strictly capped at 360px
        const parentWidth = containerRef.current.offsetWidth || 320;
        const buttonWidth = Math.min(360, Math.max(200, parentWidth));

        // Clear container to prevent duplicate rendered buttons on provider re-renders
        containerRef.current.innerHTML = '';
        google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          width: buttonWidth,
          text: 'signin_with',
        });

        initializedRef.current = true;
        setIsLoaded(true);
      })
      .catch((err) => {
        if (!isMounted) return;
        setLoadError(err.message || 'Failed to initialize Google Sign-In.');
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, clientId, containerRef]);

  return { isLoaded, loadError };
}
