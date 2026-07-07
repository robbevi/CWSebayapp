import { google, type sheets_v4, type drive_v3 } from 'googleapis';
import { env, isGoogleConfigured, isGoogleDriveUploadConfigured } from '../config/env.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;
let cachedSheets: sheets_v4.Sheets | null = null;
let cachedDrive: drive_v3.Drive | null = null;
let cachedDriveUpload: drive_v3.Drive | null = null;

function requireConfigured(): void {
  if (!isGoogleConfigured()) {
    throw new Error(
      'Google backend is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE, GOOGLE_SHEET_ID, GOOGLE_DRIVE_FOLDER_ID in .env.'
    );
  }
}

function getAuth() {
  if (cachedAuth) return cachedAuth;
  requireConfigured();
  cachedAuth = new google.auth.GoogleAuth({ keyFile: env.googleServiceAccountKeyFile, scopes: SCOPES });
  return cachedAuth;
}

export function getSheetsClient(): sheets_v4.Sheets {
  requireConfigured();
  if (cachedSheets) return cachedSheets;
  cachedSheets = google.sheets({ version: 'v4', auth: getAuth() });
  return cachedSheets;
}

// Reading/listing Drive contents works fine under the service account (it just needs
// the folder shared with it as Editor).
export function getDriveClient(): drive_v3.Drive {
  requireConfigured();
  if (cachedDrive) return cachedDrive;
  cachedDrive = google.drive({ version: 'v3', auth: getAuth() });
  return cachedDrive;
}

// Creating files is different: service accounts have no storage quota on a personal
// (non-Workspace) Google account, so uploads must run as a real, OAuth-authenticated
// user identity instead (see apps/server/scripts/google-oauth-setup.ts). Sheets and
// Drive listing are unaffected and stay on the service account above.
export function getDriveUploadClient(): drive_v3.Drive {
  if (!isGoogleDriveUploadConfigured()) {
    throw new Error(
      'Google Drive photo upload is not configured. Run `npm run google:auth -w @warehouse/server` and set the resulting GOOGLE_OAUTH_REFRESH_TOKEN in .env.'
    );
  }
  if (cachedDriveUpload) return cachedDriveUpload;

  const oauth2Client = new google.auth.OAuth2(env.googleOAuthClientId, env.googleOAuthClientSecret);
  oauth2Client.setCredentials({ refresh_token: env.googleOAuthRefreshToken });

  cachedDriveUpload = google.drive({ version: 'v3', auth: oauth2Client });
  return cachedDriveUpload;
}
