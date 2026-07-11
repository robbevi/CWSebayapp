import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useDropdownPosition } from '../../hooks/useDropdownPosition';
import { cn } from '../../lib/cn';

interface ComboBoxProps {
  options: string[];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

// A free-text input with a filtered suggestion list — unlike SelectDropdown, whatever
// is typed is itself a valid value (e.g. a brand-new manufacturer not yet in the sheet),
// the popover is just a shortcut for picking an existing one.
export function ComboBox({ options, value, placeholder, onChange }: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLInputElement>(null);
  const { style: popoverStyle, popoverRef } = useDropdownPosition(open, triggerRef, 256);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = value.trim().toLowerCase();
    return needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
  }, [options, value]);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={triggerRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 py-2 text-xs text-textPri placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      {open && filtered.length > 0 && (
        <div
          ref={popoverRef as RefObject<HTMLDivElement>}
          style={popoverStyle}
          className="z-50 overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-lg"
        >
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center rounded-btn px-2 py-1.5 text-left text-xs hover:bg-surfaceMuted',
                value === option && 'bg-primary/10 font-semibold text-primary'
              )}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
