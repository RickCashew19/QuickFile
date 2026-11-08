import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { publicService } from '../../services/publicService';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import { Select } from '../../components/shared/Select';
import { Alert } from '../../components/shared/Alert';
import { Icon } from '../../components/shared/Icon';
import './RegisterPage.css';
import './LoginPage.css';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirm_password: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    birthdate: '',
    gender: 'male',
    civil_status: 'single',
    contact_number: '',
    purok_zone: '',
    street_address: '',
    barangay: '',
    city: '',
    province: '',
    emergency_contact_name: '',
    emergency_contact_number: '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [config, setConfig] = useState(null);
  const [recaptchaToken, setRecaptchaToken] = useState(null);
  const recaptchaRef = useRef(null);

  useEffect(() => {
    publicService.getConfig().then((data) => {
      setConfig(data);
      if (data) {
        setFormData((prev) => ({
          ...prev,
          barangay: data.barangay_name || '',
          city: data.city_municipality || '',
          province: data.province || '',
        }));
      }

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
    });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic Validation
    if (
      !formData.email ||
      !formData.password ||
      !formData.first_name ||
      !formData.last_name ||
      !formData.birthdate ||
      !formData.gender
    ) {
      setErrorMessage('Please fill in all required fields marked with an asterisk (*).');
      return;
    }

    if (formData.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters in length.');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (config?.integrations?.recaptcha_enabled && !recaptchaToken) {
      setErrorMessage('Please complete the reCAPTCHA verification.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        recaptcha_token: recaptchaToken,
      };
      delete payload.confirm_password;

      await register(payload);
      navigate('/citizen/requests', { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'Registration failed. Please try again.');
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
    <div className="qf-register-layout">
      <div className="qf-register-card">
        <div className="qf-auth-header">
          <Link to="/" className="qf-auth-header__logo" aria-label="Return to Home">
            <Icon name="building" size={26} />
          </Link>
          <h1 className="qf-auth-header__title">Resident Registration</h1>
          <p className="qf-auth-header__subtitle">
            Create an official QuickFile citizen account for online document requests
          </p>
        </div>

        {errorMessage && (
          <Alert variant="danger" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Account Credentials */}
          <fieldset className="qf-form-section">
            <legend className="qf-form-section__title">1. Account Credentials</legend>
            <Input
              label="Email Address"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="juan.delacruz@example.com"
              required
              prefix={<Icon name="mail" size={18} />}
            />
            <div className="qf-form-row-2">
              <Input
                label="Password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 6 characters"
                required
                prefix={<Icon name="lock" size={18} />}
              />
              <Input
                label="Confirm Password"
                type="password"
                name="confirm_password"
                value={formData.confirm_password}
                onChange={handleChange}
                placeholder="Re-enter password"
                required
                prefix={<Icon name="lock" size={18} />}
              />
            </div>
          </fieldset>

          {/* Personal Information */}
          <fieldset className="qf-form-section">
            <legend className="qf-form-section__title">2. Personal Information</legend>
            <div className="qf-form-row-2">
              <Input
                label="First Name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                placeholder="Juan"
                required
              />
              <Input
                label="Middle Name"
                name="middle_name"
                value={formData.middle_name}
                onChange={handleChange}
                placeholder="Optional"
              />
            </div>
            <div className="qf-form-row-2">
              <Input
                label="Last Name"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                placeholder="Dela Cruz"
                required
              />
              <Input
                label="Suffix"
                name="suffix"
                value={formData.suffix}
                onChange={handleChange}
                placeholder="Jr., Sr., III (Optional)"
              />
            </div>
            <div className="qf-form-row-3">
              <Input
                label="Birthdate"
                type="date"
                name="birthdate"
                value={formData.birthdate}
                onChange={handleChange}
                required
              />
              <Select
                label="Gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                required
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'other', label: 'Other' },
                ]}
              />
              <Select
                label="Civil Status"
                name="civil_status"
                value={formData.civil_status}
                onChange={handleChange}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'married', label: 'Married' },
                  { value: 'widowed', label: 'Widowed' },
                  { value: 'separated', label: 'Separated' },
                ]}
              />
            </div>
          </fieldset>

          {/* Contact & Address */}
          <fieldset className="qf-form-section">
            <legend className="qf-form-section__title">3. Contact & Residency Address</legend>
            <Input
              label="Contact Number"
              type="tel"
              name="contact_number"
              value={formData.contact_number}
              onChange={handleChange}
              placeholder="09123456789"
              prefix={<Icon name="phone" size={18} />}
            />
            <div className="qf-form-row-2">
              <Input
                label="Purok / Zone"
                name="purok_zone"
                value={formData.purok_zone}
                onChange={handleChange}
                placeholder="e.g. Purok 4"
              />
              <Input
                label="Street Address / House No."
                name="street_address"
                value={formData.street_address}
                onChange={handleChange}
                placeholder="e.g. 123 Rizal St."
              />
            </div>
            <div className="qf-form-row-3">
              <Input
                label="Barangay"
                name="barangay"
                value={formData.barangay}
                onChange={handleChange}
              />
              <Input
                label="City / Municipality"
                name="city"
                value={formData.city}
                onChange={handleChange}
              />
              <Input
                label="Province"
                name="province"
                value={formData.province}
                onChange={handleChange}
              />
            </div>
          </fieldset>

          {/* Emergency Contact */}
          <fieldset className="qf-form-section">
            <legend className="qf-form-section__title">4. Emergency Contact (Optional)</legend>
            <div className="qf-form-row-2">
              <Input
                label="Emergency Contact Name"
                name="emergency_contact_name"
                value={formData.emergency_contact_name}
                onChange={handleChange}
                placeholder="Name of next of kin"
              />
              <Input
                label="Emergency Contact Number"
                type="tel"
                name="emergency_contact_number"
                value={formData.emergency_contact_number}
                onChange={handleChange}
                placeholder="09123456789"
              />
            </div>
          </fieldset>

          {config?.integrations?.recaptcha_enabled && (
            <div
              ref={recaptchaRef}
              style={{ marginBottom: 'var(--space-6)', display: 'flex', justifyContent: 'center' }}
            />
          )}

          <Button type="submit" size="lg" fullWidth loading={loading}>
            Create Citizen Account
          </Button>
        </form>

        <div className="qf-auth-footer">
          Already registered? <Link to="/login">Sign in to your account</Link>
        </div>
      </div>
    </div>
  );
}
