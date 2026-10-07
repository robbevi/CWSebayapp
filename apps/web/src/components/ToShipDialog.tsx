import { ExternalLink, Printer, Truck, X } from 'lucide-react';
import { packingSlipPage, sellerHubOrderUrl, shipService as service, type ShipOrder } from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

/** The same slip the sale email carries, in a window of its own that prints as it opens. */
function printPackingSlip(order: ShipOrder): void {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return;
  w.document.write(packingSlipPage(order));
  w.document.close();
}

/**
 * Orders eBay says haven't shipped. Opens on its own when someone signs in and there are
 * any, and stays to hand from the header. Each order says what to pick and from where,
 * where it's going, and how; the label is bought in eBay, which marks it shipped and
 * takes it off this list.
 */
export function ToShipDialog({ orders, onClose }: { orders: ShipOrder[]; onClose: () => void }) {
  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-card bg-surface">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surfaceMuted p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-textPri">
              <Truck size={16} /> {orders.length} {orders.length === 1 ? 'order' : 'orders'} to ship
            </h2>
            <p className="mt-0.5 text-[11px] text-textMuted">
              Soonest due first. Buy the label in eBay and the order leaves this list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 min-h-0 items-center justify-center rounded-btn border border-border text-textMuted hover:bg-surface"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          {orders.length === 0 && <p className="text-xs text-textMuted">Nothing waiting to ship.</p>}
          {orders.map((o) => (
            <section key={o.orderId} className="rounded-card border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-textPri">Order {o.orderId}</span>
                <span className="text-[11px] font-semibold text-textMuted">
                  Ship by {day(o.shipBy)} · {service(o.service)}
                </span>
              </div>

              <ul className="mt-2 space-y-2">
                {o.items.map((i) => (
                  <li key={i.lineItemId} className="flex gap-3">
                    {i.part?.photoUrl ? (
                      <img
                        src={i.part.photoUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-btn border border-border object-cover"
                      />
                    ) : (
                      <span className="h-14 w-14 shrink-0 rounded-btn border border-dashed border-border" />
                    )}
                    <span className="min-w-0 flex-1 text-xs">
                      <span className="block font-semibold text-textPri">
                        {i.quantity} × {i.sku || 'No SKU'}
                      </span>
                      <span className="block truncate text-textMuted">{i.part?.description || i.title}</span>
                      {i.part ? (
                        <span className="block text-[11px] text-textMuted">
                          Bin <span className="font-semibold text-textPri">{i.part.binLocation || '—'}</span>
                          {i.part.recoveryBin && (
                            <>
                              {' '}· Recovery <span className="font-semibold text-textPri">{i.part.recoveryBin}</span>
                            </>
                          )}
                          {i.part.condition && ` · ${i.part.condition}`}
                        </span>
                      ) : (
                        <span className="block text-[11px] text-amber-600">Not matched to a part in SPARE</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-2 text-[11px] text-textMuted">
                To {o.shipTo.name}, {o.shipTo.city}
                {o.shipTo.state && `, ${o.shipTo.state}`} {o.shipTo.postalCode}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => printPackingSlip(o)}
                  className="flex min-h-0 items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-xs font-semibold text-textPri hover:bg-surfaceMuted"
                >
                  <Printer size={13} /> Print packing slip
                </button>
                <a
                  href={sellerHubOrderUrl(o.orderId)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-btn bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover"
                >
                  <ExternalLink size={13} /> Label in eBay
                </a>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
