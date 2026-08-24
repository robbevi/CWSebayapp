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
