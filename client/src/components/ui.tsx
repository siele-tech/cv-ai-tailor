import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

// ---------- icons (inline, so no icon dependency) ----------

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.200-1.8zM19 15l.8 2.200L22 18l-2.200.8L19 21l-.8-2.200L16 18l2.200-.8z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-14v5l3 2',
  settings: 'M4 6h10m4 0h2M4 12h2m4 0h10M4 18h10m4 0h2M14 4v4M6 10v4M14 16v4',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 19h16',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 20h16',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5m0 0-6 6m6-6 6 6',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  chevron: 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.500 4.500L19 7.5',
  alert: 'M12 9v4m0 4h.01M10.300 3.900 2.500 17.500A2 2 0 0 0 4.200 20.500h15.600a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0z',
  eye: 'M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4m4 4H4',
  clip: 'M20.5 11.5 12 20a5 5 0 0 1-7.1-7.1l9.2-9.2a3.4 3.4 0 0 1 4.8 4.8l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4L15.5 7',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-md shadow-brand-600/25 hover:from-brand-700 hover:to-violet-700 active:scale-[0.98]',
  secondary: 'border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-brand-200 hover:bg-brand-50/50 active:scale-[0.98]',
  ghost: 'text-brand-700 hover:bg-brand-50 active:bg-brand-100',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50 active:bg-red-100',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  size?: 'md' | 'lg' | 'sm';
}

export function Button({ variant = 'secondary', icon, loading = false, size = 'md', className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  const sizing = size === 'lg' ? 'min-h-14 px-5 text-base' : size === 'sm' ? 'min-h-10 px-3 text-sm' : 'min-h-12 px-4 text-[15px]';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

// ---------- layout pieces ----------

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-12px_rgb(67_56_202/0.18)] backdrop-blur ${className}`}>{children}</section>;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="bg-gradient-to-r from-slate-900 via-brand-800 to-violet-700 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">{title}</h1>
      {subtitle && <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{subtitle}</p>}
    </div>
  );
}

const NOTICE: Record<'info' | 'warn' | 'error' | 'success', string> = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

export function Notice({ kind = 'info', title, children }: { kind?: keyof typeof NOTICE; title?: string; children?: ReactNode }) {
  return (
    <div role={kind === 'error' ? 'alert' : 'note'} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${NOTICE[kind]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

/** Shown while a long server operation runs. Indeterminate, because the server gives no percentage. */
export function Progress({ label, hint }: { label: string; hint?: string }) {
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-900">
        <Spinner className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full w-2/5 rounded-full bg-brand-600" style={{ animation: 'indeterminate 1.4s ease-in-out infinite' }} />
      </div>
      {hint && <p className="mt-2 text-xs text-brand-800">{hint}</p>}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-600">{children}</p>}
      {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
    </Card>
  );
}

export function Chips({ items, tone = 'neutral' }: { items: string[]; tone?: 'good' | 'bad' | 'neutral' }) {
  const style =
    tone === 'good' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : tone === 'bad' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${style}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

// ---------- form fields ----------

const INPUT =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50';

function Labelled({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-700">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  hint?: string;
  error?: string;
  type?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'url';
  autoComplete?: string;
  maxLength?: number;
}

export function Field({ label, value, onChange, hint, error, type = 'text', ...rest }: FieldProps) {
  const id = useId();
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} className={`${INPUT} h-12`} {...rest} />
    </Labelled>
  );
}

interface TextAreaProps {
  label: string;
  value: string;
  onChange(value: string): void;
  rows?: number;
  placeholder?: string;
  hint?: string;
  error?: string;
  maxLength?: number;
}

export function TextArea({ label, value, onChange, rows = 4, hint, error, ...rest }: TextAreaProps) {
  const id = useId();
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} className={`${INPUT} py-3 leading-relaxed`} {...rest} />
    </Labelled>
  );
}

interface ListTextProps {
  label: string;
  value: string[];
  onChange(value: string[]): void;
  /** "lines": one item per line. "commas": items separated by commas. */
  mode: 'lines' | 'commas';
  rows?: number;
  placeholder?: string;
  hint?: string;
}

/**
 * Edits a list of strings as free text, which is far easier on a phone than one input per item.
 * The raw text is kept locally so separators typed mid-edit are not normalised away.
 */
export function ListText({ label, value, onChange, mode, rows, placeholder, hint }: ListTextProps) {
  const id = useId();
  const parse = (text: string) => (mode === 'lines' ? text.split('\n') : text.split(/[,\n]/)).map((s) => s.trim()).filter(Boolean);
  const format = (items: string[]) => items.join(mode === 'lines' ? '\n' : ', ');
  const [raw, setRaw] = useState(() => format(value));
  const lastSent = useRef(value);

  // Re-sync only when the list was changed from outside (for example a CV was just extracted).
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setRaw(format(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Labelled id={id} label={label} hint={hint ?? (mode === 'lines' ? 'One per line.' : 'Separate with commas.')}>
      <textarea
        id={id}
        // Long items wrap on a phone, so size by estimated wrapped lines rather than item count.
        rows={rows ?? (mode === 'lines' ? Math.min(Math.max(value.reduce((n, item) => n + Math.ceil(item.length / 30), 1), 3), 14) : 3)}
        value={raw}
        placeholder={placeholder}
        onChange={(e) => {
          setRaw(e.target.value);
          const next = parse(e.target.value);
          lastSent.current = next;
          onChange(next);
        }}
        className={`${INPUT} py-3 leading-relaxed`}
      />
    </Labelled>
  );
}

// ---------- confirm dialog ----------

interface ConfirmProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: ConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="p-5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-slate-600">{children}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
