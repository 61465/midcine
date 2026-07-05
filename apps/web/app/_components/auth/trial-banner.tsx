'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import { currentUser, daysRemainingInTrial, type User } from '../../../lib/auth';

export function TrialBanner() {
  const [user, setUser] = useState<User | null>(null);
  const [days, setDays] = useState(0);

  useEffect(() => {
    setUser(currentUser());
    setDays(daysRemainingInTrial());
    const h = () => {
      setUser(currentUser());
      setDays(daysRemainingInTrial());
    };
    window.addEventListener('midcine:auth-changed', h);
    return () => window.removeEventListener('midcine:auth-changed', h);
  }, []);

  if (!user || user.plan !== 'trial') return null;

  const urgent = days <= 3;
  const bg = urgent
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';

  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] ${bg}`}>
      <Clock className="h-3 w-3" />
      <span>
        {days === 0
          ? 'Trial expires today'
          : days === 1
            ? 'Trial ends tomorrow'
            : `${days} days left in trial`}
      </span>
      <Link
        href="/billing"
        className="ml-1 flex items-center gap-0.5 rounded-full bg-white/10 px-2 py-0.5 font-bold hover:bg-white/20"
      >
        Upgrade
        <ArrowRight className="h-2.5 w-2.5" />
      </Link>
    </div>
  );
}
