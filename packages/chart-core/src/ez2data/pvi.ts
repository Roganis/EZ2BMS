// `.pvi` - a play field SKIN: where the lanes are, what a note looks like,
// where the judgement, combo, gauge and target bar go. CP949 text, INI-shaped,
// comments after `'`, at system/<mode>/panel/STYLE_<mode><style>_<player>.pvi
// (player 0 = 1P, 1 = 2P).
//
// A transcription of EZ2PORT's ez2/pvi.c, which reads keys BY NAME (the game
// reads them positionally; the shipped files agree either way) and covers the
// sections the port draws. Unknown sections are skipped, never an error.
// Paths are kept as the file spells them (backslashes, `.bmp` for what ships
// as `.abm`, relative to the panel directory unless they start `system\`).

import { atoi, ciEq, ctrim } from './initext';

export interface PviColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PviTrack {
  present: boolean;
  enable: number;
  x: number;
  y: number;
  w: number;
  h: number;
  bkSrc: number;
  bkDst: number;
  /** Top and bottom of the lane fill. */
  bk1: PviColor;
  bk2: PviColor;
  leftLineW: number;
  rightLineW: number;
  leftLine: PviColor;
  rightLine: PviColor;
  pressX: number;
  pressY: number;
  pressTex: string;
  pressColor: PviColor;
  pressSrc: number;
  pressDst: number;
  barColor: PviColor;
  barTex: string;
  barMaxH: number;
  barGrow: number;
  barShrink: number;
  /** NoteAniTexture prefixes, one per note style (the game uses index 0 by default). */
  noteTex: string[];
}

export interface PviAnim {
  present: boolean;
  enable: number;
  left: number;
  hotX: number;
  hotY: number;
  w: number;
  h: number;
  frameDelay: number;
  maxFrame: number;
  tex: string[];
}

export interface PviFont {
  present: boolean;
  enable: number;
  x: number;
  y: number;
  tex: string;
  fontW: number;
  fontH: number;
  pitch: number;
  format: string;
  src: number;
  dst: number;
}

export interface PviTarget {
  x: number;
  y: number;
  w: number;
  h: number;
  tex: string;
}

export interface PviLight {
  present: boolean;
  enable: number;
  x: number;
  y: number;
  w: number;
  h: number;
  frontX: number;
  frontY: number;
  frontW: number;
  frontH: number;
  back: string;
  front: string;
}

export interface Pvi {
  trackCount: number;
  /** [Track1]..[Track20], indexed from 0. */
  tracks: PviTrack[];
  measure: PviAnim;
  coolBomb: PviAnim;
  goodBomb: PviAnim;
  longBomb: PviAnim;
  judgment: {
    present: boolean;
    enable: number;
    hotX: number;
    hotY: number;
    kool: string;
    cool: string;
    good: string;
    miss: string;
    fail: string;
  };
  judgmentTex: {
    present: boolean;
    enable: number;
    kool: string;
    coolFast: string;
    coolSlow: string;
    good: string;
    miss: string;
    fail: string;
  };
  combo: {
    present: boolean;
    enable: number;
    font: string;
    hotX: number;
    hotY: number;
    unit: string[];
  };
  keyPanel: {
    present: boolean;
    enable: number;
    x: number;
    y: number;
    w: number;
    h: number;
    bitmap: string;
  };
  maxCombo: PviFont;
  score: PviFont;
  gauge: {
    present: boolean;
    enable: number;
    backX: number;
    backY: number;
    gaugeX: number;
    gaugeY: number;
    back: string;
    gauge: string;
  };
  lights: PviLight[];
  target: { present: boolean; enable: number; bars: PviTarget[] };
  unknownSections: number;
}

export const PVI_TRACKS = 20;
const NOTE_STYLES = 8;
const TARGET_BARS = 16;
const LIGHTS = 4;
const PATH = 191;

const color = (): PviColor => ({ r: 0, g: 0, b: 0, a: 0 });
const track = (): PviTrack => ({
  present: false,
  enable: 0,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  bkSrc: 0,
  bkDst: 0,
  bk1: color(),
  bk2: color(),
  leftLineW: 0,
  rightLineW: 0,
  leftLine: color(),
  rightLine: color(),
  pressX: 0,
  pressY: 0,
  pressTex: '',
  pressColor: color(),
  pressSrc: 0,
  pressDst: 0,
  barColor: color(),
  barTex: '',
  barMaxH: 0,
  barGrow: 0,
  barShrink: 0,
  noteTex: [],
});
const anim = (): PviAnim => ({
  present: false,
  enable: 0,
  left: 0,
  hotX: 0,
  hotY: 0,
  w: 0,
  h: 0,
  frameDelay: 0,
  maxFrame: 0,
  tex: [],
});
const font = (): PviFont => ({
  present: false,
  enable: 0,
  x: 0,
  y: 0,
  tex: '',
  fontW: 0,
  fontH: 0,
  pitch: 0,
  format: '',
  src: 0,
  dst: 0,
});
const light = (): PviLight => ({
  present: false,
  enable: 0,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  frontX: 0,
  frontY: 0,
  frontW: 0,
  frontH: 0,
  back: '',
  front: '',
});

/** Integers separated by whitespace or commas, like pvi.c `ints`. */
function ints(v: string, max: number): number[] {
  const out: number[] = [];
  let s = v;
  while (out.length < max) {
    s = s.replace(/^[\s,]+/, '');
    if (!s) break;
    const m = /^[+-]?\d+/.exec(s);
    if (!m) break;
    out.push(Number.parseInt(m[0], 10));
    s = s.slice(m[0].length);
  }
  return out;
}

function toColor(v: string): PviColor {
  const t = [255, 255, 255, 255];
  ints(v, 4).forEach((x, i) => (t[i] = x));
  return { r: t[0]!, g: t[1]!, b: t[2]!, a: t[3]! };
}

function pair(v: string): [number, number] {
  const t = ints(v, 2);
  return [t[0] ?? 0, t[1] ?? 0];
}

/** A quoted string's contents, or the trimmed value when unquoted (pvi.c `str`). */
function str(v: string, max = PATH): string {
  const q = v.indexOf('"');
  if (q >= 0) {
    const e = v.indexOf('"', q + 1);
    return (e >= 0 ? v.slice(q + 1, e) : v.slice(q + 1)).slice(0, max);
  }
  return ctrim(v.slice(0, max));
}

function strlist(v: string, max: number): string[] {
  return str(v, 1023)
    .split(';')
    .map(ctrim)
    .filter((s) => s.length > 0)
    .slice(0, max)
    .map((s) => s.slice(0, PATH));
}

type Sec =
  | 'none'
  | 'general'
  | 'track'
  | 'measure'
  | 'coolBomb'
  | 'goodBomb'
  | 'longBomb'
  | 'judgment'
  | 'judgmentTex'
  | 'combo'
  | 'keyPanel'
  | 'maxCombo'
  | 'score'
  | 'gauge'
  | 'light'
  | 'target'
  | 'ruby'
  | 'skip';

const SECTIONS: Record<string, Sec> = {
  general: 'general',
  measureline: 'measure',
  coolbomb: 'coolBomb',
  goodbomb: 'goodBomb',
  longnotebomb: 'longBomb',
  judgment: 'judgment',
  judgmenttex: 'judgmentTex',
  coolcombo: 'combo',
  keypanel: 'keyPanel',
  maxcoolcombo: 'maxCombo',
  score: 'score',
  groovegauge: 'gauge',
  groovelight: 'light',
  targetbar: 'target',
  rubygauge: 'ruby',
};

function sectionOf(name: string): [Sec, number] {
  if (name.slice(0, 5).toLowerCase() === 'track' && /\d/.test(name[5] ?? '')) {
    return ['track', atoi(name.slice(5)) - 1];
  }
  return [SECTIONS[name.toLowerCase()] ?? 'skip', 0];
}

function trackKv(t: PviTrack, k: string, v: string): void {
  if (ciEq(k, 'Enable')) t.enable = atoi(v);
  else if (ciEq(k, 'Coord')) [t.x, t.y] = pair(v);
  else if (ciEq(k, 'Size')) [t.w, t.h] = pair(v);
  else if (ciEq(k, 'BKAlphaFunc')) [t.bkSrc, t.bkDst] = pair(v);
  else if (ciEq(k, 'BkColor1')) t.bk1 = toColor(v);
  else if (ciEq(k, 'BkColor2')) t.bk2 = toColor(v);
  else if (ciEq(k, 'LeftBoader.LineWidth')) t.leftLineW = atoi(v);
  else if (ciEq(k, 'LeftBoader.LineColor')) t.leftLine = toColor(v);
  else if (ciEq(k, 'RightBoader.LineWidth')) t.rightLineW = atoi(v);
  else if (ciEq(k, 'RightBoader.LineColor')) t.rightLine = toColor(v);
  else if (ciEq(k, 'PressKeyCoord')) [t.pressX, t.pressY] = pair(v);
  else if (ciEq(k, 'PressKeyDownTexture')) t.pressTex = str(v);
  else if (ciEq(k, 'PressKeyColor')) t.pressColor = toColor(v);
  else if (ciEq(k, 'PressKeyAlphaFunc')) [t.pressSrc, t.pressDst] = pair(v);
  else if (ciEq(k, 'PressBarColor')) t.barColor = toColor(v);
  else if (ciEq(k, 'PressBarTexture')) t.barTex = str(v);
  else if (ciEq(k, 'PressBarMaxHeight')) t.barMaxH = atoi(v);
  else if (ciEq(k, 'PressBarGrowUpSpeed')) t.barGrow = atoi(v);
  else if (ciEq(k, 'PressBarShrinkSpeed')) t.barShrink = atoi(v);
  else if (ciEq(k, 'NoteAniTexture')) t.noteTex = strlist(v, NOTE_STYLES);
}

function animKv(a: PviAnim, k: string, v: string): void {
  if (ciEq(k, 'Enable')) a.enable = atoi(v);
  else if (ciEq(k, 'Left')) a.left = atoi(v);
  else if (ciEq(k, 'HeightHotSpot')) a.hotY = atoi(v);
  else if (ciEq(k, 'HotSpot')) [a.hotX, a.hotY] = pair(v);
  else if (ciEq(k, 'Size')) [a.w, a.h] = pair(v);
  else if (ciEq(k, 'FrameDelay')) a.frameDelay = atoi(v);
  else if (ciEq(k, 'MaxFrame')) a.maxFrame = atoi(v);
  else if (ciEq(k, 'AniTexture')) a.tex = strlist(v, NOTE_STYLES);
}

function fontKv(f: PviFont, k: string, v: string): void {
  if (ciEq(k, 'Enable')) f.enable = atoi(v);
  else if (ciEq(k, 'Coord')) [f.x, f.y] = pair(v);
  else if (ciEq(k, 'FontTexture')) f.tex = str(v);
  else if (ciEq(k, 'FontSize')) [f.fontW, f.fontH] = pair(v);
  else if (ciEq(k, 'FontPitch')) f.pitch = atoi(v);
  else if (ciEq(k, 'Format')) f.format = str(v, 31);
  else if (ciEq(k, 'AlphaFunc')) [f.src, f.dst] = pair(v);
}

export class PviError extends Error {}

/** Parse a .pvi's text. Throws PviError when there is no [General] section (not a .pvi). */
export function parsePvi(text: string): Pvi {
  const o: Pvi = {
    trackCount: 0,
    tracks: Array.from({ length: PVI_TRACKS }, track),
    measure: anim(),
    coolBomb: anim(),
    goodBomb: anim(),
    longBomb: anim(),
    judgment: {
      present: false,
      enable: 0,
      hotX: 0,
      hotY: 0,
      kool: '',
      cool: '',
      good: '',
      miss: '',
      fail: '',
    },
    judgmentTex: {
      present: false,
      enable: 0,
      kool: '',
      coolFast: '',
      coolSlow: '',
      good: '',
      miss: '',
      fail: '',
    },
    combo: { present: false, enable: 0, font: '', hotX: 0, hotY: 0, unit: ['', '', '', ''] },
    keyPanel: { present: false, enable: 0, x: 0, y: 0, w: 0, h: 0, bitmap: '' },
    maxCombo: font(),
    score: font(),
    gauge: {
      present: false,
      enable: 0,
      backX: 0,
      backY: 0,
      gaugeX: 0,
      gaugeY: 0,
      back: '',
      gauge: '',
    },
    lights: [],
    target: { present: false, enable: 0, bars: [] },
    unknownSections: 0,
  };
  let sec: Sec = 'none';
  let idx = 0;
  let block = '';
  let seenGeneral = false;

  for (const raw of text.split(/[\r\n]+/)) {
    // A comment runs from ' to the end, outside quotes.
    let line = '';
    let inq = false;
    for (const ch of raw.slice(0, 1023)) {
      if (ch === '"') inq = !inq;
      else if (ch === "'" && !inq) break;
      line += ch;
    }
    line = ctrim(line);
    if (!line) continue;

    if (line[0] === '[') {
      const close = line.indexOf(']');
      const name = ctrim(close >= 0 ? line.slice(1, close) : line.slice(1)).slice(0, 63);
      [sec, idx] = sectionOf(name);
      if (sec === 'general') seenGeneral = true;
      markPresent(o, sec, idx);
      block = '';
      continue;
    }
    if (line[0] === '}') {
      block = '';
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = ctrim(line.slice(0, eq));
    const val = ctrim(line.slice(eq + 1));
    if (val.startsWith('{') || (val === '' && line.slice(eq + 1).includes('{'))) {
      block = key.slice(0, 63);
      continue;
    }
    apply(o, sec, idx, block ? `${block}.${key}` : key, val);
  }
  if (!seenGeneral) throw new PviError('not a .pvi (no [General] section)');
  return o;
}

function markPresent(o: Pvi, sec: Sec, idx: number): void {
  switch (sec) {
    case 'track':
      if (idx >= 0 && idx < PVI_TRACKS) o.tracks[idx]!.present = true;
      break;
    case 'measure':
    case 'coolBomb':
    case 'goodBomb':
    case 'longBomb':
    case 'judgment':
    case 'judgmentTex':
    case 'combo':
    case 'keyPanel':
    case 'maxCombo':
    case 'score':
    case 'gauge':
    case 'target':
      o[sec].present = true;
      break;
    case 'light':
      if (o.lights.length < LIGHTS) o.lights.push({ ...light(), present: true });
      break;
    case 'skip':
      o.unknownSections++;
      break;
    default:
      break;
  }
}

function apply(o: Pvi, sec: Sec, idx: number, k: string, v: string): void {
  switch (sec) {
    case 'general':
      if (ciEq(k, 'NumberOfTrack')) o.trackCount = atoi(v);
      break;
    case 'track':
      if (idx >= 0 && idx < PVI_TRACKS) trackKv(o.tracks[idx]!, k, v);
      break;
    case 'measure':
    case 'coolBomb':
    case 'goodBomb':
    case 'longBomb':
      animKv(o[sec], k, v);
      break;
    case 'judgment': {
      const j = o.judgment;
      if (ciEq(k, 'Enable')) j.enable = atoi(v);
      else if (ciEq(k, 'HotSpot')) [j.hotX, j.hotY] = pair(v);
      else if (ciEq(k, 'KoolStr')) j.kool = str(v);
      else if (ciEq(k, 'CoolStr')) j.cool = str(v);
      else if (ciEq(k, 'GoolStr') || ciEq(k, 'GoodStr')) j.good = str(v);
      // Positional in the game: the first of Miss/Fail fills the FAIL slot.
      else if (ciEq(k, 'MissStr') || ciEq(k, 'FailStr')) {
        if (!j.fail) j.fail = str(v);
        else j.miss = str(v);
      }
      break;
    }
    case 'judgmentTex': {
      const j = o.judgmentTex;
      if (ciEq(k, 'Enable')) j.enable = atoi(v);
      else if (ciEq(k, 'KoolTex')) j.kool = str(v);
      else if (ciEq(k, 'FastCoolTex')) j.coolFast = str(v);
      else if (ciEq(k, 'SlowCoolTex')) j.coolSlow = str(v);
      else if (ciEq(k, 'GoodTex')) j.good = str(v);
      else if (ciEq(k, 'MissTex')) j.miss = str(v);
      else if (ciEq(k, 'FailTex')) j.fail = str(v);
      break;
    }
    case 'combo': {
      const c = o.combo;
      if (ciEq(k, 'Enable')) c.enable = atoi(v);
      else if (ciEq(k, 'Font')) c.font = str(v);
      else if (ciEq(k, 'HotSpot')) [c.hotX, c.hotY] = pair(v);
      else {
        const m = /^unit([1-4])str$/i.exec(k);
        if (m) c.unit[Number(m[1]) - 1] = str(v);
      }
      break;
    }
    case 'keyPanel': {
      const p = o.keyPanel;
      if (ciEq(k, 'Enable')) p.enable = atoi(v);
      else if (ciEq(k, 'Coord')) [p.x, p.y] = pair(v);
      else if (ciEq(k, 'Size')) [p.w, p.h] = pair(v);
      else if (ciEq(k, 'Bitmap')) p.bitmap = str(v);
      break;
    }
    case 'maxCombo':
    case 'score':
      fontKv(o[sec], k, v);
      break;
    case 'gauge': {
      const g = o.gauge;
      if (ciEq(k, 'Enable')) g.enable = atoi(v);
      else if (ciEq(k, 'BackCoord')) [g.backX, g.backY] = pair(v);
      else if (ciEq(k, 'BackBitmap')) g.back = str(v);
      else if (ciEq(k, 'GaugeCoord')) [g.gaugeX, g.gaugeY] = pair(v);
      else if (ciEq(k, 'GaugeBitmap')) g.gauge = str(v);
      break;
    }
    case 'light': {
      const L = o.lights[o.lights.length - 1] ?? (o.lights[0] = light());
      if (ciEq(k, 'Enable')) L.enable = atoi(v);
      else if (ciEq(k, 'Coord') || ciEq(k, 'BackCoord')) [L.x, L.y] = pair(v);
      else if (ciEq(k, 'Size') || ciEq(k, 'BackSize')) [L.w, L.h] = pair(v);
      else if (ciEq(k, 'BackTexture') || ciEq(k, 'BackBitmap')) L.back = str(v);
      else if (ciEq(k, 'FrontCoord')) [L.frontX, L.frontY] = pair(v);
      else if (ciEq(k, 'FrontSize')) [L.frontW, L.frontH] = pair(v);
      else if (ciEq(k, 'FrontTexture')) L.front = str(v);
      break;
    }
    case 'target': {
      const t = o.target;
      if (ciEq(k, 'Enable')) {
        t.enable = atoi(v);
      } else if (ciEq(k, 'Coord')) {
        if (t.bars.length < TARGET_BARS) {
          const [x, y] = pair(v);
          t.bars.push({ x, y, w: 0, h: 0, tex: '' });
        }
      } else if (t.bars.length > 0) {
        const b = t.bars[t.bars.length - 1]!;
        if (ciEq(k, 'Size')) [b.w, b.h] = pair(v);
        else if (ciEq(k, 'AniTexture')) b.tex = str(v);
      }
      break;
    }
    default:
      break;
  }
}

/** Where the notes hit: TargetBar[0]'s vertical centre (EZ2PORT scene/skin.c). */
export function judgeLineY(p: Pvi): number | undefined {
  const b = p.target.bars[0];
  return b ? b.y + b.h / 2 : undefined;
}
