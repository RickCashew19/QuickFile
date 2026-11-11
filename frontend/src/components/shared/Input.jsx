import { useId } from 'react';
import './Input.css';

export function Input({
  id: explicitId,
  label,
  type = 'text',
  name,
  value,
  onChange,
  onBlur,
  placeholder = '',
  required = false,
  disabled = false,
  error = null,
  helperText = null,
  helpText = null,
  prefix = null,
  suffix = null,
  className = '',
  autoComplete,
  ...props
}) {
  const generatedId = useId();
  const inputId = explicitId || generatedId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const effectiveHelperText = helperText || helpText;

  const inputClasses = [
    'qf-field__input',
    prefix ? 'qf-field__input--has-prefix' : '',
    suffix ? 'qf-field__input--has-suffix' : '',
    error ? 'qf-field__input--error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`qf-field ${className}`.trim()}>
      {label && (
        <div className="qf-field__label-row">
          <label htmlFor={inputId} className="qf-field__label">
            {label}
            {required && <span className="qf-field__required">*</span>}
          </label>
        </div>
      )}

      <div className="qf-field__input-wrapper">
        {prefix && <span className="qf-field__prefix">{prefix}</span>}
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : effectiveHelperText ? helperId : undefined}
          className={inputClasses}
          {...props}
        />
        {suffix && <span className="qf-field__suffix">{suffix}</span>}
      </div>

      {error ? (
        <span id={errorId} className="qf-field__error" role="alert">
          {error}
        </span>
      ) : effectiveHelperText ? (
        <span id={helperId} className="qf-field__helper">
          {effectiveHelperText}
        </span>
      ) : null}
    </div>
  );
}
