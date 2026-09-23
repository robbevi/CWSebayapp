import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Square } from 'lucide-react';
import { useState } from 'react';
import { fetchResearchBacklog, startResearchBacklog, stopResearchBacklog } from '../lib/api';
import { useToastStore } from '../state/useToastStore';
import { Button } from './ui/Button';

const KEY = ['research-backlog'];
const SIZES = [10, 25, 50, 100];
/** The server's own ceiling for one run. */
const MAX_RUN = 500;
/** Measured across the first runs: the agent answers in about four minutes a part. */
const MINUTES_EACH = 4;

/** "about 40 minutes", "about 3½ hours" — long enough runs are planned around, not watched. */
function roughly(parts: number): string {
  const mins = parts * MINUTES_EACH;
  if (mins < 90) return `about ${mins} minutes`;
  const halves = Math.round(mins / 30);
  const hours = Math.floor(halves / 2);
  return `about ${hours}${halves % 2 ? '½' : ''} hours`;
}

/**
 * Researching the backlog: Copilot writes up every part that is ready to list, one at a
 * time, without anyone opening each part to ask. Admins only, since it commits the
 * workflow to hours of work.
 *
 * A run lives in the server's memory, so a deploy or Render's free plan going to sleep
 * ends it. Nothing is lost: parts already researched are skipped, so starting again
 * carries on from where it stopped.
 */
/**
 * The sizes worth offering for the backlog left: the fixed steps below it, and everything
 * remaining. A long run is safe to start, because one that is cut short resumes where it
 * stopped rather than beginning again.
 */
function sizeOptions(waiting: number): number[] {
  const all = Math.min(Math.max(waiting, 1), MAX_RUN);
  return [...new Set([...SIZES.filter((n) => n < waiting), all])];
}

export function ResearchBacklog() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const [size, setSize] = useState(SIZES[0]);

  const status = useQuery({
    queryKey: KEY,
    queryFn: fetchResearchBacklog,
    // Counting the backlog is slow, so only poll while a run is going.
    refetchInterval: (q) => (q.state.data?.running ? 15_000 : false),
  });

  const start = useMutation({
    mutationFn: () => startResearchBacklog(size),
    onSuccess: (s) => {
      qc.setQueryData(KEY, { ...s, waiting: s.waiting ?? 0 });
      void qc.invalidateQueries({ queryKey: KEY });
      toast(`Researching ${Math.min(size, s.waiting || size)} parts. Leave SPARE open while it runs.`);
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not start the run', 'error'),
  });

  const stop = useMutation({
    mutationFn: stopResearchBacklog,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast('Stopping after the part being researched now.');
    },
  });

  const s = status.data;
  const done = s ? s.answered : 0;
  // Copilot is usually quick but has taken a quarter of an hour, so say how long this one
  // has been going: a long wait is normal, and looks like a stall without it.
  const waitingMins = s?.currentSince ? Math.round((Date.now() - Date.parse(s.currentSince)) / 60_000) : 0;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-textMuted">
        <Sparkles size={13} /> Research the backlog
      </div>

      {status.isLoading && <p className="mt-2 text-xs text-textMuted">Counting…</p>}
      {status.error && <p className="mt-2 text-xs text-red-600">{status.error.message}</p>}

      {s && (
        <>
          <p className="mt-1 text-[11px] text-textMuted">
            {s.running
              ? `Researching ${s.current ?? '…'}${waitingMins >= 1 ? ` for ${waitingMins} ${waitingMins === 1 ? 'minute' : 'minutes'}` : ''} — ${done} of ${s.limit} done. Leave SPARE open.`
              : `${s.waiting} ${s.waiting === 1 ? 'part is' : 'parts are'} ready to list with no research yet — ${roughly(s.waiting)} for all of them, at about ${MINUTES_EACH} minutes each.`}
          </p>

          {s.running ? (
            <Button type="button" variant="outline" onClick={() => stop.mutate()} disabled={stop.isPending} className="mt-2 w-full">
              <Square size={13} /> Stop after this part
            </Button>
          ) : (
            <div className="mt-2 flex gap-2">
              <select
                aria-label="How many parts to research"
                // The backlog shrinks as runs finish, so a size picked earlier may no
                // longer be on the menu; fall back rather than showing a blank box.
                value={sizeOptions(s.waiting).includes(size) ? size : sizeOptions(s.waiting)[0]}
                onChange={(e) => setSize(Number(e.target.value))}
                className="rounded-btn border border-border bg-surface px-2 text-sm text-textPri"
              >
                {sizeOptions(s.waiting).map((n) => (
                  <option key={n} value={n}>
                    {n >= s.waiting ? `All ${s.waiting} remaining` : `${n} parts`} · {roughly(Math.min(n, s.waiting))}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={() => start.mutate()}
                disabled={start.isPending || s.waiting === 0}
                className="flex-1"
              >
                <Sparkles size={14} /> Start
              </Button>
            </div>
          )}

          {!s.running && s.startedAt && (
            <p className="mt-1.5 text-[11px] text-textMuted">
              Last run: {s.answered} researched of {s.sent} sent
              {s.stoppedBy ? `, stopped by ${s.stoppedBy}` : ''}.
            </p>
          )}
          {s.slow.length > 0 && (
            <p className="mt-1.5 text-[11px] text-textMuted">
              Still with Copilot when the run moved on: {s.slow.join(', ')}. Their research turns up on the part
              itself once the agent finishes.
            </p>
          )}
          {s.failed.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {s.failed.slice(-3).map((f) => (
                <li key={f.sku} className="text-[11px] text-amber-600">
                  {f.sku}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
