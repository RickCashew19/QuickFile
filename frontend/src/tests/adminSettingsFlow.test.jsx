import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminSettingsPage } from '../pages/admin/settings/AdminSettingsPage';
import { adminService } from '../api/adminService';
import { ApiError } from '../api/apiClient';

vi.mock('../api/adminService', () => ({
  adminService: {
    getSettings: vi.fn(),
    updateCustomSettings: vi.fn(),
    updateToggles: vi.fn(),
    updateGeneralSettings: vi.fn(),
    verifySuperAdminPin: vi.fn(),
    validateApiKey: vi.fn(),
    initiateApiKeyUpdate: vi.fn(),
    confirmApiKeyUpdate: vi.fn(),
  },
}));

describe('Admin Settings & API Key Management Suite', () => {
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
        secret_key: '••••••••••••••••',
      },
    },
    app_settings: [
      { key: 'system_name', value: 'Barangay San Isidro QuickFile' },
      { key: 'barangay_captain', value: 'Hon. Maria Santos' },
      { key: 'enable_google_login', value: false },
      { key: 'enable_recaptcha', value: false },
      { key: 'enable_sms_notifications', value: false },
      { key: 'enable_email_notifications', value: false },
      { key: 'enable_rest_api_gateway', value: false },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adminService.getSettings.mockResolvedValue(mockSettingsData);
    adminService.verifySuperAdminPin.mockResolvedValue({
      verified: true,
      grant_token: 'mock_grant_token',
      expires_in_seconds: 900,
    });
    adminService.validateApiKey.mockResolvedValue({
      valid: true,
      message: 'REST API Secret Key validated successfully.',
    });
    adminService.initiateApiKeyUpdate.mockResolvedValue({
      verification_id: 'v_test_123',
      email_masked: 'a***n@quickfile.gov.ph',
      expires_in_seconds: 600,
    });
    adminService.confirmApiKeyUpdate.mockResolvedValue({
      modified_keys: ['CUSTOM_REST_API_SECRET_KEY'],
      integrations: {
        ...mockSettingsData.integrations,
        rest_api: {
          source: 'custom',
          secret_key: 'custom_secret_key',
        },
      },
    });
    adminService.updateToggles.mockResolvedValue({
      enable_rest_api_gateway: true,
      enable_google_login: true,
    });
  });

  it('Section 1: Instantly asks for Super Admin PIN before granting access to System Settings', async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    );

    // Initial view must instantly show the PIN verification challenge
    await waitFor(() => {
      expect(screen.getByText('Super Admin PIN Verification Required')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Enter Super Admin PIN/i)).toBeInTheDocument();
    });

    // Neither settings tabs nor integration cards are accessible yet
    expect(screen.queryByText('Google OAuth 2.0 Single Sign-On')).not.toBeInTheDocument();
    expect(screen.queryByText('Barangay Information & Signatories')).not.toBeInTheDocument();

    // Enter incorrect PIN
    adminService.verifySuperAdminPin.mockRejectedValueOnce(
      new Error('Incorrect Super Admin PIN. Verification failed.')
    );

    const pinInput = screen.getByPlaceholderText(/Enter Super Admin PIN/i);
    fireEvent.change(pinInput, { target: { value: 'wrong-pin' } });

    const unlockBtn = screen.getByRole('button', { name: /Verify PIN/i });
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByText('Incorrect Super Admin PIN. Verification failed.')).toBeInTheDocument();
    });

    // Enter correct PIN
    fireEvent.change(pinInput, { target: { value: 'CorrectPin@2026' } });
    fireEvent.click(unlockBtn);

    // Settings page unlocks and renders navigation and integration cards
    await waitFor(() => {
      expect(screen.getByText('Super Admin Session Active')).toBeInTheDocument();
      expect(screen.getByText('Google OAuth 2.0 Single Sign-On')).toBeInTheDocument();
      expect(screen.queryByText('REST API Gateway Security & Key Management')).not.toBeInTheDocument();
    });
  });

  it('Section 2: Feature Toggles tab and Core Service overview card are removed with direct switches on service cards', async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage initialPinVerified={true} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('API Key Management & Gateways')).toBeInTheDocument();
      expect(screen.getByText('Barangay Information & Signatories')).toBeInTheDocument();
    });

    // Assert that the standalone "Feature Toggles" tab button is NOT present in the navigation
    const tabButtons = screen.getAllByRole('button');
    const hasStandaloneTogglesTab = tabButtons.some(
      (btn) => btn.className.includes('qf-settings-tab-btn') && btn.textContent.includes('Feature Toggles')
    );
    expect(hasStandaloneTogglesTab).toBe(false);

    // Assert that the Core Service & Feature Toggles overview card is removed
    expect(screen.queryByText('Core Service & Feature Toggles')).not.toBeInTheDocument();

    // Assert that individual service cards have their direct switch toggles
    expect(screen.getByRole('checkbox', { name: /Toggle Google Login Service/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Toggle SMS Notifications Service/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Toggle Email Notifications Service/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Toggle Google reCAPTCHA Service/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Toggle REST API Gateway Authentication/i })).not.toBeInTheDocument();
    expect(screen.queryByText('REST API Gateway Security & Key Management')).not.toBeInTheDocument();
  });

  it('Section 3: Confirms each service toggle with a fresh PIN and shows feedback in its card', async () => {
    adminService.updateToggles.mockResolvedValue({
      enable_sms_notifications: true,
    });

    render(
      <MemoryRouter>
        <AdminSettingsPage initialPinVerified={true} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PhilSMS Gateway')).toBeInTheDocument();
    });

    // Locate the direct toggle switch in the PhilSMS Gateway card
    const toggleCheckbox = screen.getByRole('checkbox', {
      name: /Toggle SMS Notifications Service/i,
    });
    expect(toggleCheckbox).toBeInTheDocument();
    expect(toggleCheckbox.checked).toBe(false);

    // Toggle on
    fireEvent.click(toggleCheckbox);

    const smsCard = screen.getByText('PhilSMS Gateway').closest('.qf-integration-card');
    expect(
      within(smsCard).getByText(/Confirm enabling SMS Notifications/i)
    ).toBeInTheDocument();
    expect(adminService.updateToggles).not.toHaveBeenCalled();

    fireEvent.change(within(smsCard).getByPlaceholderText('Enter Super Admin PIN'), {
      target: { value: 'FreshSuperAdminPIN' },
    });
    fireEvent.click(within(smsCard).getByRole('button', { name: /Confirm Enable/i }));

    await waitFor(() => {
      expect(adminService.updateToggles).toHaveBeenCalledWith(
        { enable_sms_notifications: true, su_admin_key: 'FreshSuperAdminPIN' }
      );
      expect(within(smsCard).getByText(/SMS Notifications enabled and active successfully/i)).toBeInTheDocument();
    });
    expect(toggleCheckbox.checked).toBe(true);
  });

  it('keeps a failed toggle unchanged and displays the authorization error in that service card', async () => {
    adminService.updateToggles.mockRejectedValueOnce(
      new Error('Invalid Super Admin PIN. 4 attempt(s) remaining before lockout.')
    );

    render(
      <MemoryRouter>
        <AdminSettingsPage initialPinVerified={true} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PhilSMS Gateway')).toBeInTheDocument();
    });

    const smsCard = screen.getByText('PhilSMS Gateway').closest('.qf-integration-card');
    const toggleCheckbox = within(smsCard).getByRole('checkbox', {
      name: /Toggle SMS Notifications Service/i,
    });
    fireEvent.click(toggleCheckbox);
    fireEvent.change(within(smsCard).getByPlaceholderText('Enter Super Admin PIN'), {
      target: { value: 'WrongSuperAdminPIN' },
    });
    fireEvent.click(within(smsCard).getByRole('button', { name: /Confirm Enable/i }));

    await waitFor(() => {
      expect(
        within(smsCard).getByText(/Invalid Super Admin PIN\. 4 attempt\(s\) remaining/i)
      ).toBeInTheDocument();
    });
    expect(toggleCheckbox.checked).toBe(false);
    expect(within(smsCard).getByPlaceholderText('Enter Super Admin PIN')).toHaveValue('');
  });

  it('Section 4: Validates API key with provider and displays feedback', async () => {
    adminService.validateApiKey.mockResolvedValue({
      valid: true,
      message: 'PhilSMS API Token validated successfully.',
    });

    render(
      <MemoryRouter>
        <AdminSettingsPage initialPinVerified={true} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PhilSMS Gateway')).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByPlaceholderText(/Custom SMS token/i);
    fireEvent.change(apiKeyInput, { target: { value: 'philsms_test_token_1234567890' } });

    const validateBtn = screen.getByRole('button', { name: /Validate with PhilSMS/i });
    fireEvent.click(validateBtn);

    await waitFor(() => {
      expect(adminService.validateApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'sms',
          credentials: expect.objectContaining({
            CUSTOM_SMS_API_TOKEN: 'philsms_test_token_1234567890',
          }),
        })
      );
      expect(screen.getByText(/PhilSMS API Token validated successfully/i)).toBeInTheDocument();
    });
  });

  it('Section 5: Entering custom API (like Google Auth) sends 2FA and verifies if it is a working API', async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage initialPinVerified={true} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Google OAuth 2.0 Single Sign-On')).toBeInTheDocument();
    });

    // Enter custom Google OAuth credentials
    const clientIdInput = screen.getByPlaceholderText(/Enter client ID to override/i);
    const clientSecretInput = screen.getByPlaceholderText(/Enter client secret to override/i);

    fireEvent.change(clientIdInput, {
      target: { value: '123456789-abcdef.apps.googleusercontent.com' },
    });
    fireEvent.change(clientSecretInput, {
      target: { value: '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s' },
    });

    // Locate Google OAuth card's Save & Verify (2FA) button
    const googleCard = screen.getByText('Google OAuth 2.0 Single Sign-On').closest('.qf-integration-card');
    const saveBtn = googleCard.querySelector('button.qf-btn--primary');
    expect(saveBtn).toBeInTheDocument();
    fireEvent.click(saveBtn);

    // If Super Admin Key step-up modal opens, authorize
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    if (screen.queryByPlaceholderText(/Enter authorization key/i)) {
      const suKeyInput = screen.getByPlaceholderText(/Enter authorization key/i);
      fireEvent.change(suKeyInput, { target: { value: 'SuperAdminPIN@2026' } });
      const authContinueBtn = screen.getByRole('button', { name: /Authorize & Continue/i });
      fireEvent.click(authContinueBtn);
    }

    // 2FA verification code dispatched and 2FA modal opens
    await waitFor(() => {
      expect(adminService.initiateApiKeyUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            CUSTOM_GOOGLE_CLIENT_ID: '123456789-abcdef.apps.googleusercontent.com',
            CUSTOM_GOOGLE_CLIENT_SECRET: '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s',
          }),
        })
      );
      expect(screen.getByText('Two-Factor Authentication (2FA)')).toBeInTheDocument();
    });

    // Scenario A: When API is verified as NOT working, backend rejects and modal shows error
    adminService.confirmApiKeyUpdate.mockRejectedValueOnce(
      new Error('Google OAuth API is not working: Invalid Google Client ID format.')
    );

    const codeInput = screen.getByPlaceholderText('000000');
    fireEvent.change(codeInput, { target: { value: '123456' } });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Activate API Key/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Google OAuth API is not working: Invalid Google Client ID format/i)
      ).toBeInTheDocument();
    });

    // Scenario B: When API is working, 2FA confirms and activates custom key
    adminService.confirmApiKeyUpdate.mockResolvedValueOnce({
      modified_keys: ['CUSTOM_GOOGLE_CLIENT_ID', 'CUSTOM_GOOGLE_CLIENT_SECRET'],
      integrations: {
        ...mockSettingsData.integrations,
        google: {
          source: 'custom',
          client_id: '123456789-abcdef.apps.googleusercontent.com',
          client_secret: '••••••••••••••••',
        },
      },
    });

    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/2FA verification successful\. Custom API key configurations saved and activated/i)
      ).toBeInTheDocument();
    });
  });

  it('handles HTTP 423 Lockout error gracefully', async () => {
    const lockoutError = new ApiError(
      'Super Admin Key is locked. Try again in 30 minute(s).',
      423,
      'LOCKED'
    );
    adminService.verifySuperAdminPin.mockRejectedValue(lockoutError);

    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter Super Admin PIN/i)).toBeInTheDocument();
    });

    const pinInput = screen.getByPlaceholderText(/Enter Super Admin PIN/i);
    fireEvent.change(pinInput, { target: { value: 'locked-pin' } });

    const unlockBtn = screen.getByRole('button', { name: /Verify PIN/i });
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByText('Super Admin Key Lockout Active')).toBeInTheDocument();
      expect(
        screen.getByText(/Super Admin Key is locked\. Try again in 30 minute\(s\)\./)
      ).toBeInTheDocument();
    });
  });
});
