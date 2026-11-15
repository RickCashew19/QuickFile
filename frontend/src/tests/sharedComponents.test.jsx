import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Modal } from '../components/shared/Modal';
import { Alert } from '../components/shared/Alert';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Logo } from '../components/shared/Logo';
import { Icon } from '../components/shared/Icon';

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

    it('closes on direct backdrop click when preventBackdropClose is false', () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Body</p>
        </Modal>
      );

      const backdrop = container.querySelector('.qf-modal-backdrop');
      fireEvent.mouseDown(backdrop);
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT close on backdrop click when preventBackdropClose is true', () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal" preventBackdropClose={true}>
          <p>Body</p>
        </Modal>
      );

      const backdrop = container.querySelector('.qf-modal-backdrop');
      fireEvent.mouseDown(backdrop);
      fireEvent.click(backdrop);
      expect(handleClose).not.toHaveBeenCalled();
    });

    it('does NOT close when mouse drag originates inside modal and ends on backdrop', () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Selectable text</p>
        </Modal>
      );

      const modalContent = screen.getByText('Selectable text');
      const backdrop = container.querySelector('.qf-modal-backdrop');

      // User starts dragging inside the modal dialog
      fireEvent.mouseDown(modalContent);
      // Mouse is released outside on the backdrop
      fireEvent.click(backdrop);

      expect(handleClose).not.toHaveBeenCalled();
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

  describe('Logo & Icon Suite (Photo 1 Style)', () => {
    it('renders QuickFile Logo SVG with document fold and checkmark', () => {
      const { container } = render(<Logo size={48} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
      expect(svg).toHaveAttribute('width', '48');
    });

    it('renders Logo with brand title and subtitle when showText is true', () => {
      render(<Logo size={36} showText title="QuickFile" subtitle="Resident Portal" />);
      expect(screen.getByText('QuickFile')).toBeInTheDocument();
      expect(screen.getByText('Resident Portal')).toBeInTheDocument();
    });

    it('renders Logo image when useImage is true', () => {
      render(<Logo size={40} useImage alt="QuickFile Brand" />);
      const img = screen.getByAltText('QuickFile Brand');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/logo.jpg');
    });

    it('renders tailored cohesive icons matching Photo 1 design language', () => {
      const { container, rerender } = render(<Icon name="logo" size={32} />);
      expect(container.querySelector('svg')).toBeInTheDocument();

      rerender(<Icon name="check" size={24} />);
      expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '2.8');

      rerender(<Icon name="file" size={24} />);
      expect(container.querySelector('svg')).toBeInTheDocument();

      rerender(<Icon name="building" size={24} />);
      expect(container.querySelector('svg')).toBeInTheDocument();

      rerender(<Icon name="qr" size={24} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });
});
