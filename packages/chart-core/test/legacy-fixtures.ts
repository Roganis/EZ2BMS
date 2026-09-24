// Legacy bmson documents for legacy-bmson*.test.ts, written by hand.

/** A bmson 0.21 document as BmsONE 0.2 wrote it (member names from its Bmson021.cpp). */
export function v021(extra: Record<string, unknown> = {}) {
  return {
    info: {
      title: 'Old Song',
      artist: 'A',
      genre: 'G',
      judgeRank: 3,
      total: 300,
      initBPM: 150,
      level: 5,
      x_note: 'kept',
    },
    lines: [
      { y: 0, k: 0 },
      { y: 960, k: 0 },
    ],
    bpmNotes: [{ y: 960, v: 175 }],
    stopNotes: [{ y: 1200, v: 120 }],
    soundChannel: [
      {
        name: 'a.wav',
        notes: [
          { x: 1, y: 0, l: 0, c: false },
          { x: 8, y: 240, l: 480, c: false },
          { x: 0, y: 480, l: 0, c: true },
        ],
      },
    ],
    bga: { bgaHeader: [{ ID: 1, name: 'bg.mp4' }], bgaNotes: [{ y: 0, ID: 1 }] },
    x_root: { any: 1 },
    ...extra,
  };
}
