import { env } from '../config/env.js';

/**
 * eBay OAuth. The app holds a long-lived refresh token obtained once through the consent
 * flow (scripts/ebay-oauth-setup.ts) and trades it for short-lived access tokens, exactly
 * as the Drive integration does — order data is user-scoped, so a client-credentials token
 * is not sufficient.
 */

/**
 * Requested at consent time, so they must cover everything the app will ever read — eBay
 * grants exactly what was asked for, and widening the list later means going through the
 * consent flow again for a fresh refresh token.
 *
 *  fulfillment  what sold, with line items and buyer payments
 *  finances     the fees that turn a gross sale into real proceeds
 *  inventory    active listings and their current asking price
 *  analytics    listing traffic — views and impressions
 */
export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
];

export function ebayBaseUrl(): string {
  return env.ebayEnv === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

export function ebayAuthUrl(): string {
  return env.ebayEnv === 'sandbox' ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
}

function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

let cached: { token: string; expiresAt: number } | undefined;

export async function getAccessToken(): Promise<string> {
  const { ebayClientId, ebayClientSecret, ebayRefreshToken } = env;
  if (!ebayClientId || !ebayClientSecret || !ebayRefreshToken) {
    throw new Error('eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_REFRESH_TOKEN.');
  }
  // A minute of headroom, so a token never expires mid-request.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: ebayRefreshToken,
    scope: EBAY_SCOPES.join(' '),
  });

  const res = await fetch(`${ebayBaseUrl()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(ebayClientId, ebayClientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    // invalid_grant covers three different mistakes and the raw response does not
    // separate them, so name all three rather than sending someone down one path.
    const hint = text.includes('invalid_grant')
      ? ' This means one of: the refresh token was minted under a different App ID than ' +
        'EBAY_CLIENT_ID; it was minted in the other environment (sandbox vs production, ' +
        'see EBAY_ENV); or it has expired or been revoked. Check /api/health/ebay, then ' +
        're-run scripts/ebay-oauth-setup.ts against the keyset you are actually using.'
      : '';
    throw new Error(`eBay token refresh failed (${res.status}).${hint} Response: ${text.slice(0, 300)}`);
  }

  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export async function ebayGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${ebayBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': env.ebayMarketplaceId,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`eBay GET ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** Clears the cached access token. Only needed by tests and the setup script. */
export function resetTokenCache(): void {
  cached = undefined;
}
