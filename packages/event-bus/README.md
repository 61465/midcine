# @midcine/event-bus

Cross-app event bus.

- **Same browser (across tabs):** native `BroadcastChannel` API. No library.
- **Cross-device:** bridge to Redis pub/sub via `@midcine/api-client`'s `connectRealtime`. Wire it in
  `apps/*/src/lib/event-bus-bridge.ts` (see Sprint 3 spec).

## Usage
```ts
import { suiteBus } from '@midcine/event-bus';

suiteBus.init(); // call once at app boot

// Subscribe
const unsub = suiteBus.on('report.signed', (e) => {
  console.log('report signed for', e.studyUid);
});

// Emit
suiteBus.emit({ type: 'report.signed', studyUid: 'X', tenantId: 'T', at: new Date().toISOString() });
```
