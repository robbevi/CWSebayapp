import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDropdownPosition } from '../../hooks/useDropdownPosition';
import { cn } from '../../lib/cn';

interface OptionGroup {
  label: string;
  options: string[];
}

interface SelectDropdownProps {
  icon?: ReactNode;
  options?: string[];
  /** Use instead of `options` for a categorized list (renders a bold uppercase header per group). */
  groups?: OptionGroup[];
  value: string;
  /** Omit for a value that's never "unset" (e.g. a Yes/No toggle) — this also hides the clear-to-blank row. */
  placeholder?: string;
  /** A value treated as the "neutral"/default state — rendered in muted gray like a placeholder
   *  (e.g. "No" on a Yes/No toggle), so it matches the look of the unselected condition dropdowns. */
  mutedValue?: string;
  /** Extra classes for the closed trigger button (e.g. font-medium to match a sibling button). */
  triggerClassName?: string;
  /** Prepended to the displayed value only (e.g. "Sort: " before "Bin Location") — doesn't
   *  affect matching against `options`/`groups`, so selection highlighting still works. */
  valuePrefix?: string;
  /** Extra classes for the value text span (e.g. text-center). */
  valueClassName?: string;
  onChange: (value: string) => void;
}

// Fully custom single-select popover instead of a native <select> — the browser's own
// picker/option-group styling can't be restyled (especially on mobile), so this renders
// everything ourselves to match the rest of the UI (rounded corners, light gray border).
export function SelectDropdown({
  icon,
  options,
  groups,
  value,
  placeholder,
  mutedValue,
  triggerClassName,
  valuePrefix,
  valueClassName,
  onChange,
}: SelectDropdownProps) {
  const isMuted = !value || value === mutedValue;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Measure the trigger button (fixed height), not the container — see MultiSelectDropdown.
  const { style: popoverStyle, popoverRef } = useDropdownPosition(open, triggerRef, 256);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const select = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  const optionButtonClass = (option: string) =>
    cn(
      'flex w-full items-center rounded-btn px-2 py-1.5 text-left text-xs hover:bg-surfaceMuted',
      value === option && 'bg-primary/10 font-semibold text-primary'
    );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2 rounded-btn border border-border bg-surface px-3 py-2 text-left text-xs',
          isMuted ? 'text-textMuted' : 'text-textPri',
          open && 'ring-2 ring-primary/40',
          triggerClassName
        )}
      >
        {icon && <span className="shrink-0 text-textMuted">{icon}</span>}
        <span className={cn('flex-1 truncate', valueClassName)}>
          {value ? `${valuePrefix ?? ''}${value}` : placeholder}
        </span>
        <ChevronDown size={14} className="hidden shrink-0 text-textMuted sm:block" />
      </button>

      {open && (
        <div
          ref={popoverRef as RefObject<HTMLDivElement>}
          style={popoverStyle}
          className="z-50 overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-lg"
        >
          {placeholder && (
            <button type="button" onClick={() => select('')} className={optionButtonClass('')}>
              {placeholder}
            </button>
          )}

          {options?.map((option) => (
            <button key={option} type="button" onClick={() => select(option)} className={optionButtonClass(option)}>
              {option}
            </button>
          ))}

          {groups?.map((group) => (
            <div key={group.label} className="mt-2 border-t border-border pt-2 first:mt-0 first:border-t-0 first:pt-0">
              <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-textMuted">
                {group.label}
              </div>
              {group.options.map((option) => (
                <button key={option} type="button" onClick={() => select(option)} className={optionButtonClass(option)}>
                  {option}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
