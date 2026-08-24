import { useMemo } from 'react';
import { AlertTriangle, Boxes, Coins, Layers, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { computeDashboardStats, groupPartsBySku } from '@warehouse/shared';
import { useInventoryParts } from '../hooks/useInventoryParts';
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
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  tone?: 'warn';
}) {
  return (
    // A column with the figure pushed down, so values sit on one line across the strip
    // however long a label runs.
    <div className="flex h-full flex-col rounded-card border border-border bg-surface p-3">
      <div className="mb-1 flex items-start gap-1.5 text-textMuted">
        <span className="mt-[1px] shrink-0">{icon}</span>
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide">{label}</span>
      </div>
      <div
        className={cn(
          'mt-auto text-2xl font-bold leading-tight tabular-nums',
          tone === 'warn' ? 'text-amber-600' : 'text-textPri'
        )}
      >
        {value}
      </div>
      <div className="min-h-[16px] text-[11px] leading-tight text-textMuted">{children ?? '\u00A0'}</div>
    </div>
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
export function StatStrip() {
  const { data: parts } = useInventoryParts();
  const { data: sales } = useSales();

  const stats = useMemo(
    () => computeDashboardStats(groupPartsBySku(parts ?? []), sales ?? []),
    [parts, sales]
  );

  if (!parts) return null;

  return (
    <div className="hidden gap-3 lg:grid lg:grid-cols-5">
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
      >
        {stats.needsReview === 0 ? 'nothing flagged' : 'awaiting a second look'}
      </Card>
    </div>
  );
}
