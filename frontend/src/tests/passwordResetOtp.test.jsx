import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OtpInput } from '../components/shared/OtpInput';
import { StepIndicator } from '../components/shared/StepIndicator';
import {
  isValidEmail,
  maskEmail,
  getPasswordRequirements,
  PASSWORD_MIN_LENGTH,
} from '../validators/validators';

describe('Password reset helpers', () => {
  it('validates email addresses', () => {
    expect(isValidEmail('resident@example.com')).toBe(true);
    expect(isValidEmail('bad@@example.com')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('masks the destination email without exposing the full local part', () => {
    const masked = maskEmail('juan.delacruz@example.com');
    expect(masked).not.toContain('delacruz');
    expect(masked).toMatch(/@example\.com$/);
    expect(masked.startsWith('j')).toBe(true);
  });

  it('reports password requirements', () => {
    const short = getPasswordRequirements('Ab1');
    expect(short.find((r) => r.key === 'length').met).toBe(false);
    expect(short.find((r) => r.key === 'upper').met).toBe(true);
    const strong = getPasswordRequirements('StrongPass1');
    expect(strong.every((r) => r.met)).toBe(true);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('OtpInput', () => {
  it('renders six boxes and auto-advances on digit entry', () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit/);
    expect(boxes).toHaveLength(6);
    fireEvent.change(boxes[0], { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('accepts a pasted full code', () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit/);
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '123456' } });
    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('accepts non-digits by stripping them', () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit/);
    fireEvent.change(boxes[0], { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('StepIndicator', () => {
  it('shows three steps with the active step marked', () => {
    render(<StepIndicator steps={['Enter Email', 'Verify OTP', 'Reset Password']} currentStep={1} />);
    expect(screen.getByText('Enter Email')).toBeTruthy();
    expect(screen.getByText('Verify OTP')).toBeTruthy();
    expect(screen.getByText('Reset Password')).toBeTruthy();
    expect(screen.getByText('Verify OTP').closest('li').getAttribute('aria-current')).toBe('step');
  });
});
