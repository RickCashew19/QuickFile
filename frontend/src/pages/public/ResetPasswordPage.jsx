import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authService } from '../../api/authService';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Alert } from '../../components/shared/Alert';
import { Icon } from '../../components/shared/Icon';
import { Logo } from '../../components/shared/Logo';
import './LoginPage.css';

export function ResetPasswordPage() {
  const location = useLocation();

  // step 1: verify PIN -> step 2: set new password
  const [step, setStep] = useState('verify');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    // Referrer-Policy: no-referrer protection on reset-password page
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);

    return () => {
      if (meta.parentNode) {
        meta.parentNode.removeChild(meta);
      }
    };
  }, []);

  useEffect(() => {
    // Extract the registered email from the URL (PIN is delivered out-of-band via email/SMS)
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [location.search]);

  // STEP 1: verify the 6-digit PIN first; only on success advance to the password form
  const handleVerifyPin = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    const cleanPin = pin.trim();

    if (!cleanEmail) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }
    if (!/^\d{6}$/.test(cleanPin)) {
      setErrorMessage('Verification PIN must be exactly 6 digits.');
      return;
    }

    setLoading(true);
    try {
      const res = await authService.verifyResetPin(cleanEmail, cleanPin);
      const token = res?.data?.reset_token || res?.reset_token;
      if (!token) throw new Error('Verification did not return a reset token. Please try again.');
      setResetToken(token);
      setPin('');
      setStep('password');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to verify the PIN. It may be incorrect or expired.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: set the new password using the single-use token (no PIN at this step)
  const handleSetPassword = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password || password.length < 8) {
      setErrorMessage('New password must be at least 8 characters in length.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!resetToken) {
      setErrorMessage('Your verification session expired. Please verify your PIN again.');
      setStep('verify');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword({
        email: email.trim(),
        resetToken,
        newPassword: password,
      });
      setSuccess(true);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to reset password. Please verify your PIN again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qf-auth-layout">
      <div className="qf-auth-card">
        <Link to="/" className="qf-auth-header__back qf-btn qf-btn--secondary qf-btn--sm">
          <Icon name="chevron-left" size={16} />
          Back to Home
        </Link>
        <div className="qf-auth-header">
          <div className="qf-auth-header__logo" aria-hidden="true">
            <Logo size={52} />
          </div>
          <h1 className="qf-auth-header__title">
            {step === 'verify' ? 'Verify Reset PIN' : 'Set New Password'}
          </h1>
          <p className="qf-auth-header__subtitle">
            {step === 'verify'
              ? 'Enter your registered email and the 6-digit PIN received in your email.'
              : 'Your identity is verified. Choose a new password below.'}
          </p>
        </div>

        {success ? (
          <div>
            <Alert variant="success" title="Password Reset Complete">
              Your password has been successfully updated. You can now log in using your new credentials.
            </Alert>
            <div style={{ marginTop: 'var(--space-6)' }}>
              <Link to="/login">
                <Button fullWidth>
                  Proceed to Sign In
                </Button>
              </Link>
            </div>
          </div>
        ) : step === 'verify' ? (
          <form onSubmit={handleVerifyPin} noValidate>
            {errorMessage && (
              <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
                {errorMessage}
              </Alert>
            )}

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="resident@example.com"
              required
              disabled={loading}
              prefix={<Icon name="mail" size={18} />}
            />

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Input
                label="6-Digit Verification PIN"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="e.g. 123456"
                required
                disabled={loading}
                prefix={<Icon name="key" size={18} />}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-1)' }}>
                Check your email inbox for the 6-digit code (valid for 15 minutes).
              </span>
            </div>

            <Button type="submit" fullWidth loading={loading}>
              Verify PIN
            </Button>

            <div className="qf-auth-footer">
              <Link to="/forgot-password">Resend 6-digit PIN</Link> &nbsp;•&nbsp; <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSetPassword} noValidate>
            {errorMessage && (
              <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
                {errorMessage}
              </Alert>
            )}

            <Input
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              disabled={loading}
              prefix={<Icon name="lock" size={18} />}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
                </button>
              }
            />

            <Input
              label="Confirm New Password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              disabled={loading}
              prefix={<Icon name="lock" size={18} />}
            />

            <Button type="submit" fullWidth loading={loading}>
              Update Password
            </Button>

            <div className="qf-auth-footer">
              <button
                type="button"
                onClick={() => { setStep('verify'); setResetToken(null); setErrorMessage(null); }}
                className="qf-btn qf-btn--link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Verify a different PIN
              </button>
              &nbsp;•&nbsp; <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
