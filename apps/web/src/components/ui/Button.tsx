import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primaryHover',
  secondary: 'bg-surfaceMuted text-textPri hover:bg-border',
  outline: 'bg-transparent border border-border text-textPri hover:bg-surfaceMuted',
  ghost: 'bg-transparent text-textPri hover:bg-surfaceMuted',
  danger: 'bg-transparent border border-red-300 text-red-600 hover:bg-red-50',
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-btn px-4 text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
