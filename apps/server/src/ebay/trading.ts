import type { TradingMessage } from '@warehouse/shared';
import { env } from '../config/env.js';
import { getAccessToken } from './client.js';

/**
 * The Trading API: XML over POST, with the OAuth user token in a header of its own.
 *
 * It takes no OAuth scopes — any valid user token will do — which is why listing through
 * it needed no fresh consent. Listings it creates also stay editable in Seller Hub, where
 * the Inventory API's can only ever be changed through that API again.
 */
const ENDPOINT =
  env.ebayEnv === 'sandbox' ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll';

export const SITE_US = '0';
/** eBay Motors. Its categories are only accepted when the call is addressed to it. */
export const SITE_MOTORS = '100';

export async function tradingCall(call: string, inner: string, siteId = SITE_US): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call,
      'X-EBAY-API-SITEID': siteId,
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${inner}</${call}Request>`,
  });
  const text = await res.text();
  if (!text) throw new Error(`eBay ${call} returned nothing (HTTP ${res.status}).`);
  return text;
}

export function xmlAll(xml: string | undefined, name: string): string[] {
  if (!xml) return [];
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);
}

export function xmlOne(xml: string | undefined, name: string): string | undefined {
  return xmlAll(xml, name)[0];
}

export function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function tradingSucceeded(xml: string): boolean {
  const ack = xmlOne(xml, 'Ack');
  return ack === 'Success' || ack === 'Warning';
}

/** Warnings eBay attaches to every listing call on this account, whatever the listing. */
const ACCOUNT_BOILERPLATE = new Set(['21917236']);

export function tradingMessages(xml: string): TradingMessage[] {
  const seen = new Set<string>();
  const out: TradingMessage[] = [];
  for (const e of xmlAll(xml, 'Errors')) {
    const code = xmlOne(e, 'ErrorCode') ?? '';
    const message = xmlDecode(xmlOne(e, 'LongMessage') ?? xmlOne(e, 'ShortMessage') ?? '')
      .replace(/<[^>]+>/g, '')
      .trim();
    const key = `${code}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const severity: TradingMessage['severity'] =
      xmlOne(e, 'SeverityCode') === 'Error' ? 'error' : ACCOUNT_BOILERPLATE.has(code) ? 'info' : 'warning';
    out.push({ severity, code, message });
  }
  return out;
}
