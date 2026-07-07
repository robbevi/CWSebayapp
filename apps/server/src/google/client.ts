import { google, type sheets_v4, type drive_v3 } from 'googleapis';
import { env, isGoogleConfigured } from '../config/env.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;
let cachedSheets: sheets_v4.Sheets | null = null;
let cachedDrive: drive_v3.Drive | null = null;

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

export function getDriveClient(): drive_v3.Drive {
  requireConfigured();
  if (cachedDrive) return cachedDrive;
  cachedDrive = google.drive({ version: 'v3', auth: getAuth() });
  return cachedDrive;
}
