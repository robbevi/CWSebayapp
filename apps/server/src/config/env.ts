import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

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
  PORT: z.string().optional(),
});

const raw = rawSchema.parse(process.env);

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
