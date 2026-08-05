import { Minus, Plus } from 'lucide-react';
import { Input } from './ui/Input';

export function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(0, v);

  return (
    <div className="flex items-center gap-2">
      {/* 44px to match the input's min-height, so the row reads as one balanced control
          rather than short buttons floating beside a taller field. */}
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border border-border text-textPri hover:bg-surfaceMuted"
        aria-label="Decrease quantity"
      >
        <Minus size={16} />
      </button>
      {/* Width is set on a wrapper rather than the Input: the Input's own `w-full` and a
          `w-20` passed in are both real utilities, and which one wins is decided by
          stylesheet order, not the order they're listed — so it stretched on mobile. */}
      <div className="w-20 shrink-0">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
          className="text-center"
        />
      </div>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border border-border text-textPri hover:bg-surfaceMuted"
        aria-label="Increase quantity"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
