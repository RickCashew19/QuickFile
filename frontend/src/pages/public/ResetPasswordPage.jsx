import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../api/authService';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Alert } from '../../components/shared/Alert';
import { Icon } from '../../components/shared/Icon';
import { Logo } from '../../components/shared/Logo';
import { OtpInput } from '../../components/shared/OtpInput';
import { StepIndicator } from '../../components/shared/StepIndicator';
import {
  maskEmail,
  isValidEmail,
  PASSWORD_MIN_LENGTH,
  getPasswordRequirements,
} from '../../validators/validators';
import './LoginPage.css';

const STEPS = ['Enter Email', 'Verify OTP', 'Reset Password'];
const RESEND_COOLDOWN_SECONDS = 60;

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [step, setStep] = useState('verify'); // 'verify' | 'password'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [otpVersion, setOtpVersion] = useState(0);
  const redirectTimer = useRef(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      if (meta.parentNode) meta.parentNode.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    if (emailParam) setEmail(emailParam);
  }, [location.search]);

  // Resend cooldown countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  // STEP 2: verify the 6-digit OTP.
  const handleVerify = async (e) => {
    e?.preventDefault();
    setErrorMessage(null);
    if (!isValidEmail(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await authService.verifyResetOtp(email.trim(), otp);
      const token = res?.data?.reset_token || res?.reset_token;
      if (!token) throw new Error('Verification did not return a reset token. Please try again.');
      setResetToken(token);
      setOtp('');
      setStep('password');
    } catch (err) {
      setErrorMessage(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend a fresh OTP after the cooldown.
  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await authService.resendResetOtp(email.trim());
      if (res?.data?.retryAfterSeconds) {
        setCooldown(res.data.retryAfterSeconds);
      } else {
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
      setOtp('');
      setOtpVersion((v) => v + 1);
    } catch (err) {
      const retry = err?.status === 429 && Number(err?.data?.retryAfterSeconds);
      if (retry) setCooldown(retry);
      else setErrorMessage(err.message || 'Unable to resend the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 3: set the new password using the single-use token.
  const handleReset = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!resetToken) {
      setErrorMessage('Your verification expired. Please verify your code again.');
      setStep('verify');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword({ email: email.trim(), resetToken, newPassword: password });
      setSuccess(true);
      redirectTimer.current = setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to reset your password. Please verify your code again.');
    } finally {
      setLoading(false);
    }
  };

  const requirements = getPasswordRequirements(password);

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
            {step === 'verify' ? 'Verify Your Identity' : 'Set New Password'}
          </h1>
          <p className="qf-auth-header__subtitle">
            {step === 'verify'
              ? `Enter the 6-digit code sent to ${maskEmail(email)}.`
              : 'Choose a strong new password for your account.'}
          </p>
        </div>

        <StepIndicator steps={STEPS} currentStep={step === 'verify' ? 1 : 2} />

        {success ? (
          <div>
            <Alert variant="success" title="Password Reset Complete">
              Your password has been updated. Redirecting you to the sign-in page...
            </Alert>
            <div style={{ marginTop: 'var(--space-6)' }}>
              <Link to="/login">
                <Button fullWidth>Go to Sign In</Button>
              </Link>
            </div>
          </div>
        ) : step === 'verify' ? (
          <form onSubmit={handleVerify} noValidate>
            {errorMessage && (
              <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
                {errorMessage}
              </Alert>
            )}

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="qf-field__label">6-Digit Verification Code</label>
              <OtpInput key={otpVersion} value={otp} onChange={setOtp} disabled={loading} autoFocus />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-2)' }}>
                The code expires in 5 minutes. Check your email (and SMS, if registered).
              </span>
            </div>

            <Button type="submit" fullWidth loading={loading} disabled={loading || otp.length !== 6}>
              Verify Code
            </Button>

            <div className="qf-auth-footer" style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="qf-btn qf-btn--link"
                style={{ background: 'none', border: 'none', cursor: cooldown > 0 ? 'not-allowed' : 'pointer', padding: 0 }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Link to="/forgot-password">Use a different email</Link>
                {' • '}
                <Link to="/login">Back to sign in</Link>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleReset} noValidate>
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
                  onClick={() => setShowPassword((s) => !s)}
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
              placeholder="Re-enter your new password"
              required
              disabled={loading}
              prefix={<Icon name="lock" size={18} />}
            />

            <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
              {requirements.map((r) => (
                <li key={r.key} style={{ fontSize: '0.78rem', color: r.met ? 'var(--color-success, #15803d)' : 'var(--color-text-muted, #64748b)' }}>
                  {r.met ? '✓' : '○'} {r.label}
                </li>
              ))}
            </ul>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={loading || password.length < PASSWORD_MIN_LENGTH || password !== confirmPassword}
            >
              Update Password
            </Button>

            <div className="qf-auth-footer">
              <button
                type="button"
                onClick={() => { setStep('verify'); setResetToken(null); setPassword(''); setConfirmPassword(''); setErrorMessage(null); }}
                className="qf-btn qf-btn--link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Verify a different code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
