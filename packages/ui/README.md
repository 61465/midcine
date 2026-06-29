# @midcine/ui

Shared design system + RTL-aware components for the midcine Suite (7 apps).

## Stack
- React 19 + TypeScript 5.7
- Tailwind CSS 3.4 (preset shared via `@midcine/ui/tailwind-preset`)
- Radix UI primitives
- class-variance-authority + clsx + tailwind-merge
- lucide-react icons

## Usage in an app
```ts
// tailwind.config.ts
import preset from '@midcine/ui/tailwind-preset';
export default { presets: [preset], content: ['./src/**/*.{ts,tsx}'] };

// in your app entry
import '@midcine/ui/styles';
import { Button, AppSwitcher, PriorityBadge } from '@midcine/ui';
```

## RTL
- `lib/rtl.ts` exposes `getDirection(lang)` and `flipDirection(side, dir)`.
- Components use Tailwind's logical properties (`start`/`end`) — never `left`/`right`.

## Tokens
- `tokens/index.ts` — colors, fonts, radii, priority/modality types.
- Update tokens here → all apps inherit.

## What's missing (intentional, lands in Sprint 1)
- Storybook
- Chromatic visual regression
- Vitest component tests
- Composite styling on Radix re-exports (Dialog/Dropdown/Toast)
