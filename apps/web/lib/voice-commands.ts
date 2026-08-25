// Voice command grammar + parser for midcine hands-free control.
// English only.

export type CommandIntent =
  | 'next-case'
  | 'prev-case'
  | 'first-case'
  | 'open-compare'
  | 'open-3d'
  | 'open-mpr'
  | 'open-mip'
  | 'open-2d'
  | 'open-grid'
  | 'run-ai-impression'
  | 'run-critical-scan'
  | 'sign-report'
  | 'send-report'
  | 'open-history'
  | 'close-dialog'
  | 'ship-report'
  | 'help';

export interface ParsedCommand {
  intent: CommandIntent;
  params?: Record<string, string>;
  matched: string;
}

interface CommandDef {
  intent: CommandIntent;
  patterns: string[];
  paramNames?: string[];
  description: string;
}

export const COMMANDS: CommandDef[] = [
  { intent: 'next-case', patterns: ['next case', 'next'], description: 'Move to the next study in the worklist' },
  { intent: 'prev-case', patterns: ['previous case', 'previous', 'prev', 'back'], description: 'Move to the previous study' },
  { intent: 'first-case', patterns: ['first case', 'start', 'beginning'], description: 'Jump to the first case in the worklist' },
  { intent: 'open-compare', patterns: ['open compare', 'compare with prior', 'compare'], description: 'Open side-by-side comparison with most recent prior' },
  { intent: 'open-3d', patterns: ['open 3d', '3d view', 'three d'], description: 'Switch viewer to 3D volume rendering' },
  { intent: 'open-mpr', patterns: ['open mpr', 'mpr view', 'mpr', 'multiplanar'], description: 'Switch viewer to MPR (Axial/Sagittal/Coronal)' },
  { intent: 'open-mip', patterns: ['open mip', 'mip view', 'mip'], description: 'Switch viewer to Maximum Intensity Projection' },
  { intent: 'open-2d', patterns: ['open 2d', '2d view', 'stack'], description: 'Switch viewer back to 2D stack' },
  { intent: 'open-grid', patterns: ['all slices', 'show all', 'grid'], description: 'Show all slices as thumbnails' },
  { intent: 'run-ai-impression', patterns: ['ai impression', 'generate impression', 'draft impression'], description: 'Generate ACR Impression from Findings' },
  { intent: 'run-critical-scan', patterns: ['scan critical', 'critical check', 'red flag'], description: 'Re-run critical alert scan on findings' },
  { intent: 'sign-report', patterns: ['sign report', 'sign'], description: 'Open sign dialog' },
  { intent: 'send-report', paramNames: ['to'], patterns: ['send report to {to}', 'send to {to}'], description: 'Open send dialog pre-selecting a referrer' },
  { intent: 'ship-report', patterns: ['ship report', 'ship', 'complete and send'], description: 'One-click: AI Impression + Sign + Send' },
  { intent: 'open-history', patterns: ['open history', 'patient history', 'history'], description: "Open the patient's medical history page" },
  { intent: 'close-dialog', patterns: ['close', 'cancel', 'exit'], description: 'Close current dialog / overlay' },
  { intent: 'help', patterns: ['help', 'commands', 'what can you do'], description: 'Show list of available voice commands' },
];

const WAKE_PREFIXES = ['hey midcine ', 'midcine ', 'command '];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?/#$%^&*;:{}=_`~()"'\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripWake(s: string): string {
  const n = ' ' + normalize(s) + ' ';
  for (const w of WAKE_PREFIXES) {
    const wn = ' ' + normalize(w) + ' ';
    if (n.startsWith(wn)) return n.slice(wn.length).trim();
  }
  return n.trim();
}

export function parseCommand(text: string): ParsedCommand | null {
  if (!text) return null;
  const target = stripWake(text);
  if (!target) return null;

  for (const def of COMMANDS) {
    for (const pattern of def.patterns) {
      const paramMatch = pattern.match(/{(\w+)}/g);
      if (paramMatch) {
        const parts = pattern.split(/\{(\w+)\}/g);
        const paramNames: string[] = [];
        const regexParts: string[] = [];
        for (let i = 0; i < parts.length; i++) {
          if (i % 2 === 0) {
            regexParts.push(normalize(parts[i]!).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
          } else {
            paramNames.push(parts[i]!);
            regexParts.push('(.+?)');
          }
        }
        const rx = new RegExp('^' + regexParts.join('\\s*') + '$');
        const m = target.match(rx);
        if (m) {
          const params: Record<string, string> = {};
          for (let i = 0; i < paramNames.length; i++) {
            params[paramNames[i]!] = (m[i + 1] ?? '').trim();
          }
          return { intent: def.intent, params, matched: pattern };
        }
      } else {
        const p = normalize(pattern);
        if (target === p || target.startsWith(p + ' ') || target.endsWith(' ' + p)) {
          return { intent: def.intent, matched: pattern };
        }
      }
    }
  }
  return null;
}

export function listCommands(): { intent: string; description: string; example: string }[] {
  return COMMANDS.map((c) => ({
    intent: c.intent,
    description: c.description,
    example: c.patterns[0]!,
  }));
}
