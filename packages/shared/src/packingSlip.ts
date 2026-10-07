import { ebayLabelUrl, sellerHubOrderUrl, type ShipItem, type ShipOrder } from './sales.js';
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

export interface SaleNotice {
  orderId: string;
  subject: string;
  /** The email: what to pick from where, where it goes, and the buttons to ship it. */
  html: string;
  /** The same, in plain text, for a Teams post or anything that won't take HTML. */
  text: string;
  shipBy: string | null;
  sellerHubUrl: string;
  labelUrl: string;
  skus: string[];
}

export interface SaleNoticeOptions {
  /**
   * Where SPARE is reached from the open internet, for the logo and the parts' photos.
   * Without it the header is text and the photos are left out.
   */
  publicBase?: string;
  /** The logo from somewhere else, over the one at publicBase. */
  logoUrl?: string;
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

/** "383-0136 x 5, 412-2207 x 1": every SKU while there are few, then a count of the rest. */
function skuList(items: ShipItem[]): string {
  const each = items.map((i) => `${i.sku || 'No SKU'} x ${i.quantity}`);
  return each.length > 3 ? `${each.slice(0, 3).join(', ')} +${each.length - 3} more` : each.join(', ');
}


// Email clients, classic Outlook above all, keep tables and inline styles and little else:
// no rounded corners, and no padding or margins on anything but table cells. Rounded
// shapes are drawn for Outlook in its own VML, inside comments only Outlook reads.
const GREEN = '#0f7a5a';
const NAVY = '#0d2944';
const ORANGE = '#f7810b';
const INK = '#17241f';
const MUTED = '#5b6b66';
const LINE = '#e1e7e4';
const FACE = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const text = (size: number, color: string, more = '') => `${FACE}font-size:${size}px;color:${color};${more}`;
const caps = (color: string) => text(13, color, 'font-weight:600;letter-spacing:.07em;text-transform:uppercase;');
const VML = 'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"';

/** A filled box with rounded corners, in Outlook too. */
function roundedBox(inner: string, width: number, height: number, fill: string): string {
  return `<!--[if mso]><v:roundrect ${VML} style="width:${width}px;height:${height}px;v-text-anchor:middle;" arcsize="14%" stroke="f" fillcolor="${fill}"><v:textbox inset="0,0,0,0">${inner}</v:textbox></v:roundrect><![endif]-->
<!--[if !mso]><!--><div style="background:${fill};border-radius:12px;">${inner}</div><!--<![endif]-->`;
}

/** A button with rounded corners, in Outlook too. */
function button(label: string, href: string, width: number, solid: boolean): string {
  const fg = solid ? '#ffffff' : NAVY;
  const fill = solid ? GREEN : '#ffffff';
  const url = escapeHtml(href);
  return `<!--[if mso]><v:roundrect ${VML} href="${url}" style="width:${width}px;height:56px;v-text-anchor:middle;" arcsize="18%" ${
    solid ? 'stroke="f"' : `strokecolor="${NAVY}" strokeweight="2px"`
  } fillcolor="${fill}"><w:anchorlock/><center style="${text(18, fg, 'font-weight:bold;')}">${label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${url}" style="${text(18, fg, `display:inline-block;width:${width}px;line-height:52px;text-align:center;font-weight:700;text-decoration:none;background:${fill};border:2px solid ${solid ? GREEN : NAVY};border-radius:10px;`)}">${label}</a><!--<![endif]-->`;
}

/** Where a part is: its bin, and its recovery bin when it has one, as two clear tiles. */
function binTiles(part: NonNullable<ShipItem['part']>): string {
  const tile = (label: string, value: string, bg: string, fg: string, labelColor: string, border: string) =>
    `<td style="background:${bg};border:1px solid ${border};padding:10px 18px;vertical-align:top;">
      <div style="${caps(labelColor)}">${label}</div>
      <div style="${text(22, fg, 'font-weight:700;line-height:1.25;')}">${escapeHtml(value)}</div>
    </td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
    ${tile('Bin', part.binLocation || '—', NAVY, '#ffffff', '#b9c6d3', NAVY)}
    ${part.recoveryBin ? `<td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>${tile('Recovery bin', part.recoveryBin, '#fff3e6', NAVY, '#a85500', '#f6c48f')}` : ''}
  </tr></table>`;
}

function itemRow(i: ShipItem, first: boolean, publicBase?: string): string {
  const top = first ? '' : `border-top:1px solid ${LINE};`;
  // SPARE's thumbnail rather than the original: phone photos are stored sideways with a
  // note to turn them, which Outlook ignores, and the original runs to megabytes.
  const photo =
    i.part?.photoFileId && publicBase
    ? `<img src="${escapeHtml(`${publicBase}/api/photos/${encodeURIComponent(i.part.photoFileId)}/thumb`)}" width="96" alt="${escapeHtml(i.sku)}" style="display:block;width:96px;height:auto;border:1px solid ${LINE};">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="96" height="96" style="background:#eef2f0;">&nbsp;</td></tr></table>`;
  return `<tr>
  <td width="112" style="${top}padding:18px 0 18px 18px;vertical-align:top;">${photo}</td>
  <td style="${top}padding:18px 14px;vertical-align:top;">
    <div style="${text(20, INK, 'font-weight:700;')}">${escapeHtml(i.sku || 'No SKU')}</div>
    <div style="${text(15, MUTED, 'margin-top:2px;')}">${escapeHtml(i.part?.description || i.title)}${
      i.part?.condition ? ` · ${escapeHtml(i.part.condition)}` : ''
    }</div>
    ${
      i.part
        ? binTiles(i.part)
        : `<div style="${text(14, '#a15c00', 'margin-top:10px;')}">Not matched to a part in SPARE — check the listing.</div>`
    }
  </td>
  <td width="70" align="right" style="${top}padding:18px 18px 18px 0;vertical-align:top;">
    <div style="${caps(MUTED)}">Qty</div>
    <div style="${text(32, INK, 'font-weight:700;line-height:1.15;')}">${i.quantity}</div>
  </td>
</tr>`;
}

/** The sale email's body. */
export function saleEmailHtml(order: ShipOrder, options: SaleNoticeOptions = {}): string {
  const to = order.shipTo;
  const due = shipDue(order.shipBy, options.now);
  const place = `${to.city}${to.state ? `, ${to.state}` : ''} ${to.postalCode}`.trim();
  const address = [to.name, ...to.lines, place, to.country].filter(Boolean).map(escapeHtml).join('<br>');
  const units = order.items.reduce((n, i) => n + i.quantity, 0);
  const logoUrl = options.logoUrl ?? (options.publicBase ? `${options.publicBase}/email/spare-logo.png` : undefined);
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="190" height="54" alt="SPARE" style="display:block;width:190px;height:54px;border:0;">`
    : `<div style="${text(26, NAVY, 'font-weight:800;letter-spacing:.04em;')}">SPARE</div>`;

  const shipBy = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding:16px 20px;vertical-align:middle;">
      <div style="${caps('#fff1e0')}">Ship by</div>
      <div style="${text(26, '#ffffff', 'font-weight:700;line-height:1.25;')}">${escapeHtml(shipDay(order.shipBy))}${
        due ? `<span style="${text(16, '#fff1e0', 'font-weight:600;')}"> · ${due}</span>` : ''
      }</div>
    </td>
    <td align="right" style="padding:16px 20px;vertical-align:middle;">
      <div style="${caps('#fff1e0')}">Service</div>
      <div style="${text(18, '#ffffff', 'font-weight:600;')}">${escapeHtml(shipService(order.service))}</div>
    </td>
  </tr></table>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f3;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};">
  <tr><td style="padding:22px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">${logo}</td>
      <td align="right" style="vertical-align:middle;${caps(GREEN)}">New eBay sale</td>
    </tr></table>
  </td></tr>
  <tr><td height="5" style="height:5px;background:${ORANGE};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:24px 28px 0;">
    <div style="${text(26, NAVY, 'font-weight:700;')}">Order Number: ${escapeHtml(order.orderId)}</div>
    <div style="${text(15, MUTED, 'margin-top:4px;')}">Ordered ${escapeHtml(shipDay(order.createdAt || null))} · ${units} ${
      units === 1 ? 'item' : 'items'
    } · Buyer ${escapeHtml(order.buyer)}</div>
  </td></tr>

  <tr><td style="padding:20px 28px 0;">${roundedBox(shipBy, 544, 92, ORANGE)}</td></tr>

  <tr><td style="padding:26px 28px 10px;"><div style="${caps(MUTED)}">Pick list</div></td></tr>
  <tr><td style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};">
      ${order.items.map((i, n) => itemRow(i, n === 0, options.publicBase)).join('')}
    </table>
  </td></tr>

  <tr><td style="padding:26px 28px 0;">
    <div style="${caps(MUTED)}">Ship to</div>
    <div style="${text(16, INK, 'line-height:1.5;margin-top:6px;')}">${address}</div>
  </td></tr>

  <tr><td style="padding:28px 28px 10px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">${button('Buy shipping label', ebayLabelUrl(order), 280, true)}</td>
      <td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>
      <td style="vertical-align:middle;">${button('Order details', sellerHubOrderUrl(order.orderId), 200, false)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:4px 28px 28px;">
    <div style="${text(14, MUTED)}">Buying the label marks the order shipped and takes it off SPARE's to-ship list.</div>
  </td></tr>
</table>
<div style="${text(12, '#97a29d', 'margin-top:14px;')}">Sent by SPARE · Surplus Parts &amp; Asset Recovery Exchange</div>
</td></tr>
</table>`;
}

/** What goes out when a sale comes in: enough to pick, pack and buy the label from. */
export function saleNotice(order: ShipOrder, options: SaleNoticeOptions = {}): SaleNotice {
  const due = shipDue(order.shipBy, options.now);
  const labelUrl = ebayLabelUrl(order);
  return {
    orderId: order.orderId,
    subject: `SALE eBay Order: ${order.orderId} - ${order.items.length > 1 ? 'SKUs' : 'SKU'}: ${skuList(
      order.items
    )} - Ship by ${shipDay(order.shipBy)}`,
    html: saleEmailHtml(order, options),
    text: [
      `SALE eBay Order: ${order.orderId}`,
      `Ship by ${shipDay(order.shipBy)}${due ? ` (${due})` : ''} · ${shipService(order.service)}`,
      ...order.items.map(
        (i) =>
          `• ${i.quantity} × ${i.sku || 'No SKU'} — ${i.part?.description || i.title} — bin ${i.part?.binLocation || '—'}${
            i.part?.recoveryBin ? `, recovery ${i.part.recoveryBin}` : ''
          }`
      ),
      `To ${order.shipTo.name}, ${order.shipTo.city}${order.shipTo.state ? `, ${order.shipTo.state}` : ''}`,
      `Buy the label: ${labelUrl}`,
      `Order details: ${sellerHubOrderUrl(order.orderId)}`,
    ].join('\n'),
    shipBy: order.shipBy,
    sellerHubUrl: sellerHubOrderUrl(order.orderId),
    labelUrl,
    skus: order.items.map((i) => i.sku).filter(Boolean),
  };
}
