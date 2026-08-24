import type { Listing } from '@warehouse/shared';
import { env } from '../config/env.js';
import { ebayBaseUrl, ebayGet, getAccessToken } from './client.js';

/**
 * Live listing data, assembled from two eBay APIs because neither is complete on its own.
 *
 *  - Trading (`GetMyeBaySelling`) has watchers, the current asking price and quantity
 *    available. It is the only place a watch count exists — the REST Analytics API has no
 *    watch metric, and the Inventory API holds nothing for listings created through eBay's
 *    own web interface, which these are.
 *  - Analytics (`traffic_report`) has impressions and views, which Trading does not.
 *
 * Trading speaks XML and takes the OAuth token through a header of its own rather than
 * Authorization, which is why this doesn't go through ebayGet.
 */

const TRADING_ENDPOINT =
  env.ebayEnv === 'sandbox' ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll';

const PAGE_SIZE = 200;
// eBay caps the active list; stop rather than page forever if something goes wrong.
const MAX_PAGES = 25;

function tag(xml: string, name: string): string | undefined {
  // Attributes appear on some of these (CurrentPrice carries a currencyID), so the opening
  // tag is matched loosely.
  return new RegExp(`<${name}[^>]*>([^<]*)</${name}>`).exec(xml)?.[1];
}

function num(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchActivePage(page: number): Promise<{ items: string[]; totalPages: number }> {
  const token = await getAccessToken();
  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>${PAGE_SIZE}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`;

  const res = await fetch(TRADING_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
    body,
  });

  const text = await res.text();
  const ack = tag(text, 'Ack');
  if (ack !== 'Success' && ack !== 'Warning') {
    const message = tag(text, 'LongMessage') ?? tag(text, 'ShortMessage') ?? text.slice(0, 200);
    throw new Error(`eBay GetMyeBaySelling failed (${res.status}): ${message}`);
  }

  // Only the ActiveList section — the response can carry other lists whose items would
  // otherwise be swept up as active listings.
  const active = /<ActiveList>([\s\S]*?)<\/ActiveList>/.exec(text)?.[1] ?? '';
  const items = [...active.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((m) => m[1]);
  const totalPages = num(tag(active, 'TotalNumberOfPages')) || 1;
  return { items, totalPages };
}

interface TrafficRecord {
  dimensionValues: { value: string }[];
  metricValues: { value: number | null }[];
}

/** Impressions and views per listing. Returns an empty map rather than failing the sync. */
async function fetchTraffic(days: number): Promise<Map<string, { impressions: number; views: number }>> {
  const out = new Map<string, { impressions: number; views: number }>();
  const yyyymmdd = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
  try {
    const page = await ebayGet<{ records?: TrafficRecord[] }>(
      '/sell/analytics/v1/traffic_report?dimension=LISTING' +
        '&metric=LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL' +
        `&filter=marketplace_ids:{${env.ebayMarketplaceId}},date_range:[${yyyymmdd(days)}..${yyyymmdd(1)}]`
    );
    for (const r of page.records ?? []) {
      const id = r.dimensionValues[0]?.value;
      if (!id) continue;
      out.set(id, { impressions: r.metricValues[0]?.value ?? 0, views: r.metricValues[1]?.value ?? 0 });
    }
  } catch (err) {
    console.warn(
      '[ebay] Traffic report unavailable, listings will sync without views:',
      err instanceof Error ? err.message : err
    );
  }
  return out;
}

export async function fetchListings(trafficDays = 30): Promise<Listing[]> {
  const syncedAt = new Date().toISOString();
  const [traffic] = await Promise.all([fetchTraffic(trafficDays)]);

  const listings: Listing[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { items, totalPages: reported } = await fetchActivePage(page);
    totalPages = Math.min(reported, MAX_PAGES);
    for (const item of items) {
      const id = tag(item, 'ItemID');
      if (!id) continue;
      const t = traffic.get(id);
      listings.push({
        ebayListingId: id,
        title: tag(item, 'Title') ?? '',
        price: num(tag(item, 'CurrentPrice')),
        currency: /<CurrentPrice[^>]*currencyID="([^"]+)"/.exec(item)?.[1] ?? 'USD',
        quantityAvailable: num(tag(item, 'Quantity')),
        watchers: num(tag(item, 'WatchCount')),
        // Null rather than zero: eBay having no traffic record is not the same as a
        // listing genuinely having had no views.
        impressions: t ? t.impressions : null,
        views: t ? t.views : null,
        syncedAt,
      });
    }
    page++;
  } while (page <= totalPages);

  return listings;
}

export { ebayBaseUrl };
