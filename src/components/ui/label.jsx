import React from 'react';
import { cn } from '../../lib/cn';

export function Label({ className, ...props }) {
  return <label className={cn('mb-1 block text-sm font-medium text-slate-700', className)} {...props} />;
}