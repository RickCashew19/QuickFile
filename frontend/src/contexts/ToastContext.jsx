import { createContext, useContext, useState, useCallback } from 'react';
import { Icon } from '../components/shared/Icon';
import '../components/shared/Toast.css';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type = 'info', title, message, duration }) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
      const isSuccess = type === 'success';
      const effectiveDuration = duration !== undefined ? duration : isSuccess ? 4000 : 0; // Success 4s auto-dismiss, errors stay until dismissed

      const newToast = { id, type, title, message };
      setToasts((prev) => [...prev, newToast]);

      if (effectiveDuration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, effectiveDuration);
      }
      return id;
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="qf-toast-container" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`qf-toast qf-toast--${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
          >
            <div className="qf-toast__icon">
              {toast.type === 'success' && <Icon name="check-circle" size={20} />}
              {toast.type === 'error' && <Icon name="alert" size={20} />}
              {toast.type === 'info' && <Icon name="info" size={20} />}
            </div>
            <div className="qf-toast__content">
              {toast.title && <div className="qf-toast__title">{toast.title}</div>}
              <div className="qf-toast__message">{toast.message}</div>
            </div>
            <button
              type="button"
              className="qf-toast__close"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      addToast: () => {},
      removeToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }

  return {
    ...context,
    success: (message, title = 'Success') => context.addToast({ type: 'success', message, title }),
    error: (message, title = 'Error') => context.addToast({ type: 'error', message, title }),
    info: (message, title = 'Notice') => context.addToast({ type: 'info', message, title }),
  };
}
