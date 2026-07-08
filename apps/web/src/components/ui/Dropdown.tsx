import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface DropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: string[];
  placeholder?: string;
}

export function Dropdown({ options, placeholder, className, value, ...props }: DropdownProps) {
  const isPlaceholder = placeholder !== undefined && (value === undefined || value === '');

  return (
    <select
      value={value}
      className={cn(
        'w-full rounded-btn border border-border bg-surface px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40',
        isPlaceholder ? 'text-textMuted' : 'text-textPri',
        className
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
