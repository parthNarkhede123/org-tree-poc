import React from 'react';
import { cn } from '../../lib/cn';

export function Separator({ orientation = 'horizontal', className }) {
  if (orientation === 'vertical') {
    return <div className={cn('w-px bg-slate-200', className)} />;
  }
  return <div className={cn('h-px bg-slate-200', className)} />;
}