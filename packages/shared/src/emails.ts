import { escapeHtml, shipDay } from './packingSlip.js';
import { ebayLabelUrl, sellerHubOrderUrl, type Sale, type ShipItem, type ShipOrder } from './sales.js';
import { chicagoDateString } from './submissions.js';

/**
 * The emails SPARE sends through the notification flow: one when a sale comes in, and the
 * daily reminders for orders still waiting to ship and sales still waiting on their Cetaris
 * Part Sale. Each goes to the flow as a subject and a finished HTML body, so the flow only
 * has to send it; `kind` lets it route one kind somewhere else.
 *
 * Email clients keep tables and inline styles and little else, so that is all these use.
 */

export type NoticeKind = 'sale' | 'ship-reminder' | 'part-sale-reminder';

export interface Notice {
  kind: NoticeKind;
  subject: string;
  html: string;
  /** The same, in plain text, for a Teams post or anything that won't take HTML. */
  text: string;
}

export interface SaleNotice extends Notice {
  kind: 'sale';
  orderId: string;
  shipBy: string | null;
  sellerHubUrl: string;
  labelUrl: string;
  skus: string[];
}

export interface NoticeOptions {
  /**
   * Where SPARE is reached from the open internet: for the logo, and the reminders' link
   * back into the app. Without it the header is lettered and the link left out.
   */
  publicBase?: string;
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

const GREEN = '#0f7a5a';
const NAVY = '#0d2944';
const ORANGE = '#f7810b';
const RED = '#c62828';
const INK = '#17241f';
const MUTED = '#5b6b66';
const LINE = '#e1e7e4';
const FACE = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const text = (size: number, color: string, more = '') => `${FACE}font-size:${size}px;color:${color};${more}`;
const caps = (color: string, size = 13) =>
  text(size, color, 'font-weight:600;letter-spacing:.07em;text-transform:uppercase;');
const spacer = (height: number) =>
  `<tr><td height="${height}" style="height:${height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VML = 'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"';

/**
 * A pill — a rounded shape with one centered line — as a link or a label.
 *
 * Classic Outlook draws mail with Word, which ignores rounded corners, and padding
 * anywhere but a table cell. So for Outlook the pill is drawn as its own shape, in the
 * long-standing "bulletproof button" form: the one shape whose text it reliably centers.
 * Every other client gets a styled link or label. Everything else in these emails is
 * built from table cells, solid fills and borders, which Outlook draws as written.
 */
function pill(o: {
  label: string;
  width: number;
  height: number;
  fill: string;
  color: string;
  size: number;
  stroke?: string;
  href?: string;
}): string {
  const font = text(o.size, o.color, 'font-weight:bold;');
  const edge = o.stroke ? `strokecolor="${o.stroke}" strokeweight="2px"` : 'stroke="f"';
  const href = o.href ? ` href="${escapeHtml(o.href)}"` : '';
  const outlook = `<!--[if mso]><v:roundrect ${VML}${href} style="height:${o.height}px;v-text-anchor:middle;width:${o.width}px;" arcsize="50%" ${edge} fillcolor="${o.fill}"><w:anchorlock/><center style="${font}">${o.label}</center></v:roundrect><![endif]-->`;
  const border = o.stroke ? 4 : 0;
  const style = `${font}display:inline-block;width:${o.width - border}px;line-height:${o.height - border}px;text-align:center;text-decoration:none;white-space:nowrap;background:${o.fill};border-radius:${o.height / 2}px;${
    o.stroke ? `border:2px solid ${o.stroke};` : ''
  }`;
  const other = o.href ? `<a href="${escapeHtml(o.href)}" style="${style}">${o.label}</a>` : `<span style="${style}">${o.label}</span>`;
  return `${outlook}<!--[if !mso]><!-->${other}<!--<![endif]-->`;
}

const URGENT: Record<string, string> = { Overdue: RED, 'Due today': '#c2410c', 'Due tomorrow': '#c2410c' };

/**
 * The days left to ship, as a small pill. On the orange ship-by band it is white with the
 * words in color; on white it is filled: red when late, deep orange when close, green
 * otherwise.
 */
function dueChip(due: string, onOrange = false): string {
  if (!due) return '';
  const tone = URGENT[due] ?? GREEN;
  return pill({
    label: due.toUpperCase(),
    width: 176,
    height: 40,
    size: 14,
    fill: onOrange ? '#ffffff' : tone,
    color: onOrange ? tone : '#ffffff',
  });
}

/** A large pill button: green for the thing to do, gray for the one beside it. */
function button(label: string, href: string, primary: boolean, size = 18): string {
  const big = size > 16;
  return pill({
    label,
    href,
    size,
    width: big ? (primary ? 260 : 210) : primary ? 200 : 170,
    height: big ? 56 : 44,
    fill: primary ? GREEN : '#e3e7e5',
    color: primary ? '#ffffff' : INK,
  });
}

function buttons(...each: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${each
    .map((b, i) => `${i ? '<td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>' : ''}<td style="vertical-align:middle;">${b}</td>`)
    .join('')}</tr></table>`;
}

/** The ship-by date as a full-width orange band, with the days left on the right. */
function shipBand(shipBy: string | null, due: string): string {
  return `<tr><td bgcolor="${ORANGE}" style="background:${ORANGE};padding:18px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">
        <div style="${text(13, '#ffe7cc', 'font-weight:700;letter-spacing:1px;')}">SHIP BY</div>
        <div style="${text(30, '#ffffff', 'font-weight:700;')}">${escapeHtml(shipDay(shipBy))}</div>
      </td>
      <td width="186" align="right" style="width:186px;vertical-align:middle;">${dueChip(due, true)}</td>
    </tr></table>
  </td></tr>`;
}

const label = (s: string, color = MUTED) => `<div style="${text(12, color, 'font-weight:700;letter-spacing:1px;')}">${s}</div>`;
const HEAD_BG = '#f4f6f5';

/**
 * Where to pull a part from: its recovery bin, in large type, with an accent down the
 * cell's left edge. A part with no recovery bin shows its bin instead.
 */
function pullFrom(i: ShipItem): { accent: string; fill: string; html: string } {
  if (!i.part) {
    return {
      accent: '#d97706',
      fill: '#fff8ec',
      html: `<div style="${text(14, '#a15c00')}">Not matched to a part in SPARE. Check the listing.</div>`,
    };
  }
  if (!i.part.recoveryBin) {
    return {
      accent: NAVY,
      fill: '#f3f6f9',
      html: `${label('BIN', '#50637a')}<div style="${text(24, NAVY, 'font-weight:700;')}">${escapeHtml(i.part.binLocation || '—')}</div>`,
    };
  }
  return {
    accent: GREEN,
    fill: '#f1f8f4',
    html: `${label('RECOVERY BIN', GREEN)}<div style="${text(26, '#0b4d39', 'font-weight:700;')}">${escapeHtml(i.part.recoveryBin)}</div>`,
  };
}

/** The pick ticket: quantity, part, and where to pull it from, one row per item. */
function pickTable(items: ShipItem[], framed = true): string {
  const rows = items
    .map((i) => {
      const from = pullFrom(i);
      const top = `border-top:1px solid ${LINE};`;
      return `<tr>
      <td width="64" align="center" style="${top}padding:16px 0;vertical-align:top;${text(32, INK, 'font-weight:700;')}">${i.quantity}</td>
      <td style="${top}padding:16px;vertical-align:top;">
        ${label('CUSTOM LABEL (SKU)')}
        <div style="${text(19, INK, 'font-weight:700;')}">${escapeHtml(i.sku || 'None')}</div>
        <div style="${text(15, INK, 'padding-top:6px;')}">${escapeHtml(i.title)}</div>${
          i.part
            ? `<div style="${text(13, MUTED, 'padding-top:4px;')}">SPARE: ${escapeHtml(i.part.description)}${
                i.part.condition ? ` · ${escapeHtml(i.part.condition)}` : ''
              }</div>`
            : ''
        }
      </td>
      <td width="180" bgcolor="${from.fill}" style="${top}border-left:4px solid ${from.accent};background:${from.fill};padding:14px 16px;vertical-align:top;">${from.html}</td>
    </tr>`;
    })
    .join('');
  const head = (s: string, more = '') =>
    `<td bgcolor="${HEAD_BG}" style="background:${HEAD_BG};padding:10px 16px;${more}">${label(s)}</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${framed ? `border:1px solid ${LINE};` : ''}">
    <tr>${head('QTY', 'text-align:center;padding-left:0;padding-right:0;')}${head('PART')}${head('PULL FROM')}</tr>
    ${rows}
  </table>`;
}

/** The frame every SPARE email shares: the green header with the logo, then a title. */
function shell(o: { eyebrow: string; title: string; subtitle: string; body: string; publicBase?: string }): string {
  const logo = o.publicBase
    ? `<img src="${escapeHtml(`${o.publicBase}/email/spare-logo-email.png`)}" width="200" height="57" alt="SPARE" style="display:block;width:200px;height:57px;border:0;">`
    : `<div style="${text(28, '#ffffff', 'font-weight:800;letter-spacing:.06em;')}">SPARE</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f3;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
  <tr><td bgcolor="${GREEN}" style="background:${GREEN};padding:20px 28px;border-radius:12px 12px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">${logo}</td>
      <td align="right" style="vertical-align:middle;${text(20, '#ffffff', 'font-weight:700;')}">${o.eyebrow}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px 28px 0;">
    <div style="${text(26, NAVY, 'font-weight:700;')}">${o.title}</div>
    <div style="${text(15, MUTED, 'margin-top:4px;')}">${o.subtitle}</div>
  </td></tr>
  ${o.body}
</table>
<div style="${text(12, '#97a29d', 'margin-top:14px;')}">Sent by SPARE · Surplus Parts &amp; Asset Recovery Exchange</div>
</td></tr>
</table>`;
}

const units = (items: ShipItem[]) => items.reduce((n, i) => n + i.quantity, 0);

/** "383-0136 x 5, 412-2207 x 1": every SKU while there are few, then a count of the rest. */
function skuList(items: ShipItem[]): string {
  const each = items.map((i) => `${i.sku || 'No SKU'} x ${i.quantity}`);
  return each.length > 3 ? `${each.slice(0, 3).join(', ')} +${each.length - 3} more` : each.join(', ');
}

/** What goes out when a sale comes in: enough to pick, pack and buy the label from. */
export function saleNotice(order: ShipOrder, options: NoticeOptions = {}): SaleNotice {
  const due = shipDue(order.shipBy, options.now);
  const labelUrl = ebayLabelUrl(order);
  const detailsUrl = sellerHubOrderUrl(order.orderId);
  const to = order.shipTo;
  const place = `${to.city}${to.state ? `, ${to.state}` : ''} ${to.postalCode}`.trim();
  const address = [to.name, ...to.lines, place, to.country].filter(Boolean).map(escapeHtml).join('<br>');
  const count = units(order.items);

  const body = `
  ${spacer(20)}
  ${shipBand(order.shipBy, due)}
  <tr><td style="padding:24px 28px 0;">${pickTable(order.items)}</td></tr>
  <tr><td style="padding:20px 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="#f7f9f8" style="background:#f7f9f8;border-left:4px solid ${NAVY};padding:14px 18px;">
        ${label('SHIP TO')}
        <div style="${text(16, INK, 'line-height:1.5;')}">${address}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 28px 8px;">${buttons(button('Buy Shipping Label', labelUrl, true), button('Order Details', detailsUrl, false))}</td></tr>
  <tr><td style="padding:6px 28px 28px;">
    <div style="${text(14, MUTED)}">Buying the label marks the order shipped and takes it off SPARE's to-ship list.</div>
  </td></tr>`;

  return {
    kind: 'sale',
    orderId: order.orderId,
    subject: `[SALE] eBay Order: ${order.orderId} - ${order.items.length > 1 ? 'SKUs' : 'SKU'}: ${skuList(
      order.items
    )} - Ship by ${shipDay(order.shipBy)}`,
    html: shell({
      eyebrow: 'New eBay Sale!',
      title: `Order Number: ${escapeHtml(order.orderId)}`,
      subtitle: `Ordered ${escapeHtml(shipDay(order.createdAt || null))} · ${count} ${count === 1 ? 'item' : 'items'} · Buyer ${escapeHtml(order.buyer)}`,
      body,
      publicBase: options.publicBase,
    }),
    text: [
      `[SALE] eBay Order: ${order.orderId}`,
      `Ship by ${shipDay(order.shipBy)}${due ? ` (${due})` : ''}`,
      ...order.items.map((i) => `• ${i.quantity} × ${i.sku || 'No SKU'} — ${i.title} — ${pickFrom(i)}`),
      `To ${to.name}, ${to.city}${to.state ? `, ${to.state}` : ''}`,
      `Buy the label: ${labelUrl}`,
      `Order details: ${detailsUrl}`,
    ].join('\n'),
    shipBy: order.shipBy,
    sellerHubUrl: detailsUrl,
    labelUrl,
    skus: order.items.map((i) => i.sku).filter(Boolean),
  };
}

/** Where to pull an item from, in a line of text. */
function pickFrom(i: ShipItem): string {
  if (!i.part) return 'not matched to a part in SPARE';
  return i.part.recoveryBin ? `recovery bin ${i.part.recoveryBin}` : `bin ${i.part.binLocation || '—'}`;
}

/** The morning's reminder of every order still waiting on its label, soonest due first. */
export function shipReminder(orders: ShipOrder[], options: NoticeOptions = {}): Notice {
  const sorted = [...orders].sort((a, b) => (a.shipBy ?? a.createdAt).localeCompare(b.shipBy ?? b.createdAt));
  const dues = sorted.map((o) => shipDue(o.shipBy, options.now));
  const overdue = dues.filter((d) => d === 'Overdue').length;
  const n = sorted.length;
  const what = `${n} eBay ${n === 1 ? 'order' : 'orders'}`;

  const cards = sorted
    .map(
      (o, k) => `<tr><td style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};">
      <tr><td bgcolor="#fff4e8" style="background:#fff4e8;border-bottom:3px solid ${ORANGE};padding:14px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;">
            <div style="${text(18, NAVY, 'font-weight:700;')}">Order Number: ${escapeHtml(o.orderId)}</div>
            <div style="${text(15, '#7a4a12')}">Ship by <strong>${escapeHtml(shipDay(o.shipBy))}</strong> · ordered ${escapeHtml(shipDay(o.createdAt || null))}</div>
          </td>
          <td width="186" align="right" style="width:186px;vertical-align:middle;">${dueChip(dues[k])}</td>
        </tr></table>
      </td></tr>
      <tr><td>${pickTable(o.items, false)}</td></tr>
      <tr><td style="padding:16px;border-top:1px solid ${LINE};">${buttons(
        button('Buy Shipping Label', ebayLabelUrl(o), true, 15),
        button('Order Details', sellerHubOrderUrl(o.orderId), false, 15)
      )}</td></tr>
    </table>
  </td></tr>`
    )
    .join(spacer(16));

  return {
    kind: 'ship-reminder',
    subject: `[REMINDER] ${what} to ship${overdue ? ` - ${overdue} overdue` : ''} - ${
      n === 1 ? `Order: ${sorted[0].orderId} - Ship by ${shipDay(sorted[0].shipBy)}` : `soonest due ${shipDay(sorted[0].shipBy)}`
    }`,
    html: shell({
      eyebrow: 'Shipping Reminder',
      title: `${what} waiting to ship`,
      subtitle: 'Sold, but no label bought yet. Soonest due first.',
      body: `${spacer(20)}${cards}${spacer(28)}`,
      publicBase: options.publicBase,
    }),
    text: [
      `[REMINDER] ${what} waiting to ship`,
      ...sorted.map(
        (o, k) =>
          `• ${o.orderId} — ship by ${shipDay(o.shipBy)}${dues[k] ? ` (${dues[k]})` : ''} — ${o.items
            .map((i) => `${i.sku || 'No SKU'} x ${i.quantity}, ${pickFrom(i)}`)
            .join('; ')} — label: ${ebayLabelUrl(o)}`
      ),
    ].join('\n'),
  };
}

/** What a sale is called in a list: its SKU, or for an older listing with none, its eBay item number. */
const saleLabel = (s: Sale) => s.sku || (s.ebayListingId ? `Item ${s.ebayListingId}` : 'No SKU');

/** Shown in full up to here; past it, the rest are counted and left to SPARE. */
export const PART_SALE_REMINDER_ROWS = 30;

/** The morning's reminder of every sale still waiting on its Cetaris Part Sale, oldest first. */
export function partSaleReminder(sales: Sale[], options: NoticeOptions = {}): Notice {
  const sorted = [...sales].sort((a, b) => a.soldAt.localeCompare(b.soldAt));
  const shown = sorted.slice(0, PART_SALE_REMINDER_ROWS);
  const rest = sorted.length - shown.length;
  const n = sorted.length;
  const what = `${n} eBay ${n === 1 ? 'sale' : 'sales'}`;
  const cell = (s: string, more = '') => `<td style="${text(15, INK, `padding:10px 12px;border-top:1px solid ${LINE};${more}`)}">${s}</td>`;
  const head = (s: string, more = '') => `<td style="${caps(MUTED, 12)}padding:10px 12px;${more}">${s}</td>`;

  const rows = shown
    .map(
      (s) => `<tr>${cell(escapeHtml(shipDay(s.soldAt)), 'white-space:nowrap;')}${cell(
        `<strong>${escapeHtml(saleLabel(s))}</strong> x ${s.qtySold}`
      )}${cell(escapeHtml(s.orderId), `color:${MUTED};font-size:14px;white-space:nowrap;`)}${cell(money(s.grossSale), 'text-align:right;white-space:nowrap;')}</tr>`
    )
    .join('');

  const body = `
  <tr><td style="padding:20px 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;">
      <tr>${head('Sold')}${head('SKU')}${head('Order')}${head('Sale', 'text-align:right;')}</tr>
      ${rows}
    </table>
    ${rest > 0 ? `<div style="${text(14, MUTED, 'margin-top:10px;')}">…and ${rest} more in SPARE.</div>` : ''}
  </td></tr>
  ${
    options.publicBase
      ? `<tr><td style="padding:24px 28px 8px;">${button('Log Part Sales in SPARE', options.publicBase, true)}</td></tr>`
      : ''
  }
  <tr><td style="padding:6px 28px 28px;">
    <div style="${text(14, MUTED)}">One Part Sale number can cover several sales. In SPARE, open the "to log" count on Listed / Sold.</div>
  </td></tr>`;

  return {
    kind: 'part-sale-reminder',
    subject: `[REMINDER] Cetaris Part Sale needed for ${what}`,
    html: shell({
      eyebrow: 'Cetaris Reminder',
      title: `${what} need a Part Sale`,
      subtitle: 'Sold on eBay, with no Cetaris Part Sale number logged yet. Oldest first.',
      body,
      publicBase: options.publicBase,
    }),
    text: [
      `[REMINDER] Cetaris Part Sale needed for ${what}`,
      ...shown.map((s) => `• ${shipDay(s.soldAt)} — ${saleLabel(s)} x ${s.qtySold} — order ${s.orderId} — ${money(s.grossSale)}`),
      ...(rest > 0 ? [`…and ${rest} more in SPARE.`] : []),
    ].join('\n'),
  };
}
