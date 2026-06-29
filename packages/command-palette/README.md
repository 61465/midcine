# @midcine/command-palette

Global ⌘K palette for the suite. Each app contributes its own commands via `useCommandSource`.

## Use
```tsx
// app/layout.tsx
import { CommandPaletteProvider, CommandPalette } from '@midcine/command-palette';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      {children}
      <CommandPalette />
    </CommandPaletteProvider>
  );
}

// inside any client component:
import { useCommandSource } from '@midcine/command-palette';

useCommandSource({
  id: 'worklist',
  loadGroups: async (q) => [
    { id: 'nav', label: 'تنقّل', items: [
      { id: 'open-worklist', label: 'افتح Worklist', action: () => router.push('/worklist') },
    ]},
  ],
});
```
