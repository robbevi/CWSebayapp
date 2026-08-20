/**
 * One-time eBay consent flow. Produces the refresh token the server uses to read orders.
 *
 * Unlike Google, eBay will not redirect to http://127.0.0.1 — the redirect target must be
 * an HTTPS URL registered in the developer portal, and it is referenced by its RuName
 * rather than by the URL itself. So this script cannot catch the redirect: you complete
 * consent in the browser and paste the URL eBay sends you back to.
 *
 * Prerequisites (all on developer.ebay.com, under Application Keys):
 *   1. An app keyset. EBAY_CLIENT_ID is the App ID, EBAY_CLIENT_SECRET is the Cert ID.
 *   2. A redirect URL entry ("User Tokens" -> "Get a Token from eBay via Your Application").
 *      Its RuName goes in EBAY_RU_NAME.
 *
 * Then: npx tsx scripts/ebay-oauth-setup.ts
 */
import { createInterface } from 'node:readline/promises';
import { env } from '../src/config/env.js';
import { EBAY_SCOPES, ebayAuthUrl, ebayBaseUrl } from '../src/ebay/client.js';

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

async function main() {
  const { ebayClientId, ebayClientSecret, ebayRuName } = env;
  if (!ebayClientId || !ebayClientSecret) {
    fail('Set EBAY_CLIENT_ID (App ID) and EBAY_CLIENT_SECRET (Cert ID) in .env first.');
  }
  if (!ebayRuName) {
    fail('Set EBAY_RU_NAME in .env first — it is the RuName of your redirect URL entry, not the URL itself.');
  }

  const authUrl =
    `${ebayAuthUrl()}/oauth2/authorize?client_id=${encodeURIComponent(ebayClientId)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(ebayRuName)}` +
    `&scope=${encodeURIComponent(EBAY_SCOPES.join(' '))}`;

  console.log(`\nUsing the ${env.ebayEnv} environment.`);
  console.log('\n1. Open this URL and sign in as the eBay account that owns the listings:\n');
  console.log(authUrl);
  console.log('\n2. Approve the request. eBay will send you to your redirect URL.');
  console.log('3. Copy that URL from the address bar and paste it below.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pasted = (await rl.question('Redirect URL (or just the code): ')).trim();
  rl.close();

  let code = pasted;
  if (pasted.includes('code=')) {
    // The value arrives URL-encoded; URL parsing decodes it exactly once, which is right.
    const parsed = new URL(pasted);
    code = parsed.searchParams.get('code') ?? '';
  }
  if (!code) fail('No authorization code found in what you pasted.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: ebayRuName,
  });

  const res = await fetch(`${ebayBaseUrl()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${ebayClientId}:${ebayClientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    fail(
      `Token exchange failed (${res.status}): ${text}\n\n` +
        'Authorization codes expire within minutes — if this says invalid_grant, run the script again and paste the URL promptly.'
    );
  }

  const json = JSON.parse(text) as { refresh_token?: string; refresh_token_expires_in?: number };
  if (!json.refresh_token) fail(`No refresh token in the response: ${text}`);

  const months = json.refresh_token_expires_in
    ? Math.round(json.refresh_token_expires_in / 2_592_000)
    : undefined;

  console.log('\n=== SUCCESS ===');
  console.log('Add this to .env (and to Render) as EBAY_REFRESH_TOKEN:\n');
  console.log(json.refresh_token);
  if (months) console.log(`\nIt expires in roughly ${months} months; re-run this script to renew.`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
