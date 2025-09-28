import React from 'react';
import { cn } from '../../lib/cn';

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn('h-9 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500', className)}
      {...props}
    />
  );
});