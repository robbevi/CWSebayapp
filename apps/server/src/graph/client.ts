import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { env, isGraphConfigured } from '../config/env.js';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

let cachedClient: Client | null = null;

export function getGraphClient(): Client {
  if (!isGraphConfigured()) {
    throw new Error('Graph is not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in .env.');
  }
  if (cachedClient) return cachedClient;

  const credential = new ClientSecretCredential(env.tenantId!, env.clientId!, env.clientSecret!);

  cachedClient = Client.init({
    authProvider: async (done) => {
      try {
        const token = await credential.getToken(GRAPH_SCOPE);
        done(null, token?.token ?? null);
      } catch (err) {
        done(err as Error, null);
      }
    },
  });

  return cachedClient;
}
