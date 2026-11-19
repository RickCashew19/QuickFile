import { useRef } from 'react';
import './OtpInput.css';

/**
 * Six-digit OTP input with automatic focus advance, paste support, and
 * backspace navigation. Value is reported to the parent as a plain digit string.
 */
export function OtpInput({ value = '', onChange, disabled = false, length = 6, autoFocus = false }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => (value || '')[i] || '');

  function emit(next) {
    if (onChange) onChange(next.join(''));
  }

  function handleChange(index, raw) {
    const cleaned = String(raw || '').replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      emit(next);
      return;
    }
    // Support typing/pasting multiple digits into a single box.
    const next = [...digits];
    let cursor = index;
    for (const ch of cleaned) {
      if (cursor >= length) break;
      next[cursor] = ch;
      cursor += 1;
    }
    emit(next);
    const focusIndex = Math.min(cursor, length - 1);
    if (refs.current[focusIndex]) refs.current[focusIndex].focus();
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        const next = [...digits];
        next[index - 1] = '';
        emit(next);
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = String(e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    const next = Array.from({ length }, (_, i) => pasted[i] || '');
    emit(next);
    const focusIndex = Math.min(pasted.length, length - 1);
    refs.current[focusIndex]?.focus();
  }

  return (
    <div className="qf-otp" role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="qf-otp__box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          autoFocus={autoFocus && i === 0}
        />
      ))}
    </div>
  );
}
