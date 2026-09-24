// EZ2 mode identities and the names every consumer spells them with.
//
// Sources: EZ2PORT ez2/mode.h (port mode names and file prefixes),
// ez2/bmson.c kModes (the seven mode_hint values the port's importer accepts),
// BMSTWO-EZ2.md section 1 (the gaps: Andromeda and Catch have no convention;
// `ez2-andromeda` and `ez2-catch` are this project's proposals, cabinet-only).

export type ModeId =
  '5k-only' | 'scratch' | 'ruby' | '5k' | '7k' | '10k' | '14k' | 'andromeda' | 'catch';

export interface ModeNames {
  id: ModeId;
  /** What the cabinet calls it. */
  label: string;
  /** bmson `mode_hint`. */
  hint: string;
  /** EZ2PORT mode name (ez2/mode.c), also the `.gds`/`.pvi` folder under system/. */
  portName: string;
  /** Chart file prefix: `<prefix>1p-<key>[-hd|-shd|-ex]`. */
  filePrefix: string;
  /** Whether EZ2PORT's song packages can carry this mode today. */
  portPlayable: boolean;
}

export const MODES: readonly ModeNames[] = [
  {
    id: '5k-only',
    label: '5 KEY ONLY',
    hint: 'ez2-5k-only',
    portName: '5KeyMix',
    filePrefix: '5keymix',
    portPlayable: true,
  },
  {
    id: 'scratch',
    label: 'SCRATCH',
    hint: 'ez2-5k-scratch',
    portName: 'ScratchMix',
    filePrefix: 'scratchmix',
    portPlayable: true,
  },
  {
    id: 'ruby',
    label: 'RUBY',
    hint: 'ez2-ruby',
    portName: 'RubyMix',
    filePrefix: 'rubymix',
    portPlayable: true,
  },
  {
    id: '5k',
    label: '5K STANDARD',
    hint: 'ez2-5k',
    portName: 'StreetMix',
    filePrefix: 'streetmix',
    portPlayable: true,
  },
  {
    id: '7k',
    label: '7 KEY',
    hint: 'ez2-7k',
    portName: '7StreetMix',
    filePrefix: '7streetmix',
    portPlayable: true,
  },
  {
    id: '10k',
    label: '10 KEY',
    hint: 'ez2-10k',
    portName: 'ClubMix',
    filePrefix: 'clubmix',
    portPlayable: true,
  },
  {
    id: '14k',
    label: '14 KEY',
    hint: 'ez2-14k',
    portName: 'SpaceMix',
    filePrefix: 'spacemix',
    portPlayable: true,
  },
  {
    id: 'andromeda',
    label: '16 KEY',
    hint: 'ez2-andromeda',
    portName: 'AndromedaMix',
    filePrefix: 'andromedamix',
    portPlayable: false,
  },
  {
    id: 'catch',
    label: 'EZ2CATCH',
    hint: 'ez2-catch',
    portName: 'EZ2CATCH',
    filePrefix: 'catch',
    portPlayable: false,
  },
];

const byId = new Map(MODES.map((m) => [m.id, m]));

export function modeNames(id: ModeId): ModeNames {
  const m = byId.get(id);
  if (!m) throw new Error(`unknown mode ${id}`);
  return m;
}

export function isModeId(s: string): s is ModeId {
  return byId.has(s as ModeId);
}

/** Exact, case-insensitive: the hint as EZ2BMS writes it. */
export function modeFromHint(hint: string | undefined): ModeId | undefined {
  if (!hint) return undefined;
  const h = hint.toLowerCase();
  return MODES.find((m) => m.hint === h)?.id;
}
