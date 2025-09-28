import React from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }) {
  return <div className={cn('rounded-2xl border bg-white shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('p-4 border-b', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <div className={cn('text-lg font-semibold', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-4', className)} {...props} />;
}