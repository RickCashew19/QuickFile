import { useId } from 'react';
import './Select.css';
import '../shared/Input.css';

export function Select({
  id: explicitId,
  label,
  name,
  value,
  onChange,
  onBlur,
  options = [],
  placeholder = 'Select an option...',
  required = false,
  disabled = false,
  error = null,
  helperText = null,
  children,
  className = '',
  ...props
}) {
  const generatedId = useId();
  const selectId = explicitId || generatedId;
  const helperId = `${selectId}-helper`;
  const errorId = `${selectId}-error`;

  const selectClasses = [
    'qf-select',
    error ? 'qf-select--error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`qf-field ${className}`.trim()}>
      {label && (
        <div className="qf-field__label-row">
          <label htmlFor={selectId} className="qf-field__label">
            {label}
            {required && <span className="qf-field__required">*</span>}
          </label>
        </div>
      )}

      <div className="qf-select-wrapper">
        <select
          id={selectId}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={selectClasses}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.length > 0
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <span className="qf-select__arrow" aria-hidden="true">
          ▼
        </span>
      </div>

      {error ? (
        <span id={errorId} className="qf-field__error" role="alert">
          {error}
        </span>
      ) : helperText ? (
        <span id={helperId} className="qf-field__helper">
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
