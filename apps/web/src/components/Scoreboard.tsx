import { useState } from 'react';
import { X } from 'lucide-react';
import { GOALS, type SubmissionSummary, type UserRole } from '@warehouse/shared';
import { useAppUsers } from '../hooks/useAppUsers';
import { useSubmissionSummary } from '../hooks/useSubmissionSummary';

type Period = 'day' | 'week' | 'month';
const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];
const ROLE_LABELS: Record<UserRole, string> = { warehouse: 'Warehouse Staff', lister: 'eBay Listers' };

function RoleGroup({ role, rows, period }: { role: UserRole; rows: SubmissionSummary[]; period: Period }) {
  const goal = GOALS[period];
  const max = Math.max(goal, ...rows.map((r) => r[period]), 1);

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">{ROLE_LABELS[role]}</h3>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const value = r[period];
          const met = value >= goal;
          return (
            <div key={r.user}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-textPri">{r.user}</span>
                <span className={met ? 'font-semibold text-primary' : 'text-textMuted'}>
                  {value} / {goal}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-pill bg-surfaceMuted">
                <div
                  className={`h-full rounded-pill ${met ? 'bg-primary' : 'bg-primary/60'}`}
                  style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Scoreboard({ onClose }: { onClose: () => void }) {
  const { data: summary } = useSubmissionSummary();
  const { data: users } = useAppUsers();
  const [period, setPeriod] = useState<Period>('day');

  const rows: SubmissionSummary[] = (users ?? []).map((u) => {
    const found = summary?.find((s) => s.user === u.name);
    return found ?? { user: u.name, role: u.role, day: 0, week: 0, month: 0 };
  });
  const warehouseRows = rows.filter((r) => r.role === 'warehouse');
  const listerRows = rows.filter((r) => r.role === 'lister');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-card bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-textPri">Scoreboard</h2>
          <button onClick={onClose} className="rounded-btn p-1 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 flex gap-2">
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

        <div className="space-y-6">
          <RoleGroup role="warehouse" rows={warehouseRows} period={period} />
          <RoleGroup role="lister" rows={listerRows} period={period} />
        </div>
      </div>
    </div>
  );
}
