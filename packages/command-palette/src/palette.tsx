'use client';
import * as React from 'react';
import { Command } from 'cmdk';
import { usePalette } from './provider';
import type { CommandGroup } from './types';

export function CommandPalette() {
  const { open, setOpen, sources } = usePalette();
  const [query, setQuery] = React.useState('');
  const [groups, setGroups] = React.useState<CommandGroup[]>([]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const all = await Promise.all(sources.map((s) => s.loadGroups(query)));
      if (!cancelled) setGroups(all.flat());
    })();
    return () => {
      cancelled = true;
    };
  }, [open, query, sources]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="midcine command palette">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="ابحث عن مريض، حالة، أمر..."
            className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              لا نتائج
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group.id} heading={group.label}>
                {group.items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                    onSelect={async () => {
                      await item.action();
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
                  >
                    {item.icon && <item.icon className="h-4 w-4 text-muted-foreground" />}
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {item.shortcut}
                      </kbd>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
