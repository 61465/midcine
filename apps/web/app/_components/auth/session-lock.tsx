'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { currentUser, logout } from '../../../lib/auth';

/**
 * Auto-locks the session after IDLE_MINUTES of no user activity.
 * Required for Saudi PDPL / HIPAA-style compliance on shared workstations.
 * User must re-login to continue.
 */
const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_MIDCINE_SESSION_LOCK_MIN ?? '15');
const IDLE_MS = IDLE_MINUTES * 60_000;
const WARN_BEFORE_MS = 60_000; // warn 1 min before lock

export function SessionLock() {
  const router = useRouter();
  const [warn, setWarn] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!currentUser()) return;

    let lastActivity = Date.now();
    let warnTimer: number | null = null;
    let lockTimer: number | null = null;
    let tickTimer: number | null = null;

    function schedule() {
      if (warnTimer) window.clearTimeout(warnTimer);
      if (lockTimer) window.clearTimeout(lockTimer);
      if (tickTimer) window.clearInterval(tickTimer);
      setWarn(false);
      warnTimer = window.setTimeout(() => {
        setWarn(true);
        setRemaining(Math.round(WARN_BEFORE_MS / 1000));
        tickTimer = window.setInterval(() => {
          const left = Math.max(0, IDLE_MS - (Date.now() - lastActivity));
          setRemaining(Math.ceil(left / 1000));
        }, 1000);
      }, IDLE_MS - WARN_BEFORE_MS);
      lockTimer = window.setTimeout(() => {
        logout();
        router.push('/login?reason=idle_lock');
      }, IDLE_MS);
    }

    function poke() {
      lastActivity = Date.now();
      schedule();
    }

    schedule();
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const e of events) {
      window.addEventListener(e, poke, { passive: true });
    }
    return () => {
      for (const e of events) window.removeEventListener(e, poke);
      if (warnTimer) window.clearTimeout(warnTimer);
      if (lockTimer) window.clearTimeout(lockTimer);
      if (tickTimer) window.clearInterval(tickTimer);
    };
  }, [router]);

  if (!warn) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs shadow-lg backdrop-blur">
      <Lock className="h-4 w-4 text-amber-400" />
      <div>
        <div className="font-bold text-amber-200">Session about to lock</div>
        <div className="text-[10px] text-amber-300">
          Auto-lock in {remaining}s · move mouse to stay signed in
        </div>
      </div>
    </div>
  );
}
