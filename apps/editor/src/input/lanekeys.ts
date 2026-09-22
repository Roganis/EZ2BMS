// Which keyboard key plays which lane. EZ2PORT's defaults (keys.example.ini)
// unless the player's own <game>/ez2port/keys.ini says otherwise: Z S X D C
// for keys 1-5, V B for 6-7, Ctrl/Shift for the turntable, Space for the
// pedal, F G H J for the effectors; 2P mirrored on M K , L . / ; with the
// right-hand modifiers. Keyed by KeyboardEvent.code, so the keyboard's
// layout does not matter.

/** keys.ini channel -> bmson lane. */
export const CHANNEL_LANE: Record<string, number> = {
  Key1: 11,
  Key2: 12,
  Key3: 13,
  Key4: 14,
  Key5: 15,
  Key6: 31,
  Key7: 32,
  Scratch1: 1,
  Scratch2: 1,
  Pedal: 10,
  Effect1: 31,
  Effect2: 32,
  Effect3: 33,
  Effect4: 34,
  P2Key1: 21,
  P2Key2: 22,
  P2Key3: 23,
  P2Key4: 24,
  P2Key5: 25,
  P2Key6: 33,
  P2Key7: 34,
  P2Scratch1: 2,
  P2Scratch2: 2,
  P2Pedal: 20,
};

/** EZ2PORT's default bindings, as keys.ini would write them. */
export const DEFAULT_BINDINGS: Record<string, string[]> = {
  Key1: ['Z'],
  Key2: ['S'],
  Key3: ['X'],
  Key4: ['D'],
  Key5: ['C'],
  Key6: ['V'],
  Key7: ['B'],
  Scratch1: ['Left Ctrl'],
  Scratch2: ['Left Shift'],
  Pedal: ['Space'],
  Effect1: ['F'],
  Effect2: ['G'],
  Effect3: ['H'],
  Effect4: ['J'],
  P2Key1: ['M'],
  P2Key2: ['K'],
  P2Key3: [','],
  P2Key4: ['L'],
  P2Key5: ['.'],
  P2Key6: ['/'],
  P2Key7: [';'],
  P2Scratch1: ['Right Ctrl'],
  P2Scratch2: ['Right Shift'],
  P2Pedal: ['Right Alt'],
};

const NAMED: Record<string, string> = {
  space: 'Space',
  return: 'Enter',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  escape: 'Escape',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  'left ctrl': 'ControlLeft',
  'right ctrl': 'ControlRight',
  'left shift': 'ShiftLeft',
  'right shift': 'ShiftRight',
  'left alt': 'AltLeft',
  'right alt': 'AltRight',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '\\': 'Backslash',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '-': 'Minus',
  '=': 'Equal',
  '`': 'Backquote',
};

/** An SDL scancode name (as keys.ini writes it) to a KeyboardEvent.code. */
export function sdlToCode(name: string): string | undefined {
  const n = name.trim();
  if (/^[A-Za-z]$/.test(n)) return `Key${n.toUpperCase()}`;
  if (/^[0-9]$/.test(n)) return `Digit${n}`;
  if (/^F([1-9]|1[0-2])$/i.test(n)) return n.toUpperCase();
  const kp = /^keypad ([0-9])$/i.exec(n);
  if (kp) return `Numpad${kp[1]}`;
  return NAMED[n.toLowerCase()];
}

/** Split an .ini value: alternates by commas, quotes protect , ; and \\. */
function values(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const c of raw) {
    if (q) {
      if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ';') break;
    else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out.filter((v, i, a) => v !== '' || a.length === 1);
}

/** keys.ini text -> code -> lane. Channels it does not mention keep EZ2PORT's defaults. */
export function laneKeysFromIni(text: string | null): Record<string, number> {
  const bind: Record<string, string[]> = { ...DEFAULT_BINDINGS };
  if (text) {
    let inKeys = false;
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith('[')) {
        inKeys = /^\[keys\]/i.test(t);
        continue;
      }
      if (!inKeys || t.startsWith(';') || !t.includes('=')) continue;
      const eq = t.indexOf('=');
      const ch = t.slice(0, eq).trim();
      if (!(ch in CHANNEL_LANE)) continue;
      bind[ch] = values(t.slice(eq + 1)).filter(Boolean);
    }
  }
  const map: Record<string, number> = {};
  for (const [ch, names] of Object.entries(bind)) {
    for (const n of names) {
      const code = sdlToCode(n);
      if (code && !(code in map)) map[code] = CHANNEL_LANE[ch]!;
    }
  }
  return map;
}

export const DEFAULT_LANE_KEYS = laneKeysFromIni(null);

/** The lane a key plays in a mode, if the mode has that lane. */
export function laneForKey(
  code: string,
  lanes: ReadonlySet<number>,
  map = DEFAULT_LANE_KEYS,
): number | undefined {
  const x = map[code];
  return x !== undefined && lanes.has(x) ? x : undefined;
}
