import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import './Toast.css';

const ToastContext = createContext(null);

let toastId = 0;

/**
 * Lightweight toast notification system.
 *
 * Wraps the app in a <ToastProvider> and use the useToast() hook
 * to trigger toasts from any component:
 *
 *   const toast = useToast();
 *   toast.success('Review saved');
 *   toast.error('Upload failed');
 *   toast.info('Session expires in 5 minutes');
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, variant = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, variant }]);
    timersRef.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const api = useRef({
    success: (msg, duration) => addToast(msg, 'success', duration),
    error: (msg, duration) => addToast(msg, 'error', duration ?? 6000),
    info: (msg, duration) => addToast(msg, 'info', duration),
    dismiss,
  });

  // Keep the ref methods up to date without recreating the object
  api.current.success = (msg, duration) => addToast(msg, 'success', duration);
  api.current.error = (msg, duration) => addToast(msg, 'error', duration ?? 6000);
  api.current.info = (msg, duration) => addToast(msg, 'info', duration);
  api.current.dismiss = dismiss;

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="toast-container" aria-live="polite" aria-relevant="additions">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`toast toast--${t.variant}`}
              role="status"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="toast__icon" aria-hidden="true">
                {t.variant === 'success' && '✓'}
                {t.variant === 'error' && '!'}
                {t.variant === 'info' && 'i'}
              </span>
              <span className="toast__message">{t.message}</span>
              <button
                type="button"
                className="toast__close"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}
