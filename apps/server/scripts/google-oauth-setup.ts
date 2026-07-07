import { createServer } from 'node:http';
import { google } from 'googleapis';
import { env } from '../src/config/env.js';

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

async function main() {
  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
    console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(env.googleOAuthClientId, env.googleOAuthClientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive'],
  });

  console.log('\nOpen this URL in your browser and sign in with the Google account that owns the Drive folder:\n');
  console.log(authUrl);
  console.log('\nWaiting for you to complete sign-in (up to 5 minutes)...\n');

  const code: string = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '', REDIRECT_URI);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.setHeader('Content-Type', 'text/html');

      if (error) {
        res.end(`<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(error));
        return;
      }
      if (code) {
        res.end('<h1>Success</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(code);
        return;
      }
      res.end('<h1>Waiting for authorization...</h1>');
    });
    server.listen(PORT);
    setTimeout(
      () => {
        server.close();
        reject(new Error('Timed out waiting for authorization.'));
      },
      5 * 60 * 1000
    );
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh token was returned. Revoke prior access at https://myaccount.google.com/permissions and re-run this script.\n'
    );
    process.exit(1);
  }

  console.log('\n=== SUCCESS ===');
  console.log('Add this to .env as GOOGLE_OAUTH_REFRESH_TOKEN:\n');
  console.log(tokens.refresh_token);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
