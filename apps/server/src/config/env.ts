import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import type { AppUser } from '@warehouse/shared';

// npm workspace scripts ("-w @warehouse/server") run with cwd set to apps/server, not
// the repo root — dotenv's default `path.resolve(process.cwd(), '.env')` would silently
// miss the root .env entirely. Resolve it explicitly relative to this file's location
// instead (apps/server/src/config or apps/server/dist/config, both one level under
// apps/server, so the same relative depth works in dev and in the compiled build).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const rawSchema = z.object({
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  SHAREPOINT_SITE_HOSTNAME: z.string().optional(),
  SHAREPOINT_SITE_PATH: z.string().optional(),
  SHAREPOINT_LIST_NAME: z.string().optional(),
  SHAREPOINT_PHOTOS_FOLDER_PATH: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
  GOOGLE_SHEET_ID: z.string().optional(),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().optional(),
  APP_USERS_JSON: z.string().optional(),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_REFRESH_TOKEN: z.string().optional(),
  EBAY_RU_NAME: z.string().optional(),
  EBAY_ENV: z.enum(['production', 'sandbox']).optional(),
  EBAY_MARKETPLACE_ID: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  PORT: z.string().optional(),
});

const raw = rawSchema.parse(process.env);

// The real employee roster (names + roles) is kept out of source entirely — this repo
// is public — and injected at runtime instead, as a JSON array in .env/Render's env vars.

/** Why the roster is empty, so a bad paste can be diagnosed without guessing. */
export let appUsersProblem: string | undefined;

/**
 * Repairs the damage a value routinely picks up on its way through a dashboard text field
 * before parsing: surrounding stray quotes, and curly quotes substituted for straight ones
 * by an editor somewhere upstream. Neither is valid JSON, and both are invisible to read.
 */
function repairJson(raw: string): string {
  let out = raw.trim();
  if ((out.startsWith("'") && out.endsWith("'")) || (out.startsWith('`') && out.endsWith('`'))) {
    out = out.slice(1, -1).trim();
  }
  // A whole JSON array wrapped in double quotes — only unwrap when it really is wrapping,
  // never when the value legitimately begins and ends with a quoted string.
  if (out.startsWith('"[') && out.endsWith(']"')) out = out.slice(1, -1).trim();
  return out.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function parseAppUsers(json: string | undefined): AppUser[] {
  appUsersProblem = undefined;
  if (!json || !json.trim()) {
    appUsersProblem = 'APP_USERS_JSON is not set.';
    console.error(appUsersProblem);
    return [];
  }

  const repaired = repairJson(json);
  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch (err) {
    // The message carries the character offset, which is what actually locates a bad
    // paste. Never log the value itself — it is a list of real employees.
    appUsersProblem =
      `APP_USERS_JSON is not valid JSON (${(err as Error).message}). ` +
      `Length ${json.length}, starts "${repaired.slice(0, 2)}", ends "${repaired.slice(-2)}".`;
    console.error(appUsersProblem);
    return [];
  }

  if (!Array.isArray(parsed)) {
    appUsersProblem = `APP_USERS_JSON parsed as ${typeof parsed}, expected an array.`;
    console.error(appUsersProblem);
    return [];
  }

  const users = parsed.filter(
    (u): u is AppUser =>
      !!u && typeof u === 'object' && typeof (u as AppUser).name === 'string' && !!(u as AppUser).name
  );
  if (users.length !== parsed.length) {
    appUsersProblem = `APP_USERS_JSON had ${parsed.length} entries but only ${users.length} usable ones.`;
    console.error(appUsersProblem);
  }
  // A role that isn't one of the two known values would silently mis-score submissions.
  for (const u of users) {
    if (u.role !== 'warehouse' && u.role !== 'lister') {
      console.error(`APP_USERS_JSON: "${u.name}" has role "${u.role}"; expected warehouse or lister.`);
      u.role = 'warehouse';
    }
  }
  return users;
}

export const env = {
  tenantId: raw.AZURE_TENANT_ID,
  clientId: raw.AZURE_CLIENT_ID,
  clientSecret: raw.AZURE_CLIENT_SECRET,
  siteHostname: raw.SHAREPOINT_SITE_HOSTNAME,
  sitePath: raw.SHAREPOINT_SITE_PATH,
  listName: raw.SHAREPOINT_LIST_NAME,
  photosFolderPath: raw.SHAREPOINT_PHOTOS_FOLDER_PATH,
  // Resolved against the repo root (not process.cwd()) so a relative path in .env
  // works regardless of which directory the process was actually started from.
  googleServiceAccountKeyFile: raw.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
    ? path.resolve(REPO_ROOT, raw.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)
    : undefined,
  googleSheetId: raw.GOOGLE_SHEET_ID,
  googleDriveFolderId: raw.GOOGLE_DRIVE_FOLDER_ID,
  googleOAuthClientId: raw.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: raw.GOOGLE_OAUTH_CLIENT_SECRET,
  googleOAuthRefreshToken: raw.GOOGLE_OAUTH_REFRESH_TOKEN,
  appUsers: parseAppUsers(raw.APP_USERS_JSON),
  ebayClientId: raw.EBAY_CLIENT_ID,
  ebayClientSecret: raw.EBAY_CLIENT_SECRET,
  ebayRefreshToken: raw.EBAY_REFRESH_TOKEN,
  ebayRuName: raw.EBAY_RU_NAME,
  ebayEnv: raw.EBAY_ENV ?? 'production',
  ebayMarketplaceId: raw.EBAY_MARKETPLACE_ID ?? 'EBAY_US',
  // Where eBay can reach this app from the open internet, to fetch listing photographs.
  publicBaseUrl: raw.PUBLIC_BASE_URL?.replace(/\/$/, ''),
  port: Number(raw.PORT ?? 4000),
};

export function isGraphConfigured(): boolean {
  return !!(
    env.tenantId &&
    env.clientId &&
    env.clientSecret &&
    env.siteHostname &&
    env.sitePath &&
    env.listName &&
    env.photosFolderPath
  );
}

export function isGoogleConfigured(): boolean {
  return !!(env.googleServiceAccountKeyFile && env.googleSheetId && env.googleDriveFolderId);
}

// Drive file *creation* (photo upload) needs a real Google account identity, not the
// service account — see google/client.ts for why. Sheets and Drive *listing* stay on
// the service account and only need isGoogleConfigured().
export function isGoogleDriveUploadConfigured(): boolean {
  return !!(env.googleOAuthClientId && env.googleOAuthClientSecret && env.googleOAuthRefreshToken);
}
