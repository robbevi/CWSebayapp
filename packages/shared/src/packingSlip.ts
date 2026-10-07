import { sellerHubOrderUrl, type ShipOrder } from './sales.js';

/**
 * The packing slip SPARE makes itself, for the print button and the sale email alike.
 * eBay doesn't hand its own slip out through the API, but it does hand out everything
 * that goes on one — and SPARE adds what eBay's slip can't: which bin the part is in.
 *
 * Styles are inline because Outlook drops most of a <style> block.
 */

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const shipDay = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Chicago',
      })
    : '—';

/** eBay's service codes are run together; spaced out they read as the service. */
export const shipService = (code: string) => code.replace(/([a-z])([A-Z])/g, '$1 $2') || '—';

const LABEL = 'font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#777;';
const CELL = 'text-align:left;padding:8px;border-bottom:1px solid #ddd;vertical-align:top;';

/** The slip itself: who it goes to, how, and what to pick from which bin. */
export function packingSlipBody(order: ShipOrder): string {
  const to = order.shipTo;
  const rows = order.items
    .map(
      (i) => `<tr>
  <td style="${CELL}font-size:16px;font-weight:700;width:40px;">${i.quantity}</td>
  <td style="${CELL}"><strong>${escapeHtml(i.sku || '—')}</strong><br>${escapeHtml(i.part?.description || i.title)}</td>
  <td style="${CELL}">${escapeHtml(i.part?.binLocation || '—')}${
    i.part?.recoveryBin ? `<br>Recovery ${escapeHtml(i.part.recoveryBin)}` : ''
  }</td>
  <td style="${CELL}">${escapeHtml(i.part?.condition || '')}</td>
</tr>`
    )
    .join('');
  const place = `${to.city}${to.state ? `, ${to.state}` : ''} ${to.postalCode}`.trim();
  return `<div style="font:13px/1.4 Segoe UI,system-ui,sans-serif;color:#111;">
<h1 style="font-size:18px;margin:0 0 4px;">Packing slip</h1>
<div style="color:#555;margin-bottom:20px;">eBay order ${escapeHtml(order.orderId)} · ordered ${escapeHtml(
    shipDay(order.createdAt || null)
  )} · ship by ${escapeHtml(shipDay(order.shipBy))}</div>
<table style="border-collapse:collapse;margin-bottom:20px;"><tr>
  <td style="vertical-align:top;padding:0 48px 0 0;"><div style="${LABEL}">Ship to</div>
    ${[escapeHtml(to.name), ...to.lines.map(escapeHtml), escapeHtml(place), escapeHtml(to.country)]
      .filter(Boolean)
      .join('<br>')}
  </td>
  <td style="vertical-align:top;padding:0;"><div style="${LABEL}">Service</div>${escapeHtml(shipService(order.service))}
    <div style="${LABEL}margin-top:8px;">Buyer</div>${escapeHtml(order.buyer)}</td>
</tr></table>
<table style="width:100%;border-collapse:collapse;">
<thead><tr>${['Qty', 'Part', 'Bin', 'Condition'].map((h) => `<th style="${CELL}${LABEL}">${h}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>
</div>`;
}

/** A page of its own that prints itself as it opens. */
export function packingSlipPage(order: ShipOrder): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${escapeHtml(order.orderId)}</title>
<style>body{margin:32px}@media print{body{margin:12mm}}</style></head><body>
${packingSlipBody(order)}
<script>window.onload = () => window.print();</script>
</body></html>`;
}

export interface SaleNotice {
  orderId: string;
  subject: string;
  /** The email: a line on what sold and where to buy the label, then the packing slip. */
  html: string;
  /** The same, in plain text, for a Teams post or anything that won't take HTML. */
  text: string;
  shipBy: string | null;
  sellerHubUrl: string;
  skus: string[];
}

/** What goes out when a sale comes in: enough to pick, pack and buy the label from. */
export function saleNotice(order: ShipOrder): SaleNotice {
  const url = sellerHubOrderUrl(order.orderId);
  const what = order.items.map((i) => `${i.quantity} × ${i.sku || i.title}`).join(', ');
  const picks = order.items.map(
    (i) => `${i.quantity} × ${i.sku || 'No SKU'} — ${i.part?.description || i.title} — bin ${i.part?.binLocation || '—'}`
  );
  return {
    orderId: order.orderId,
    subject: `eBay sale: ${what} — ship by ${shipDay(order.shipBy)}`,
    html: `<div style="font:14px/1.5 Segoe UI,system-ui,sans-serif;color:#111;margin-bottom:24px;">
<p style="margin:0 0 12px;">New eBay sale to pack and ship by <strong>${escapeHtml(shipDay(order.shipBy))}</strong>.</p>
<p style="margin:0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f62fe;color:#fff;text-decoration:none;font-weight:600;padding:8px 14px;border-radius:6px;">Buy the label in eBay</a></p>
</div>
${packingSlipBody(order)}`,
    text: [
      `New eBay sale — ship by ${shipDay(order.shipBy)} (${shipService(order.service)})`,
      ...picks,
      `To ${order.shipTo.name}, ${order.shipTo.city}${order.shipTo.state ? `, ${order.shipTo.state}` : ''}`,
      `Label: ${url}`,
    ].join('\n'),
    shipBy: order.shipBy,
    sellerHubUrl: url,
    skus: order.items.map((i) => i.sku).filter(Boolean),
  };
}
