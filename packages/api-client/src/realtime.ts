import { z } from 'zod';

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('STUDY_NEW'),
    studyUid: z.string(),
    priority: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('STUDY_AI_READY'),
    studyUid: z.string(),
    confidence: z.number(),
    requiresReview: z.boolean(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('REPORT_SIGNED'),
    studyUid: z.string(),
    signedBy: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('CONSENT_APPROVED'),
    consentId: z.string(),
    at: z.string(),
  }),
]);
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;

export interface RealtimeOptions {
  url: string;
  getToken: () => string | Promise<string>;
  onEvent: (event: RealtimeEvent) => void;
  onError?: (err: Event) => void;
  onReconnect?: () => void;
}

export function connectRealtime(opts: RealtimeOptions): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldReconnect = true;

  const connect = async () => {
    const token = await opts.getToken();
    ws = new WebSocket(`${opts.url}?token=${encodeURIComponent(token)}`);

    ws.onmessage = (msg) => {
      try {
        const parsed = RealtimeEventSchema.parse(JSON.parse(msg.data));
        opts.onEvent(parsed);
      } catch (e) {
        console.warn('[realtime] invalid event', e);
      }
    };

    ws.onerror = (err) => opts.onError?.(err);

    ws.onclose = () => {
      if (shouldReconnect) {
        reconnectTimer = setTimeout(() => {
          opts.onReconnect?.();
          connect();
        }, 3000);
      }
    };
  };

  connect();

  return () => {
    shouldReconnect = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}
