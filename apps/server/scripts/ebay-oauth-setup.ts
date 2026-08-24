/**
 * One-time eBay consent flow, in two non-interactive steps.
 *
 *   Step 1   npx tsx scripts/ebay-oauth-setup.ts
 *            Prints the sign-in URL. Open it, approve, and eBay sends you to your
 *            redirect URL with ?code=... in the address bar.
 *
 *   Step 2   npx tsx scripts/ebay-oauth-setup.ts --url "<that whole address>"
 *            Exchanges the code and writes EBAY_REFRESH_TOKEN into .env.
 *
 * Split in two rather than prompting, so it can be run by a tool that has no interactive
 * stdin. The refresh token is written straight to .env and never printed: it is a
 * credential, and anything printed ends up in a terminal log.
 *
 * Runs locally. Render needs no shell — copy the value out of .env into its environment.
 *
 * Prerequisites, on developer.ebay.com under Application Keys, for the environment you
 * intend to use:
 *   EBAY_CLIENT_ID      the App ID
 *   EBAY_CLIENT_SECRET  the Cert ID
 *   EBAY_RU_NAME        the RuName of your redirect URL entry — the RuName, not the URL
 *   EBAY_ENV            production or sandbox, matching that keyset
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env, REPO_ROOT } from '../src/config/env.js';
import { EBAY_SCOPES, ebayAuthUrl, ebayBaseUrl } from '../src/ebay/client.js';

const ENV_FILE = path.join(REPO_ROOT, '.env');
const KEY = 'EBAY_REFRESH_TOKEN';

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function requireConfig(): { clientId: string; clientSecret: string; ruName: string } {
  const { ebayClientId, ebayClientSecret, ebayRuName } = env;
  if (!ebayClientId || !ebayClientSecret) {
    fail('Set EBAY_CLIENT_ID (App ID) and EBAY_CLIENT_SECRET (Cert ID) in .env first.');
  }
  if (!ebayRuName) {
    fail(
      'Set EBAY_RU_NAME in .env first.\n' +
        'It is the RuName of your redirect URL entry — a token like Company-Company-PRD-1a2b3c-4d5e6f —\n' +
        'not the https:// URL itself. Find it under User Tokens on your keyset.'
    );
  }
  return { clientId: ebayClientId, clientSecret: ebayClientSecret, ruName: ebayRuName };
}

/** Replaces the value in place, or appends the key if it isn't there yet. */
function writeToEnvFile(value: string): void {
  let contents = '';
  try {
    contents = readFileSync(ENV_FILE, 'utf-8');
  } catch {
    fail(`Could not read ${ENV_FILE}.`);
  }
  // Quoted, because an eBay token contains '#' and dotenv treats an unquoted '#' as the
  // start of a comment — an unquoted token silently truncates to "v^1.1", which parses
  // fine and then fails at the API with an unhelpful invalid_grant.
  const line = `${KEY}="${value}"`;
  const pattern = new RegExp(`^${KEY}=.*$`, 'm');
  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : contents + (contents.endsWith('\n') ? '' : '\n') + line + '\n';
  writeFileSync(ENV_FILE, next, 'utf-8');
}

function printAuthUrl(): void {
  const { clientId, ruName } = requireConfig();
  const url =
    `${ebayAuthUrl()}/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(ruName)}` +
    `&scope=${encodeURIComponent(EBAY_SCOPES.join(' '))}`;

  console.log(`\nEnvironment: ${env.ebayEnv}\n`);
  console.log('1. Open this and sign in as the eBay account that owns the listings:\n');
  console.log(url);
  console.log('\n2. Approve. eBay will send you to your redirect URL.');
  console.log('3. Copy the whole address from the browser bar and run:\n');
  console.log('   npx tsx scripts/ebay-oauth-setup.ts --url "<paste it here>"\n');
  console.log('Authorization codes expire within minutes, so do step 3 promptly.\n');
}

async function exchange(pasted: string): Promise<void> {
  const { clientId, clientSecret, ruName } = requireConfig();

  let code = pasted.trim();
  if (code.includes('code=')) {
    try {
      // URL parsing decodes the value exactly once, which is what eBay expects.
      code = new URL(code).searchParams.get('code') ?? '';
    } catch {
      fail('That did not parse as a URL. Paste the whole address, in quotes.');
    }
  }
  if (!code) fail('No authorization code found in what you pasted.');

  const res = await fetch(`${ebayBaseUrl()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ruName }),
  });

  const text = await res.text();
  if (!res.ok) {
    fail(
      `Token exchange failed (${res.status}): ${text}\n\n` +
        'invalid_grant here usually means the code was already used or has expired — codes last\n' +
        'only a few minutes. Re-run step 1 and paste the new address promptly.'
    );
  }

  const json = JSON.parse(text) as { refresh_token?: string; refresh_token_expires_in?: number };
  if (!json.refresh_token) fail(`No refresh token in the response: ${text}`);

  writeToEnvFile(json.refresh_token);

  const months = json.refresh_token_expires_in
    ? Math.round(json.refresh_token_expires_in / 2_592_000)
    : undefined;

  console.log('\n=== SUCCESS ===');
  console.log(`Wrote ${KEY} to .env (${json.refresh_token.length} characters).`);
  if (months) console.log(`Valid for about ${months} months — re-run this to renew.`);
  console.log('\nThe value is deliberately not printed. To put it into Render, open .env,');
  console.log(`copy everything after ${KEY}=, and paste it as that variable in the dashboard.`);
  console.log('\nCheck it first with:  npx tsx scripts/check-ebay.ts\n');
}

const urlArg = process.argv.indexOf('--url');
const codeArg = process.argv.indexOf('--code');

if (urlArg !== -1 && process.argv[urlArg + 1]) {
  await exchange(process.argv[urlArg + 1]);
} else if (codeArg !== -1 && process.argv[codeArg + 1]) {
  await exchange(process.argv[codeArg + 1]);
} else {
  printAuthUrl();
}
