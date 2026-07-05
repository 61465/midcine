'use client';

import { useEffect, useState } from 'react';
import { Save, PenLine, Send, Mic, Check } from 'lucide-react';

interface Prefs {
  signerName: string;
  signerLicense: string;
  referrerName: string;
  referrerPhone: string;
  voiceLanguage: 'ar' | 'en' | 'auto';
  autoSendOnSign: boolean;
  reportLanguage: 'ar' | 'en';
}

const DEFAULTS: Prefs = {
  signerName: '',
  signerLicense: '',
  referrerName: '',
  referrerPhone: '',
  voiceLanguage: 'auto',
  autoSendOnSign: false,
  reportLanguage: 'ar',
};

// One-to-one localStorage keys — matches keys the composer already uses,
// so settings changes take effect immediately without any migration.
const KEY_MAP: Record<keyof Prefs, string> = {
  signerName: 'midcine.signerName',
  signerLicense: 'midcine.signerLicense',
  referrerName: 'midcine.lastReferrerName',
  referrerPhone: 'midcine.lastReferrerPhone',
  voiceLanguage: 'midcine.voiceLanguage',
  autoSendOnSign: 'midcine.autoSendOnSign',
  reportLanguage: 'midcine.reportLanguage',
};

function load(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  const out = { ...DEFAULTS };
  for (const k of Object.keys(KEY_MAP) as (keyof Prefs)[]) {
    const raw = window.localStorage.getItem(KEY_MAP[k]);
    if (raw === null) continue;
    if (typeof DEFAULTS[k] === 'boolean') {
      (out as any)[k] = raw === 'true';
    } else {
      (out as any)[k] = raw;
    }
  }
  return out;
}

function save(prefs: Prefs) {
  for (const k of Object.keys(KEY_MAP) as (keyof Prefs)[]) {
    window.localStorage.setItem(KEY_MAP[k], String(prefs[k]));
  }
}

export function SettingsForm() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPrefs(load()), []);

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function submit() {
    save(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="mb-4 flex items-center gap-2">
          <PenLine className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-bold text-slate-200">Signer identity</h2>
        </div>
        <p className="mb-4 text-[11px] text-slate-500">
          Used when you sign a report. Auto-filled by the sign dialog.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Full name">
            <input
              value={prefs.signerName}
              onChange={(e) => update('signerName', e.target.value)}
              placeholder="Dr. Full Name"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </Field>
          <Field label="License #">
            <input
              value={prefs.signerLicense}
              onChange={(e) => update('signerLicense', e.target.value)}
              placeholder="RAD-1234"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Send className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-200">Referrer defaults</h2>
        </div>
        <p className="mb-4 text-[11px] text-slate-500">
          Where signed reports go when you press W (Send).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Referrer name">
            <input
              value={prefs.referrerName}
              onChange={(e) => update('referrerName', e.target.value)}
              placeholder="Dr. Referrer"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </Field>
          <Field label="WhatsApp number">
            <input
              value={prefs.referrerPhone}
              onChange={(e) => update('referrerPhone', e.target.value)}
              placeholder="+201002233445"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </Field>
        </div>
        <Toggle
          label="Auto-send to referrer when I sign"
          checked={prefs.autoSendOnSign}
          onChange={(v) => update('autoSendOnSign', v)}
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Mic className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-slate-200">Voice + reports</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Voice language">
            <select
              value={prefs.voiceLanguage}
              onChange={(e) => update('voiceLanguage', e.target.value as any)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="auto">Auto-detect</option>
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Report language">
            <select
              value={prefs.reportLanguage}
              onChange={(e) => update('reportLanguage', e.target.value as any)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <Check className="h-3 w-3" />
            Saved
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          className="flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400"
        >
          <Save className="h-4 w-4" />
          Save preferences
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-4 flex cursor-pointer items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          'relative h-5 w-9 rounded-full transition ' + (checked ? 'bg-cyan-500' : 'bg-slate-700')
        }
      >
        <div
          className={
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition ' +
            (checked ? 'left-4' : 'left-0.5')
          }
        />
      </button>
      <span className="select-none text-xs text-slate-300">{label}</span>
    </label>
  );
}
