import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Modal } from '../components/shared/Modal';
import { Alert } from '../components/shared/Alert';
import { StatusBadge } from '../components/shared/StatusBadge';

describe('Shared UI Components Suite', () => {
  describe('Button Component', () => {
    it('renders text, handles clicks, and applies disabled styling', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      const { rerender } = render(
        <Button onClick={handleClick}>Submit Request</Button>
      );

      const btn = screen.getByRole('button', { name: /submit request/i });
      expect(btn).toBeInTheDocument();
      await user.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);

      rerender(<Button disabled onClick={handleClick}>Submit Request</Button>);
      expect(btn).toBeDisabled();
    });

    it('shows loading state and prevents clicks', () => {
      render(<Button loading>Process</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Input Component', () => {
    it('associates label with input using htmlFor and renders errors with role alert', () => {
      render(
        <Input
          id="custom-email"
          label="Email Address"
          error="Email is invalid."
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByLabelText(/email address/i);
      expect(input).toHaveAttribute('id', 'custom-email');
      expect(input).toHaveAttribute('aria-invalid', 'true');

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Email is invalid.');
    });
  });

  describe('Modal Component', () => {
    it('renders dialog when isOpen is true and calls onClose when clicking close button', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      const { rerender } = render(
        <Modal isOpen={false} onClose={handleClose} title="Test Modal">
          <p>Modal body content</p>
        </Modal>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      rerender(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Modal body content</p>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Modal body content')).toBeInTheDocument();

      await user.click(screen.getByLabelText('Close dialog'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape key press', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Body</p>
        </Modal>
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Alert Component', () => {
    it('renders with alert role and executes onDismiss when provided', async () => {
      const handleDismiss = vi.fn();
      const user = userEvent.setup();

      render(
        <Alert variant="danger" title="System Error" onDismiss={handleDismiss}>
          Could not establish connection.
        </Alert>
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Could not establish connection.');
      await user.click(screen.getByLabelText('Dismiss alert'));
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('StatusBadge Component', () => {
    it('renders status pill with correct humanized text and variant class', () => {
      render(<StatusBadge status="ready_for_pickup" />);
      const badge = screen.getByText('Ready for Pickup');
      expect(badge).toBeInTheDocument();
      expect(badge.parentElement).toHaveClass('qf-status-badge--success');
    });
  });
});
