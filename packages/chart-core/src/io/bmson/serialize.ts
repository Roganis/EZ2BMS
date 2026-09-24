// ChartData -> bmson 1.0 text.
//
// Deterministic: sorted keys, notes grouped by channel in channel order and
// sorted by (y, x) inside a channel, one note per line. Saving what was just
// loaded from an EZ2BMS-written file reproduces its bytes; a foreign file comes
// back semantically identical (same members, same values) though its layout
// may change. Unknown members stored in `extra` are merged back in; a model
// field always wins over an `extra` member of the same name.

import type { ChartData, ChartInfo, Extra, NoteRec } from '../../model/types';
import { stableStringify } from '../../util/stable-json';

type Obj = Record<string, unknown>;

function withExtra(o: Obj, extra: Extra | undefined): Obj {
  if (!extra) return o;
  const out: Obj = { ...extra };
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

function infoToJson(i: ChartInfo): Obj {
  return withExtra(
    {
      title: i.title,
      subtitle: i.subtitle,
      artist: i.artist,
      subartists: i.subartists,
      genre: i.genre,
      mode_hint: i.modeHint,
      chart_name: i.chartName,
      level: i.level,
      init_bpm: i.initBpm,
      judge_rank: i.judgeRank,
      total: i.total,
      back_image: i.backImage,
      eyecatch_image: i.eyecatchImage,
      title_image: i.titleImage,
      banner_image: i.bannerImage,
      preview_music: i.previewMusic,
      resolution: i.resolution,
      judgement_deltas: i.judgementDeltas && { ...i.judgementDeltas },
      life_deltas: i.lifeDeltas && { ...i.lifeDeltas },
      x_tier: i.tier,
    },
    i.extra,
  );
}

function noteToJson(n: NoteRec): Obj {
  return withExtra(
    {
      x: n.x,
      y: n.y,
      l: n.l,
      c: n.c,
      up: n.up,
      x_stop: n.xStop,
      x_vel: n.vel,
      x_pan: n.pan,
      x_kind: n.kind,
    },
    n.extra,
  );
}

export function compareNotes(a: NoteRec, b: NoteRec): number {
  return a.y - b.y || a.x - b.x || Number(a.c) - Number(b.c) || a.id - b.id;
}

export function chartToJson(chart: ChartData): Obj {
  const byChannel = new Map<number, NoteRec[]>();
  for (const c of chart.channels) byChannel.set(c.id, []);
  for (const n of chart.notes) {
    const list = byChannel.get(n.ch);
    if (!list) throw new Error(`note ${n.id} belongs to missing channel ${n.ch}`);
    list.push(n);
  }
  const skip = (key: 'bpm_events' | 'stop_events' | 'sound_channels', len: number) =>
    len === 0 && !!chart.absent?.includes(key);
  const root: Obj = {
    version: chart.version,
    info: infoToJson(chart.info),
    lines: chart.lines?.map((l) => withExtra({ y: l.y }, l.extra)),
    bpm_events: skip('bpm_events', chart.bpmEvents.length)
      ? undefined
      : chart.bpmEvents.map((e) => withExtra({ y: e.y, bpm: e.bpm }, e.extra)),
    stop_events: skip('stop_events', chart.stopEvents.length)
      ? undefined
      : chart.stopEvents.map((e) => withExtra({ y: e.y, duration: e.duration }, e.extra)),
    // EZ2BMS's own member, so only in charts that have scroll changes.
    x_scroll_events: chart.scrollEvents.length
      ? chart.scrollEvents.map((e) => withExtra({ y: e.y, rate: e.rate }, e.extra))
      : undefined,
    sound_channels: skip('sound_channels', chart.channels.length)
      ? undefined
      : chart.channels.map((c) =>
          withExtra(
            {
              name: c.name,
              x_color: c.color,
              notes: byChannel.get(c.id)!.sort(compareNotes).map(noteToJson),
            },
            c.extra,
          ),
        ),
    bga: !chart.bga
      ? undefined
      : withExtra(
          {
            bga_header: chart.bga.header.map((h) => withExtra({ id: h.id, name: h.name }, h.extra)),
            bga_events: chart.bga.bga.map((e) => withExtra({ y: e.y, id: e.id }, e.extra)),
            layer_events: chart.bga.layer.map((e) => withExtra({ y: e.y, id: e.id }, e.extra)),
            poor_events: chart.bga.poor.map((e) => withExtra({ y: e.y, id: e.id }, e.extra)),
          },
          chart.bga.extra,
        ),
  };
  return withExtra(root, chart.extra);
}

/** The bmson text for a chart. UTF-8 without a BOM when encoded. */
export function serializeBmson(chart: ChartData): string {
  return stableStringify(chartToJson(chart));
}
