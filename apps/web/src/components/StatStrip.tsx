import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, ChevronDown, Coins, Layers, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { computeDashboardStats, groupPartsBySku } from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useUIStore } from '../state/useUIStore';
import { useSales } from '../hooks/useSales';
import { cn } from '../lib/cn';

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function Card({
  label,
  value,
  icon,
  children,
  tone,
  onClick,
  active,
  title,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  tone?: 'warn';
  /** Given, the whole tile becomes the way to filter the board by what it counts. */
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    // A column with the figure pushed down, so values sit on one line across the strip
    // however long a label runs.
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        'flex h-full flex-col rounded-card border bg-surface p-3 text-left',
        active ? 'border-primary ring-1 ring-primary/40' : 'border-border',
        onClick && 'hover:border-primary/50'
      )}
    >
      <div className="mb-1 flex items-start gap-1.5 text-textMuted">
        <span className="mt-[1px] shrink-0">{icon}</span>
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide">{label}</span>
      </div>
      <div
        className={cn(
          'mt-auto text-2xl font-bold leading-tight tabular-nums lg:text-xl',
          tone === 'warn' ? 'text-amber-600' : 'text-textPri'
        )}
      >
        {value}
      </div>
      <div className="min-h-[16px] text-[11px] leading-tight text-textMuted">{children ?? '\u00A0'}</div>
    </Tag>
  );
}

/**
 * Week-on-week movement in listings. Direction is carried by the arrow as well as the
 * colour, so it still reads without relying on being able to tell red from green.
 */
function Trend({ pct }: { pct: number | null }) {
  if (pct === null) return <>no listings last week</>;
  if (pct === 0) return <>level with last week</>;
  const up = pct > 0;
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold', up ? 'text-primary' : 'text-amber-600')}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}
      {pct}% <span className="font-normal text-textMuted">vs last week</span>
    </span>
  );
}

/**
 * Desktop only. On a phone the board itself is the job, and five summary cards above the
 * search field would push it off the screen — the same figures live in the Scoreboard,
 * which is a tap away.
 */
const COLLAPSED_KEY = 'spare.stats.collapsed';

export function StatStrip() {
  const { data: parts } = useInventoryParts();
  const { data: sales } = useSales();
  const needsReview = useUIStore((s) => s.needsReview);
  const set = useUIStore((s) => s.set);
  // Remembered per browser: someone who works from the board all day shouldn't have to
  // put the strip away every morning.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // A browser that refuses storage still works; it just forgets.
    }
  }, [collapsed]);

  const stats = useMemo(
    () => computeDashboardStats(groupPartsBySku(parts ?? []), sales ?? []),
    [parts, sales]
  );

  if (!parts) return null;

  const toggle = (
    <button
      type="button"
      onClick={() => setCollapsed((c) => !c)}
      aria-expanded={!collapsed}
      className="flex h-auto min-h-0 shrink-0 items-center gap-1 rounded-btn px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-textMuted hover:bg-surfaceMuted hover:text-textPri"
      title={collapsed ? 'Show the summary' : 'Hide the summary'}
    >
      {collapsed ? 'Show' : 'Hide'}
      <ChevronDown size={13} className={cn('transition-transform', !collapsed && 'rotate-180')} />
    </button>
  );

  // Put away, the cards go entirely: half a summary is worse than none, and the point of
  // putting them away is the height.
  if (collapsed) {
    return <div className="hidden justify-end lg:flex">{toggle}</div>;
  }

  return (
    <div className="relative hidden gap-3 lg:grid lg:grid-cols-5">
      <Card label="Total Items" value={stats.totalItems.toLocaleString()} icon={<Layers size={13} />}>
        {stats.totalRecords.toLocaleString()} stock records
      </Card>

      <Card label="Total QOH" value={stats.totalQoh.toLocaleString()} icon={<Boxes size={13} />}>
        {stats.countedParts.toLocaleString()} parts counted
      </Card>

      <Card label="Est. Recovery Value" value={money(stats.estRecoveryValue)} icon={<Coins size={13} />}>
        {/* "now", because the Scoreboard's similarly named tile counts what was listed
            within the selected period rather than everything currently up. */}
        {money(stats.listedValue)} on eBay now
      </Card>

      <Card label="Listed This Week" value={stats.listedThisWeek.toLocaleString()} icon={<Tag size={13} />}>
        <Trend pct={stats.listedDeltaPct} />
      </Card>

      <Card
        label="Needs Review"
        value={stats.needsReview.toLocaleString()}
        icon={<AlertTriangle size={13} />}
        tone={stats.needsReview > 0 ? 'warn' : undefined}
        onClick={stats.needsReview > 0 ? () => set({ needsReview: !needsReview }) : undefined}
        active={needsReview}
        title={needsReview ? 'Showing only flagged parts — click again to show everything' : 'Show only flagged parts'}
      >
        {stats.needsReview === 0 ? 'nothing flagged' : 'awaiting a second look'}
      </Card>
      {/* Sits over the last card's top-right corner: a control of the strip, not a sixth
          thing to read. */}
      <div className="pointer-events-none absolute right-2.5 top-2.5 flex justify-end">
        <span className="pointer-events-auto">{toggle}</span>
      </div>
    </div>
  );
}
