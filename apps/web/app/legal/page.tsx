import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Shield, FileText, Server } from 'lucide-react';

export const metadata = {
  title: 'midcine — Legal Disclaimer',
  description:
    'AI assistant use policy, radiologist responsibility, and data handling for midcine.',
};

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-sm font-bold">Legal Disclaimer — midcine</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10 text-sm leading-relaxed text-slate-300">
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <h1 className="text-lg font-bold">
              AI assistant — not a medical device
            </h1>
          </div>
          <p className="text-amber-100">
            midcine is an AI-assisted drafting tool for radiology reports. It is
            <strong> NOT </strong>a diagnostic device and has
            <strong> NO FDA, CE, or CDSCO clearance</strong>. All AI outputs are
            drafts intended for review by a licensed radiologist.
          </p>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-100">
            <FileText className="h-4 w-4 text-cyan-400" />
            Purpose and scope
          </h2>
          <p>
            This platform is intended solely for use by licensed medical
            professionals as a productivity aid in non-emergent radiology
            workflows. It is not a replacement for human expertise, peer review,
            or clinical judgement.
          </p>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-100">
            <Shield className="h-4 w-4 text-cyan-400" />
            Radiologist responsibility
          </h2>
          <p>
            The <strong>licensed radiologist</strong> retains full professional
            and legal responsibility for all interpretations, diagnoses, and
            report content. AI output must be:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Thoroughly reviewed for accuracy and completeness</li>
            <li>
              Edited as necessary to reflect the radiologist&apos;s professional
              judgement
            </li>
            <li>
              Signed only after the radiologist confirms all findings against
              the original images
            </li>
          </ul>
          <p className="mt-2">
            Use of this tool does not transfer or reduce the radiologist&apos;s
            duty of care.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-slate-100">
            Known limitations of the AI
          </h2>
          <p>The AI may:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Miss</strong> subtle, rare, or complex findings (early
              pathology, incidentalomas, unusual variants)
            </li>
            <li>
              <strong>Hallucinate</strong> — generate false positives or false
              negatives
            </li>
            <li>
              <strong>Misinterpret artefacts</strong> (motion, beam-hardening,
              partial-volume) as pathology
            </li>
            <li>
              Fail to recognise pediatric-specific conditions or account for
              clinical context absent from the DICOM images
            </li>
            <li>Be adversely affected by low image quality or unusual protocols</li>
          </ul>
          <p className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-rose-100">
            <strong>Do not use</strong> for pediatric cases, emergencies, or
            time-critical scenarios without direct radiologist review of the raw
            images.
          </p>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-100">
            <Server className="h-4 w-4 text-cyan-400" />
            Data handling and privacy
          </h2>
          <p>
            <strong>Local storage.</strong> All DICOM images and draft reports
            are processed and stored locally on the deployment machine. No data
            leaves the local network unless explicitly exported by the user.
          </p>
          <p className="mt-2">
            <strong>Cloud AI.</strong> When cloud vision AI is invoked, only the
            rendered image tiles are transmitted — never the raw DICOM headers
            or PHI-carrying tags. The doctor may disable cloud AI in Settings.
          </p>
          <p className="mt-2">
            <strong>Audit log.</strong> Every AI request, draft generation,
            edit, and sign action is recorded with timestamp and user
            identifier. Logs are retained locally for a minimum of 7 years.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-slate-100">
            Liability
          </h2>
          <p>
            The platform provider, developers, and hosting entities disclaim all
            liability for errors, omissions, or adverse outcomes arising from
            the use of AI-generated content. The radiologist and their
            institution assume all clinical risk associated with its use.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-slate-100">Contact</h2>
          <p>
            For issues, incidents, or feedback, contact the platform
            administrator through your institution&apos;s IT channel.
          </p>
        </section>

        <div className="mt-8 border-t border-slate-800 pt-4 text-[11px] text-slate-500">
          Last updated: {new Date().toISOString().slice(0, 10)}. This document is
          a pre-pilot disclaimer for evaluation purposes and does not
          constitute a legal agreement.
        </div>
      </main>
    </div>
  );
}
