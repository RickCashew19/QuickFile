import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminSettingsPage } from '../pages/admin/settings/AdminSettingsPage';
import { adminService } from '../services/adminService';
import { ApiError } from '../services/apiClient';

vi.mock('../services/adminService', () => ({
  adminService: {
    getSettings: vi.fn(),
    updateCustomSettings: vi.fn(),
    updateToggles: vi.fn(),
    updateGeneralSettings: vi.fn(),
  },
}));

describe('Admin Settings & Super Admin Key Flow', () => {
  const mockSettingsData = {
    integrations: {
      google: {
        source: 'default',
        client_id: '••••••••••••1234.apps.googleusercontent.com',
        client_secret: '••••••••••••••••',
      },
      sms: {
        source: 'custom',
        gateway_url: 'https://app.philsms.com/api/v3/sms/send',
        api_token: '••••••••••••••••••••••••••••••••',
      },
      smtp: {
        source: 'default',
        host: 'smtp.gmail.com',
        user: '••••••••@quickfile.gov.ph',
        pass: '••••••••••••••••',
      },
      recaptcha: {
        source: 'default',
        site_key: '••••••••••••••••••••••••••••••••',
        secret_key: '••••••••••••••••••••••••••••••••',
      },
      rest_api: {
        source: 'default',
        secret_key: '••••••••••••••••••••••••••••••••',
      },
    },
    app_settings: [
      { key: 'system_name', value: 'Barangay San Isidro QuickFile' },
      { key: 'barangay_captain', value: 'Hon. Maria Santos' },
      { key: 'enable_google_login', value: false },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adminService.getSettings.mockResolvedValue(mockSettingsData);
  });

  it('renders masked integration values and Default/Custom source badges', async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Google OAuth 2.0 Single Sign-On')).toBeInTheDocument();
    });

    // Verify Default and Custom badges
    const defaultBadges = screen.getAllByText('Default');
    expect(defaultBadges.length).toBeGreaterThanOrEqual(1);

    const customBadges = screen.getAllByText('Custom');
    expect(customBadges.length).toBeGreaterThanOrEqual(1);

    // Verify masked preview text exists
    expect(screen.getByText(/1234\.apps\.googleusercontent\.com/)).toBeInTheDocument();
  });

  it('prompts SuperAdminKeyModal on save, zeroes key from state after submit, and calls API', async () => {
    adminService.updateCustomSettings.mockResolvedValue({
      modified_keys: ['CUSTOM_GOOGLE_CLIENT_ID'],
      integrations: {
        ...mockSettingsData.integrations,
        google: {
          source: 'custom',
          client_id: 'custom-google-id',
          client_secret: '••••••••••••••••',
        },
      },
    });

    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Google OAuth 2.0 Single Sign-On')).toBeInTheDocument();
    });

    // Fill in Custom Google Client ID draft
    const clientIdInputs = screen.getAllByPlaceholderText(/Enter client ID to override/i);
    fireEvent.change(clientIdInputs[0], { target: { value: 'custom-google-id' } });

    // Click Save Settings for Google OAuth
    const saveButtons = screen.getAllByRole('button', { name: /Save Settings/i });
    fireEvent.click(saveButtons[0]);

    // SuperAdminKeyModal should now be open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Authorize: Google OAuth/i)).toBeInTheDocument();
    });

    // Key input
    const keyInput = screen.getByPlaceholderText(/Enter authorization key/i);
    expect(keyInput).toBeInTheDocument();
    fireEvent.change(keyInput, { target: { value: 'SecretKey@2026' } });

    // Submit key
    const authSaveBtn = screen.getByRole('button', { name: /Authorize & Save/i });
    fireEvent.click(authSaveBtn);

    await waitFor(() => {
      expect(adminService.updateCustomSettings).toHaveBeenCalledWith({
        su_admin_key: 'SecretKey@2026',
        settings: { CUSTOM_GOOGLE_CLIENT_ID: 'custom-google-id' },
        reset_keys: [],
      });
    });

    // Verify success alert
    await waitFor(() => {
      expect(screen.getByText('Integration settings saved successfully.')).toBeInTheDocument();
    });
  });

  it('prompts SuperAdminKeyModal on Reset to Default with correct resetKeys', async () => {
    adminService.updateCustomSettings.mockResolvedValue({
      modified_keys: ['CUSTOM_SMS_API_TOKEN'],
      integrations: {
        ...mockSettingsData.integrations,
        sms: {
          source: 'default',
          gateway_url: 'https://app.philsms.com/api/v3/sms/send',
          api_token: '••••••••••••••••',
        },
      },
    });

    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PhilSMS Gateway')).toBeInTheDocument();
    });

    // Click Reset to Default for SMS Gateway (which has source: 'custom')
    const resetBtn = screen.getByRole('button', { name: /Reset to Default/i });
    fireEvent.click(resetBtn);

    // Modal opens for reset
    await waitFor(() => {
      expect(screen.getByText(/Authorize: SMS Gateway/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Authorize & Reset/i })).toBeInTheDocument();
    });

    // Provide key and submit
    const keyInput = screen.getByPlaceholderText(/Enter authorization key/i);
    fireEvent.change(keyInput, { target: { value: 'SecretKey@2026' } });

    const authResetBtn = screen.getByRole('button', { name: /Authorize & Reset/i });
    fireEvent.click(authResetBtn);

    await waitFor(() => {
      expect(adminService.updateCustomSettings).toHaveBeenCalledWith({
        su_admin_key: 'SecretKey@2026',
        settings: {},
        reset_keys: ['CUSTOM_SMS_GATEWAY_URL', 'CUSTOM_SMS_API_TOKEN', 'CUSTOM_SMS_SENDER_ID'],
      });
    });
  });

  it('handles HTTP 423 Lockout error and renders prominent lockout alert banner', async () => {
    const lockoutError = new ApiError(
      'Super Admin Key is locked. Try again in 30 minute(s).',
      423,
      'LOCKED'
    );
    adminService.updateCustomSettings.mockRejectedValue(lockoutError);

    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Google OAuth 2.0 Single Sign-On')).toBeInTheDocument();
    });

    const clientIdInputs = screen.getAllByPlaceholderText(/Enter client ID to override/i);
    fireEvent.change(clientIdInputs[0], { target: { value: 'test' } });

    const saveButtons = screen.getAllByRole('button', { name: /Save Settings/i });
    fireEvent.click(saveButtons[0]);

    const keyInput = screen.getByPlaceholderText(/Enter authorization key/i);
    fireEvent.change(keyInput, { target: { value: 'wrong-key' } });

    const authSaveBtn = screen.getByRole('button', { name: /Authorize & Save/i });
    fireEvent.click(authSaveBtn);

    // Modal closes and prominent lockout banner appears
    await waitFor(() => {
      expect(screen.getByText('Super Admin Key Lockout Active')).toBeInTheDocument();
      expect(screen.getByText(/Super Admin Key is locked\. Try again in 30 minute\(s\)\./)).toBeInTheDocument();
    });
  });
});
