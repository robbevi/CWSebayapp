/**
 * Checks the eBay connection end to end, one step at a time, so a failure says which step
 * broke rather than surfacing a bare 400 from somewhere in the middle.
 *
 *   npx tsx scripts/check-ebay.ts
 *
 * Never prints a secret. Credentials are reported as set/missing and by length only.
 */
import { env } from '../src/config/env.js';
import { EBAY_SCOPES, ebayBaseUrl, getAccessToken } from '../src/ebay/client.js';
import { fetchSales } from '../src/ebay/ordersService.js';

function tick(ok: boolean): string {
  return ok ? 'ok  ' : 'MISS';
}

function describe(name: string, value: string | undefined): string {
  return `  ${tick(!!value)} ${name.padEnd(22)}${value ? `set (${value.length} chars)` : 'not set'}`;
}

async function main() {
  console.log(`\neBay environment: ${env.ebayEnv}   marketplace: ${env.ebayMarketplaceId}`);
  console.log(`API base: ${ebayBaseUrl()}\n`);

  console.log('Credentials');
  console.log(describe('EBAY_CLIENT_ID', env.ebayClientId));
  console.log(describe('EBAY_CLIENT_SECRET', env.ebayClientSecret));
  console.log(describe('EBAY_RU_NAME', env.ebayRuName));
  console.log(describe('EBAY_REFRESH_TOKEN', env.ebayRefreshToken));

  if (!env.ebayClientId || !env.ebayClientSecret) {
    console.log('\nAdd EBAY_CLIENT_ID (App ID) and EBAY_CLIENT_SECRET (Cert ID) to .env, then re-run.\n');
    process.exit(1);
  }

  if (!env.ebayRefreshToken) {
    console.log(
      '\nCredentials are present but nobody has granted access yet.\n' +
        (env.ebayRuName
          ? 'Next: npx tsx scripts/ebay-oauth-setup.ts\n'
          : 'Next: add EBAY_RU_NAME (the RuName of your redirect URL entry, not the URL), then run scripts/ebay-oauth-setup.ts\n')
    );
    process.exit(1);
  }

  console.log('\nExchanging the refresh token for an access token...');
  try {
    const token = await getAccessToken();
    console.log(`  ok   got an access token (${token.length} chars)`);
  } catch (err) {
    console.error(`  FAIL ${(err as Error).message}`);
    process.exit(1);
  }

  console.log('\nScopes requested at consent time:');
  for (const s of EBAY_SCOPES) console.log(`  · ${s.replace('https://api.ebay.com/oauth/api_scope/', '')}`);

  // Which account is this actually? An order history that looks empty is far more often a
  // grant made while signed in as the wrong eBay user than a seller with no sales.
  console.log('\nChecking which eBay account granted the token...');
  try {
    const token = await getAccessToken();
    const res = await fetch(`${ebayBaseUrl()}/commerce/identity/v1/user/`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.ok) {
      const who = (await res.json()) as { username?: string; accountType?: string; registrationMarketplaceId?: string };
      console.log(`  ok   ${who.username ?? '(username withheld)'}  ${who.accountType ?? ''} ${who.registrationMarketplaceId ?? ''}`);
    } else {
      console.log(`  --   unavailable (${res.status}) — re-run the consent flow to pick up the identity scope`);
    }
  } catch (err) {
    console.log(`  --   ${(err as Error).message}`);
  }

  // Which listings can this token actually see? An order history that reads as empty is
  // far more often a grant made on the wrong eBay account than a seller with no sales, and
  // the listing-id block is the quickest way to tell those two apart.
  console.log('\nListings this token can see (60 days of traffic)...');
  try {
    const token = await getAccessToken();
    const yyyymmdd = (n: number) =>
      new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
    const res = await fetch(
      `${ebayBaseUrl()}/sell/analytics/v1/traffic_report` +
        '?dimension=LISTING&metric=LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL' +
        `&filter=marketplace_ids:{${env.ebayMarketplaceId}},date_range:[${yyyymmdd(60)}..${yyyymmdd(1)}]`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': env.ebayMarketplaceId,
        },
      }
    );
    if (res.ok) {
      const json = (await res.json()) as { records?: { dimensionValues: { value: string }[] }[] };
      const ids = (json.records ?? []).map((r) => r.dimensionValues[0]?.value ?? '');
      const blocks: Record<string, number> = {};
      for (const id of ids) blocks[id.slice(0, 4)] = (blocks[id.slice(0, 4)] ?? 0) + 1;
      console.log(`  ok   ${ids.length} listing(s), id blocks: ${JSON.stringify(blocks)}`);
      if (ids.length > 0) console.log(`       e.g. ${ids.slice(0, 4).join(', ')}`);
      console.log('       If those are not your listings, the consent was granted while');
      console.log('       signed in as a different eBay account.');
    } else {
      console.log(`  --   traffic unavailable (${res.status})`);
    }
  } catch (err) {
    console.log(`  --   ${(err as Error).message}`);
  }

  console.log('\nReading the last 30 days of orders...');
  const since = new Date(Date.now() - 30 * 86_400_000);
  try {
    const sales = await fetchSales(since);
    console.log(`  ok   ${sales.length} sold line item(s)`);
    const estimated = sales.filter((s) => s.feesEstimated).length;
    if (estimated > 0) {
      console.log(`       ${estimated} still carry estimated fees — eBay posts finance records a little later.`);
    }
    for (const s of sales.slice(0, 5)) {
      console.log(
        `       ${s.soldAt.slice(0, 10)}  ${(s.sku || s.ebayListingId).padEnd(18)} ` +
          `qty ${s.qtySold}  gross ${s.grossSale}  net ${s.netProceeds}`
      );
    }
    if (sales.length === 0 && env.ebayEnv === 'sandbox') {
      console.log(
        '       The sandbox starts empty. Create a test buyer and place an order against a\n' +
          '       sandbox listing to give this something to find.'
      );
    }
  } catch (err) {
    console.error(`  FAIL ${(err as Error).message}`);
    process.exit(1);
  }

  console.log('\nConnection is working.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
