import Link from 'next/link';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { SettingsForm } from '../_components/settings/settings-form';

export const metadata = {
  title: 'midcine — Settings',
};

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-bold text-slate-200">Preferences</span>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <SettingsForm />
      </div>
    </div>
  );
}
