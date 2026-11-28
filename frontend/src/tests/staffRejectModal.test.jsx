import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StaffRejectModal } from '../pages/staff/queue/StaffRejectModal';

describe('StaffRejectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared field styling and locks the textarea resize handle', () => {
    render(
      <StaffRejectModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />
    );

    const textarea = screen.getByLabelText(/Rejection Reason/i);
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveClass('qf-field__input');
    expect(textarea.style.resize).toBe('none');
    expect(textarea).toHaveAttribute('maxlength', '500');
    expect(screen.getByText('0/500')).toBeInTheDocument();
  });

  it('validates a short reason and submits the trimmed value', () => {
    const onConfirm = vi.fn();
    render(
      <StaffRejectModal isOpen onClose={vi.fn()} onConfirm={onConfirm} />
    );

    const textarea = screen.getByLabelText(/Rejection Reason/i);
    const submit = screen.getByRole('button', { name: /Confirm Rejection/i });

    fireEvent.change(textarea, { target: { value: 'abc' } });
    fireEvent.click(submit);

    const error = screen.getByRole('alert');
    expect(error).toHaveClass('qf-field__error');
    expect(error).toHaveTextContent(/at least 5 characters/i);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: '  Incomplete documents  ' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(submit);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('Incomplete documents');
  });
});
