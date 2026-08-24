import { Router } from 'express';
import type { HealthStatus } from '@warehouse/shared';
import { appUsersProblem, env, isGoogleConfigured, isGraphConfigured } from '../config/env.js';
import { getResolvedContext } from '../graph/siteResolver.js';
import { checkAccess as checkSheetsAccess } from '../google/sheetsService.js';
import { checkAccess as checkDriveAccess } from '../google/driveService.js';

export const healthRouter = Router();

// Surfaced so an empty roster can be spotted from the health endpoint rather than only
// by noticing the user picker is blank.
healthRouter.get('/health/users', (_req, res) => {
  res.json({
    count: env.appUsers.length,
    roles: env.appUsers.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] ?? 0) + 1;
      return acc;
    }, {}),
    problem: appUsersProblem ?? null,
  });
});

/**
 * Which eBay settings arrived, so "not configured" can be acted on instead of guessed at.
 * Reports presence and length only — never a value, since two of these are secrets.
 */
healthRouter.get('/health/ebay', (_req, res) => {
  const seen = (v: string | undefined) => ({ set: !!v && v.trim().length > 0, length: v?.trim().length ?? 0 });
  const clientId = seen(env.ebayClientId);
  // The App ID is an OAuth *client identifier*, not a secret — the Cert ID is the secret
  // half. Showing enough of it to compare against the developer portal is what settles
  // "was the token minted against this keyset or a different one".
  const clientIdHint = (() => {
    const id = (env.ebayClientId ?? '').trim();
    if (id.length < 12) return null;
    return `${id.slice(0, 22)}…${id.slice(-8)}`;
  })();
  const clientSecret = seen(env.ebayClientSecret);
  const refreshToken = seen(env.ebayRefreshToken);

  // An eBay App ID carries its environment in the middle segment (…-SBX-… or …-PRD-…).
  // That marker is not a secret, and it catches the commonest wiring mistake: a token
  // minted under one keyset paired with the other keyset's credentials.
  const keyset = /-SBX-/i.test(env.ebayClientId ?? '')
    ? 'sandbox'
    : /-PRD-/i.test(env.ebayClientId ?? '')
      ? 'production'
      : 'unknown';
  const mismatch = keyset !== 'unknown' && keyset !== env.ebayEnv;

  const missing = [
    !clientId.set && 'EBAY_CLIENT_ID',
    !clientSecret.set && 'EBAY_CLIENT_SECRET',
    !refreshToken.set && 'EBAY_REFRESH_TOKEN',
  ].filter(Boolean);

  res.json({
    environment: env.ebayEnv,
    marketplace: env.ebayMarketplaceId,
    configured: missing.length === 0,
    keyset,
    keysetMatchesEnvironment: !mismatch,
    clientIdHint,
    missing,
    vars: {
      EBAY_CLIENT_ID: clientId,
      EBAY_CLIENT_SECRET: clientSecret,
      EBAY_REFRESH_TOKEN: refreshToken,
      EBAY_RU_NAME: seen(env.ebayRuName),
    },
    // A refresh token is long; a truncated paste is a common cause of a silent failure.
    note:
      missing.length > 0
        ? `Set ${missing.join(', ')} in the environment, then restart.`
        : mismatch
          ? `The App ID is a ${keyset} key but EBAY_ENV is ${env.ebayEnv}. All three values must come from the same keyset, and the refresh token must have been minted against it.`
          : 'All three present and consistent. If sync still fails, compare clientIdHint against the App ID on the keyset you generated the refresh token from — a token minted against a different keyset is rejected as "issued to another client".',
  });
});

healthRouter.get('/health', async (_req, res) => {
  if (isGoogleConfigured()) {
    try {
      await Promise.all([checkSheetsAccess(), checkDriveAccess()]);
      const body: HealthStatus = { backend: 'google', configured: true, resolved: true };
      res.json(body);
    } catch (err) {
      const body: HealthStatus = { backend: 'google', configured: true, resolved: false, error: (err as Error).message };
      res.json(body);
    }
    return;
  }

  if (isGraphConfigured()) {
    try {
      await getResolvedContext();
      const body: HealthStatus = { backend: 'sharepoint', configured: true, resolved: true };
      res.json(body);
    } catch (err) {
      const body: HealthStatus = {
        backend: 'sharepoint',
        configured: true,
        resolved: false,
        error: (err as Error).message,
      };
      res.json(body);
    }
    return;
  }

  const body: HealthStatus = { backend: 'none', configured: false, resolved: false };
  res.json(body);
});
