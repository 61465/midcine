'use client';

import { useState } from 'react';
import { Loader2, Check, Mail } from 'lucide-react';

export function WaitlistForm({ variant = 'inline' }: { variant?: 'inline' | 'hero' }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Radiologist');
  const [country, setCountry] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [position, setPosition] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setState('busy');
    setErr(null);
    try {
      const r = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ email, name, role, country }),
      });
      const d = await r.json();
      if (d.ok) {
        setState('done');
        setPosition(d.position);
      } else {
        setState('error');
        setErr(d.error ?? 'Something went wrong');
      }
    } catch (e: any) {
      setState('error');
      setErr(String(e?.message ?? e));
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
        <Check className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
        <div className="text-sm font-bold text-emerald-300">You're in.</div>
        <div className="mt-1 text-xs text-emerald-200">
          You're #{position} on the launch list. We'll email you when the beta opens.
        </div>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your work email"
          required
          className="flex-1 rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === 'busy'}
          className="flex items-center justify-center gap-2 rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          {state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Join waitlist
        </button>
        {err && <div className="basis-full text-xs text-rose-400">{err}</div>}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email *"
          required
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
        >
          <option>Radiologist</option>
          <option>Radiology resident</option>
          <option>Referring physician</option>
          <option>Radiology tech</option>
          <option>Clinic owner</option>
          <option>Other</option>
        </select>
        <input
          type="text"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country"
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={state === 'busy'}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-500 py-3 text-sm font-bold text-slate-950 hover:from-fuchsia-400 hover:to-cyan-400 disabled:opacity-50"
      >
        {state === 'busy' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        Reserve my spot
      </button>
      {err && <div className="text-center text-xs text-rose-400">{err}</div>}
    </form>
  );
}
