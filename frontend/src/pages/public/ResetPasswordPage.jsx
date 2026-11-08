import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authService } from '../../services/authService';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Alert } from '../../components/shared/Alert';
import { Icon } from '../../components/shared/Icon';
import './LoginPage.css';

export function ResetPasswordPage() {
  const location = useLocation();

  const [token, setToken] = useState(null);
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
    // Extract token from URL
    const params = new URLSearchParams(location.search);
    const rawToken = params.get('token');

    if (rawToken) {
      setToken(rawToken);
      // Immediately wipe the token from the browser address bar to protect against history leakage
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      setErrorMessage('Missing or invalid password reset token. Please request a new link.');
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage('Invalid or expired reset token. Please request a new reset link.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('New password must be at least 6 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qf-auth-layout">
      <div className="qf-auth-card">
        <div className="qf-auth-header">
          <Link to="/" className="qf-auth-header__logo" aria-label="Return to Home">
            <Icon name="lock" size={26} />
          </Link>
          <h1 className="qf-auth-header__title">Set New Password</h1>
          <p className="qf-auth-header__subtitle">
            Choose a strong, secure password for your QuickFile account
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
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              disabled={!token || loading}
              prefix={<Icon name="lock" size={18} />}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              disabled={!token || loading}
              prefix={<Icon name="lock" size={18} />}
            />

            <Button type="submit" fullWidth loading={loading} disabled={!token}>
              Update Password
            </Button>

            <div className="qf-auth-footer">
              <Link to="/login">Cancel and return to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
