import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { publicService } from '../../services/publicService';
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

  // Extract redirect parameter
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get('redirect') || location.state?.from?.pathname;

  const handleLoginSuccess = useCallback(
    (user) => {
      if (redirectParam) {
        navigate(redirectParam, { replace: true });
        return;
      }

      if (user.role === ROLES.CITIZEN) {
        navigate('/citizen/requests', { replace: true });
      } else if (user.role === ROLES.STAFF) {
        navigate('/staff/dashboard', { replace: true });
      } else if (user.role === ROLES.ADMIN) {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    },
    [redirectParam, navigate]
  );

  useEffect(() => {
    publicService.getConfig().then((data) => {
      setConfig(data);

      // Initialize reCAPTCHA v2 if enabled
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
              // Ignore if already rendered
            }
          }
        });
      }

      // Initialize Google OAuth if enabled
      if (data?.integrations?.google_login_enabled && data.google_client_id) {
        publicService.loadGoogleScript().then((google) => {
          if (google && google.accounts && googleBtnRef.current) {
            google.accounts.id.initialize({
              client_id: data.google_client_id,
              callback: async (response) => {
                try {
                  setLoading(true);
                  setErrorMessage(null);
                  const res = await loginWithGoogle(response.credential);
                  handleLoginSuccess(res.user);
                } catch (err) {
                  setErrorMessage(err.message || 'Google sign-in failed.');
                } finally {
                  setLoading(false);
                }
              },
            });
            google.accounts.id.renderButton(googleBtnRef.current, {
              theme: 'outline',
              size: 'large',
              width: 380,
              text: 'signin_with',
            });
          }
        });
      }
    });
  }, [loginWithGoogle, handleLoginSuccess]);

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
      // Reset reCAPTCHA on failed attempt if rendered
      if (window.grecaptcha && recaptchaRef.current) {
        try {
          window.grecaptcha.reset();
          setRecaptchaToken(null);
        } catch {
          // Ignore
        }
      }
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
          <p className="qf-auth-header__subtitle">
            Sign in to access your QuickFile portal
          </p>
        </div>

        {sessionExpiredMessage && (
          <Alert variant="warning" onDismiss={clearExpiredMessage}>
            {sessionExpiredMessage}
          </Alert>
        )}

        {errorMessage && (
          <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

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
