import { useId } from 'react';
import { Icon } from './Icon';
import './Input.css';

export function Input({
  id: explicitId,
  label,
  type = 'text',
  name,
  value = '',
  onChange,
  onBlur,
  onKeyDown,
  onClear,
  onSubmitSearch,
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

  const isSearch = type === 'search';
  const effectivePrefix = prefix || (isSearch ? <Icon name="search" size={18} /> : null);

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange({ target: { name, value: '' } });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && onSubmitSearch) {
      onSubmitSearch(value);
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const showClearButton = isSearch && Boolean(value) && !disabled;
  const effectiveSuffix = suffix || (showClearButton ? (
    <button
      type="button"
      className="qf-field__clear-btn"
      onClick={handleClear}
      aria-label="Clear search text"
    >
      <Icon name="close" size={14} />
    </button>
  ) : null);

  const inputClasses = [
    'qf-field__input',
    effectivePrefix ? 'qf-field__input--has-prefix' : '',
    effectiveSuffix ? 'qf-field__input--has-suffix' : '',
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
        {effectivePrefix && <span className="qf-field__prefix">{effectivePrefix}</span>}
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : effectiveHelperText ? helperId : undefined}
          className={inputClasses}
          {...props}
        />
        {effectiveSuffix && <span className="qf-field__suffix">{effectiveSuffix}</span>}
      </div>

      {error ? (
        <span id={errorId} className="qf-field__error" role="alert">
          <Icon name="alert" size={14} className="qf-field__error-icon" />
          <span>{error}</span>
        </span>
      ) : effectiveHelperText ? (
        <span id={helperId} className="qf-field__helper">
          {effectiveHelperText}
        </span>
      ) : null}
    </div>
  );
}
