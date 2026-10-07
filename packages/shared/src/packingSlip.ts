import { sellerHubOrderUrl, type ShipItem, type ShipOrder } from './sales.js';
import { chicagoDateString } from './submissions.js';

/**
 * The packing slip SPARE prints, and the email it sends when a sale comes in.
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

export interface SaleNotice {
  orderId: string;
  subject: string;
  /** The email: what to pick from where, where it goes, and the button to buy the label. */
  html: string;
  /** The same, in plain text, for a Teams post or anything that won't take HTML. */
  text: string;
  shipBy: string | null;
  sellerHubUrl: string;
  skus: string[];
}

export interface SaleNoticeOptions {
  /** Where SPARE's photos are served from the open internet. Without it, no pictures. */
  photoBase?: string;
  /** Counted from, for "3 days left". */
  now?: Date;
}

/** How long is left to ship, counted in Williston's days. */
export function shipDue(shipBy: string | null, now = new Date()): string {
  if (!shipBy) return '';
  const days = Math.round(
    (Date.parse(chicagoDateString(shipBy)) - Date.parse(chicagoDateString(now.toISOString()))) / 86_400_000
  );
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days left`;
}

/** "383-0136 ×5, 412-2207": every SKU while there are few, then a count of the rest. */
function skuList(items: ShipItem[]): string {
  const each = items.map((i) => `${i.sku || 'No SKU'}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`);
  return each.length > 3 ? `${each.slice(0, 3).join(', ')} +${each.length - 3} more` : each.join(', ');
}

// Email clients, Outlook above all, keep tables and inline styles and little else.
const BRAND = '#0f7a5a';
const INK = '#1d2321';
const MUTED = '#66716c';
const LINE = '#e1e7e4';
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const CAPS = 'font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;';

function itemRow(i: ShipItem, first: boolean, photoBase?: string): string {
  const photo = i.part?.photoUrl && photoBase ? `${photoBase}${i.part.photoUrl}` : null;
  const top = first ? '' : `border-top:1px solid ${LINE};`;
  const chip = (text: string, bg: string, fg: string) =>
    `<span style="display:inline-block;background:${bg};color:${fg};font-size:13px;font-weight:700;padding:5px 10px;border-radius:6px;margin:8px 6px 0 0;">${escapeHtml(text)}</span>`;
  const where = i.part
    ? chip(`Bin ${i.part.binLocation || '—'}`, INK, '#ffffff') +
      (i.part.recoveryBin ? chip(`Recovery ${i.part.recoveryBin}`, '#e8f3ee', BRAND) : '')
    : `<div style="font-size:12px;color:#a15c00;margin-top:8px;">Not matched to a part in SPARE — check the listing.</div>`;
  return `<tr>
  <td width="76" style="${top}padding:16px 0 16px 16px;vertical-align:top;">${
    photo
      ? `<img src="${escapeHtml(photo)}" width="64" height="64" alt="${escapeHtml(i.sku)}" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid ${LINE};">`
      : `<div style="width:64px;height:64px;border-radius:8px;background:#eef2f0;"></div>`
  }</td>
  <td style="${top}padding:16px 12px;vertical-align:top;">
    <div style="font-size:17px;font-weight:700;color:${INK};">${escapeHtml(i.sku || 'No SKU')}</div>
    <div style="font-size:13px;color:${MUTED};margin-top:2px;">${escapeHtml(i.part?.description || i.title)}${
      i.part?.condition ? ` · ${escapeHtml(i.part.condition)}` : ''
    }</div>
    ${where}
  </td>
  <td width="64" align="right" style="${top}padding:16px 16px 16px 0;vertical-align:top;">
    <div style="${CAPS}color:${MUTED};">Qty</div>
    <div style="font-size:26px;font-weight:700;color:${INK};line-height:1.15;">${i.quantity}</div>
  </td>
</tr>`;
}

/** The sale email's body. */
export function saleEmailHtml(order: ShipOrder, options: SaleNoticeOptions = {}): string {
  const url = sellerHubOrderUrl(order.orderId);
  const to = order.shipTo;
  const due = shipDue(order.shipBy, options.now);
  const place = `${to.city}${to.state ? `, ${to.state}` : ''} ${to.postalCode}`.trim();
  const address = [to.name, ...to.lines, place, to.country].filter(Boolean).map(escapeHtml).join('<br>');
  const units = order.items.reduce((n, i) => n + i.quantity, 0);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f3;${FONT}">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;${FONT}">
  <tr><td style="background:${BRAND};padding:22px 24px;border-radius:12px 12px 0 0;">
    <div style="${CAPS}color:#bfe3d4;">SPARE · New eBay sale</div>
    <div style="font-size:24px;font-weight:700;color:#ffffff;margin-top:4px;">Order ${escapeHtml(order.orderId)}</div>
    <div style="font-size:13px;color:#dff1e9;margin-top:4px;">Ordered ${escapeHtml(shipDay(order.createdAt || null))} · ${units} ${
      units === 1 ? 'item' : 'items'
    } · Buyer ${escapeHtml(order.buyer)}</div>
  </td></tr>

  <tr><td style="padding:20px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5e3;border:1px solid #f1c27d;border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;vertical-align:top;">
          <div style="${CAPS}color:#8a5a12;">Ship by</div>
          <div style="font-size:21px;font-weight:700;color:#4f3205;margin-top:2px;">${escapeHtml(shipDay(order.shipBy))}${
            due ? ` <span style="font-size:13px;font-weight:600;color:#8a5a12;">· ${due}</span>` : ''
          }</div>
        </td>
        <td align="right" style="padding:14px 16px;vertical-align:top;">
          <div style="${CAPS}color:#8a5a12;">Service</div>
          <div style="font-size:15px;font-weight:600;color:#4f3205;margin-top:2px;">${escapeHtml(shipService(order.service))}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 24px 8px;"><div style="${CAPS}color:${MUTED};">Pick list</div></td></tr>
  <tr><td style="padding:0 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;">
      ${order.items.map((i, n) => itemRow(i, n === 0, options.photoBase)).join('')}
    </table>
  </td></tr>

  <tr><td style="padding:22px 24px 0;">
    <div style="${CAPS}color:${MUTED};">Ship to</div>
    <div style="font-size:14px;line-height:1.5;color:${INK};margin-top:6px;">${address}</div>
  </td></tr>

  <tr><td style="padding:24px 24px 26px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="background:${BRAND};border-radius:8px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;${FONT}">Buy shipping label in eBay &rarr;</a>
      </td>
    </tr></table>
    <div style="font-size:12px;color:${MUTED};margin-top:12px;">Buying the label marks the order shipped and takes it off SPARE's to-ship list.</div>
  </td></tr>
</table>
<div style="font-size:11px;color:#97a29d;margin-top:14px;">Sent by SPARE · Surplus Parts &amp; Asset Recovery Exchange</div>
</td></tr>
</table>`;
}

/** What goes out when a sale comes in: enough to pick, pack and buy the label from. */
export function saleNotice(order: ShipOrder, options: SaleNoticeOptions = {}): SaleNotice {
  const url = sellerHubOrderUrl(order.orderId);
  const due = shipDue(order.shipBy, options.now);
  return {
    orderId: order.orderId,
    subject: `📦 eBay Order ${order.orderId} · ${order.items.length > 1 ? 'SKUs' : 'SKU'} ${skuList(
      order.items
    )} · Ship by ${shipDay(order.shipBy)}`,
    html: saleEmailHtml(order, options),
    text: [
      `📦 New eBay sale — Order ${order.orderId}`,
      `Ship by ${shipDay(order.shipBy)}${due ? ` (${due})` : ''} · ${shipService(order.service)}`,
      ...order.items.map(
        (i) =>
          `• ${i.quantity} × ${i.sku || 'No SKU'} — ${i.part?.description || i.title} — bin ${i.part?.binLocation || '—'}`
      ),
      `To ${order.shipTo.name}, ${order.shipTo.city}${order.shipTo.state ? `, ${order.shipTo.state}` : ''}`,
      `Label: ${url}`,
    ].join('\n'),
    shipBy: order.shipBy,
    sellerHubUrl: url,
    skus: order.items.map((i) => i.sku).filter(Boolean),
  };
}
