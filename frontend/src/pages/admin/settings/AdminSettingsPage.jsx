import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../services/adminService';
import { SuperAdminKeyModal } from '../../../components/shared/SuperAdminKeyModal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Icon } from '../../../components/shared/Icon';
import './AdminSettingsPage.css';

export function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('integrations'); // 'integrations' | 'general' | 'toggles'
  const [settingsData, setSettingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [lockoutAlert, setLockoutAlert] = useState(null);

  // Custom Integration draft values
  const [customDrafts, setCustomDrafts] = useState({});

  // Super Admin Key Modal state
  const [suModalOpen, setSuModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'save' | 'reset', section: string, resetKeys?: string[] }
  const [suKeySubmitting, setSuKeySubmitting] = useState(false);
  const [suModalError, setSuModalError] = useState(null);

  // General settings draft
  const [generalDraft, setGeneralDraft] = useState({
    system_name: '',
    contact_email: '',
    contact_phone: '',
    office_name: '',
    barangay_captain: '',
    barangay_secretary: '',
  });
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Toggles draft
  const [togglesDraft, setTogglesDraft] = useState({
    enable_google_login: false,
    enable_recaptcha: false,
    enable_sms_notifications: false,
    enable_email_notifications: false,
    enable_rest_api_gateway: false,
  });
  const [savingToggles, setSavingToggles] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getSettings();
      setSettingsData(res);

      // Hydrate general settings and toggles from app_settings
      const appSettings = res.app_settings || [];
      const appMap = new Map(appSettings.map((s) => [s.key, s.value]));

      setGeneralDraft({
        system_name: appMap.get('system_name') || 'QuickFile',
        contact_email: appMap.get('contact_email') || 'office@quickfile.gov.ph',
        contact_phone: appMap.get('contact_phone') || '09171234567',
        office_name: appMap.get('office_name') || 'Office of the Barangay Captain',
        barangay_captain: appMap.get('barangay_captain') || 'Hon. Barangay Captain',
        barangay_secretary: appMap.get('barangay_secretary') || 'Barangay Secretary',
      });

      setTogglesDraft({
        enable_google_login: Boolean(appMap.get('enable_google_login')),
        enable_recaptcha: Boolean(appMap.get('enable_recaptcha')),
        enable_sms_notifications: Boolean(appMap.get('enable_sms_notifications')),
        enable_email_notifications: Boolean(appMap.get('enable_email_notifications')),
        enable_rest_api_gateway: Boolean(appMap.get('enable_rest_api_gateway')),
      });
    } catch (err) {
      if (err.status === 423) {
        setLockoutAlert(err.message);
      } else {
        setError(err.message || 'Failed to retrieve system settings.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleDraftChange = (key, value) => {
    setCustomDrafts((prev) => ({ ...prev, [key]: value }));
  };

  // Trigger Save for an integration section
  const handlePromptSave = (section) => {
    setPendingAction({ type: 'save', section });
    setSuModalError(null);
    setSuModalOpen(true);
  };

  // Trigger Reset for an integration section
  const handlePromptReset = (section, resetKeys) => {
    setPendingAction({ type: 'reset', section, resetKeys });
    setSuModalError(null);
    setSuModalOpen(true);
  };

  // Super Admin Key confirmed callback
  const handleAuthorizeAction = async (suAdminKey) => {
    if (!pendingAction) return;
    setSuKeySubmitting(true);
    setSuModalError(null);

    try {
      const payload = {
        su_admin_key: suAdminKey,
        settings: {},
        reset_keys: [],
      };

      if (pendingAction.type === 'save') {
        payload.settings = customDrafts;
      } else if (pendingAction.type === 'reset') {
        payload.reset_keys = pendingAction.resetKeys || [];
      }

      const res = await adminService.updateCustomSettings(payload);

      // Successfully updated; update state and clear drafts
      setSettingsData((prev) => ({
        ...prev,
        integrations: res.integrations || prev.integrations,
      }));
      setCustomDrafts({});
      setSuModalOpen(false);
      setPendingAction(null);
      setSuccessMsg(
        pendingAction.type === 'save'
          ? 'Integration settings saved successfully.'
          : 'Integration settings reset to system defaults.'
      );
    } catch (err) {
      if (err.status === 423) {
        // Super Admin Key Lockout
        setSuModalOpen(false);
        setPendingAction(null);
        setLockoutAlert(err.message || 'Super Admin Key is locked due to excessive failed attempts.');
      } else {
        setSuModalError(err.message || 'Authorization failed. Please verify your Super Admin Key.');
      }
    } finally {
      setSuKeySubmitting(false);
    }
  };

  // General settings submit
  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setSavingGeneral(true);
    setError(null);
    try {
      await adminService.updateGeneralSettings(generalDraft);
      setSuccessMsg('Barangay general information updated successfully.');
    } catch (err) {
      setError(err.message || 'Failed to update general settings.');
    } finally {
      setSavingGeneral(false);
    }
  };

  // Toggles submit
  const handleSaveToggles = async (e) => {
    e.preventDefault();
    setSavingToggles(true);
    setError(null);
    try {
      await adminService.updateToggles(togglesDraft);
      setSuccessMsg('Feature toggles updated successfully.');
    } catch (err) {
      setError(err.message || 'Failed to update feature toggles.');
    } finally {
      setSavingToggles(false);
    }
  };

  const integrations = settingsData?.integrations || {};

  return (
    <div className="qf-admin-settings">
      <div className="qf-admin-staff__header">
        <div>
          <h1 className="qf-admin-dashboard__title">System & Security Settings</h1>
          <p className="qf-admin-dashboard__subtitle">
            Configure jurisdiction credentials, integration gateways, and step-up Super Admin protections.
          </p>
        </div>
      </div>

      {/* Prominent HTTP 423 Lockout Alert */}
      {lockoutAlert && (
        <Alert variant="danger" onClose={() => setLockoutAlert(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <strong>Super Admin Key Lockout Active</strong>
            <span>{lockoutAlert}</span>
          </div>
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <div className="qf-settings-tabs">
        <button
          type="button"
          className={`qf-settings-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          <Icon name="shield" size={16} />
          Integration Gateways (Super Admin Key)
        </button>
        <button
          type="button"
          className={`qf-settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          <Icon name="user" size={16} />
          Barangay Information & Signatories
        </button>
        <button
          type="button"
          className={`qf-settings-tab-btn ${activeTab === 'toggles' ? 'active' : ''}`}
          onClick={() => setActiveTab('toggles')}
        >
          <Icon name="refresh" size={16} />
          Feature Toggles
        </button>
      </div>

      {loading ? (
        <Loader label="Loading system settings..." />
      ) : activeTab === 'integrations' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* 1. Google OAuth */}
          <div className="qf-integration-card">
            <div className="qf-integration-card__header">
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                  Google OAuth 2.0 Single Sign-On
                </h3>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Enables one-tap Google login for verified residents and staff.
                </span>
              </div>
              <span className={`qf-source-badge qf-source-badge--${integrations.google?.source || 'default'}`}>
                {integrations.google?.source === 'custom' ? 'Custom' : 'Default'}
              </span>
            </div>

            <div className="qf-masked-preview">
              <div>Active Client ID: <code>{integrations.google?.client_id || 'Not configured'}</code></div>
              <div>Active Client Secret: <code>{integrations.google?.client_secret || 'Not configured'}</code></div>
            </div>

            <div className="qf-grid-2col">
              <Input
                label="Custom Google Client ID"
                placeholder="Enter client ID to override..."
                value={customDrafts.CUSTOM_GOOGLE_CLIENT_ID || ''}
                onChange={(e) => handleDraftChange('CUSTOM_GOOGLE_CLIENT_ID', e.target.value)}
              />
              <Input
                label="Custom Google Client Secret"
                type="password"
                placeholder="Enter client secret to override..."
                value={customDrafts.CUSTOM_GOOGLE_CLIENT_SECRET || ''}
                onChange={(e) => handleDraftChange('CUSTOM_GOOGLE_CLIENT_SECRET', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              {integrations.google?.source === 'custom' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    handlePromptReset('Google OAuth', ['CUSTOM_GOOGLE_CLIENT_ID', 'CUSTOM_GOOGLE_CLIENT_SECRET'])
                  }
                >
                  Reset to Default
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => handlePromptSave('Google OAuth')}
                disabled={!customDrafts.CUSTOM_GOOGLE_CLIENT_ID && !customDrafts.CUSTOM_GOOGLE_CLIENT_SECRET}
              >
                Save Settings
              </Button>
            </div>
          </div>

          {/* 2. SMS Gateway */}
          <div className="qf-integration-card">
            <div className="qf-integration-card__header">
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                  PhilSMS Gateway
                </h3>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Delivers real-time SMS status updates to residents' mobile numbers.
                </span>
              </div>
              <span className={`qf-source-badge qf-source-badge--${integrations.sms?.source || 'default'}`}>
                {integrations.sms?.source === 'custom' ? 'Custom' : 'Default'}
              </span>
            </div>

            <div className="qf-masked-preview">
              <div>Gateway URL: <code>{integrations.sms?.gateway_url || 'https://app.philsms.com/api/v3/sms/send'}</code></div>
              <div>Active API Token: <code>{integrations.sms?.api_token || 'Not configured'}</code></div>
            </div>

            <div className="qf-grid-2col">
              <Input
                label="Custom Gateway URL"
                placeholder="https://..."
                value={customDrafts.CUSTOM_SMS_GATEWAY_URL || ''}
                onChange={(e) => handleDraftChange('CUSTOM_SMS_GATEWAY_URL', e.target.value)}
              />
              <Input
                label="Custom API Token"
                type="password"
                placeholder="Enter SMS token..."
                value={customDrafts.CUSTOM_SMS_API_TOKEN || ''}
                onChange={(e) => handleDraftChange('CUSTOM_SMS_API_TOKEN', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              {integrations.sms?.source === 'custom' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    handlePromptReset('SMS Gateway', ['CUSTOM_SMS_GATEWAY_URL', 'CUSTOM_SMS_API_TOKEN', 'CUSTOM_SMS_SENDER_ID'])
                  }
                >
                  Reset to Default
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => handlePromptSave('SMS Gateway')}
                disabled={!customDrafts.CUSTOM_SMS_GATEWAY_URL && !customDrafts.CUSTOM_SMS_API_TOKEN}
              >
                Save Settings
              </Button>
            </div>
          </div>

          {/* 3. SMTP Mailer */}
          <div className="qf-integration-card">
            <div className="qf-integration-card__header">
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                  SMTP Mailer
                </h3>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Sends transactional password resets and digital certificate notifications.
                </span>
              </div>
              <span className={`qf-source-badge qf-source-badge--${integrations.smtp?.source || 'default'}`}>
                {integrations.smtp?.source === 'custom' ? 'Custom' : 'Default'}
              </span>
            </div>

            <div className="qf-masked-preview">
              <div>Host: <code>{integrations.smtp?.host || 'smtp.gmail.com'}</code></div>
              <div>Username: <code>{integrations.smtp?.user || 'Not configured'}</code></div>
              <div>Password: <code>{integrations.smtp?.pass || '••••••'}</code></div>
            </div>

            <div className="qf-grid-2col">
              <Input
                label="Custom SMTP Host"
                placeholder="smtp.example.com"
                value={customDrafts.CUSTOM_SMTP_HOST || ''}
                onChange={(e) => handleDraftChange('CUSTOM_SMTP_HOST', e.target.value)}
              />
              <Input
                label="Custom SMTP User"
                placeholder="mailer@domain.com"
                value={customDrafts.CUSTOM_SMTP_USER || ''}
                onChange={(e) => handleDraftChange('CUSTOM_SMTP_USER', e.target.value)}
              />
              <Input
                label="Custom SMTP Pass"
                type="password"
                placeholder="App password..."
                value={customDrafts.CUSTOM_SMTP_PASS || ''}
                onChange={(e) => handleDraftChange('CUSTOM_SMTP_PASS', e.target.value)}
              />
              <Input
                label="Sender Display Name"
                placeholder="Barangay QuickFile Services"
                value={customDrafts.CUSTOM_SMTP_FROM_NAME || ''}
                onChange={(e) => handleDraftChange('CUSTOM_SMTP_FROM_NAME', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              {integrations.smtp?.source === 'custom' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    handlePromptReset('SMTP Mailer', [
                      'CUSTOM_SMTP_HOST',
                      'CUSTOM_SMTP_PORT',
                      'CUSTOM_SMTP_USER',
                      'CUSTOM_SMTP_PASS',
                      'CUSTOM_SMTP_FROM_NAME',
                      'CUSTOM_SMTP_FROM_EMAIL',
                    ])
                  }
                >
                  Reset to Default
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => handlePromptSave('SMTP Mailer')}
                disabled={
                  !customDrafts.CUSTOM_SMTP_HOST &&
                  !customDrafts.CUSTOM_SMTP_USER &&
                  !customDrafts.CUSTOM_SMTP_PASS &&
                  !customDrafts.CUSTOM_SMTP_FROM_NAME
                }
              >
                Save Settings
              </Button>
            </div>
          </div>

          {/* 4. Google reCAPTCHA */}
          <div className="qf-integration-card">
            <div className="qf-integration-card__header">
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                  Google reCAPTCHA Security
                </h3>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Bot challenge mitigation for registration and authentication forms.
                </span>
              </div>
              <span className={`qf-source-badge qf-source-badge--${integrations.recaptcha?.source || 'default'}`}>
                {integrations.recaptcha?.source === 'custom' ? 'Custom' : 'Default'}
              </span>
            </div>

            <div className="qf-masked-preview">
              <div>Site Key: <code>{integrations.recaptcha?.site_key || 'Not configured'}</code></div>
              <div>Secret Key: <code>{integrations.recaptcha?.secret_key || 'Not configured'}</code></div>
            </div>

            <div className="qf-grid-2col">
              <Input
                label="Custom Site Key"
                placeholder="6LeIxacTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                value={customDrafts.CUSTOM_RECAPTCHA_SITE_KEY || ''}
                onChange={(e) => handleDraftChange('CUSTOM_RECAPTCHA_SITE_KEY', e.target.value)}
              />
              <Input
                label="Custom Secret Key"
                type="password"
                placeholder="Secret key..."
                value={customDrafts.CUSTOM_RECAPTCHA_SECRET_KEY || ''}
                onChange={(e) => handleDraftChange('CUSTOM_RECAPTCHA_SECRET_KEY', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              {integrations.recaptcha?.source === 'custom' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    handlePromptReset('Google reCAPTCHA', ['CUSTOM_RECAPTCHA_SITE_KEY', 'CUSTOM_RECAPTCHA_SECRET_KEY'])
                  }
                >
                  Reset to Default
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => handlePromptSave('Google reCAPTCHA')}
                disabled={!customDrafts.CUSTOM_RECAPTCHA_SITE_KEY && !customDrafts.CUSTOM_RECAPTCHA_SECRET_KEY}
              >
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      ) : activeTab === 'general' ? (
        <form onSubmit={handleSaveGeneral} className="qf-integration-card">
          <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
            Barangay Profile & Certificate Signatories
          </h3>

          <div className="qf-grid-2col">
            <Input
              label="System Name"
              value={generalDraft.system_name}
              onChange={(e) => setGeneralDraft({ ...generalDraft, system_name: e.target.value })}
              required
            />
            <Input
              label="Issuing Office Name"
              value={generalDraft.office_name}
              onChange={(e) => setGeneralDraft({ ...generalDraft, office_name: e.target.value })}
              required
            />
          </div>

          <div className="qf-grid-2col">
            <Input
              label="Barangay Captain (Official Signatory)"
              value={generalDraft.barangay_captain}
              onChange={(e) => setGeneralDraft({ ...generalDraft, barangay_captain: e.target.value })}
              required
            />
            <Input
              label="Barangay Secretary (Attesting Official)"
              value={generalDraft.barangay_secretary}
              onChange={(e) => setGeneralDraft({ ...generalDraft, barangay_secretary: e.target.value })}
              required
            />
          </div>

          <div className="qf-grid-2col">
            <Input
              label="Official Contact Email"
              type="email"
              value={generalDraft.contact_email}
              onChange={(e) => setGeneralDraft({ ...generalDraft, contact_email: e.target.value })}
              required
            />
            <Input
              label="Official Contact Phone"
              value={generalDraft.contact_phone}
              onChange={(e) => setGeneralDraft({ ...generalDraft, contact_phone: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" type="submit" loading={savingGeneral}>
              Save General Information
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSaveToggles} className="qf-integration-card">
          <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
            Core System Feature Flags
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={togglesDraft.enable_google_login}
                onChange={(e) => setTogglesDraft({ ...togglesDraft, enable_google_login: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>Enable Google Login</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Requires GOOGLE_CLIENT_ID to be configured.
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={togglesDraft.enable_recaptcha}
                onChange={(e) => setTogglesDraft({ ...togglesDraft, enable_recaptcha: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>Enable Google reCAPTCHA</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Enforces challenge verification on register and forgot-password forms.
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={togglesDraft.enable_sms_notifications}
                onChange={(e) => setTogglesDraft({ ...togglesDraft, enable_sms_notifications: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>Enable SMS Notifications</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Sends SMS status updates via SMS gateway.
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={togglesDraft.enable_email_notifications}
                onChange={(e) => setTogglesDraft({ ...togglesDraft, enable_email_notifications: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>Enable Email Notifications</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Sends email notifications on stage transitions.
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={togglesDraft.enable_rest_api_gateway}
                onChange={(e) => setTogglesDraft({ ...togglesDraft, enable_rest_api_gateway: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>Enable REST API Gateway</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  Allows authorized external integration with the barangay ledger.
                </div>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <Button variant="primary" type="submit" loading={savingToggles}>
              Save Feature Toggles
            </Button>
          </div>
        </form>
      )}

      {/* Super Admin Key Authorization Modal */}
      <SuperAdminKeyModal
        isOpen={suModalOpen}
        onClose={() => {
          setSuModalOpen(false);
          setPendingAction(null);
          setSuModalError(null);
        }}
        onConfirm={handleAuthorizeAction}
        title={`Authorize: ${pendingAction?.section || 'System Settings'}`}
        description={
          pendingAction?.type === 'reset'
            ? 'Resetting custom integration credentials back to environment defaults requires Super Admin Key step-up authentication.'
            : 'Applying modified environment parameters requires Super Admin Key step-up authentication.'
        }
        actionLabel={pendingAction?.type === 'reset' ? 'Authorize & Reset' : 'Authorize & Save'}
        isSubmitting={suKeySubmitting}
        errorMessage={suModalError}
      />
    </div>
  );
}
