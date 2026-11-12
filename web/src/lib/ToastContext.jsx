import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Icon } from '../components/Icon.jsx';

const ToastContext = createContext(null);

const TONE = {
  success: { icon: 'check-circle', ring: 'ring-emerald-100', bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  error: { icon: 'alert-circle', ring: 'ring-red-100', bg: 'bg-red-50', fg: 'text-red-600' },
  info: { icon: 'info', ring: 'ring-brand-100', bg: 'bg-brand-50', fg: 'text-brand-600' },
  warning: { icon: 'alert-triangle', ring: 'ring-amber-100', bg: 'bg-amber-50', fg: 'text-amber-600' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, { tone = 'success', description, duration = 4000, action } = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev.slice(-3), { id, message, description, tone, action }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (m, o) => push(m, { ...o, tone: 'success' }),
      error: (m, o) => push(m, { ...o, tone: 'error', duration: o?.duration ?? 6000 }),
      info: (m, o) => push(m, { ...o, tone: 'info' }),
      warning: (m, o) => push(m, { ...o, tone: 'warning' }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-5 sm:right-5">
        {toasts.map((t) => {
          const tone = TONE[t.tone] || TONE.info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border border-line bg-elevated p-3 shadow-pop"
              role="status"
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone.bg} ring-1 ${tone.ring} ${tone.fg}`}>
                <Icon name={tone.icon} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-ink">{t.message}</p>
                {t.description && <p className="mt-0.5 text-[12px] leading-snug text-muted">{t.description}</p>}
                {t.action && (
                  <button
                    onClick={() => {
                      t.action.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-1.5 text-[12px] font-semibold text-brand-600 hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} className="btn-icon h-6 w-6 shrink-0" aria-label="Dismiss">
                <Icon name="x" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
