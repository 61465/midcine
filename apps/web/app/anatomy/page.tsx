import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { AnatomyLab } from '../_components/anatomy/anatomy-lab';

export const metadata = {
  title: 'midcine — Pathology Atlas',
};

export default function AnatomyPage() {
  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-bold text-slate-200">Pathology Atlas</span>
          </div>
          <span className="ml-auto text-[10px] text-slate-500">
            21 conditions · visual reference
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-7xl">
        <AnatomyLab />
      </div>
    </div>
  );
}
