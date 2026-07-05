'use client';

import { useEffect } from 'react';

// Global keyboard shortcuts for the Reading Room.
// Cursor-inspired: single-letter shortcuts when not typing.
// Emits typed CustomEvents so any component in the room can respond.

interface Handlers {
  onNextSlice?: () => void;
  onPrevSlice?: () => void;
  onSign?: () => void;
  onSend?: () => void;
  onNextCase?: () => void;
  onPrevCase?: () => void;
  onToggleWorklist?: () => void;
  onHelp?: () => void;
}

function isTyping(): boolean {
  const t = document.activeElement as HTMLElement | null;
  if (!t) return false;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return true;
  if (t.isContentEditable) return true;
  return false;
}

export function RoomShortcuts(h: Handlers) {
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (isTyping()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'j':
          if (e.shiftKey) h.onNextCase?.();
          else h.onNextSlice?.();
          e.preventDefault();
          break;
        case 'k':
          if (e.shiftKey) h.onPrevCase?.();
          else h.onPrevSlice?.();
          e.preventDefault();
          break;
        case 's':
          h.onSign?.();
          e.preventDefault();
          break;
        case 'w':
          h.onSend?.();
          e.preventDefault();
          break;
        case 'l':
          h.onToggleWorklist?.();
          e.preventDefault();
          break;
        case '?':
          h.onHelp?.();
          e.preventDefault();
          break;
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
