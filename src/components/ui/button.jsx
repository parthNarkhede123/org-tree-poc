import React from 'react';
import { cn } from '../../lib/cn';

const variantClasses = {
  default: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
  outline: 'border border-slate-300 text-slate-900 hover:bg-slate-50',
  ghost: 'text-slate-800 hover:bg-slate-100',
};

const sizeClasses = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-base',
};

export function Button({ variant = 'default', size = 'md', className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}