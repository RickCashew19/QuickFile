import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import './Modal.css';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer = null,
  size = 'md',
  preventBackdropClose = false,
  className = '',
}) {
  const modalRef = useRef(null);
  const mouseDownTargetRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Handle escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Prevent background scrolling
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropMouseDown = (e) => {
    mouseDownTargetRef.current = e.target;
  };

  const handleBackdropClick = (e) => {
    // Only close if backdrop close is enabled AND both mousedown and click originated
    // directly on the backdrop overlay itself (preventing text-drag releases from closing)
    if (
      !preventBackdropClose &&
      e.target === e.currentTarget &&
      mouseDownTargetRef.current === e.currentTarget
    ) {
      onClose();
    }
  };

  return (
    <div
      className="qf-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'qf-modal-title' : undefined}
        className={`qf-modal qf-modal--${size} ${className}`.trim()}
      >
        <div className="qf-modal__header">
          {title && (
            <h2 id="qf-modal-title" className="qf-modal__title">
              {title}
            </h2>
          )}
          <button
            type="button"
            className="qf-modal__close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="qf-modal__body">{children}</div>

        {footer && <div className="qf-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
