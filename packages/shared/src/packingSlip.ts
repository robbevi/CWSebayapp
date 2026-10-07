import type { ShipOrder } from './sales.js';

/**
 * The packing slip SPARE prints, and the date and service wording its emails share.
 * eBay doesn't hand its own slip out through the API, but it does hand out everything
 * that goes on one — and SPARE adds what eBay's slip can't: which bin the part is in.
 *
 * Styles are inline because Outlook drops most of a <style> block.
 */

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// The abbreviations people write, rather than the three letters a locale gives.
const WEEKDAYS: Record<string, string> = {
  Sunday: 'Sun',
  Monday: 'Mon',
  Tuesday: 'Tues',
  Wednesday: 'Wed',
  Thursday: 'Thurs',
  Friday: 'Fri',
  Saturday: 'Sat',
};

/** "Tues, Oct 13", in Williston's time. */
export function shipDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' });
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  return `${WEEKDAYS[weekday] ?? weekday}, ${date}`;
}

/**
 * eBay's service codes are run together; spaced out they read as the service. The
 * carriers' own run-together names are put back after.
 */
export const shipService = (code: string) =>
  code
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\bFed Ex\b/g, 'FedEx')
    .replace(/\bSmart Post\b/g, 'SmartPost') || '—';

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
