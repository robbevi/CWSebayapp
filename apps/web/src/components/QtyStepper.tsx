import { Minus, Plus } from 'lucide-react';
import { Input } from './ui/Input';

export function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(0, v);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border border-border text-textPri hover:bg-surfaceMuted"
        aria-label="Decrease quantity"
      >
        <Minus size={16} />
      </button>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="w-20 text-center"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border border-border text-textPri hover:bg-surfaceMuted"
        aria-label="Increase quantity"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
