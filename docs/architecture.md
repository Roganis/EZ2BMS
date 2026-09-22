# Architecture

EZ2BMS is a Tauri 2 desktop application: a Svelte 5 + PixiJS front end in the
system webview, and a Rust back end for everything that touches audio samples,
processes or the disk. This page is the map; the per-format decisions live in
[`bmson-dialect.md`](bmson-dialect.md) and the engine contract in
[`ez2port-compat.md`](ez2port-compat.md).

## The rule: one implementation of each concern

| Concern                                                                                                                            | Lives in                           | Why                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Chart model, timing, modes, editing, undo, lint                                                                                    | `packages/chart-core` (TypeScript) | the editor edits it at 60+ fps without crossing IPC; Vitest tests it without a webview |
| Every byte format: bmson, BMS, EZFF `.ez`, `.ezi`, `.ini`, `song.ini`, `.abm`, `.gds`, `.pvi`, the cipher, PE key-table extraction | `packages/chart-core`              | pure byte work on the model; one implementation, tested against the EZ2PORT oracle     |
| The EZ2PORT judge/score/gauge rules, voice rules, publish plan                                                                     | `packages/chart-core`              | Play mode and Publish must agree with each other by construction                       |
| Decode, resample, mix, render, cut, encode (`.ssf`/`.ezw`/wav)                                                                     | `crates/ez2bms-audio` (Rust)       | real-time and sample-exact work                                                        |
| Launching `ez2play`, capturing its log                                                                                             | `crates/ez2bms-launch` (Rust)      | process control                                                                        |
| Files, dialogs, settings, IPC glue                                                                                                 | `src-tauri` (Rust)                 | the host                                                                               |

The front end talks to native code only through one interface,
`apps/editor/src/bridge/types.ts` (`Backend`). `tauri.ts` implements it in the
app; `web.ts` implements it in a plain browser with an in-memory file system and
a silent clock, which is what Playwright and browser development use.

## Layout

```
packages/chart-core/src/
  model/      ChartDoc, NoteRec, channels, extras (unknown JSON kept), note index
  timing/     tempo map (f32-faithful), ticks (48/beat), measures, snap, rescale
  modes/      mode registry, lane kinds, bundled lane orders, file names
  ez2data/    .gds, .pvi, .abm, PE + key tables, cipher
  io/bmson/   parse / serialize / mode resolution / legacy renumbering
  edit/       ops + inverses, transactions, history, selection, clipboard, commands
  engine/     EZ2PORT emulation: voices, judge, holds, gauge, score, sessions
  publish/    the compiled plan and the package writers (EZFF, ezi, ini, song.ini, plate)
  lint/       rules, grouped by severity
apps/editor/src/
  bridge/ state/ commands/ input/ render/ skin/ audio/ port/ ui/ theme/
crates/
  ez2bms-audio/    sample cache, peaks, mixer with EZ2 voice rules, offline render, cutting
  ez2bms-launch/   ez2play discovery, capability probe, isolated temp songs root
  ez2port-oracle/  TEST ONLY: builds third_party/ez2port-core and answers JSON queries
third_party/ez2port-core/  vendored snapshot of EZ2PORT's ez2core (GPL-3.0-or-later)
```

## One compiler for playback and publishing

`chart-core/src/publish/plan.ts` turns a chart into exactly what the package
writer will put on disk: slices become keysound entries, background notes are
allocated to tracks, STOPs become gaps, pulses become 1/48-beat ticks, tempo is
rounded to f32 the way EZFF stores it. The editor's preview and Play mode play
**that plan**, through the same voice rules EZ2PORT uses. What you hear in the
editor is what the engine will play.

## Edit and Play share one axis

EZ2PORT scrolls by ticks, not seconds: `1.6 px per tick x speed%`, so the space
between two beats never changes when the BPM does. The editor's Edit mode uses
the same pulse axis; Play mode only swaps who drives the position (the audio
clock instead of the user) and the zoom. Flipping between them is an animation,
not a different renderer.

## Audio

The mixer runs on the audio thread with no allocation and no locks. The front
end sends the compiled plan per channel as raw bytes; a builder thread turns it
into a frame-accurate schedule and swaps it in with `arc-swap`. Starting from any
position picks up samples that are already sounding mid-sample. The same mixer
renders offline, which is how tests check audio without a device (`null`
backend) and how previews and slices are rendered.

## Risks and fallbacks

- **WebKitGTK WebGL speed** - see [`perf-log.md`](perf-log.md). Mitigations:
  draw only on change in Edit mode, pooled sprites, density view when zoomed
  out, no Pixi filters or backdrop blur; `WEBKIT_DISABLE_DMABUF_RENDERER=1` for
  NVIDIA blank-window issues; the Tauri CEF runtime as a last resort.
- **The oracle drifting from the live port** - `third_party/ez2port-core/PROVENANCE.md`
  records the build; re-vendor from a newer zip or repository when the port changes.
- **Nothing from the game ships** - key tables, lane layouts and art are read
  from the user's own install at run time, exactly as EZ2PORT does.
