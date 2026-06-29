import { z } from 'zod';

const CHANNEL_NAME = 'midcine:suite-events';

export const SuiteEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('report.signed'),
    studyUid: z.string(),
    tenantId: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('study.opened'),
    studyUid: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('patient.viewed'),
    patientId: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('notification.read'),
    notificationId: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal('theme.changed'),
    theme: z.enum(['light', 'dark']),
    at: z.string(),
  }),
  z.object({
    type: z.literal('cache.invalidate'),
    keys: z.array(z.string()),
    at: z.string(),
  }),
]);
export type SuiteEvent = z.infer<typeof SuiteEventSchema>;

type Listener<E extends SuiteEvent = SuiteEvent> = (event: E) => void;

class EventBus {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<Listener>();

  init() {
    if (typeof window === 'undefined' || this.channel) return;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (msg) => {
      try {
        const parsed = SuiteEventSchema.parse(msg.data);
        this.listeners.forEach((l) => l(parsed));
      } catch {
        // ignore invalid messages
      }
    };
  }

  emit(event: SuiteEvent) {
    this.channel?.postMessage(event);
    this.listeners.forEach((l) => l(event));
  }

  on<T extends SuiteEvent['type']>(
    type: T,
    listener: Listener<Extract<SuiteEvent, { type: T }>>,
  ): () => void {
    const wrapped: Listener = (event) => {
      if (event.type === type) listener(event as Extract<SuiteEvent, { type: T }>);
    };
    this.listeners.add(wrapped);
    return () => {
      this.listeners.delete(wrapped);
    };
  }

  destroy() {
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
  }
}

export const suiteBus = new EventBus();
