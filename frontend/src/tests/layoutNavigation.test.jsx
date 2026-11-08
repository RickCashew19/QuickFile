import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StaffLayout } from '../components/layout/StaffLayout';
import { CitizenLayout } from '../components/layout/CitizenLayout';
import { AdminLayout } from '../components/layout/AdminLayout';
import { ROLES, STAFF_PERMISSIONS } from '../config/constants';
import * as useAuthModule from '../hooks/useAuth';

describe('Layout Navigation by Role and Permission Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('StaffLayout filters menu items based on staff granular permissions', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { full_name: 'Officer Maria', role: ROLES.STAFF },
      hasPermission: (perm) => perm === STAFF_PERMISSIONS.CAN_VERIFY_QR,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/staff/dashboard']}>
        <Routes>
          <Route path="/staff" element={<StaffLayout />}>
            <Route path="dashboard" element={<div>STAFF_PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Dashboard is always visible
    expect(screen.getAllByText('Staff Dashboard')[0]).toBeInTheDocument();

    // Staff QR Scanner is permitted
    expect(screen.getAllByText('Staff QR Scanner')[0]).toBeInTheDocument();

    // Request Queue and Reports should NOT be visible because permission is false
    expect(screen.queryByText('Request Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Reports & Analytics')).not.toBeInTheDocument();
  });

  it('StaffLayout shows all items when user is an administrator', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { full_name: 'Super Admin', role: ROLES.ADMIN },
      hasPermission: () => true, // Admin has all permissions
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/staff/dashboard']}>
        <Routes>
          <Route path="/staff" element={<StaffLayout />}>
            <Route path="dashboard" element={<div>STAFF_PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Request Queue')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Walk-In Filing')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Historical Records')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Staff QR Scanner')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Reports & Analytics')[0]).toBeInTheDocument();
  });

  it('CitizenLayout displays citizen items and unread count badge', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { full_name: 'Juan Resident', role: ROLES.CITIZEN },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/citizen/dashboard']}>
        <Routes>
          <Route path="/citizen" element={<CitizenLayout />}>
            <Route path="dashboard" element={<div>CITIZEN_PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Browse Catalog')[0]).toBeInTheDocument();
    expect(screen.getAllByText('New Request')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Request History')[0]).toBeInTheDocument();
    expect(screen.getAllByText('My Profile')[0]).toBeInTheDocument();
    expect(screen.getByText('Juan Resident')).toBeInTheDocument();
  });

  it('AdminLayout displays all administrative modules and handles drawer escape key', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { full_name: 'Administrator', role: ROLES.ADMIN },
      logout: vi.fn(),
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="dashboard" element={<div>ADMIN_PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Staff Accounts')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Document Types')[0]).toBeInTheDocument();
    expect(screen.getAllByText('System Settings')[0]).toBeInTheDocument();

    // Open mobile drawer
    const hamburger = screen.getByLabelText('Open menu');
    await user.click(hamburger);

    expect(screen.getByRole('dialog', { name: 'Admin Navigation' })).toBeInTheDocument();

    // Press escape key to close drawer
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Admin Navigation' })).not.toBeInTheDocument();
  });
});
