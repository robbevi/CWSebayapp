import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm text-textPri placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/40',
        className
      )}
      {...props}
    />
  );
}
