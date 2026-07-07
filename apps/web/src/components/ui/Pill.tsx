import type { PropsWithChildren } from 'react';
import { cn } from '../../lib/cn';

interface PillProps {
  active?: boolean;
  tone?: 'default' | 'dark';
}

export function Pill({ active, tone = 'default', children }: PropsWithChildren<PillProps>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        active
          ? 'bg-primary text-white border-primary'
          : tone === 'dark'
            ? 'bg-primaryDeep/10 text-primaryDeep border-primaryDeep/20'
            : 'bg-surface text-textMuted border-border'
      )}
    >
      {children}
    </span>
  );
}
