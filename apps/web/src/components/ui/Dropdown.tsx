import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface DropdownGroup {
  label: string;
  options: string[];
}

interface DropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: string[];
  /** Use instead of `options` to render `<optgroup>` sections (e.g. a categorized reason list). */
  groups?: DropdownGroup[];
  placeholder?: string;
  /** "bare" drops the border/background/padding so it can sit inside a custom-styled wrapper. */
  variant?: 'default' | 'bare';
}

export function Dropdown({ options, groups, placeholder, variant = 'default', className, value, ...props }: DropdownProps) {
  const isPlaceholder = placeholder !== undefined && (value === undefined || value === '');

  return (
    <select
      value={value}
      className={cn(
        'w-full text-xs focus:outline-none',
        variant === 'default' && 'rounded-btn border border-border bg-surface px-3 py-2 focus:ring-2 focus:ring-primary/40',
        variant === 'bare' && 'bg-transparent',
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
      {options?.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
      {groups?.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
