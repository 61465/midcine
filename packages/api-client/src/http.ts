import ky, { type KyInstance, type Options as KyOptions, HTTPError } from 'ky';
import { ApiError, fromProblemDetails } from './errors';

export interface MidcineClientConfig {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  tenantId?: string;
  timeout?: number;
  onUnauthorized?: () => void;
}

export function createHttpClient(config: MidcineClientConfig): KyInstance {
  return ky.create({
    prefixUrl: config.baseUrl,
    timeout: config.timeout ?? 30000,
    retry: { limit: 2, statusCodes: [408, 429, 500, 502, 503, 504] },
    hooks: {
      beforeRequest: [
        async (req) => {
          if (config.getToken) {
            const token = await config.getToken();
            if (token) req.headers.set('Authorization', `Bearer ${token}`);
          }
          if (config.tenantId) {
            req.headers.set('X-Midcine-Tenant', config.tenantId);
          }
          req.headers.set('X-Request-ID', crypto.randomUUID());
        },
      ],
      beforeError: [
        async (error: HTTPError) => {
          if (error.response.status === 401) config.onUnauthorized?.();
          try {
            const body = await error.response.json();
            if (body && typeof body === 'object' && 'type' in body) {
              return fromProblemDetails(body as never) as never;
            }
          } catch {
            /* fall through */
          }
          return new ApiError(
            error.message,
            error.response.status,
            error.request.url,
          ) as never;
        },
      ],
    },
  });
}

export type { KyOptions };
