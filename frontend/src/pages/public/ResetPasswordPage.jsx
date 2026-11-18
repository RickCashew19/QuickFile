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

  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
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
    // Extract query parameters from URL
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    const tokenParam = params.get('token');

    if (emailParam) {
      setEmail(emailParam);
    }

    if (tokenParam) {
      // If a token was provided in URL, prefill the PIN (server accepts 6 digits only)
      setPin(tokenParam);
      // Immediately clean the URL to protect against history leakage
      window.history.replaceState({}, document.title, window.location.pathname + (emailParam ? `?email=${encodeURIComponent(emailParam)}` : ''));
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    const cleanPin = pin.trim();

    if (!cleanEmail) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    if (!cleanPin) {
      setErrorMessage('Please enter the 6-digit verification PIN sent to your email.');
      return;
    }

    if (!/^\d{6}$/.test(cleanPin)) {
      setErrorMessage('Verification PIN must be exactly 6 digits.');
      return;
    }

    if (!password || password.length < 8) {
      setErrorMessage('New password must be at least 8 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword({
        email: cleanEmail,
        pin: cleanPin,
        token: cleanPin,
        newPassword: password,
      });
      setSuccess(true);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to reset password. The PIN code may have expired or is incorrect.');
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
          <h1 className="qf-auth-header__title">Set New Password</h1>
          <p className="qf-auth-header__subtitle">
            Enter your email, the 6-digit PIN code received in your email, and your new password
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
        ) : (
          <form onSubmit={handleSubmit} noValidate>
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
                placeholder="e.g. 1234"
                required
                disabled={loading}
                prefix={<Icon name="key" size={18} />}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-1)' }}>
                Check your email inbox for the 6-digit code (valid for 15 minutes).
              </span>
            </div>

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
              <Link to="/forgot-password">Resend 4-digit PIN</Link> &nbsp;•&nbsp; <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
