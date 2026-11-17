import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../api/adminService';
import { SuperAdminKeyModal } from '../../../components/shared/SuperAdminKeyModal';
import { TwoFactorModal } from '../../../components/shared/TwoFactorModal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Loader } from '../../../components/shared/Loader';
import { Alert } from '../../../components/shared/Alert';
import { Icon } from '../../../components/shared/Icon';
import { cleanPhoneInput } from '../../../utils/phoneUtil';
import './AdminSettingsPage.css';

export function AdminSettingsPage({ initialPinVerified = false }) {
  const [activeTab, setActiveTab] = useState('integrations'); // 'integrations' | 'general'
  const [settingsData, setSettingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [lockoutAlert, setLockoutAlert] = useState(null);

  // Super Admin PIN Gate State
  const [isPinVerified, setIsPinVerified] = useState(initialPinVerified);
  const [verifiedPin, setVerifiedPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState(null);

  // Custom Integration draft values
  const [customDrafts, setCustomDrafts] = useState({});

  // Super Admin Key Modal state (for Resets)
  const [suModalOpen, setSuModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [suKeySubmitting, setSuKeySubmitting] = useState(false);
  const [suModalError, setSuModalError] = useState(null);

  // Two-Factor Authentication (2FA) State
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [twoFactorData, setTwoFactorData] = useState(null);
  const [twoFactorSubmitting, setTwoFactorSubmitting] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState(null);

  // Provider Key Validation Feedback State
  const [validationFeedback, setValidationFeedback] = useState({});
  const [validatingProvider, setValidatingProvider] = useState({});

  // Direct Gateway Toggle Saving State
  const [savingGatewayToggle, setSavingGatewayToggle] = useState(false);

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

  // Toggles draft (unified directly inside API Key Management & Gateways)
  const [togglesDraft, setTogglesDraft] = useState({
    enable_google_login: false,
    enable_recaptcha: false,
    enable_sms_notifications: false,
    enable_email_notifications: false,
    enable_rest_api_gateway: false,
  });

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

  // Section 1: Super Admin PIN verification challenge
  const handleUnlockWithPin = async (e) => {
    e?.preventDefault();
    if (!pinInput.trim() || pinSubmitting) return;

    setPinSubmitting(true);
    setPinError(null);

    try {
      await adminService.verifySuperAdminPin(pinInput.trim());
      setVerifiedPin(pinInput.trim());
      setIsPinVerified(true);
      setPinInput('');
      setSuccessMsg('Super Admin PIN verified. System settings unlocked.');
    } catch (err) {
      if (err.status === 423) {
        setLockoutAlert(err.message || 'Super Admin PIN is locked.');
      } else {
        setPinError(err.message || 'Incorrect Super Admin PIN. Verification failed.');
      }
    } finally {
      setPinSubmitting(false);
    }
  };

  // Section 3: Live Provider Key Validation
  const handleValidateKey = async (provider, credentials) => {
    setValidatingProvider((prev) => ({ ...prev, [provider]: true }));
    setValidationFeedback((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await adminService.validateApiKey({ provider, credentials });
      setValidationFeedback((prev) => ({
        ...prev,
        [provider]: {
          valid: res.data?.valid ?? res.valid,
          message: res.message || res.data?.message || 'Key validated successfully.',
        },
      }));
    } catch (err) {
      setValidationFeedback((prev) => ({
        ...prev,
        [provider]: {
          valid: false,
          message: err.message || 'Validation failed against provider.',
        },
      }));
    } finally {
      setValidatingProvider((prev) => ({ ...prev, [provider]: false }));
    }
  };

  // Section 4: Direct Enable/Disable Toggle for REST API Key Authentication
  const handleToggleGatewayDirectly = async (checked) => {
    const hasKey =
      Boolean(settingsData?.integrations?.rest_api?.secret_key) ||
      Boolean(customDrafts.CUSTOM_REST_API_SECRET_KEY);

    if (checked && !hasKey) {
      setError('Cannot enable REST API Gateway: REST_API_SECRET_KEY is not configured.');
      return;
    }

    setSavingGatewayToggle(true);
    setError(null);
    try {
      const newToggles = { ...togglesDraft, enable_rest_api_gateway: checked };
      await adminService.updateToggles(newToggles);
      setTogglesDraft(newToggles);
      setSuccessMsg(
        checked
          ? 'REST API Key Authentication enabled and strictly enforced.'
          : 'REST API Key Authentication disabled. System returned to alternative authentication behavior.'
      );
    } catch (err) {
      setError(err.message || 'Failed to update REST API Gateway toggle.');
    } finally {
      setSavingGatewayToggle(false);
    }
  };

  // Section 4: Unified Feature Toggles inside API Key Management & Gateways
  const handleToggleFeature = async (toggleKey, checked) => {
    if (toggleKey === 'enable_rest_api_gateway') {
      return handleToggleGatewayDirectly(checked);
    }

    if (toggleKey === 'enable_google_login' && checked) {
      const hasGoogle =
        Boolean(settingsData?.integrations?.google?.client_id) ||
        Boolean(customDrafts.CUSTOM_GOOGLE_CLIENT_ID);
      if (!hasGoogle) {
        setError('Cannot enable Google login: GOOGLE_CLIENT_ID is not configured.');
        return;
      }
    }

    if (toggleKey === 'enable_recaptcha' && checked) {
      const hasRecaptcha =
        Boolean(settingsData?.integrations?.recaptcha?.site_key) ||
        Boolean(customDrafts.CUSTOM_RECAPTCHA_SITE_KEY);
      if (!hasRecaptcha) {
        setError('Cannot enable reCAPTCHA: RECAPTCHA credentials are not configured.');
        return;
      }
    }

    if (toggleKey === 'enable_sms_notifications' && checked) {
      const hasSms =
        Boolean(settingsData?.integrations?.sms?.api_token) ||
        Boolean(customDrafts.CUSTOM_SMS_API_TOKEN);
      if (!hasSms) {
        setError('Cannot enable SMS notifications: SMS_API_TOKEN is not configured.');
        return;
      }
    }

    if (toggleKey === 'enable_email_notifications' && checked) {
      const hasSmtp =
        Boolean(settingsData?.integrations?.smtp?.user) ||
        Boolean(customDrafts.CUSTOM_SMTP_USER);
      if (!hasSmtp) {
        setError('Cannot enable email notifications: SMTP credentials are not configured.');
        return;
      }
    }

    const previous = togglesDraft[toggleKey];
    const newToggles = { ...togglesDraft, [toggleKey]: checked };
    setTogglesDraft(newToggles);
    setError(null);

    try {
      await adminService.updateToggles(newToggles);
      const label = toggleKey.replace(/^enable_/, '').replace(/_/g, ' ');
      setSuccessMsg(
        checked
          ? `${label.toUpperCase()} enabled and active.`
          : `${label.toUpperCase()} disabled.`
      );
    } catch (err) {
      setTogglesDraft((prev) => ({ ...prev, [toggleKey]: previous }));
      setError(err.message || `Failed to update ${toggleKey}.`);
    }
  };

  // Section 2: Initiate Save with 2FA
  const handlePromptSave = async (section, provider = null, customKeys = null) => {
    setError(null);
    setSuccessMsg(null);

    const keysToSave = customKeys || customDrafts;
    const pinToUse = verifiedPin;

    if (!pinToUse) {
      // Fallback: If not already unlocked with PIN, prompt PIN modal first
      setPendingAction({ type: 'save', section, provider, customKeys: keysToSave });
      setSuModalError(null);
      setSuModalOpen(true);
      return;
    }

    // Initiate 2FA verification flow
    try {
      setLoading(true);
      const res = await adminService.initiateApiKeyUpdate({
        su_admin_key: pinToUse,
        settings: keysToSave,
        reset_keys: [],
      });

      setTwoFactorData(res.data || res);
      setTwoFactorError(null);
      setTwoFactorModalOpen(true);
    } catch (err) {
      if (err.status === 423) {
        setLockoutAlert(err.message || 'Super Admin Key is locked.');
      } else {
        setError(err.message || 'Failed to initiate 2FA verification.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Section 2: Confirm 2FA code submission & verify if it is a working API
  const handleConfirm2FA = async (code) => {
    if (!twoFactorData?.verification_id) return;
    setTwoFactorSubmitting(true);
    setTwoFactorError(null);

    try {
      const res = await adminService.confirmApiKeyUpdate({
        verification_id: twoFactorData.verification_id,
        code,
      });

      setSettingsData((prev) => ({
        ...prev,
        integrations: res.data?.integrations || res.integrations || prev.integrations,
      }));
      setCustomDrafts({});
      setTwoFactorModalOpen(false);
      setTwoFactorData(null);
      setSuccessMsg('2FA verification successful. Custom API key configurations saved and activated.');
    } catch (err) {
      setTwoFactorError(err.message || 'Invalid or expired 2FA verification code, or API key is not working.');
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  // Trigger Reset for an integration section
  const handlePromptReset = (section, resetKeys) => {
    setPendingAction({ type: 'reset', section, resetKeys });
    setSuModalError(null);
    setSuModalOpen(true);
  };

  // Super Admin Key confirmed callback (used for fallback saves and resets)
  const handleAuthorizeAction = async (suAdminKey) => {
    if (!pendingAction) return;
    setSuKeySubmitting(true);
    setSuModalError(null);

    try {
      if (pendingAction.type === 'save') {
        const res = await adminService.initiateApiKeyUpdate({
          su_admin_key: suAdminKey,
          settings: pendingAction.customKeys || customDrafts,
          reset_keys: [],
        });

        setVerifiedPin(suAdminKey);
        setIsPinVerified(true);
        setSuModalOpen(false);
        setPendingAction(null);

        setTwoFactorData(res.data || res);
        setTwoFactorError(null);
        setTwoFactorModalOpen(true);
        return;
      }

      const payload = {
        su_admin_key: suAdminKey,
        settings: {},
        reset_keys: pendingAction.resetKeys || [],
      };

      const res = await adminService.updateCustomSettings(payload);

      setSettingsData((prev) => ({
        ...prev,
        integrations: res.integrations || prev.integrations,
      }));
      setCustomDrafts({});
      setSuModalOpen(false);
      setPendingAction(null);
      setSuccessMsg('Integration settings reset to system defaults.');
    } catch (err) {
      if (err.status === 423) {
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

      {!isPinVerified ? (
        /* Instant Super Admin PIN Challenge Card gating System Settings */
        <div
          className="qf-integration-card"
          style={{ maxWidth: 520, margin: 'var(--space-6) auto', padding: 'var(--space-6)' }}
        >
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
            <div
              style={{
                display: 'inline-flex',
                padding: 'var(--space-3)',
                borderRadius: '50%',
                backgroundColor: 'var(--color-primary-light, #eff6ff)',
                color: 'var(--color-primary)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <Icon name="shield" size={32} />
            </div>
            <h2 style={{ fontSize: 'var(--font-lg)', margin: '0 0 var(--space-1) 0' }}>
              Super Admin PIN Verification Required
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)', margin: 0 }}>
              Please enter your Super Admin PIN to access and configure API keys, integration credentials, and gateway security.
            </p>
          </div>

          {pinError && <Alert variant="danger">{pinError}</Alert>}

          <form
            onSubmit={handleUnlockWithPin}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          >
            <Input
              id="super-admin-pin-access-input"
              label="Super Admin PIN"
              type={showPinInput ? 'text' : 'password'}
              placeholder="Enter Super Admin PIN..."
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              autoFocus
              required
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPinInput(!showPinInput)}
                  aria-label={showPinInput ? 'Hide PIN' : 'Show PIN'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Icon name={showPinInput ? 'eye-off' : 'eye'} size={18} />
                </button>
              }
            />
            <Button
              type="submit"
              variant="primary"
              loading={pinSubmitting}
              fullWidth
              iconLeft={<Icon name="lock" size={16} />}
            >
              Verify PIN & Access API Keys
            </Button>
          </form>
        </div>
      ) : (
        /* Unlocked Settings Page */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Active Session Status Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-surface-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Icon name="check-circle" size={16} />
              <span style={{ fontSize: 'var(--font-sm)', fontWeight: 'var(--font-semibold)' }}>
                Super Admin Session Active
              </span>
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                (PIN Verified)
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsPinVerified(false);
                setVerifiedPin('');
              }}
            >
              Lock Section
            </Button>
          </div>

          {/* Settings Tabs - Feature Toggles Tab Removed & Unified in Integrations */}
          <div className="qf-settings-tabs">
            <button
              type="button"
              className={`qf-settings-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}
            >
              <Icon name="shield" size={16} />
              API Key Management & Gateways
            </button>
            <button
              type="button"
              className={`qf-settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <Icon name="user" size={16} />
              Barangay Information & Signatories
            </button>
          </div>

          {loading ? (
            <Loader label="Loading system settings..." />
          ) : activeTab === 'integrations' ? (
            /* Unlocked API Key Management & Gateways Section */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {/* Feature Toggles Overview Panel */}
              <div className="qf-integration-card">
                <div className="qf-integration-card__header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                      Core Service & Feature Toggles
                    </h3>
                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      Enable or disable external integrations, authentication providers, and notification gateways in real time.
                    </span>
                  </div>
                  <span className="qf-source-badge qf-source-badge--custom">
                    5 Feature Flags
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 'var(--space-3)',
                  }}
                >
                  {/* REST API Gateway Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: togglesDraft.enable_rest_api_gateway
                        ? 'var(--color-primary-light, #eff6ff)'
                        : 'var(--color-surface-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>
                        REST API Gateway
                      </div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                        API key authentication enforcement
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        aria-label="Toggle REST API Gateway Service"
                        checked={togglesDraft.enable_rest_api_gateway}
                        onChange={(e) => handleToggleGatewayDirectly(e.target.checked)}
                        disabled={savingGatewayToggle}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  {/* Google Login Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: togglesDraft.enable_google_login
                        ? 'var(--color-primary-light, #eff6ff)'
                        : 'var(--color-surface-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>
                        Google Login (SSO)
                      </div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                        One-tap Google sign-in
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        aria-label="Toggle Google Login Service"
                        checked={togglesDraft.enable_google_login}
                        onChange={(e) => handleToggleFeature('enable_google_login', e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  {/* Google reCAPTCHA Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: togglesDraft.enable_recaptcha
                        ? 'var(--color-primary-light, #eff6ff)'
                        : 'var(--color-surface-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>
                        Google reCAPTCHA
                      </div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                        Bot protection challenges
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        aria-label="Toggle Google reCAPTCHA Service"
                        checked={togglesDraft.enable_recaptcha}
                        onChange={(e) => handleToggleFeature('enable_recaptcha', e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  {/* PhilSMS Gateway Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: togglesDraft.enable_sms_notifications
                        ? 'var(--color-primary-light, #eff6ff)'
                        : 'var(--color-surface-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>
                        SMS Notifications
                      </div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                        PhilSMS status text alerts
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        aria-label="Toggle SMS Notifications Service"
                        checked={togglesDraft.enable_sms_notifications}
                        onChange={(e) => handleToggleFeature('enable_sms_notifications', e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  {/* SMTP Mail Server Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: togglesDraft.enable_email_notifications
                        ? 'var(--color-primary-light, #eff6ff)'
                        : 'var(--color-surface-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>
                        Email Notifications
                      </div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                        SMTP certificates & mail dispatch
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        aria-label="Toggle Email Notifications Service"
                        checked={togglesDraft.enable_email_notifications}
                        onChange={(e) => handleToggleFeature('enable_email_notifications', e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* 1. Google OAuth */}
              <div className="qf-integration-card">
                <div className="qf-integration-card__header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                      Google OAuth 2.0 Single Sign-On
                    </h3>
                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      Enables one-tap Google login for verified residents (Staff and Admin use password login for security).
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-xs)' }}>
                      <input
                        type="checkbox"
                        checked={togglesDraft.enable_google_login}
                        onChange={(e) => handleToggleFeature('enable_google_login', e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span>{togglesDraft.enable_google_login ? 'Active' : 'Disabled'}</span>
                    </label>
                    <span className={`qf-source-badge qf-source-badge--${integrations.google?.source || 'default'}`}>
                      {integrations.google?.source === 'custom' ? 'Custom' : 'Default'}
                    </span>
                  </div>
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

                {validationFeedback['google'] && (
                  <Alert variant={validationFeedback['google'].valid ? 'success' : 'danger'}>
                    {validationFeedback['google'].message}
                  </Alert>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      handleValidateKey('google', {
                        CUSTOM_GOOGLE_CLIENT_ID: customDrafts.CUSTOM_GOOGLE_CLIENT_ID || integrations.google?.client_id,
                        CUSTOM_GOOGLE_CLIENT_SECRET: customDrafts.CUSTOM_GOOGLE_CLIENT_SECRET,
                      })
                    }
                    loading={validatingProvider['google']}
                    disabled={!customDrafts.CUSTOM_GOOGLE_CLIENT_ID && !integrations.google?.client_id}
                    iconLeft={<Icon name="check-circle" size={14} />}
                  >
                    Validate with Google
                  </Button>
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
                    onClick={() =>
                      handlePromptSave('Google OAuth 2.0', 'google', {
                        CUSTOM_GOOGLE_CLIENT_ID: customDrafts.CUSTOM_GOOGLE_CLIENT_ID,
                        CUSTOM_GOOGLE_CLIENT_SECRET: customDrafts.CUSTOM_GOOGLE_CLIENT_SECRET,
                      })
                    }
                    disabled={!customDrafts.CUSTOM_GOOGLE_CLIENT_ID && !customDrafts.CUSTOM_GOOGLE_CLIENT_SECRET}
                    iconLeft={<Icon name="shield" size={14} />}
                  >
                    Save & Verify (2FA)
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
                      Dispatches transactional SMS alerts to residents regarding application approvals and pickups.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-xs)' }}>
                      <input
                        type="checkbox"
                        checked={togglesDraft.enable_sms_notifications}
                        onChange={(e) => handleToggleFeature('enable_sms_notifications', e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span>{togglesDraft.enable_sms_notifications ? 'Active' : 'Disabled'}</span>
                    </label>
                    <span className={`qf-source-badge qf-source-badge--${integrations.sms?.source || 'default'}`}>
                      {integrations.sms?.source === 'custom' ? 'Custom' : 'Default'}
                    </span>
                  </div>
                </div>

                <div className="qf-masked-preview">
                  <div>Gateway URL: <code>{integrations.sms?.gateway_url || 'https://app.philsms.com/api/v3/sms/send'}</code></div>
                  <div>API Token: <code>{integrations.sms?.api_token || 'Not configured'}</code></div>
                  <div>Sender ID: <code>{integrations.sms?.sender_id || 'PhilSMS'}</code></div>
                </div>

                <div className="qf-grid-3col">
                  <Input
                    label="Custom Gateway URL"
                    placeholder="https://..."
                    value={customDrafts.CUSTOM_SMS_GATEWAY_URL || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMS_GATEWAY_URL', e.target.value)}
                  />
                  <Input
                    label="Custom API Token"
                    type="password"
                    placeholder="Custom SMS token..."
                    value={customDrafts.CUSTOM_SMS_API_TOKEN || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMS_API_TOKEN', e.target.value)}
                  />
                  <Input
                    label="Custom Sender ID"
                    placeholder="e.g. BarangaySMS"
                    value={customDrafts.CUSTOM_SMS_SENDER_ID || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMS_SENDER_ID', e.target.value)}
                  />
                </div>

                {validationFeedback['sms'] && (
                  <Alert variant={validationFeedback['sms'].valid ? 'success' : 'danger'}>
                    {validationFeedback['sms'].message}
                  </Alert>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      handleValidateKey('sms', {
                        CUSTOM_SMS_GATEWAY_URL: customDrafts.CUSTOM_SMS_GATEWAY_URL || integrations.sms?.gateway_url,
                        CUSTOM_SMS_API_TOKEN: customDrafts.CUSTOM_SMS_API_TOKEN,
                      })
                    }
                    loading={validatingProvider['sms']}
                    disabled={!customDrafts.CUSTOM_SMS_API_TOKEN}
                    iconLeft={<Icon name="check-circle" size={14} />}
                  >
                    Validate with PhilSMS
                  </Button>
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
                    onClick={() =>
                      handlePromptSave('SMS Gateway', 'sms', {
                        CUSTOM_SMS_GATEWAY_URL: customDrafts.CUSTOM_SMS_GATEWAY_URL,
                        CUSTOM_SMS_API_TOKEN: customDrafts.CUSTOM_SMS_API_TOKEN,
                        CUSTOM_SMS_SENDER_ID: customDrafts.CUSTOM_SMS_SENDER_ID,
                      })
                    }
                    disabled={
                      !customDrafts.CUSTOM_SMS_GATEWAY_URL &&
                      !customDrafts.CUSTOM_SMS_API_TOKEN &&
                      !customDrafts.CUSTOM_SMS_SENDER_ID
                    }
                    iconLeft={<Icon name="shield" size={14} />}
                  >
                    Save & Verify (2FA)
                  </Button>
                </div>
              </div>

              {/* 3. SMTP Mail Gateway */}
              <div className="qf-integration-card">
                <div className="qf-integration-card__header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                      SMTP / Email Gateway
                    </h3>
                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      Transports official email notifications and PDF certificates to verified resident addresses.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-xs)' }}>
                      <input
                        type="checkbox"
                        checked={togglesDraft.enable_email_notifications}
                        onChange={(e) => handleToggleFeature('enable_email_notifications', e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span>{togglesDraft.enable_email_notifications ? 'Active' : 'Disabled'}</span>
                    </label>
                    <span className={`qf-source-badge qf-source-badge--${integrations.smtp?.source || 'default'}`}>
                      {integrations.smtp?.source === 'custom' ? 'Custom' : 'Default'}
                    </span>
                  </div>
                </div>

                <div className="qf-masked-preview">
                  <div>Host: <code>{integrations.smtp?.host || 'Not configured'}</code></div>
                  <div>User: <code>{integrations.smtp?.user || 'Not configured'}</code></div>
                  <div>Pass: <code>{integrations.smtp?.pass || '••••••••'}</code></div>
                </div>

                <div className="qf-grid-2col">
                  <Input
                    label="Custom SMTP Host"
                    placeholder="smtp.example.com"
                    value={customDrafts.CUSTOM_SMTP_HOST || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMTP_HOST', e.target.value)}
                  />
                  <Input
                    label="Custom SMTP Port"
                    placeholder="587 or 465"
                    value={customDrafts.CUSTOM_SMTP_PORT || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMTP_PORT', e.target.value)}
                  />
                  <Input
                    label="Custom SMTP User"
                    placeholder="user@example.com"
                    value={customDrafts.CUSTOM_SMTP_USER || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMTP_USER', e.target.value)}
                  />
                  <Input
                    label="Custom SMTP Password"
                    type="password"
                    placeholder="Account password..."
                    value={customDrafts.CUSTOM_SMTP_PASS || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMTP_PASS', e.target.value)}
                  />
                  <Input
                    label="Custom From Name"
                    placeholder="QuickFile Notifications"
                    value={customDrafts.CUSTOM_SMTP_FROM_NAME || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMTP_FROM_NAME', e.target.value)}
                  />
                  <Input
                    label="Custom From Email"
                    type="email"
                    placeholder="notifications@quickfile.gov.ph"
                    value={customDrafts.CUSTOM_SMTP_FROM_EMAIL || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_SMTP_FROM_EMAIL', e.target.value)}
                  />
                </div>

                {validationFeedback['smtp'] && (
                  <Alert variant={validationFeedback['smtp'].valid ? 'success' : 'danger'}>
                    {validationFeedback['smtp'].message}
                  </Alert>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      handleValidateKey('smtp', {
                        CUSTOM_SMTP_HOST: customDrafts.CUSTOM_SMTP_HOST || integrations.smtp?.host,
                        CUSTOM_SMTP_PORT: customDrafts.CUSTOM_SMTP_PORT || integrations.smtp?.port,
                        CUSTOM_SMTP_SECURE: customDrafts.CUSTOM_SMTP_SECURE || integrations.smtp?.secure,
                        CUSTOM_SMTP_USER: customDrafts.CUSTOM_SMTP_USER || integrations.smtp?.user,
                        CUSTOM_SMTP_PASS: customDrafts.CUSTOM_SMTP_PASS || integrations.smtp?.pass,
                      })
                    }
                    loading={validatingProvider['smtp']}
                    disabled={!customDrafts.CUSTOM_SMTP_HOST || !customDrafts.CUSTOM_SMTP_USER || !customDrafts.CUSTOM_SMTP_PASS}
                    iconLeft={<Icon name="check-circle" size={14} />}
                  >
                    Validate Connection
                  </Button>
                  {integrations.smtp?.source === 'custom' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        handlePromptReset('SMTP Gateway', [
                          'CUSTOM_SMTP_HOST',
                          'CUSTOM_SMTP_PORT',
                          'CUSTOM_SMTP_SECURE',
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
                    onClick={() =>
                      handlePromptSave('SMTP Gateway', 'smtp', {
                        CUSTOM_SMTP_HOST: customDrafts.CUSTOM_SMTP_HOST,
                        CUSTOM_SMTP_PORT: customDrafts.CUSTOM_SMTP_PORT,
                        CUSTOM_SMTP_USER: customDrafts.CUSTOM_SMTP_USER,
                        CUSTOM_SMTP_PASS: customDrafts.CUSTOM_SMTP_PASS,
                        CUSTOM_SMTP_FROM_NAME: customDrafts.CUSTOM_SMTP_FROM_NAME,
                        CUSTOM_SMTP_FROM_EMAIL: customDrafts.CUSTOM_SMTP_FROM_EMAIL,
                      })
                    }
                    disabled={
                      !customDrafts.CUSTOM_SMTP_HOST &&
                      !customDrafts.CUSTOM_SMTP_PORT &&
                      !customDrafts.CUSTOM_SMTP_USER &&
                      !customDrafts.CUSTOM_SMTP_PASS
                    }
                    iconLeft={<Icon name="shield" size={14} />}
                  >
                    Save & Verify (2FA)
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
                      Bot protection challenge keys for citizen registration and public inquiry forms.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-xs)' }}>
                      <input
                        type="checkbox"
                        checked={togglesDraft.enable_recaptcha}
                        onChange={(e) => handleToggleFeature('enable_recaptcha', e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span>{togglesDraft.enable_recaptcha ? 'Active' : 'Disabled'}</span>
                    </label>
                    <span className={`qf-source-badge qf-source-badge--${integrations.recaptcha?.source || 'default'}`}>
                      {integrations.recaptcha?.source === 'custom' ? 'Custom' : 'Default'}
                    </span>
                  </div>
                </div>

                <div className="qf-masked-preview">
                  <div>Site Key: <code>{integrations.recaptcha?.site_key || 'Not configured'}</code></div>
                  <div>Secret Key: <code>{integrations.recaptcha?.secret_key || 'Not configured'}</code></div>
                </div>

                <div className="qf-grid-2col">
                  <Input
                    label="Custom reCAPTCHA Site Key"
                    placeholder="Site key..."
                    value={customDrafts.CUSTOM_RECAPTCHA_SITE_KEY || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_RECAPTCHA_SITE_KEY', e.target.value)}
                  />
                  <Input
                    label="Custom reCAPTCHA Secret Key"
                    type="password"
                    placeholder="Secret key..."
                    value={customDrafts.CUSTOM_RECAPTCHA_SECRET_KEY || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_RECAPTCHA_SECRET_KEY', e.target.value)}
                  />
                </div>

                {validationFeedback['recaptcha'] && (
                  <Alert variant={validationFeedback['recaptcha'].valid ? 'success' : 'danger'}>
                    {validationFeedback['recaptcha'].message}
                  </Alert>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      handleValidateKey('recaptcha', {
                        CUSTOM_RECAPTCHA_SECRET_KEY: customDrafts.CUSTOM_RECAPTCHA_SECRET_KEY,
                        CUSTOM_RECAPTCHA_SITE_KEY: customDrafts.CUSTOM_RECAPTCHA_SITE_KEY,
                      })
                    }
                    loading={validatingProvider['recaptcha']}
                    disabled={!customDrafts.CUSTOM_RECAPTCHA_SECRET_KEY}
                    iconLeft={<Icon name="check-circle" size={14} />}
                  >
                    Validate Secret Key
                  </Button>
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
                    onClick={() =>
                      handlePromptSave('Google reCAPTCHA', 'recaptcha', {
                        CUSTOM_RECAPTCHA_SITE_KEY: customDrafts.CUSTOM_RECAPTCHA_SITE_KEY,
                        CUSTOM_RECAPTCHA_SECRET_KEY: customDrafts.CUSTOM_RECAPTCHA_SECRET_KEY,
                      })
                    }
                    disabled={!customDrafts.CUSTOM_RECAPTCHA_SITE_KEY && !customDrafts.CUSTOM_RECAPTCHA_SECRET_KEY}
                    iconLeft={<Icon name="shield" size={14} />}
                  >
                    Save & Verify (2FA)
                  </Button>
                </div>
              </div>

              {/* 5. REST API Gateway Security & Key Management */}
              <div className="qf-integration-card">
                <div className="qf-integration-card__header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 'var(--font-base)', fontWeight: 'var(--font-semibold)' }}>
                      REST API Gateway Security & Key Management
                    </h3>
                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      Shared secret key for external client systems, reporting webhooks, and gateway endpoints.
                    </span>
                  </div>
                  <span className={`qf-source-badge qf-source-badge--${integrations.rest_api?.source || 'default'}`}>
                    {integrations.rest_api?.source === 'custom' ? 'Custom' : 'Default'}
                  </span>
                </div>

                {/* Section 4: Direct Enable/Disable Toggle inside API Key Management */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    backgroundColor: 'var(--color-surface-subtle)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)' }}>
                      REST API Key Authentication
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                      When enabled, API key authentication is strictly enforced via <code>x-api-key</code>. When disabled, alternative Bearer auth is active.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span
                      className={`qf-source-badge qf-source-badge--${
                        togglesDraft.enable_rest_api_gateway ? 'custom' : 'default'
                      }`}
                    >
                      {togglesDraft.enable_rest_api_gateway ? 'Active & Enforced' : 'Disabled'}
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={togglesDraft.enable_rest_api_gateway}
                        onChange={(e) => handleToggleGatewayDirectly(e.target.checked)}
                        disabled={savingGatewayToggle}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                        aria-label="Toggle REST API Gateway Authentication"
                      />
                    </label>
                  </div>
                </div>

                <div className="qf-masked-preview">
                  <div>Active Secret Key: <code>{integrations.rest_api?.secret_key || 'Not configured'}</code></div>
                </div>

                <div>
                  <Input
                    label="Custom REST API Secret Key"
                    type="password"
                    placeholder="Enter custom API secret key (min 16 characters)..."
                    value={customDrafts.CUSTOM_REST_API_SECRET_KEY || ''}
                    onChange={(e) => handleDraftChange('CUSTOM_REST_API_SECRET_KEY', e.target.value)}
                    helperText="Must be at least 16 characters and contain mixed letters, numbers, or symbols."
                  />
                </div>

                {validationFeedback['rest_api'] && (
                  <Alert variant={validationFeedback['rest_api'].valid ? 'success' : 'danger'}>
                    {validationFeedback['rest_api'].message}
                  </Alert>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      handleValidateKey('rest_api', {
                        CUSTOM_REST_API_SECRET_KEY:
                          customDrafts.CUSTOM_REST_API_SECRET_KEY || integrations.rest_api?.secret_key,
                      })
                    }
                    loading={validatingProvider['rest_api']}
                    disabled={!customDrafts.CUSTOM_REST_API_SECRET_KEY && !integrations.rest_api?.secret_key}
                    iconLeft={<Icon name="check-circle" size={14} />}
                  >
                    Validate Key with Provider
                  </Button>
                  {integrations.rest_api?.source === 'custom' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        handlePromptReset('REST API Gateway', ['CUSTOM_REST_API_SECRET_KEY'])
                      }
                    >
                      Reset to Default
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      handlePromptSave('REST API Gateway', 'rest_api', {
                        CUSTOM_REST_API_SECRET_KEY: customDrafts.CUSTOM_REST_API_SECRET_KEY,
                      })
                    }
                    disabled={!customDrafts.CUSTOM_REST_API_SECRET_KEY}
                    iconLeft={<Icon name="shield" size={14} />}
                  >
                    Save & Verify (2FA)
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Barangay Information & Signatories */
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
                  label="Office / Facility Name"
                  value={generalDraft.office_name}
                  onChange={(e) => setGeneralDraft({ ...generalDraft, office_name: e.target.value })}
                  required
                />
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
                  onChange={(e) =>
                    setGeneralDraft({ ...generalDraft, contact_phone: cleanPhoneInput(e.target.value) })
                  }
                  required
                />
                <Input
                  label="Punong Barangay (Captain)"
                  value={generalDraft.barangay_captain}
                  onChange={(e) => setGeneralDraft({ ...generalDraft, barangay_captain: e.target.value })}
                  required
                />
                <Input
                  label="Barangay Secretary"
                  value={generalDraft.barangay_secretary}
                  onChange={(e) => setGeneralDraft({ ...generalDraft, barangay_secretary: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" type="submit" loading={savingGeneral}>
                  Save General Information
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Super Admin Key Authorization Modal (for Resets and Fallback) */}
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
        actionLabel={pendingAction?.type === 'reset' ? 'Authorize & Reset' : 'Authorize & Continue'}
        isSubmitting={suKeySubmitting}
        errorMessage={suModalError}
      />

      {/* Two-Factor Authentication (2FA) Modal for Custom API Key Activation */}
      <TwoFactorModal
        isOpen={twoFactorModalOpen}
        onClose={() => {
          setTwoFactorModalOpen(false);
          setTwoFactorData(null);
          setTwoFactorError(null);
        }}
        onConfirm={handleConfirm2FA}
        emailMasked={twoFactorData?.email_masked || 'administrator email'}
        isSubmitting={twoFactorSubmitting}
        errorMessage={twoFactorError}
      />
    </div>
  );
}
