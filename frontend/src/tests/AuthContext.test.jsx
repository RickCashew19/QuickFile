import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../contexts/AuthContext';
import { useAuth } from '../hooks/useAuth';
import { authStorage } from '../services/authStorage';
import { authService } from '../services/authService';
import { ROLES, STAFF_PERMISSIONS } from '../config/constants';

function TestConsumer() {
  const { user, isAuthenticated, isLoading, login, logout, hasPermission } = useAuth();

  if (isLoading) return <div>Loading Auth...</div>;

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'LOGGED_IN' : 'GUEST'}</div>
      <div data-testid="user-role">{user ? user.role : 'NO_USER'}</div>
      <div data-testid="can-review">
        {hasPermission(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS) ? 'PERMITTED' : 'DENIED'}
      </div>
      <button
        type="button"
        onClick={() => login('admin@quickfile.gov.ph', 'password123')}
      >
        Sign In Button
      </button>
      <button type="button" onClick={() => logout()}>
        Sign Out Button
      </button>
    </div>
  );
}

describe('AuthContext and useAuth Suite', () => {
  beforeEach(() => {
    authStorage.clearAll();
    vi.restoreAllMocks();
  });

  it('hydrates guest status when no token is present', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('GUEST');
    expect(screen.getByTestId('user-role')).toHaveTextContent('NO_USER');
  });

  it('handles login flow and updates authenticated state', async () => {
    const user = userEvent.setup();

    vi.spyOn(authService, 'login').mockResolvedValue({
      access_token: 'valid_jwt_mock',
      user: { id: 'u1', email: 'admin@quickfile.gov.ph', role: ROLES.ADMIN },
      profile: null,
      permissions: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await screen.findByTestId('auth-status');
    await user.click(screen.getByText('Sign In Button'));

    expect(screen.getByTestId('auth-status')).toHaveTextContent('LOGGED_IN');
    expect(screen.getByTestId('user-role')).toHaveTextContent(ROLES.ADMIN);
    // Admin implicitly holds all staff permissions
    expect(screen.getByTestId('can-review')).toHaveTextContent('PERMITTED');
  });

  it('correctly evaluates staff granular permissions', async () => {
    vi.spyOn(authService, 'getMe').mockResolvedValue({
      user: { id: 'staff_1', role: ROLES.STAFF },
      permissions: { [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: true },
    });
    authStorage.setToken('mock_staff_token');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('LOGGED_IN');
    expect(screen.getByTestId('user-role')).toHaveTextContent(ROLES.STAFF);
    expect(screen.getByTestId('can-review')).toHaveTextContent('PERMITTED');
  });

  it('handles logout flow and purges stored credentials', async () => {
    const user = userEvent.setup();
    vi.spyOn(authService, 'logout').mockResolvedValue({});
    authStorage.setToken('active_token');
    authStorage.setUser({ id: 'u1', role: ROLES.CITIZEN });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await screen.findByTestId('auth-status');
    await user.click(screen.getByText('Sign Out Button'));

    expect(screen.getByTestId('auth-status')).toHaveTextContent('GUEST');
    expect(authStorage.getToken()).toBeNull();
  });
});
