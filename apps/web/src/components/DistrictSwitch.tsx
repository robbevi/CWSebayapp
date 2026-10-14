import { useEffect, useMemo } from 'react';
import { useInbound } from '../hooks/useInbound';
import { cn } from '../lib/cn';
import { useUIStore, WILLISTON } from '../state/useUIStore';
import { useUserStore } from '../state/useUserStore';

/**
 * Whose stock the dashboard shows: Williston's own, or a district's on its way in. Only
 * there while some district has stock still to arrive. Someone based in another district
 * starts on theirs.
 */
export function DistrictSwitch() {
  const currentUser = useUserStore((s) => s.currentUser);
  const home = useUserStore((s) => s.session?.district) ?? null;
  const district = useUIStore((s) => s.district);
  const set = useUIStore((s) => s.set);
  const { data } = useInbound(!!currentUser);

  const origins = useMemo(
    () => [...new Set((data ?? []).filter((i) => i.status !== 'received').map((i) => i.origin))].sort(),
    [data]
  );

  // Each sign-in starts where that person works.
  useEffect(() => {
    set({ district: home ?? WILLISTON });
  }, [currentUser, home, set]);

  // A district with nothing left to arrive has no board; fall back to Williston's.
  useEffect(() => {
    if (data && district !== WILLISTON && !origins.includes(district)) set({ district: WILLISTON });
  }, [data, district, origins, set]);

  if (origins.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div role="tablist" aria-label="District" className="flex rounded-pill border border-border bg-surface p-0.5">
        {[WILLISTON, ...origins].map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={district === d}
            onClick={() => set({ district: d })}
            className={cn(
              'min-h-0 rounded-pill px-3 py-1.5 text-xs font-semibold',
              district === d ? 'bg-primary text-white' : 'text-textMuted hover:text-textPri'
            )}
          >
            {d}
          </button>
        ))}
      </div>
      {district !== WILLISTON && (
        <span className="hidden text-[11px] text-textMuted sm:inline">On its way to Williston; it joins the Williston board when received.</span>
      )}
    </div>
  );
}
