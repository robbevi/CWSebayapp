import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Coins,
  DollarSign,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  Tag,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  catalogueValue,
  computeDiscrepancyTotals,
  computeProgramTotals,
  computeSalesTotals,
  computeStandingValue,
  GOALS,
  groupPartsBySku,
  percentOf,
} from '@warehouse/shared';
import { useAllSubmissions } from '../hooks/useAllSubmissions';
import { useAppUsers } from '../hooks/useAppUsers';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { cn } from '../lib/cn';
import { useDiscrepancyLog } from '../hooks/useDiscrepancyLog';
import { useSales, useSalesStatus, useSyncSales } from '../hooks/useSales';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { computeUserMetrics, countsForPeriod, type Period } from '../lib/submissionStats';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

/**
 * Groups the tiles by what kind of measure they are. Ten undifferentiated tiles read as
 * soup, and dollars sitting beside counts with nothing between them invites misreading one
 * for the other. The band keeps its columns aligned with the bands above it.
 */
function StatBand({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-textMuted">{label}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </div>
  );
}

function formatMoneyShort(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const PERIOD_LABEL: Record<Exclude<Period, 'all'>, string> = {
  day: 'Today',
  week: 'This Week',
  month: 'This Month',
};

function HeadlineStat({
  label,
  value,
  sub,
  icon,
  format,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
  format?: 'money';
  tone?: 'warn';
}) {
  const display =
    format === 'money'
      ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
      : value.toLocaleString();
  return (
    // A two-word label like "Revenue Recovered" wraps where "Listed" doesn't, which pushed
    // its number 14px below its neighbours'. The tile is a column with the figure pushed to
    // the bottom, so every value in a row shares a baseline however the labels wrap.
    <div className="flex h-full flex-col rounded-btn border border-border bg-surface p-3">
      <div className="mb-1 flex items-start gap-1.5 text-textMuted">
        <span className="mt-[1px] shrink-0">{icon}</span>
        <span className="text-[11px] font-semibold leading-tight">{label}</span>
      </div>
      <div className={cn('mt-auto text-xl font-bold leading-tight', tone === 'warn' ? 'text-red-600' : 'text-textPri')}>
        {display}
      </div>
      {/* Always rendered, so a tile without a caption still ends level with one that has. */}
      <div className="min-h-[15px] text-[11px] text-textMuted">{sub ?? ' '}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-btn bg-surfaceMuted p-3">
      <div className="text-[11px] font-semibold text-textMuted">{label}</div>
      <div className="text-lg font-semibold text-textPri">{value}</div>
    </div>
  );
}

function History({ history }: { history: { date: string; count: number }[] }) {
  const max = Math.max(1, ...history.map((h) => h.count));
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-textMuted">Last 30 days</div>
      <div className="flex h-16 items-end gap-[3px]">
        {history.map((h) => (
          <div
            key={h.date}
            title={`${h.date}: ${h.count}`}
            className={`flex-1 rounded-sm ${h.count > 0 ? 'bg-primary' : 'bg-border'}`}
            style={{ height: `${Math.max(6, (h.count / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function Scoreboard({ onClose }: { onClose: () => void }) {
  const { data: users } = useAppUsers();
  const { data: parts } = useInventoryParts();
  const { data: submissions } = useAllSubmissions();
  const { data: discrepancyLog } = useDiscrepancyLog();
  const { data: sales } = useSales();
  const { data: salesStatus } = useSalesStatus();
  const syncSales = useSyncSales();
  const [period, setPeriod] = useState<Period>('day');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  useBodyScrollLock();

  const groups = useMemo(() => groupPartsBySku(parts ?? []), [parts]);
  const totals = useMemo(() => computeProgramTotals(groups, period), [groups, period]);
  // Every figure is a share of the whole catalogue, in every period — in a dated window
  // that reads as throughput: "we got through 4% of the catalogue this week".
  const catalogueSize = groups.length;
  const catalogueWorth = useMemo(() => catalogueValue(groups), [groups]);
  const revenue = useMemo(() => computeSalesTotals(sales ?? [], period), [sales, period]);
  // Standing figures describe the pile as it is now, so they don't move with the period.
  const standing = useMemo(() => computeStandingValue(groups, sales ?? []), [groups, sales]);
  const variances = useMemo(
    () => computeDiscrepancyTotals(discrepancyLog ?? [], period),
    [discrepancyLog, period]
  );
  const counts = useMemo(() => countsForPeriod(submissions ?? [], period), [submissions, period]);
  // All Time has no target to hit, so the bars there are scaled against the best performer
  // rather than against a goal.
  const goal = period === 'all' ? null : GOALS[period];

  const rows = (users ?? [])
    .map((u) => ({ user: u.name, count: counts.get(u.name) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const maxBar = Math.max(goal ?? 0, ...rows.map((r) => r.count), 1);

  const activeUser = selectedUser ?? rows[0]?.user ?? null;
  const metrics = useMemo(
    () => (activeUser ? computeUserMetrics(submissions ?? [], activeUser) : null),
    [submissions, activeUser]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-card bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-textPri">Scoreboard</h2>
          <button onClick={onClose} className="rounded-btn p-1 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        {/* One toggle for the whole dialog, so the headline figures and the per-person
            bars below always describe the same window. */}
        <div className="mb-4 flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              className={`rounded-pill px-3 py-1.5 text-xs font-medium ${
                period === opt.key ? 'bg-primary text-white' : 'bg-surfaceMuted text-textMuted hover:bg-border'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-textMuted">
              Overall Progress
              {period !== 'all' && <span className="ml-1 font-normal">· {PERIOD_LABEL[period]}</span>}
            </span>
            {/* Sales also refresh on their own; this is for when you want the number now. */}
            {salesStatus?.ebayConfigured && (
              <button
                type="button"
                onClick={() => syncSales.mutate(undefined)}
                disabled={syncSales.isPending}
                className="flex min-h-0 items-center gap-1 rounded-pill px-2 py-1 text-[11px] font-semibold text-primary hover:bg-surfaceMuted disabled:opacity-50"
              >
                <RefreshCw size={11} className={syncSales.isPending ? 'animate-spin' : undefined} />
                {syncSales.isPending ? 'Syncing…' : 'Sync eBay'}
              </button>
            )}
          </div>
          <StatBand label="Pipeline">
            <HeadlineStat
              label="Parts Added"
              value={totals.added}
              sub={period === 'all' ? 'in the system' : `${percentOf(totals.added, catalogueSize)} of parts`}
              icon={<PackagePlus size={13} />}
            />
            <HeadlineStat
              label="Photographed"
              value={totals.photographed}
              sub={`${percentOf(totals.photographed, catalogueSize)} of parts`}
              icon={<Camera size={13} />}
            />
            <HeadlineStat
              label="Listed"
              value={totals.listed}
              sub={`${percentOf(totals.listed, catalogueSize)} of parts`}
              icon={<Tag size={13} />}
            />
            <HeadlineStat
              label="Completed"
              value={totals.completed}
              sub={`${percentOf(totals.completed, catalogueSize)} of parts`}
              icon={<CheckCircle2 size={13} />}
            />
          </StatBand>

          <StatBand label="Value">
            {/* Priced per remaining unit, so it draws down as stock sells rather than
                sitting flat at the catalogue total. */}
            <HeadlineStat
              label="Potential Value"
              value={standing.potential}
              format="money"
              sub="unsold stock, at today's prices"
              icon={<Coins size={13} />}
            />
            <HeadlineStat
              label="Listed Value"
              value={totals.recoveryValue}
              format="money"
              sub={`${percentOf(totals.recoveryValue, catalogueWorth)} of catalogue`}
              icon={<DollarSign size={13} />}
            />
            <HeadlineStat
              label="Revenue Recovered"
              value={revenue.net}
              format="money"
              sub={revenue.gross > 0 ? `${formatMoneyShort(revenue.gross)} gross` : 'net of eBay fees'}
              icon={<Wallet size={13} />}
            />
            <HeadlineStat
              label="Expected Margin"
              value={standing.expectedMargin}
              format="money"
              sub={
                standing.underwaterSkus > 0
                  ? `${standing.underwaterSkus.toLocaleString()} parts underwater`
                  : 'if the catalogue sells'
              }
              icon={<TrendingUp size={13} />}
            />
          </StatBand>

          <StatBand label="Counts">
            <HeadlineStat
              label="Units Sold"
              value={revenue.qty}
              sub={revenue.orders > 0 ? `${revenue.orders} orders` : 'none yet'}
              icon={<ShoppingCart size={13} />}
            />
            <HeadlineStat
              label="Count Variances"
              value={variances.skus}
              sub={
                variances.skus === 0
                  ? 'none recorded'
                  : `${variances.netUnits > 0 ? '+' : ''}${variances.netUnits} units net`
              }
              tone={variances.netUnits < 0 ? 'warn' : undefined}
              icon={<AlertTriangle size={13} />}
            />
          </StatBand>
        </div>

        <div className="mb-3 border-t border-border pt-4 text-xs font-semibold text-textMuted">By Person</div>

        <div className="mb-6 space-y-2.5">
          {rows.map((r) => {
            const met = goal !== null && r.count >= goal;
            return (
              <button
                key={r.user}
                type="button"
                onClick={() => setSelectedUser(r.user)}
                className={`block w-full rounded-btn p-1 text-left ${activeUser === r.user ? 'ring-2 ring-primary/40' : ''}`}
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-textPri">{r.user}</span>
                  <span className={met ? 'font-semibold text-primary' : 'text-textMuted'}>
                    {goal === null ? r.count : `${r.count} / ${goal}`}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-pill bg-surfaceMuted">
                  <div
                    className={`h-full rounded-pill ${met ? 'bg-primary' : 'bg-primary/60'}`}
                    style={{ width: `${Math.min(100, (r.count / maxBar) * 100)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {activeUser && metrics && (
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold text-textPri">{activeUser}</h3>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <Stat label="Total" value={metrics.total} />
              <Stat label="Days Active" value={metrics.daysActive} />
              <Stat label="Current Streak" value={metrics.currentStreak} />
              <Stat label="Avg / Day" value={metrics.avgPerDay.toFixed(1)} />
              <Stat label="Avg / Week" value={metrics.avgPerWeek.toFixed(1)} />
              <Stat label="Avg / Month" value={metrics.avgPerMonth.toFixed(1)} />
              <Stat label="Best Day" value={metrics.bestDay} />
              <Stat label="Best Week" value={metrics.bestWeek} />
              <Stat label="Best Month" value={metrics.bestMonth} />
            </div>
            <History history={metrics.history} />
          </div>
        )}
      </div>
    </div>
  );
}
