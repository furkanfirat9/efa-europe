'use client';

import React from 'react';

/**
 * Konsolun form ilkelleri. Girdi stilini tek yerde tutmak, on iki ayrı
 * input'un zamanla birbirinden ayrışmasını engelleyen şey.
 */

const CONTROL =
  'w-full rounded-lg border border-hairline bg-panel-sunken px-3 text-2xs text-ink outline-hidden transition-colors placeholder:text-ink-faint focus:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60';

export function Field({
  label,
  required,
  hint,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  /** Girdinin altındaki açıklama. Zorunluysa neden zorunlu olduğunu söyler. */
  hint?: React.ReactNode;
  /** Etiket satırının sağına yerleşen bağlantı veya buton. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className="text-2xs font-medium text-ink-muted">
          {label}
          {required && <span className="ml-1 text-loss">*</span>}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-2xs leading-relaxed text-ink-subtle">{hint}</p>}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = '', ...props }, ref) {
    return <input ref={ref} {...props} className={`${CONTROL} h-9 ${className}`} />;
  }
);

export function TextArea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} resize-none py-2.5 leading-relaxed ${className}`} />;
}

export function Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${CONTROL} h-9 cursor-pointer ${className}`}>
      {children}
    </select>
  );
}

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const base =
    'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg text-2xs font-medium transition-colors disabled:cursor-default disabled:opacity-50';

  const variants = {
    primary: 'bg-brand text-white hover:opacity-90',
    secondary:
      'border border-hairline bg-panel-sunken text-ink-muted hover:border-hairline-strong hover:text-ink',
    ghost: 'text-ink-subtle hover:bg-white/5 hover:text-ink',
    danger: 'text-ink-subtle hover:bg-loss-soft hover:text-loss',
  };

  return (
    <button {...props} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}
