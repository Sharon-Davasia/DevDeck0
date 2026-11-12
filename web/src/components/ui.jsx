import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';

/* ------------------------------------------------------------------ Button */
export function Button({
  variant = 'secondary',
  size,
  icon,
  iconRight,
  loading = false,
  className = '',
  children,
  as: As = 'button',
  ...props
}) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    subtle: 'btn bg-brand-50 text-brand-700 hover:bg-brand-100',
    dark: 'btn bg-ink text-white hover:opacity-90',
  };
  return (
    <As
      className={`${variants[variant] || variants.secondary} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? (
        <Spinner size={14} />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />
      )}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 13 : 15} />}
    </As>
  );
}

export function IconButton({ icon, label, size = 15, className = '', ...props }) {
  return (
    <button className={`btn-icon ${className}`} aria-label={label} title={label} {...props}>
      <Icon name={icon} size={size} />
    </button>
  );
}

/* ----------------------------------------------------------------- Spinner */
export function Spinner({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Badges */
export function Badge({ children, className = '', dot, icon }) {
  return (
    <span className={`badge ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

export function StatusDot({ className = 'bg-emerald-500', pulse = false }) {
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${className} opacity-60`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${className}`} />
    </span>
  );
}

/* ------------------------------------------------------------------- Modal */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const ref = useRef(null);
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-[#0b1220]/40 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`relative w-full ${sizes[size]} animate-slide-up overflow-hidden rounded-t-2xl border border-line bg-elevated shadow-pop sm:rounded-2xl`}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
            <div>
              {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
            </div>
            <IconButton icon="x" label="Close" onClick={onClose} />
          </div>
        )}
        <div className="max-h-[calc(100vh-11rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line-soft bg-[#fbfcfe] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ----------------------------------------------------------------- Drawer */
export function Drawer({ open, onClose, title, children, width = 'max-w-xl', footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 animate-fade-in bg-[#0b1220]/35 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={`absolute right-0 top-0 flex h-full w-full ${width} animate-slide-up flex-col border-l border-line bg-elevated shadow-pop sm:animate-fade-in`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------ Empty state */
export function EmptyState({ icon = 'inbox', title, description, action, className = '', compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-10' : 'px-6 py-16'} ${className}`}>
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand-50 blur-xl" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-brand-500 shadow-card">
          <Icon name={icon} size={20} />
        </div>
      </div>
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-500">
        <Icon name="alert-triangle" size={19} />
      </div>
      <h3 className="text-[14px] font-semibold text-ink">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-[12.5px] text-muted">
        {error?.message || 'We could not load this data. Please try again.'}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Skeletons */
export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-1/5" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-2.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 6, cols = 4 }) {
  return (
    <div className="divide-y divide-line-soft">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? 'w-1/3' : c === cols - 1 ? 'w-16' : 'w-24'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Tabs */
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`flex items-center gap-1 overflow-x-auto no-scrollbar ${className}`}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              active ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink'
            }`}
          >
            {tab.icon && <Icon name={tab.icon} size={13} />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded px-1 py-px text-[10.5px] font-semibold ${
                  active ? 'bg-brand-50 text-brand-700' : 'bg-line-soft text-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- Select */
export function Select({ value, onChange, options, className = '', size = 'md', ...rest }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input appearance-none pr-8 ${size === 'sm' ? 'py-1.5 text-[12.5px]' : ''}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

/* ------------------------------------------------------------- Search bar */
export function SearchInput({ value, onChange, placeholder = 'Search…', className = '', onClear, autoFocus }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="input pl-9 pr-8"
      />
      {value && (
        <button
          onClick={() => (onClear ? onClear() : onChange(''))}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"
          aria-label="Clear search"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Tooltip */
export function Tooltip({ label, children, side = 'top', className = '' }) {
  return (
    <span className={`group/tt relative inline-flex ${className}`}>
      {children}
      {label ? (
        <span
          className={`pointer-events-none absolute z-50 ${
            side === 'top' ? 'bottom-full mb-1.5' : side === 'bottom' ? 'top-full mt-1.5' : 'left-full ml-2'
          } left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-1.5 py-1 text-[10.5px] font-medium text-white opacity-0 transition-opacity group-hover/tt:opacity-100`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

/* --------------------------------------------------------------- Progress */
export function Progress({ value, max = 100, className = '', tone = 'bg-brand-500' }) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-line-soft ${className}`}>
      <div className={`h-full rounded-full ${tone} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ----------------------------------------------------------- Confirm hook */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setState({
          title: 'Are you sure?',
          confirmLabel: 'Confirm',
          tone: 'danger',
          ...options,
          resolve,
        });
      }),
    []
  );

  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.title}
        description={state?.description}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant={state?.tone === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={() => close(true)}
              autoFocus
            >
              {state?.confirmLabel}
            </Button>
          </>
        }
      >
        {state?.body ? (
          <div className="text-[13px] leading-relaxed text-soft">{state.body}</div>
        ) : (
          <p className="text-[13px] text-soft">
            This action cannot be undone. The record and its associations will be permanently removed.
          </p>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

/* --------------------------------------------------------------- Dropdown */
export function Dropdown({ trigger, children, align = 'right', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 mt-1.5 min-w-[190px] animate-slide-down overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-pop ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger = false, shortcut }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-soft hover:bg-line-soft hover:text-ink'
      }`}
    >
      {icon && <Icon name={icon} size={14} />}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="kbd">{shortcut}</span>}
    </button>
  );
}

/* ----------------------------------------------------------------- Avatar */
export function Avatar({ name = '', color = '#4f46e5', size = 32, className = '' }) {
  const text = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, ${shade(color, -18)})`,
        fontSize: size * 0.36,
      }}
    >
      {text || '?'}
    </span>
  );
}

function shade(hex, amt) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt);
  const g = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ------------------------------------------------------------ Code block */
export function CodeBlock({ code, language, className = '', copyable = true, maxHeight }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be blocked */
    }
  };
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-line bg-[#0f1420] ${className}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-slate-400">
          {language || 'shell'}
        </span>
        {copyable && (
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <Icon name={copied ? 'check' : 'copy'} size={11} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <pre
        className="overflow-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.65] text-slate-200"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ Meter */
export function StatPill({ icon, value, label, tone = 'text-soft' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      <span className="tabular-nums">{value}</span>
      {label && <span className="text-muted">{label}</span>}
    </span>
  );
}
