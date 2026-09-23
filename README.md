# EZ2BMS

An arcade-native chart suite for **EZ2PORT** (the native EZ2AC engine) and real
EZ2AC cabinets. You chart on the play field itself - the lanes, notes and
judgement of the game, not a spreadsheet of channels - hit Tab to play what you
just wrote the way the engine will play it, and publish a song package the
engine loads as-is.

> Work in progress. Milestones 1 ("chart & play core") and 2 ("keysound
> workbench + Classic-mode charting") are written; the
> checklist below is the source of truth for what exists, and
> [AI-DISCLOSURE.md](AI-DISCLOSURE.md) says what has and has not been checked
> on real machines.

## What it is for

- **Charting EZ2 modes** - 5K ONLY, SCRATCH, RUBY, 5K STANDARD, 7K, 10K (Club),
  14K (Space); Andromeda and Catch for cabinet export.
- **All three ways EZ2 songs are made** - hundreds of pre-cut keysounds,
  full-length stems sliced by notes, and converting existing material.
- **Hearing and judging exactly what EZ2PORT will do** - the editor compiles the
  chart the same way it publishes it, and plays it through EZ2PORT's own voice,
  judgement, hold and gauge rules.
- **Publishing** - an EZ2PORT song package (`song.ini`, `.ez`, `.ezi`, `.ini`,
  `.ssf`, title plate) straight into the engine's songs folder, and later `.ez`
  exports for the original cabinet software.

## Nothing from the game ships

EZ2BMS contains no game content, no key tables and no art. Like EZ2PORT, it
reads lane layouts (`.gds`), skins (`.pvi`), art (`.abm`) and the cipher tables
out of **your own** game folder and executable at run time. Without them it
still works, with a procedural skin and plaintext packages.

## Layout

| Path                    | What                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `packages/chart-core`   | TypeScript: model, timing, modes, EZ2 formats, editing, engine emulation, publishing, lint |
| `apps/editor`           | Svelte 5 + PixiJS front end                                                                |
| `crates/ez2bms-audio`   | Rust: decode, resample, mixer with EZ2 voice rules, offline render, cutting                |
| `crates/ez2bms-launch`  | Rust: find and launch `ez2play`                                                            |
| `crates/ez2port-oracle` | Rust + C, **tests only**: EZ2PORT's own core, used to prove parity                         |
| `src-tauri`             | the desktop host                                                                           |
| `docs/`                 | architecture, the bmson dialect, the EZ2PORT contract and requests, performance log        |

## Trying it

```sh
pnpm install
pnpm tauri dev          # the desktop app (Linux: libwebkit2gtk-4.1-dev, libasound2-dev)
pnpm dev                # or just the editor in a browser, with a demo song and silent audio
                        # (add ?skin to the URL for a made-up game folder: the game-skin path)
pnpm fixtures           # writes fixtures-out/: one playable test song per EZ2PORT mode,
                        # with synthesized WAV sounds - open one, press Space, Tab, F5
```

In the app: **Open song folder** on the start screen, then click a lane to place
a note, drag up for a hold, **Space** to hear it, **Tab** for the Play view,
**Shift+Tab** to play it yourself with EZ2PORT's keys, **F5** to run it in
EZ2PORT (set your game folder in the EZ2PORT tab first), **Ctrl+Shift+P** to
publish. **Ctrl+K** finds everything else; all keys are in
[docs/keybindings.md](docs/keybindings.md).

## Building

Requirements: Node 22+, pnpm 10, Rust stable, a C compiler (for the test
oracle). The desktop build also needs the Tauri prerequisites
(`libwebkit2gtk-4.1-dev`, `libasound2-dev` on Debian/Ubuntu; WebView2 on Windows).

```sh
pnpm install
pnpm test               # chart-core + editor unit tests
cargo test              # audio, launcher and oracle crates (no system audio needed)
pnpm e2e                # Playwright against the browser build
pnpm dev                # the editor in a browser, with the mock back end
pnpm tauri dev          # the desktop app
```

## Milestones

### M1 - Chart & play core

- [x] M1.0 Workspaces, CI, renderer performance spike ([perf log](docs/perf-log.md))
- [x] M1.1 EZ2PORT oracle harness (`third_party/ez2port-core`, `crates/ez2port-oracle`)
- [x] M1.2 Chart model + bmson read/write ([dialect](docs/bmson-dialect.md))
- [x] M1.3 Timing (bmson view + the engine's tick/f32 tempo map, bit-identical to EZ2PORT; EZFF read/write)
- [x] M1.4 Modes + EZ2 data parsers (`.gds`, `.pvi`, `.abm`, key tables, cipher) - [compat](docs/ez2port-compat.md)
- [x] M1.5 Editing core (ops with inverses, transactions, drafts, history, lane rules, commands)
- [x] M1.6 Publish plan + package writers (oracle: identical to the port importer on lanes and background)
- [x] M1.7 Engine emulation (judge, holds, gauge, score) (oracle: random scripts and the synthetic player agree number for number)
- [x] M1.8 Rust audio engine (voice rules, mid-sample start, allocation-free renderer; oracle: published `.ssf` files)
- [x] M1.9 `ez2play` launcher (feature probe without running it, isolated songs folder, log capture) - [requests to the port](docs/ez2port-requests.md)
- [x] M1.10 Tauri shell + IPC (files, settings, audio, clock stream, publish, test runs)
- [x] M1.11 Editor shell: backend bridge (Tauri + in-browser mock), state, command registry, palette, song select, drawers
- [x] M1.12 Playfield renderer: EZ2PORT's lanes and scroll in Pixi, neon skin, every mode on both sides, background rack, minimap
- [x] M1.12b The game's own skin from `.pvi`/`.abm` (lanes, note art, holds, beams, key panel, target bar, press glow - [compat](docs/ez2port-compat.md))
- [x] M1.13 Tools and drawers (draw, drag-to-hold, move, resize, rubber band, erase, step input; sounds, inspector, chart info, timing)
- [x] M1.14 Audio in the editor (the publish compiler feeds the engine, play from cursor on the audio clock, audition, mute background, solo)
- [x] M1.15 Play mode (autoplay and test play judged by the port of `score.c`, your `keys.ini`, HUD, result card)
- [x] M1.16 Publish and Test in EZ2PORT (F5), with the pre-flight check (errors block Publish) and a basic title plate
- [x] M1.17 New chart (mode wheel, named like EZ2PORT's charts), new song, autosave and crash recovery
- [x] M1.18 Hardening: test songs per mode (`pnpm fixtures`), 50k-note benchmarks ([perf log](docs/perf-log.md)), generated [key reference](docs/keybindings.md), release workflow

### M2 - Keysound workbench + Classic-mode charting

- [x] M2.1 Sound names and groups (a chart's `kick.wav` finds `kick.ogg`; BmsTWO's `SampleGrouping`, ported with its test vectors)
- [x] M2.2 Where every sound is used, song-wide (unused files, missing names, unused channels)
- [x] M2.3 One per-channel compile shared by playback, publishing and the checks below (no change in output)
- [x] M2.4 What a chart sounds like, exactly (`publish/audible.ts`) - [compat](docs/ez2port-compat.md)
- [x] M2.5 The M2.4 model checked against the real mixer at 44.1 and 48 kHz
- [x] M2.6 Classic-mode edits (key, un-key, split, heal, reset) that are refused if the music would change
- [x] M2.7 Host: waveform thumbnails in batches, importing (never overwriting) and renaming files, OS drops
- [x] M2.8 The background rack grouped like BmsTWO's, scrolling sideways
- [x] M2.9 Classic mode in the editor, saved per song
- [x] M2.10 The keysound workbench (Ctrl+Shift+B): waveforms, filters, draw, rename and replace across charts
- [x] M2.11 Import by file chooser or by dropping files and folders on the window; reload edited sounds
- [x] M2.12 Benchmarks with 1 500 grouped sounds ([perf log](docs/perf-log.md)) and these docs

### Later

- M3 Song manager + full publish (title plate designer, disc, preview, BGA)
- M4 Stem slicing
- M5 Importers (`.ez` originals, BMS/BME, BmsTWO, MIDI, circus2bmson)
- M6 Exporters (cabinet `.ez` v8/v6, BMS/BME)
- M7 Record mode + cabinet controller
- M8 EZ2-native extras
- M9 Polish and distribution

## Verification

| Claim                                       | How it is checked                | Status                                 |
| ------------------------------------------- | -------------------------------- | -------------------------------------- |
| Renderer JS cost fits the budget            | `perf.html` in headless Chromium | 1.1 ms/frame at ~9.7k sprites          |
| Renderer frame rate on WebKitGTK / WebView2 | `perf.html` inside the Tauri app | to be measured on the owner's machines |

## Licence

GPL-3.0. The vendored EZ2PORT core under `third_party/ez2port-core` is
GPL-3.0-or-later and is used by tests only. See [`AI-DISCLOSURE.md`](AI-DISCLOSURE.md)
for how this project was written.
