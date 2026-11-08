import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useRecaptcha } from '../hooks/useRecaptcha';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { LoginPage } from '../pages/public/LoginPage';
import { publicService } from '../services/publicService';

vi.mock('../services/publicService', () => ({
  publicService: {
    getConfig: vi.fn(),
    loadRecaptchaScript: vi.fn(),
    loadGoogleScript: vi.fn(),
  },
}));

const mockAuth = {
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
  sessionExpiredMessage: null,
  clearExpiredMessage: vi.fn(),
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

describe('Login Integrations Hooks & Page Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.sessionExpiredMessage = null;
    mockAuth.login.mockReset();
  });

  describe('useRecaptcha Hook', () => {
    it('waits for grecaptcha.ready, renders once with widgetId, and handles reset', async () => {
      const container = document.createElement('div');
      const containerRef = { current: container };
      const onVerify = vi.fn();
      const onExpire = vi.fn();

      const mockGrecaptcha = {
        ready: vi.fn((cb) => cb()),
        render: vi.fn().mockReturnValue(42),
        reset: vi.fn(),
      };
      window.grecaptcha = mockGrecaptcha;
      publicService.loadRecaptchaScript.mockResolvedValue(mockGrecaptcha);

      const { result, rerender } = renderHook(
        (props) => useRecaptcha(props),
        {
          initialProps: {
            containerRef,
            siteKey: 'test-site-key',
            enabled: true,
            onVerify,
            onExpire,
          },
        }
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(publicService.loadRecaptchaScript).toHaveBeenCalledTimes(1);
      expect(mockGrecaptcha.ready).toHaveBeenCalledTimes(1);
      expect(mockGrecaptcha.render).toHaveBeenCalledWith(
        container,
        expect.objectContaining({
          sitekey: 'test-site-key',
        })
      );
      expect(result.current.isLoaded).toBe(true);

      // Re-render hook with new function references
      rerender({
        containerRef,
        siteKey: 'test-site-key',
        enabled: true,
        onVerify: vi.fn(),
        onExpire: vi.fn(),
      });

      // Render must NOT be called again
      expect(mockGrecaptcha.render).toHaveBeenCalledTimes(1);

      // Reset uses the stored widgetId (42)
      act(() => {
        result.current.reset();
      });
      expect(mockGrecaptcha.reset).toHaveBeenCalledWith(42);
    });

    it('sets clear loadError when reCAPTCHA script fails to load', async () => {
      const container = document.createElement('div');
      const containerRef = { current: container };
      publicService.loadRecaptchaScript.mockRejectedValue(new Error('Network offline'));

      const { result } = renderHook(() =>
        useRecaptcha({
          containerRef,
          siteKey: 'test-key',
          enabled: true,
          onVerify: vi.fn(),
          onExpire: vi.fn(),
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.loadError).toContain('Network offline');
      expect(result.current.isLoaded).toBe(false);
    });
  });

  describe('useGoogleSignIn Hook', () => {
    it('initializes GIS once, renders button capped at 360px, and prevents duplicate buttons', async () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'offsetWidth', { value: 400, configurable: true });
      const containerRef = { current: container };
      const onCredential = vi.fn();

      const mockGoogle = {
        accounts: {
          id: {
            initialize: vi.fn(),
            renderButton: vi.fn(),
          },
        },
      };
      publicService.loadGoogleScript.mockResolvedValue(mockGoogle);

      const { result, rerender } = renderHook(
        (props) => useGoogleSignIn(props),
        {
          initialProps: {
            containerRef,
            clientId: 'test-client-id.apps.googleusercontent.com',
            enabled: true,
            onCredential,
          },
        }
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(publicService.loadGoogleScript).toHaveBeenCalledTimes(1);
      expect(mockGoogle.accounts.id.initialize).toHaveBeenCalledTimes(1);
      // Button width capped at 360 even if container offsetWidth is 400
      expect(mockGoogle.accounts.id.renderButton).toHaveBeenCalledWith(
        container,
        expect.objectContaining({
          width: 360,
        })
      );
      expect(result.current.isLoaded).toBe(true);

      // Re-render should not duplicate buttons or re-initialize
      rerender({
        containerRef,
        clientId: 'test-client-id.apps.googleusercontent.com',
        enabled: true,
        onCredential: vi.fn(),
      });

      expect(mockGoogle.accounts.id.initialize).toHaveBeenCalledTimes(1);
      expect(mockGoogle.accounts.id.renderButton).toHaveBeenCalledTimes(1);
    });
  });

  describe('LoginPage Wrong Password Alert Guarantee', () => {
    it('shows ONE red error alert and NO session expired warning on 401 wrong password', async () => {
      publicService.getConfig.mockResolvedValue({
        system_name: 'QuickFile',
        barangay_name: 'Barangay Central',
        integrations: { recaptcha_enabled: false, google_login_enabled: false },
      });

      mockAuth.login.mockRejectedValue(new Error('Invalid email or password.'));

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Sign In')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'citizen@test.ph' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'wrongpass' },
      });

      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      await waitFor(() => {
        // Red error must be present
        expect(screen.getByText('Invalid email or password.')).toBeInTheDocument();
        // Session expired warning must NOT be shown
        expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
      });
    });
  });
});
