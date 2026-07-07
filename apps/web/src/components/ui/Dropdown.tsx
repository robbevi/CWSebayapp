import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface DropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: string[];
}

export function Dropdown({ options, className, ...props }: DropdownProps) {
  return (
    <select
      className={cn(
        'w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm text-textPri focus:outline-none focus:ring-2 focus:ring-primary/40',
        className
      )}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
