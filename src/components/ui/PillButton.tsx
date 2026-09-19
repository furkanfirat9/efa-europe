'use client';

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  arrow?: boolean;
}

export const PillButton: React.FC<PillButtonProps> = ({
  variant = 'primary',
  icon,
  arrow = false,
  className = '',
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-hidden focus:ring-2 focus:ring-accent/30';

  let variantStyles = '';

  switch (variant) {
    case 'primary':
      variantStyles =
        'h-10 px-5 rounded-full bg-ink text-white hover:bg-neutral-800 text-[14px] shadow-xs';
      break;
    case 'secondary':
      variantStyles =
        'h-10 px-5 rounded-full bg-surface-muted text-text-primary hover:bg-surface-accent text-[14px] border border-border-subtle';
      break;
    case 'ghost':
      variantStyles =
        'h-9 px-3 rounded-full bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary text-[13px]';
      break;
    case 'icon':
      variantStyles =
        'h-9 w-9 md:h-10 md:w-10 rounded-full bg-white hover:bg-surface-muted text-text-secondary hover:text-text-primary border border-border-subtle p-0';
      break;
  }

  return (
    <button className={`${baseStyles} ${variantStyles} ${className}`} {...props}>
      {arrow && (
        <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-ink text-[11px]">
          ↗
        </span>
      )}
      {icon && <span className={children ? 'mr-1.5' : ''}>{icon}</span>}
      {children}
    </button>
  );
};
