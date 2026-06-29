import { createHttpClient, IngestionClient } from '@midcine/api-client';
import { getSession } from '@midcine/auth/client';

const http = createHttpClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8100',
  getToken: async () => {
    const session = await getSession();
    return session ? document.cookie.match(/midcine_session=([^;]+)/)?.[1] ?? null : null;
  },
  onUnauthorized: () => {
    window.location.href = '/login';
  },
});

export const ingestion = new IngestionClient(http);
