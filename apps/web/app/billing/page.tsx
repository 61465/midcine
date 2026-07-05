'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, Loader2, ArrowLeft, Star } from 'lucide-react';
import { currentUser, upgradeToPro, daysRemainingInTrial, type User } from '../../lib/auth';

const INCLUDES = [
  'Unlimited reports',
  'Voice dictation',
  'Templates + snippets',
  'WhatsApp auto-delivery',
  'Multi-referrer directory',
  'Pathology atlas',
  'Local-first — your data',
];

export default function BillingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = currentUser();
    if (!u) {
      router.push('/signup');
      return;
    }
    setUser(u);
  }, [router]);

  async function upgrade() {
    setBusy(true);
    // Real Stripe checkout would open here. For now — direct upgrade in
    // localStorage so the trial-expired path becomes navigable.
    await new Promise((r) => setTimeout(r, 800));
    upgradeToPro();
    setBusy(false);
    router.push('/room');
  }

  if (!user) return null;

  const daysLeft = daysRemainingInTrial();
  const isExpired = user.plan === 'expired';
  const isPro = user.plan === 'pro';

  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200">
      <nav className="border-b border-slate-800/50 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="text-sm font-bold">Billing</div>
        </div>
      </nav>

      <div className="mx-auto max-w-md p-6 pt-16">
        {isExpired && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            Your trial has ended. Upgrade to continue reading.
          </div>
        )}
        {isPro && (
          <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            You're on midcine Pro. Thanks for supporting the work.
          </div>
        )}

        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(circle at top right, rgba(34,211,238,0.15), transparent 60%)',
            }}
          />
          <div className="relative">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
              <Star className="h-3 w-3 fill-cyan-300" />
              midcine Pro
            </div>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-5xl font-black">$79</span>
              <span className="text-slate-500">/month</span>
            </div>
            {user.plan === 'trial' && (
              <div className="mb-6 text-xs text-cyan-300">
                {daysLeft > 0 ? `${daysLeft} days left in your trial` : 'Trial expires today'}
              </div>
            )}
            {isExpired && <div className="mb-6 text-xs text-amber-300">Trial expired</div>}
            {isPro && <div className="mb-6 text-xs text-emerald-300">Active subscription</div>}

            <ul className="mb-6 space-y-1.5">
              {INCLUDES.map((line) => (
                <li key={line} className="flex items-center gap-2 text-xs text-slate-300">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
                    <Check className="h-2.5 w-2.5" />
                  </div>
                  {line}
                </li>
              ))}
            </ul>

            {!isPro && (
              <button
                type="button"
                onClick={upgrade}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Upgrade now
                  </>
                )}
              </button>
            )}
            {isPro && (
              <Link
                href="/room"
                className="block rounded-full bg-slate-800 py-3 text-center text-sm font-bold text-slate-200 hover:bg-slate-700"
              >
                Back to Reading Room
              </Link>
            )}

            <p className="mt-4 text-center text-[10px] text-slate-500">
              Real Stripe integration ships this week. For now, upgrading flips your local plan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
