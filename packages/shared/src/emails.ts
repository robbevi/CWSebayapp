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
 * A rounded shape holding one line, in classic Outlook too. Outlook ignores rounded corners
 * and padding everywhere but its own shapes, so it is drawn twice: as an Outlook shape, in
 * comments only Outlook reads, and as plain styled HTML for every other client. Inside a
 * shape Outlook runs block elements together and drops text-transform, so the line is
 * written as it should read, capitals and all.
 */
function rounded(o: {
  width: number;
  height: number;
  radius: number;
  fill: string;
  stroke?: string;
  href?: string;
  /** Space from the left edge to the line; without it the line is centered. */
  inset?: number;
  line: string;
}): string {
  const arc = Math.min(50, Math.round((o.radius / Math.min(o.width, o.height)) * 100));
  const edge = o.stroke ? `strokecolor="${o.stroke}" strokeweight="1.5px"` : 'stroke="f"';
  const href = o.href ? ` href="${escapeHtml(o.href)}"` : '';
  const align = o.inset === undefined ? 'center' : 'left';
  const pad = o.inset ?? 0;
  const outlook = `<!--[if mso]><v:roundrect ${VML}${href} style="width:${o.width}px;height:${o.height}px;v-text-anchor:middle;" arcsize="${arc}%" ${edge} fillcolor="${o.fill}"><w:anchorlock/><v:textbox inset="${pad}px,0px,${pad}px,0px"><div style="text-align:${align};">${o.line}</div></v:textbox></v:roundrect><![endif]-->`;
  const box = `width:${o.width - 2 * pad - (o.stroke ? 3 : 0)}px;height:${o.height - (o.stroke ? 3 : 0)}px;line-height:${o.height - (o.stroke ? 3 : 0)}px;padding:0 ${pad}px;background:${o.fill};border-radius:${o.radius}px;text-align:${align};${o.stroke ? `border:1.5px solid ${o.stroke};` : ''}white-space:nowrap;text-decoration:none;display:block;`;
  const other = o.href
    ? `<a href="${escapeHtml(o.href)}" style="${box}">${o.line}</a>`
    : `<div style="${box}">${o.line}</div>`;
  return `${outlook}<!--[if !mso]><!-->${other}<!--<![endif]-->`;
}

const DUE_FILL: Record<string, string> = { Overdue: RED, 'Due today': ORANGE, 'Due tomorrow': ORANGE };

/** The days left to ship, as a small pill: red when it's late, orange when it's close. */
function dueChip(due: string): string {
  if (!due) return '';
  return rounded({
    width: 132,
    height: 32,
    radius: 16,
    fill: DUE_FILL[due] ?? GREEN,
    line: `<span style="${text(14, '#ffffff', 'font-weight:700;')}">${due}</span>`,
  });
}

/** A large pill button: solid green, or outlined in navy. */
function button(label: string, href: string, solid: boolean, size = 18): string {
  const big = size > 16;
  return rounded({
    width: big ? (solid ? 250 : 200) : solid ? 200 : 160,
    height: big ? 58 : 46,
    radius: big ? 29 : 23,
    fill: solid ? GREEN : '#ffffff',
    stroke: solid ? undefined : NAVY,
    href,
    line: `<span style="${text(size, solid ? '#ffffff' : NAVY, 'font-weight:700;')}">${label}</span>`,
  });
}

function buttons(...each: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${each
    .map((b, i) => `${i ? '<td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>' : ''}<td style="vertical-align:middle;">${b}</td>`)
    .join('')}</tr></table>`;
}

/**
 * Where a part is, recovery bin first — that's where it's pulled from — and its bin under
 * it, each a rounded card with its label and location on one line.
 */
function binStack(part: NonNullable<ShipItem['part']>): string {
  const card = (label: string, value: string, fill: string, stroke: string | undefined, labelColor: string, valueColor: string) =>
    rounded({
      width: 300,
      height: 44,
      radius: 12,
      fill,
      stroke,
      inset: 16,
      line: `<span style="${text(12, labelColor, 'font-weight:700;letter-spacing:1px;')}">${label}</span>&nbsp;&nbsp;&nbsp;<span style="${text(19, valueColor, 'font-weight:700;')}">${escapeHtml(value)}</span>`,
    });
  const cards = [
    part.recoveryBin ? card('RECOVERY BIN', part.recoveryBin, GREEN, undefined, '#cdeadf', '#ffffff') : '',
    card('BIN', part.binLocation || '—', '#eef2f6', '#c9d4e0', '#50637a', NAVY),
  ].filter(Boolean);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    ${spacer(14)}
    ${cards.map((c) => `<tr><td>${c}</td></tr>`).join(spacer(8))}
  </table>`;
}

function whereFrom(i: ShipItem): string {
  return i.part
    ? binStack(i.part)
    : `<div style="${text(14, '#a15c00', 'margin-top:10px;')}">Not matched to a part in SPARE — check the listing.</div>`;
}

/** The frame every SPARE email shares: the green header with the logo, then a title. */
function shell(o: { eyebrow: string; title: string; subtitle: string; body: string; publicBase?: string }): string {
  const logo = o.publicBase
    ? `<img src="${escapeHtml(`${o.publicBase}/email/spare-logo-light.png`)}" width="200" height="57" alt="SPARE" style="display:block;width:200px;height:57px;border:0;">`
    : `<div style="${text(28, '#ffffff', 'font-weight:800;letter-spacing:.06em;')}">SPARE</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f3;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
  <tr><td bgcolor="${GREEN}" style="background:${GREEN};padding:20px 28px;border-radius:12px 12px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">${logo}</td>
      <td align="right" style="vertical-align:middle;${caps('#cdeadf')}">${o.eyebrow}</td>
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

  const items = order.items
    .map(
      (i, n) => `<tr><td style="padding:16px 18px;${n ? `border-top:1px solid ${LINE};` : ''}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:top;">
        <div style="${text(20, INK, 'font-weight:700;')}">${escapeHtml(i.sku || 'No SKU')}</div>
        <div style="${text(17, INK, 'padding-top:4px;')}">${escapeHtml(i.part?.description || i.title)}</div>${
          i.part?.condition
            ? `<div style="${text(14, MUTED, 'padding-top:2px;')}">Condition: ${escapeHtml(i.part.condition)}</div>`
            : ''
        }
      </td>
      <td width="70" align="right" style="vertical-align:top;">
        <div style="${caps(MUTED)}">Qty</div>
        <div style="${text(30, INK, 'font-weight:700;line-height:1.15;')}">${i.quantity}</div>
      </td>
    </tr></table>
    ${whereFrom(i)}
  </td></tr>`
    )
    .join('');

  const body = `
  <tr><td style="padding:20px 28px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">${rounded({
        width: 340,
        height: 60,
        radius: 14,
        fill: ORANGE,
        inset: 20,
        line: `<span style="${text(13, '#fff1e0', 'font-weight:700;letter-spacing:1px;')}">SHIP BY</span>&nbsp;&nbsp;&nbsp;<span style="${text(24, '#ffffff', 'font-weight:700;')}">${escapeHtml(shipDay(order.shipBy))}</span>`,
      })}</td>
      ${due ? `<td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td><td style="vertical-align:middle;">${dueChip(due)}</td>` : ''}
    </tr></table>
  </td></tr>

  <tr><td style="padding:26px 28px 10px;"><div style="${caps(MUTED)}">Pick list</div></td></tr>
  <tr><td style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;">${items}</table>
  </td></tr>

  <tr><td style="padding:26px 28px 0;">
    <div style="${caps(MUTED)}">Ship to</div>
    <div style="${text(16, INK, 'line-height:1.5;margin-top:6px;')}">${address}</div>
  </td></tr>

  <tr><td style="padding:28px 28px 8px;">${buttons(button('Buy shipping label', labelUrl, true), button('Order details', detailsUrl, false))}</td></tr>
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
      eyebrow: 'New eBay sale',
      title: `Order Number: ${escapeHtml(order.orderId)}`,
      subtitle: `Ordered ${escapeHtml(shipDay(order.createdAt || null))} · ${count} ${count === 1 ? 'item' : 'items'} · Buyer ${escapeHtml(order.buyer)}`,
      body,
      publicBase: options.publicBase,
    }),
    text: [
      `[SALE] eBay Order: ${order.orderId}`,
      `Ship by ${shipDay(order.shipBy)}${due ? ` (${due})` : ''}`,
      ...order.items.map((i) => `• ${i.quantity} × ${i.sku || 'No SKU'} — ${i.part?.description || i.title} — ${pickFrom(i)}`),
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
  return [i.part.recoveryBin && `recovery bin ${i.part.recoveryBin}`, `bin ${i.part.binLocation || '—'}`]
    .filter(Boolean)
    .join(', ');
}

/** The morning's reminder of every order still waiting on its label, soonest due first. */
export function shipReminder(orders: ShipOrder[], options: NoticeOptions = {}): Notice {
  const sorted = [...orders].sort((a, b) => (a.shipBy ?? a.createdAt).localeCompare(b.shipBy ?? b.createdAt));
  const dues = sorted.map((o) => shipDue(o.shipBy, options.now));
  const overdue = dues.filter((d) => d === 'Overdue').length;
  const n = sorted.length;
  const what = `${n} eBay ${n === 1 ? 'order' : 'orders'}`;

  const cards = sorted
    .map((o, k) => {
      const lines = o.items
        .map(
          (i) => `<div style="${text(16, INK, 'margin-top:12px;')}"><strong>${escapeHtml(i.sku || 'No SKU')}</strong> x ${i.quantity} · <span style="color:${MUTED};">${escapeHtml(
            i.part?.description || i.title
          )}</span></div>${whereFrom(i)}`
        )
        .join('');
      return `<tr><td style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;"><tr><td style="padding:16px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:top;">
          <div style="${text(18, NAVY, 'font-weight:700;')}">Order Number: ${escapeHtml(o.orderId)}</div>
          <div style="${text(15, MUTED, 'margin-top:2px;')}">Ship by ${escapeHtml(shipDay(o.shipBy))} · ordered ${escapeHtml(shipDay(o.createdAt || null))}</div>
        </td>
        <td align="right" style="vertical-align:top;">${dueChip(dues[k])}</td>
      </tr></table>
      ${lines}
      <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
      ${buttons(button('Buy shipping label', ebayLabelUrl(o), true, 15), button('Order details', sellerHubOrderUrl(o.orderId), false, 15))}
    </td></tr></table>
  </td></tr>`;
    })
    .join(spacer(14));

  return {
    kind: 'ship-reminder',
    subject: `[REMINDER] ${what} to ship${overdue ? ` - ${overdue} overdue` : ''} - ${
      n === 1 ? `Order: ${sorted[0].orderId} - Ship by ${shipDay(sorted[0].shipBy)}` : `soonest due ${shipDay(sorted[0].shipBy)}`
    }`,
    html: shell({
      eyebrow: 'Shipping reminder',
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
      eyebrow: 'Cetaris reminder',
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
