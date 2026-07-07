import 'dotenv/config';
import { z } from 'zod';

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
  googleServiceAccountKeyFile: raw.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  googleSheetId: raw.GOOGLE_SHEET_ID,
  googleDriveFolderId: raw.GOOGLE_DRIVE_FOLDER_ID,
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
