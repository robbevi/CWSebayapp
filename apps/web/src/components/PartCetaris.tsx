import { ClipboardCheck, Undo2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { CETARIS_SALE_NUMBER, formatDate, type Sale } from '@warehouse/shared';
import { useClearCetaris, useLogCetaris } from '../hooks/useSales';
import { cn } from '../lib/cn';

/**
 * Seven digits, typed. Enter logs rather than saving the part, because this sits inside the
 * part's own form and a stray Enter there would save the whole part.
 */
function NumberInput({
  value,
  onChange,
  onEnter,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  label: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    onEnter();
  };
  return (
    <input
      inputMode="numeric"
      maxLength={7}
      aria-label={label}
      placeholder="Part Sale #"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 7))}
      onKeyDown={onKeyDown}
      className={cn(
        'h-8 w-28 rounded-btn border bg-surface px-2 text-xs tabular-nums text-textPri',
        value && !CETARIS_SALE_NUMBER.test(value) ? 'border-amber-400' : 'border-border'
      )}
    />
  );
}

/**
 * The Cetaris side of a part's sales, on the part itself: each sale's Part Sale number, or
 * a place to log it. Where several are still waiting, one number can be logged for all of
 * them at once, since a single Part Sale usually covers them.
 */
export function PartCetaris({ sales }: { sales: Sale[] }) {
  const log = useLogCetaris();
  const clear = useClearCetaris();
  const [perSale, setPerSale] = useState<Record<string, string>>({});
  const [forAll, setForAll] = useState('');

  const waiting = sales.filter((s) => !s.cetarisSaleNumber);
  const send = (lineItemIds: string[], number: string, done: () => void) => {
    if (!CETARIS_SALE_NUMBER.test(number) || !lineItemIds.length) return;
    log.mutate({ lineItemIds, number }, { onSuccess: done });
  };

  return (
    <div className="mt-2 space-y-2 border-t border-emerald-200 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
          <ClipboardCheck size={12} /> Cetaris Part Sale
        </span>
        <span className="text-[11px] font-semibold text-emerald-800">
          {waiting.length ? `${waiting.length} to log` : 'All logged'}
        </span>
      </div>

      {waiting.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-textMuted">
          <span>One Part Sale for all {waiting.length}:</span>
          <NumberInput
            value={forAll}
            onChange={setForAll}
            onEnter={() => send(waiting.map((s) => s.lineItemId), forAll, () => setForAll(''))}
            label="Part Sale number for every waiting sale"
          />
          <button
            type="button"
            onClick={() => send(waiting.map((s) => s.lineItemId), forAll, () => setForAll(''))}
            disabled={!CETARIS_SALE_NUMBER.test(forAll) || log.isPending}
            className="h-8 min-h-0 rounded-btn bg-primary px-3 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            Log all
          </button>
        </div>
      )}

      {sales.map((sale) => (
        <div key={sale.lineItemId} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-textMuted">
            {formatDate(sale.soldAt)} · {sale.qtySold} sold · order {sale.orderId}
          </span>
          {sale.cetarisSaleNumber ? (
            <span className="flex items-center gap-2">
              <span className="text-textMuted">
                Part Sale <span className="font-semibold tabular-nums text-textPri">{sale.cetarisSaleNumber}</span>
                {sale.cetarisLoggedBy && ` · ${sale.cetarisLoggedBy}`}
              </span>
              <button
                type="button"
                onClick={() => clear.mutate(sale.lineItemId)}
                disabled={clear.isPending}
                title="Take this number back off the sale"
                className="flex min-h-0 items-center gap-1 rounded-btn border border-border px-1.5 py-0.5 font-semibold text-textMuted hover:bg-surface"
              >
                <Undo2 size={10} /> Undo
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <NumberInput
                value={perSale[sale.lineItemId] ?? ''}
                onChange={(v) => setPerSale((p) => ({ ...p, [sale.lineItemId]: v }))}
                onEnter={() =>
                  send([sale.lineItemId], perSale[sale.lineItemId] ?? '', () =>
                    setPerSale((p) => ({ ...p, [sale.lineItemId]: '' }))
                  )
                }
                label={`Part Sale number for the sale on ${formatDate(sale.soldAt)}`}
              />
              <button
                type="button"
                onClick={() =>
                  send([sale.lineItemId], perSale[sale.lineItemId] ?? '', () =>
                    setPerSale((p) => ({ ...p, [sale.lineItemId]: '' }))
                  )
                }
                disabled={!CETARIS_SALE_NUMBER.test(perSale[sale.lineItemId] ?? '') || log.isPending}
                className="h-8 min-h-0 rounded-btn border border-primary px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
              >
                Log
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
