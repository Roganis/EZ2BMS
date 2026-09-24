import {
  ChartDoc,
  newChart,
  stemView,
  timelineOf,
  type ChartData,
  type NoteRec,
  type SampleLookup,
} from '@ez2bms/chart-core';
import { describe, expect, it } from 'vitest';
import { Viewport } from './geometry';
import { onsetTimes, stripRows } from './striprows';

// 150 BPM, 240 pulses a beat: a pulse is 5/3 ms.
const samples: SampleLookup = (src) =>
  src === 'stem.wav' ? { frames: 12 * 44100 } : src === 'loop.wav' ? { frames: 44100 } : undefined;

function doc(notes: [ch: number, y: number, c: boolean][], timing: Partial<ChartData> = {}) {
  const data = { ...newChart({ mode: '5k', tier: 'NM', bpm: 150 }), ...timing };
  data.channels = [
    { id: 1, name: 'stem.wav' },
    { id: 2, name: 'loop.wav' },
  ];
  data.notes = notes.map(([ch, y, c], i): NoteRec => ({ id: i + 1, ch, y, x: 0, l: 0, c }));
  return new ChartDoc(data);
}

/** Rows of `src`, and per row the seconds of the file it asked the waveform for. */
function rows(d: ChartDoc, src: string, vp: Viewport, height: number, loaded = true) {
  const asked: [number, number][][] = Array.from({ length: height }, () => []);
  // A row asks for its top (y) and then its bottom (y + 1): the last y seen is the row's end.
  let lastY = 0;
  const out = stripRows(
    {
      view: stemView(d, src, samples),
      timeline: timelineOf(d),
      peaks: (a, b) => {
        asked[lastY - 1]!.push([a, b]);
        return loaded ? [-16384, 32767] : undefined;
      },
    },
    {
      pulseOf: (y) => {
        lastY = y;
        return vp.pulseOf(y);
      },
    },
    height,
  );
  return { out, asked };
}

describe('stem strip rows', () => {
  it('draw each row from the second of the file playing there, by slice', () => {
    const d = doc([
      [1, 0, false],
      [1, 960, true],
    ]);
    // One pixel a pulse; pulse 1300 at the top, the judge line at 500.
    const vp = new Viewport(240, 800, 240, 500);
    const { out, asked } = rows(d, 'stem.wav', vp, 600);
    // Row 0 covers pulses 1299-1300: 2165-2166.7 ms into the song and the file.
    expect(asked[0]![0]![0]).toBeCloseTo(2.165, 9);
    expect(asked[0]![0]![1]).toBeCloseTo(2.16667, 4);
    // Past the cut at 960 (row 340) the second slice plays; below it, the first.
    expect(out[0]!.slice).toBe(1);
    expect(out[339]!.slice).toBe(1);
    expect(out[341]!.slice).toBe(0);
    // Loud: the waveform reaches the edges (square-root scaled).
    expect(out[0]!.hi).toBeCloseTo(1, 6);
    expect(out[0]!.lo).toBeCloseTo(-Math.sqrt(0.5), 3);
  });

  it('follow the tempo map and put a STOP whole into one row', () => {
    // 300 BPM from beat 4 (pulse 960); a 120-pulse (200 ms) STOP at pulse 480.
    const d = doc([[1, 0, false]], {
      bpmEvents: [{ y: 960, bpm: 300 }],
      stopEvents: [{ y: 480, duration: 120 }],
    });
    const vp = new Viewport(240, 0, 240, 1500);
    const { asked } = rows(d, 'stem.wav', vp, 1500);
    const at = (p: number) => asked[1500 - p - 1]![0]!;
    // Pulse 1199-1200: 1.6 s to beat 4, the 0.2 s STOP, then a beat at 300 BPM (0.2 s).
    expect(at(1199)[1]).toBeCloseTo(1.6 + 0.2 + 0.2, 9);
    // Pulse 480-481 holds the STOP: 0.8 s to 1.0017 s of the file.
    expect(at(480)[0]).toBeCloseTo(0.8, 9);
    expect(at(480)[1]).toBeCloseTo(1.0 + 1 / 600, 9);
  });

  it('are empty where nothing of the file sounds, and say when it is still loading', () => {
    const d = doc([[1, 960, false]]);
    const vp = new Viewport(240, 0, 1, 12000);
    // Pulse 0 at the bottom (y 12000), one pixel a beat: 12 s of stem is
    // 30 beats from beat 4, to beat 34. Below pulse 0, nothing either.
    const { out } = rows(d, 'stem.wav', vp, 12010);
    const beat = (b: number) => out[12000 - b - 1];
    expect(beat(2)).toBeNull();
    expect(beat(10)).not.toBeNull();
    expect(beat(33)).not.toBeNull();
    expect(beat(34)).toBeNull();
    expect(out.slice(12000).every((r) => r === null)).toBe(true);
    const loading = rows(d, 'stem.wav', vp, 12000, false).out;
    expect(loading[12000 - 10 - 1]!.loading).toBe(true);
  });
});

describe('onset times', () => {
  it('are where the chart plays each onset, once per hit of a retriggered loop', () => {
    // The 1 s loop struck at beats 0 and 2 (0 and 0.8 s): the first is cut at 0.8 s.
    const d = doc([
      [2, 0, false],
      [2, 480, false],
    ]);
    const v = stemView(d, 'loop.wav', samples);
    const onsets: [number, number][] = [
      [0.1, 0.9],
      [0.5, 0.05],
      [0.9, 0.6],
    ];
    const t = onsetTimes(v, onsets, 0.1, 0, 5000).map((o) => [Math.round(o.ms), o.strength]);
    expect(t).toEqual([
      [100, 0.9],
      [900, 0.9],
      [1700, 0.6],
    ]);
    expect(onsetTimes(v, onsets, 0.1, 150, 1000).map((o) => Math.round(o.ms))).toEqual([900]);
  });
});
