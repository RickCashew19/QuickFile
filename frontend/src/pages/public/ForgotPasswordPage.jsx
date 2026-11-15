import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../api/authService';
import { publicService } from '../../api/publicService';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Alert } from '../../components/shared/Alert';
import { Icon } from '../../components/shared/Icon';
import './LoginPage.css';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const [config, setConfig] = useState(null);
  const [recaptchaToken, setRecaptchaToken] = useState(null);
  const recaptchaRef = useRef(null);

  useEffect(() => {
    publicService.getConfig().then((data) => {
      setConfig(data);
      if (data?.integrations?.recaptcha_enabled && data.recaptcha_site_key) {
        publicService.loadRecaptchaScript().then(() => {
          if (recaptchaRef.current && window.grecaptcha) {
            try {
              window.grecaptcha.render(recaptchaRef.current, {
                sitekey: data.recaptcha_site_key,
                callback: (token) => setRecaptchaToken(token),
                'expired-callback': () => setRecaptchaToken(null),
              });
            } catch {
              // Ignore
            }
          }
        });
      }
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (config?.integrations?.recaptcha_enabled && !recaptchaToken) {
      setErrorMessage('Please complete the reCAPTCHA verification.');
      return;
    }

    setLoading(true);
    try {
      await authService.forgotPassword(email, recaptchaToken);
      setSubmitted(true);
    } catch (err) {
      setErrorMessage(err.message || 'Unable to process request. Please try again later.');
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
            <Icon name="lock" size={26} />
          </div>
          <h1 className="qf-auth-header__title">Reset Password</h1>
          <p className="qf-auth-header__subtitle">
            Enter your registered email address to receive a 4-digit verification PIN code to reset your password.
          </p>
        </div>

        {submitted ? (
          <div>
            <Alert variant="success" title="4-Digit PIN Code Sent">
              If <strong>{email}</strong> is registered, a 4-digit verification PIN code has been sent to your email address (valid for 15 minutes).
            </Alert>
            <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}
              >
                Enter 4-Digit PIN & Set New Password
              </Button>
              <Link to="/login">
                <Button variant="secondary" fullWidth>
                  Return to Sign In
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
              prefix={<Icon name="mail" size={18} />}
            />

            {config?.integrations?.recaptcha_enabled && (
              <div
                ref={recaptchaRef}
                style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}
              />
            )}

            <Button type="submit" fullWidth loading={loading}>
              Send 4-Digit Reset PIN
            </Button>

            <div className="qf-auth-footer">
              Remembered your password? <Link to="/login">Sign in here</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
