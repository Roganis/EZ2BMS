// bmson 0.21 -> 1.0, before the 1.0 reader sees it.
//
// 0.21 is what BmsONE wrote before bmson 1.0 (and what some converters still
// write): camelCase names, one `EventNote {y, v}` shape for tempo and stops,
// `ID` for BGA ids, and no `version`, `resolution` or `mode_hint` - it was
// always 240 pulses a beat and always the 7-key layout. The changes are the
// spec's own list ("Breaking changes from 0.21", bmson-spec doc/index.rst);
// the member-by-member mapping is BmsONE's ConverterFrom021
// (src/bmson/Bmson100Convert.cpp), which keeps every member it does not know,
// as we do.
//
// EZ2PORT reads only 1.0 (ez2/bmson.c), so there is no oracle for this step;
// what comes out is plain 1.0 and goes through the same reader and publisher
// as any other bmson (docs/ez2port-compat.md).

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Members only 0.21 has: a document with none of them is not 0.21. */
const MARKS = ['soundChannel', 'bpmNotes', 'stopNotes'] as const;
const INFO_MARKS = ['initBPM', 'judgeRank'] as const;

/** Whether a versionless document is bmson 0.21. */
export function isBmson021(doc: Obj): boolean {
  if ('version' in doc) return false;
  if (MARKS.some((k) => k in doc)) return true;
  const info = doc.info;
  return isObj(info) && INFO_MARKS.some((k) => k in info);
}

/** A copy with members renamed per `map`, in their original order. */
function rename(o: Obj, map: Record<string, string>): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) out[map[k] ?? k] = v;
  return out;
}

const BGA: Record<string, string> = {
  bgaHeader: 'bga_header',
  bgaNotes: 'bga_events',
  layerNotes: 'layer_events',
  poorNotes: 'poor_events',
};

const each = (v: unknown, f: (o: Obj) => Obj): unknown =>
  Array.isArray(v) ? v.map((o) => (isObj(o) ? f(o) : o)) : v;

/**
 * The 1.0 document for a 0.21 one. `total` moved from an absolute gauge
 * figure (BMS #TOTAL) to a percentage of the default in 1.0, and there is no
 * exact conversion without the gauge it was meant for; EZ2 has its own gauge
 * and never reads it, so the 0.21 figure is kept as `x_total_v021` rather
 * than passed off as a 1.0 one.
 */
export function upgradeBmson021(doc: Obj): Obj {
  const out: Obj = { version: '1.0.0' };
  for (const [k, v] of Object.entries(doc)) {
    switch (k) {
      case 'info': {
        if (!isObj(v)) {
          out.info = v;
          break;
        }
        const info = rename(v, { initBPM: 'init_bpm', judgeRank: 'judge_rank' });
        if ('total' in info) {
          info.x_total_v021 = info.total;
          delete info.total;
        }
        info.mode_hint ??= 'beat-7k';
        info.resolution ??= 240;
        out.info = info;
        break;
      }
      case 'lines':
        // BarLine.k (the line's kind) was dropped from 1.0 as unneeded.
        out.lines = each(v, (o) => {
          const { k: _k, ...rest } = o;
          return rest;
        });
        break;
      case 'bpmNotes':
        out.bpm_events = each(v, (o) => rename(o, { v: 'bpm' }));
        break;
      case 'stopNotes':
        out.stop_events = each(v, (o) => rename(o, { v: 'duration' }));
        break;
      case 'soundChannel':
        out.sound_channels = v;
        break;
      case 'bga': {
        if (!isObj(v)) {
          out.bga = v;
          break;
        }
        const bga: Obj = {};
        for (const [bk, bv] of Object.entries(v)) {
          const to = BGA[bk];
          bga[to ?? bk] = to ? each(bv, (o) => rename(o, { ID: 'id' })) : bv;
        }
        out.bga = bga;
        break;
      }
      default:
        out[k] = v;
    }
  }
  if (!isObj(out.info)) out.info = { mode_hint: 'beat-7k', resolution: 240 };
  return out;
}
