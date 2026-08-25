'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  User,
  Heart,
  Pill,
  Users,
  Cigarette,
  Wine,
  Briefcase,
  Phone,
  Loader2,
  Check,
} from 'lucide-react';
import {
  fetchPatient,
  fetchPatientStudies,
  savePatient,
  type Patient,
  type Study,
} from '../../../lib/studies';

function chipsToList(s: string): string[] {
  return s
    .split(/[,;\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function listToText(a: string[] | undefined): string {
  return (a ?? []).join(', ');
}

const BLANK: Patient = {
  patient_id: '',
  patient_name: '',
  age: null,
  sex: null,
  blood_type: null,
  allergies: [],
  chronic_conditions: [],
  current_meds: [],
  surgeries: [],
  family_history: [],
  smoking: '',
  alcohol: '',
  occupation: '',
  phone: '',
  emergency_contact: '',
  notes: '',
  referrer: null,
  hospital_id: 'default',
};

export default function PatientHistoryPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = use(params);
  const [patient, setPatient] = useState<Patient>({ ...BLANK, patient_id: pid });
  const [studies, setStudies] = useState<Study[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chipInputs, setChipInputs] = useState({
    allergies: '',
    chronic_conditions: '',
    current_meds: '',
    surgeries: '',
    family_history: '',
  });

  useEffect(() => {
    void fetchPatient(pid).then((p) => {
      if (p) {
        setPatient(p);
        setChipInputs({
          allergies: listToText(p.allergies),
          chronic_conditions: listToText(p.chronic_conditions),
          current_meds: listToText(p.current_meds),
          surgeries: listToText(p.surgeries),
          family_history: listToText(p.family_history),
        });
      }
    });
    void fetchPatientStudies(pid).then(setStudies);
  }, [pid]);

  const save = useCallback(async () => {
    setBusy(true);
    const payload: Patient = {
      ...patient,
      patient_id: pid,
      allergies: chipsToList(chipInputs.allergies),
      chronic_conditions: chipsToList(chipInputs.chronic_conditions),
      current_meds: chipsToList(chipInputs.current_meds),
      surgeries: chipsToList(chipInputs.surgeries),
      family_history: chipsToList(chipInputs.family_history),
    };
    const res = await savePatient(payload);
    setBusy(false);
    if (res) {
      setSaved(true);
      setPatient(res);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [patient, pid, chipInputs]);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link
            href="/room"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Reading room
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <User className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-bold">Patient history</span>
          <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            MRN {pid}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex items-center gap-1.5 rounded bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 p-6 lg:grid-cols-3">
        {/* Column 1: identity */}
        <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-cyan-400">
            <User className="h-3 w-3" /> Identity
          </h2>
          <Field
            label="Full name"
            value={patient.patient_name}
            onChange={(v) => setPatient({ ...patient, patient_name: v })}
          />
          <div className="grid grid-cols-3 gap-2">
            <NumField
              label="Age"
              value={patient.age}
              onChange={(v) => setPatient({ ...patient, age: v })}
            />
            <SelectField
              label="Sex"
              value={patient.sex ?? ''}
              options={['', 'M', 'F']}
              onChange={(v) => setPatient({ ...patient, sex: v || null })}
            />
            <SelectField
              label="Blood"
              value={patient.blood_type ?? ''}
              options={['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']}
              onChange={(v) => setPatient({ ...patient, blood_type: v || null })}
            />
          </div>
          <Field
            label="Occupation"
            icon={<Briefcase className="h-3 w-3" />}
            value={patient.occupation}
            onChange={(v) => setPatient({ ...patient, occupation: v })}
          />
          <Field
            label="Phone"
            icon={<Phone className="h-3 w-3" />}
            value={patient.phone}
            onChange={(v) => setPatient({ ...patient, phone: v })}
            placeholder="+9665..."
          />
          <Field
            label="Emergency contact"
            value={patient.emergency_contact}
            onChange={(v) => setPatient({ ...patient, emergency_contact: v })}
            placeholder="Name + phone"
          />
        </section>

        {/* Column 2: medical */}
        <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-fuchsia-400">
            <Heart className="h-3 w-3" /> Medical
          </h2>
          <ChipsField
            label="Allergies"
            value={chipInputs.allergies}
            onChange={(v) => setChipInputs({ ...chipInputs, allergies: v })}
            placeholder="Penicillin, contrast dye"
            color="rose"
          />
          <ChipsField
            label="Chronic conditions"
            value={chipInputs.chronic_conditions}
            onChange={(v) => setChipInputs({ ...chipInputs, chronic_conditions: v })}
            placeholder="HTN, DM type 2, CAD"
            color="amber"
          />
          <ChipsField
            label="Current medications"
            icon={<Pill className="h-3 w-3" />}
            value={chipInputs.current_meds}
            onChange={(v) => setChipInputs({ ...chipInputs, current_meds: v })}
            placeholder="Amlodipine 10mg, Metformin 500mg"
            color="cyan"
          />
          <ChipsField
            label="Past surgeries"
            value={chipInputs.surgeries}
            onChange={(v) => setChipInputs({ ...chipInputs, surgeries: v })}
            placeholder="Appendectomy 2018, ACL repair 2019"
            color="slate"
          />
          <ChipsField
            label="Family history"
            icon={<Users className="h-3 w-3" />}
            value={chipInputs.family_history}
            onChange={(v) => setChipInputs({ ...chipInputs, family_history: v })}
            placeholder="Mother — breast cancer, Father — MI 55"
            color="fuchsia"
          />
        </section>

        {/* Column 3: lifestyle + prior imaging */}
        <section className="space-y-3">
          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
              <Cigarette className="h-3 w-3" /> Lifestyle
            </h2>
            <Field
              label="Smoking"
              icon={<Cigarette className="h-3 w-3" />}
              value={patient.smoking}
              onChange={(v) => setPatient({ ...patient, smoking: v })}
              placeholder="1 pack/day for 20y · never · quit 2020"
            />
            <Field
              label="Alcohol"
              icon={<Wine className="h-3 w-3" />}
              value={patient.alcohol}
              onChange={(v) => setPatient({ ...patient, alcohol: v })}
              placeholder="Occasional · none · daily"
            />
            <label className="block text-[11px]">
              <span className="text-slate-400">Notes</span>
              <textarea
                value={patient.notes}
                onChange={(e) => setPatient({ ...patient, notes: e.target.value })}
                rows={4}
                placeholder="Free-form notes about the patient…"
                className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Prior imaging ({studies.length})
            </h2>
            {studies.length === 0 && (
              <div className="text-xs text-slate-500">No studies for this patient yet.</div>
            )}
            {studies.map((s) => (
              <Link
                key={s.study_uid}
                href={`/room?study=${encodeURIComponent(s.study_uid)}`}
                className="block rounded border border-slate-800 p-2 text-xs hover:border-cyan-500/40 hover:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {s.modality} · {s.body_part}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(s.study_date).toLocaleDateString()}
                  </span>
                </div>
                {s.description && (
                  <div className="mt-0.5 text-[10px] text-slate-400">{s.description}</div>
                )}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// ==== helper fields ====
function Field({
  label,
  value,
  onChange,
  placeholder,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="block text-[11px]">
      <span className="flex items-center gap-1 text-slate-400">
        {icon} {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 focus:border-cyan-500 focus:outline-none"
      />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block text-[11px]">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 focus:border-cyan-500 focus:outline-none"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-[11px]">
      <span className="text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 focus:border-cyan-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || '—'}
          </option>
        ))}
      </select>
    </label>
  );
}

const CHIP_COLOR: Record<string, string> = {
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  slate: 'border-slate-700 bg-slate-800 text-slate-300',
  fuchsia: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300',
};

function ChipsField({
  label,
  value,
  onChange,
  placeholder,
  color = 'slate',
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  color?: keyof typeof CHIP_COLOR;
  icon?: React.ReactNode;
}) {
  const chips = chipsToList(value);
  return (
    <label className="block text-[11px]">
      <span className="flex items-center gap-1 text-slate-400">
        {icon} {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 focus:border-cyan-500 focus:outline-none"
      />
      {chips.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {chips.map((c, i) => (
            <span
              key={i}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${CHIP_COLOR[color]}`}
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <span className="mt-0.5 block text-[9px] text-slate-600">Separate with commas</span>
    </label>
  );
}
