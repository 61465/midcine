import type * as React from 'react';

export interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  action: () => void | Promise<void>;
}

export interface CommandSource {
  id: string;
  /** Called every time the palette opens to refresh dynamic items. */
  loadGroups: (query: string) => Promise<CommandGroup[]> | CommandGroup[];
}
