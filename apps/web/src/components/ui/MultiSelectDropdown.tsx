import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';

interface MultiSelectDropdownProps {
  icon: ReactNode;
  label: string;
  options: string[];
  selected: string[];
  counts?: Record<string, number>;
  onChange: (next: string[]) => void;
}

export function MultiSelectDropdown({ icon, label, options, selected, counts, onChange }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  const triggerText =
    selected.length === 0 ? `All ${label}s` : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  const toggle = (option: string) => {
    onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2 rounded-btn border border-border bg-surface px-3 py-2 text-left text-xs text-textPri',
          open && 'ring-2 ring-primary/40'
        )}
      >
        <span className="text-textMuted">{icon}</span>
        <span className="flex-1 truncate">{triggerText}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 rounded-card border border-border bg-surface p-2 shadow-lg">
          <div className="relative mb-2">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}s…`}
              className="w-full rounded-btn border border-primary/40 py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="mb-2 flex items-center gap-2 border-b border-border pb-2 text-xs font-medium">
            <button type="button" className="text-primary hover:underline" onClick={() => onChange(filteredOptions)}>
              Select All
            </button>
            <span className="text-textMuted">·</span>
            <button type="button" className="text-primary hover:underline" onClick={() => onChange([])}>
              Clear All
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-textMuted">No matches</div>
            ) : (
              filteredOptions.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 rounded-btn px-2 py-1.5 text-xs hover:bg-surfaceMuted"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="flex-1 truncate">{option}</span>
                  {counts && <span className="text-textMuted">{counts[option] ?? 0}</span>}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
