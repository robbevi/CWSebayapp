import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
  onChange: (value: string) => void;
}

// Fully custom single-select popover instead of a native <select> — the browser's own
// picker/option-group styling can't be restyled (especially on mobile), so this renders
// everything ourselves to match the rest of the UI (rounded corners, light gray border).
export function SelectDropdown({ icon, options, groups, value, placeholder, onChange }: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2 rounded-btn border border-border bg-surface px-3 py-2 text-left text-xs',
          value ? 'text-textPri' : 'text-textMuted',
          open && 'ring-2 ring-primary/40'
        )}
      >
        {icon && <span className="shrink-0 text-textMuted">{icon}</span>}
        <span className="flex-1 truncate">{value || placeholder}</span>
        <ChevronDown size={14} className="shrink-0 text-textMuted" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-lg">
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
