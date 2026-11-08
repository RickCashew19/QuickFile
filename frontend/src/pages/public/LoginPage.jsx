import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRecaptcha } from '../../hooks/useRecaptcha';
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn';
import { publicService } from '../../services/publicService';
import { getSafeRedirect } from '../../utils/urlHelper';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Alert } from '../../components/shared/Alert';
import { Icon } from '../../components/shared/Icon';
import { ROLES } from '../../config/constants';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle, sessionExpiredMessage, clearExpiredMessage } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const [config, setConfig] = useState(null);
  const [recaptchaToken, setRecaptchaToken] = useState(null);
  const recaptchaRef = useRef(null);
  const googleBtnRef = useRef(null);

  // Validate redirect parameter against open redirect attacks
  const searchParams = new URLSearchParams(location.search);
  const rawRedirect = searchParams.get('redirect') || location.state?.from;
  const safeRedirect = getSafeRedirect(rawRedirect);

  const handleLoginSuccess = useCallback(
    (user) => {
      if (safeRedirect) {
        navigate(safeRedirect, { replace: true });
        return;
      }

      if (user.role === ROLES.CITIZEN) {
        navigate('/citizen/dashboard', { replace: true });
      } else if (user.role === ROLES.STAFF) {
        navigate('/staff/dashboard', { replace: true });
      } else if (user.role === ROLES.ADMIN) {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    },
    [safeRedirect, navigate]
  );

  useEffect(() => {
    publicService.getConfig().then((data) => {
      setConfig(data);
    });
  }, []);

  // Initialize reCAPTCHA v2 with safe lifecycle & widgetId reset
  const { loadError: recaptchaError, reset: resetRecaptcha } = useRecaptcha({
    containerRef: recaptchaRef,
    siteKey: config?.recaptcha_site_key,
    enabled: Boolean(config?.integrations?.recaptcha_enabled && config?.recaptcha_site_key),
    onVerify: (token) => setRecaptchaToken(token),
    onExpire: () => setRecaptchaToken(null),
  });

  // Handle Google OAuth authentication
  const handleGoogleCredential = useCallback(
    async (credential) => {
      try {
        setLoading(true);
        setErrorMessage(null);
        clearExpiredMessage();
        const res = await loginWithGoogle(credential);
        handleLoginSuccess(res.user);
      } catch (err) {
        setErrorMessage(err.message || 'Google sign-in failed.');
      } finally {
        setLoading(false);
      }
    },
    [loginWithGoogle, handleLoginSuccess, clearExpiredMessage]
  );

  // Initialize Google Identity Services OAuth with single-render guarantee
  const { loadError: googleError } = useGoogleSignIn({
    containerRef: googleBtnRef,
    clientId: config?.google_client_id,
    enabled: Boolean(config?.integrations?.google_login_enabled && config?.google_client_id),
    onCredential: handleGoogleCredential,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    clearExpiredMessage();

    if (!email || !password) {
      setErrorMessage('Please enter both your email and password.');
      return;
    }

    if (config?.integrations?.recaptcha_enabled && !recaptchaToken) {
      setErrorMessage('Please complete the reCAPTCHA verification.');
      return;
    }

    setLoading(true);
    try {
      const res = await login(email, password, recaptchaToken);
      handleLoginSuccess(res.user);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to sign in. Please verify your credentials.');
      setRecaptchaToken(null);
      resetRecaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qf-auth-layout">
      <div className="qf-auth-card">
        <div className="qf-auth-header">
          <Link to="/" className="qf-auth-header__logo" aria-label="Return to Home">
            <Icon name="building" size={26} />
          </Link>
          <h1 className="qf-auth-header__title">Welcome Back</h1>
          <p className="qf-auth-header__subtitle">Sign in to access your QuickFile portal</p>
        </div>

        {/* Expired session warning (only shown on genuine session expiries, never on failed login attempts) */}
        {sessionExpiredMessage && !errorMessage && (
          <Alert variant="warning" onDismiss={clearExpiredMessage}>
            {sessionExpiredMessage}
          </Alert>
        )}

        {errorMessage && (
          <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

        {recaptchaError && <Alert variant="warning">{recaptchaError}</Alert>}
        {googleError && <Alert variant="warning">{googleError}</Alert>}

        <form onSubmit={handleSubmit} className="qf-auth-form" noValidate>
          <Input
            label="Email Address"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="resident@example.com"
            required
            autoComplete="email"
            prefix={<Icon name="mail" size={18} />}
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
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

          <div className="qf-auth-forgot">
            <Link to="/forgot-password">Forgot Password?</Link>
          </div>

          {config?.integrations?.recaptcha_enabled && (
            <div
              ref={recaptchaRef}
              style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}
            />
          )}

          <Button type="submit" fullWidth loading={loading}>
            Sign In
          </Button>
        </form>

        {config?.integrations?.google_login_enabled && (
          <>
            <div className="qf-auth-divider">
              <span>Or continue with</span>
            </div>
            <div ref={googleBtnRef} className="qf-google-btn-container" />
          </>
        )}

        <div className="qf-auth-footer">
          Don't have an account yet? <Link to="/register">Register here</Link>
        </div>
      </div>
    </div>
  );
}
