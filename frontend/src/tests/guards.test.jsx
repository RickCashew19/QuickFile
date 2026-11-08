import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/guards/ProtectedRoute';
import { RoleRoute } from '../components/guards/RoleRoute';
import { PermissionRoute } from '../components/guards/PermissionRoute';
import { ROLES, STAFF_PERMISSIONS } from '../config/constants';
import * as useAuthModule from '../hooks/useAuth';

describe('Security Route Guards Suite', () => {
  it('ProtectedRoute redirects unauthenticated visitors to /login', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<div>LOGIN_PAGE</div>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute>
                <div>SECRET_CONTENT</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument();
    expect(screen.queryByText('SECRET_CONTENT')).not.toBeInTheDocument();
  });

  it('RoleRoute grants access when user matches allowed role', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { role: ROLES.CITIZEN },
    });

    render(
      <MemoryRouter initialEntries={['/citizen/requests']}>
        <Routes>
          <Route
            path="/citizen/requests"
            element={
              <RoleRoute allowedRoles={[ROLES.CITIZEN]}>
                <div>CITIZEN_REQUESTS</div>
              </RoleRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('CITIZEN_REQUESTS')).toBeInTheDocument();
  });

  it('RoleRoute redirects mismatched role to appropriate portal home', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { role: ROLES.CITIZEN },
    });

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route path="/citizen/requests" element={<div>CITIZEN_PORTAL_HOME</div>} />
          <Route
            path="/admin/dashboard"
            element={
              <RoleRoute allowedRoles={[ROLES.ADMIN]}>
                <div>ADMIN_DASHBOARD</div>
              </RoleRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('CITIZEN_PORTAL_HOME')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN_DASHBOARD')).not.toBeInTheDocument();
  });

  it('PermissionRoute blocks staff without required permission', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { role: ROLES.STAFF },
      hasPermission: (perm) => perm === STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS,
    });

    render(
      <MemoryRouter initialEntries={['/staff/reports']}>
        <Routes>
          <Route path="/staff/dashboard" element={<div>STAFF_DASHBOARD_HOME</div>} />
          <Route
            path="/staff/reports"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_VIEW_REPORTS}>
                <div>REPORTS_VIEW</div>
              </PermissionRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('STAFF_DASHBOARD_HOME')).toBeInTheDocument();
    expect(screen.queryByText('REPORTS_VIEW')).not.toBeInTheDocument();
  });
});
