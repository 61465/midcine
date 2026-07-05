// Reading Room design tokens — dark, quiet, radiology-optimized.
// Reading rooms are dark: dilated pupils see subtle grayscale better.
// Every color chosen for zero eye strain during 8-hour shifts.

export const roomTheme = {
  // Backgrounds — near-black with a hint of cool blue (feels calm, not oppressive)
  bg: {
    canvas: '#0A0E14', // main viewport bg
    panel: '#111827', // side panels
    surface: '#1E293B', // cards + inputs
    elevated: '#334155', // hover / active
    overlay: 'rgba(10, 14, 20, 0.85)', // modal backdrop
  },

  // Text — off-white to reduce contrast fatigue
  text: {
    primary: '#E2E8F0',
    secondary: '#94A3B8',
    muted: '#64748B',
    dim: '#475569',
  },

  // Accents — cyan for AI, gold for signatures/premium, red for urgent
  accent: {
    ai: '#22D3EE', // cyan — AI outputs, insights
    aiGlow: 'rgba(34, 211, 238, 0.15)',
    urgent: '#F87171', // urgent priority
    urgentBg: 'rgba(248, 113, 113, 0.1)',
    sign: '#FBBF24', // gold — signature moments
    ok: '#4ADE80', // green — signed, delivered
    warn: '#FB923C', // amber — pending review
  },

  // Borders — barely visible but present
  border: {
    subtle: '#1E293B',
    default: '#334155',
    accent: '#22D3EE',
  },

  // Shadows — very subtle, only for elevated surfaces
  shadow: {
    md: '0 4px 20px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 40px rgba(0, 0, 0, 0.5)',
    glow: '0 0 0 1px rgba(34, 211, 238, 0.3), 0 0 20px rgba(34, 211, 238, 0.15)',
  },
};

// Tailwind class name shortcuts — use in components
export const roomClass = {
  bg: 'bg-[#0A0E14]',
  panel: 'bg-[#111827]',
  surface: 'bg-[#1E293B]',
  elevated: 'bg-[#334155]',

  text: 'text-slate-200',
  textMuted: 'text-slate-400',
  textDim: 'text-slate-500',

  border: 'border-slate-800',
  borderSubtle: 'border-slate-800/60',

  accent: 'text-cyan-400',
  accentBg: 'bg-cyan-500/10',
  accentBorder: 'border-cyan-500/30',

  urgent: 'text-rose-400',
  urgentBg: 'bg-rose-500/10',

  gold: 'text-amber-400',
  goldBg: 'bg-amber-500/10',

  ok: 'text-emerald-400',
  okBg: 'bg-emerald-500/10',
};
