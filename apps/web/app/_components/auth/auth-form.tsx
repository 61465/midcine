'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { signup, login } from '../../../lib/auth';

interface Props {
  mode: 'signup' | 'login';
}

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        signup(email, name, password);
      } else {
        const u = login(email, password);
        if (!u) {
          setError('No account with that email on this device. Sign up first.');
          return;
        }
      }
      router.push('/room');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200">
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
        <div className="w-full">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-lg font-black">midcine</span>
          </Link>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8">
            <h1 className="mb-1 text-xl font-black text-slate-100">
              {isSignup ? 'Start your 14-day trial' : 'Welcome back'}
            </h1>
            <p className="mb-6 text-xs text-slate-500">
              {isSignup
                ? 'No card required. Try every feature. Cancel anytime.'
                : 'Sign in to your midcine account.'}
            </p>

            <form onSubmit={submit} className="space-y-3">
              {isSignup && (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Full name
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Full Name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Password
                </label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {isSignup ? 'Start free trial' : 'Sign in'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-slate-500">
              {isSignup ? (
                <>
                  Already have an account?{' '}
                  <Link href="/login" className="text-cyan-400 hover:underline">
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  New to midcine?{' '}
                  <Link href="/signup" className="text-cyan-400 hover:underline">
                    Start free trial
                  </Link>
                </>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] text-slate-600">
            Local-first: your credentials never leave this device.
          </p>
        </div>
      </div>
    </div>
  );
}
