'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { currentUser, type User } from '../../../lib/auth';

// Client-side guard — redirects to /login when no user or trial expired.
// Not a security boundary; server-side auth comes when we ship real Stripe.

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const u = currentUser();
    if (!u) {
      router.push('/signup');
      return;
    }
    if (u.plan === 'expired') {
      router.push('/billing');
      return;
    }
    setUser(u);
    function onAuthChange() {
      setUser(currentUser());
    }
    window.addEventListener('midcine:auth-changed', onAuthChange);
    return () => window.removeEventListener('midcine:auth-changed', onAuthChange);
  }, [router]);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0E14] text-xs text-slate-500">
        Loading…
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
