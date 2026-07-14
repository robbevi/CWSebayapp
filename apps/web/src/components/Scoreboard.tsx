import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { GOALS } from '@warehouse/shared';
import { useAllSubmissions } from '../hooks/useAllSubmissions';
import { useAppUsers } from '../hooks/useAppUsers';
import { computeUserMetrics, countsForPeriod, type Period } from '../lib/submissionStats';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

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
  const { data: submissions } = useAllSubmissions();
  const [period, setPeriod] = useState<Period>('day');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const counts = useMemo(() => countsForPeriod(submissions ?? [], period), [submissions, period]);
  const goal = GOALS[period];

  const rows = (users ?? [])
    .map((u) => ({ user: u.name, count: counts.get(u.name) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const maxBar = Math.max(goal, ...rows.map((r) => r.count), 1);

  const activeUser = selectedUser ?? rows[0]?.user ?? null;
  const metrics = useMemo(
    () => (activeUser ? computeUserMetrics(submissions ?? [], activeUser) : null),
    [submissions, activeUser]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-textPri">Scoreboard</h2>
          <button onClick={onClose} className="rounded-btn p-1 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex gap-2">
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

        <div className="mb-6 space-y-2.5">
          {rows.map((r) => {
            const met = r.count >= goal;
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
                    {r.count} / {goal}
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
