/**
 * Stock on its way to Williston from another district.
 *
 * Grand Junction's parts — and later any satellite office's — are shipped to Williston in
 * crates rather than sold where they sit. Until Williston receives them they are not
 * Williston stock: they wait in their own list, apart from the parts and the board, so
 * nothing about Williston's cards or listings changes until a crate is opened and each
 * part given a Williston bin. Receiving makes each one an ordinary part.
 *
 *   awaiting → packed (into a crate) → shipped → received
 */

export type InboundStatus = 'awaiting' | 'packed' | 'shipped' | 'received';

export const INBOUND_STATUSES: InboundStatus[] = ['awaiting', 'packed', 'shipped', 'received'];

export interface InboundItem {
  id: string;
  /** The district it is coming from, e.g. "Grand Junction". */
  origin: string;
  /** The export row it came from (SKU|site), so a re-import doesn't add it twice. */
  sourceKey: string;
  sku: string;
  description: string;
  manufacturer: string;
  /** Where it sits at the origin: its Cetaris site and bin there. */
  originSite: string;
  originBin: string;
  qty: number;
  /**
   * Average cost per unit: the origin's total value for the row divided by its quantity.
   * Not exact — a row can mix units transferred at $0 with a few bought in — but it is the
   * figure there is.
   */
  unitCost: number | null;
  status: InboundStatus;
  /** The crate it was packed in, e.g. "GJ-003". */
  crate: string;
  packedAt: string | null;
  packedBy: string;
  shippedAt: string | null;
  shippedBy: string;
  receivedAt: string | null;
  receivedBy: string;
  /** What Williston counted out of the crate, which may differ from what was packed. */
  receivedQty: number | null;
  /** The Cetaris transfer completed on receipt. */
  transferId: string;
  /** The Williston part it became. */
  partId: string;
  importedAt: string | null;
}

/** One crate, as the screen shows it. */
export interface Crate {
  label: string;
  origin: string;
  status: Exclude<InboundStatus, 'awaiting'>;
  items: InboundItem[];
  units: number;
  packedAt: string | null;
  shippedAt: string | null;
  shippedBy: string;
  receivedAt: string | null;
  receivedBy: string;
  transferId: string;
}

/** The crates the items are in, newest activity first. A crate's status is its least-advanced item's. */
export function cratesOf(items: InboundItem[]): Crate[] {
  const byLabel = new Map<string, InboundItem[]>();
  for (const i of items) {
    if (!i.crate || i.status === 'awaiting') continue;
    const list = byLabel.get(i.crate);
    if (list) list.push(i);
    else byLabel.set(i.crate, [i]);
  }
  const rank = (s: InboundStatus) => INBOUND_STATUSES.indexOf(s);
  const latest = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
  return [...byLabel.entries()]
    .map(([label, list]): Crate => {
      const status = list.reduce((s, i) => (rank(i.status) < rank(s) ? i.status : s), list[0].status) as Crate['status'];
      return {
        label,
        origin: list[0].origin,
        status,
        items: [...list].sort((a, b) => a.sku.localeCompare(b.sku)),
        units: list.reduce((n, i) => n + i.qty, 0),
        packedAt: latest(list.map((i) => i.packedAt)),
        shippedAt: latest(list.map((i) => i.shippedAt)),
        shippedBy: list.find((i) => i.shippedBy)?.shippedBy ?? '',
        receivedAt: latest(list.map((i) => i.receivedAt)),
        receivedBy: list.find((i) => i.receivedBy)?.receivedBy ?? '',
        transferId: list.find((i) => i.transferId)?.transferId ?? '',
      };
    })
    .sort((a, b) =>
      (b.receivedAt ?? b.shippedAt ?? b.packedAt ?? '').localeCompare(a.receivedAt ?? a.shippedAt ?? a.packedAt ?? '')
    );
}

/** "Grand Junction" → "GJ": the prefix its crates are numbered under. */
export function originCode(origin: string): string {
  const letters = origin
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return letters || 'IN';
}

/** The next crate number for an origin: one past the highest used, e.g. GJ-004 after GJ-003. */
export function nextCrateLabel(items: InboundItem[], origin: string): string {
  const prefix = originCode(origin);
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  const highest = items.reduce((n, i) => {
    const m = pattern.exec(i.crate);
    return m ? Math.max(n, Number(m[1])) : n;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}

/** A crate label as stored: trimmed and upper-cased, so "gj-3 " and "GJ-3" are one crate. */
export const normalizeCrate = (label: string) => label.trim().replace(/\s+/g, ' ').toUpperCase();

/** Average cost per unit from a row's total value, to the cent; none when there is no quantity. */
export function averageUnitCost(totalValue: number | null, qty: number): number | null {
  if (totalValue == null || !Number.isFinite(totalValue) || qty <= 0) return null;
  return Math.round((totalValue / qty) * 100) / 100;
}

/** The districts stock comes in from. Williston is where it goes, so it isn't one. */
export const INBOUND_ORIGINS = ['Grand Junction', 'Gillette', 'Vernal', 'Smithfield'];
