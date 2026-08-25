'use client';

/**
 * Persistent banner shown at the top of every clinical page.
 * States clearly that this is an AI assistant and the radiologist retains
 * legal responsibility. Dismissible per-session but never permanently.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';

const DISMISS_KEY = 'midcine.legal.banner.dismissed_at';
const DISMISS_HOURS = 12; // re-shows every 12 hours minimum

export function DisclaimerBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    const hoursSince = (Date.now() - last) / (1000 * 60 * 60);
    setVisible(!last || hoursSince > DISMISS_HOURS);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setVisible(false);
  };

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <div className="flex-1 text-[11px] text-amber-100">
          <strong className="font-bold text-amber-300">AI assistant only.</strong>{' '}
          Draft radiology reports are not diagnostic. Not FDA/CE cleared. The
          radiologist retains full legal responsibility for all interpretations,
          diagnoses, and signed reports.{' '}
          <Link
            href="/legal"
            className="inline-flex items-center gap-0.5 font-bold text-amber-200 underline hover:text-amber-100"
          >
            Read the full disclaimer
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-amber-400 hover:bg-amber-500/20 hover:text-amber-200"
          aria-label="Dismiss for now"
          title="Dismiss (will reappear later)"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
