'use client';

import React from 'react';

interface PillInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  prefixIcon?: React.ReactNode;
  suffix?: React.ReactNode;
  action?: React.ReactNode;
}

export const PillInput: React.FC<PillInputProps> = ({
  label,
  prefixIcon,
  suffix,
  action,
  className = '',
  ...props
}) => {
  return (
    <div className="space-y-1.5">
      {(label || action) && (
        <div className="flex items-center justify-between text-[13px]">
          {label && <label className="font-medium text-text-secondary">{label}</label>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="relative flex items-center">
        {prefixIcon && (
          <div className="pointer-events-none absolute left-3 flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-text-muted text-[13px] font-medium">
            {prefixIcon}
          </div>
        )}
        <input
          className={`h-11 w-full rounded-full border border-border-subtle bg-surface-muted px-4 text-[14px] text-text-primary transition-all placeholder:text-text-muted focus:border-iris focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-iris/25 ${
            prefixIcon ? 'pl-12' : ''
          } ${suffix ? 'pr-14' : ''} ${className}`}
          {...props}
        />
        {suffix && (
          <div className="pointer-events-none absolute right-4 flex items-center text-[12px] font-medium text-text-muted">
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
};
