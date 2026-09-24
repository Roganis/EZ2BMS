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
  `.ssf`, title plate) straight into the engine's songs folder.
- **Going back out** - a song sent into the original game in place of one it
  has (encrypted v8 charts, keysounds, its `song.bin` levels), with a backup
  and Restore; or a BMS/BME folder for LR2 and beatoraja.

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
| `crates/ez2bms-launch`  | Rust: find and launch `ez2play`; write into a game folder with a backup                    |
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

### M3 - Song manager + full publish

- [x] M3.1 The song model: info shared by every chart, the 48 categories, chart files named by mode, key and tier
- [x] M3.2 The song manager (Ctrl+Shift+L): info, category and every chart in a mode x tier matrix
- [x] M3.3 Safe publishing: whose package a folder is, shipped keys refused, rankings kept for unchanged charts, backups
- [x] M3.4 Disc and eyecatch: crop any PNG/JPEG/BMP, cut byte-for-byte as EZ2PORT's importer cuts - [compat](docs/ez2port-compat.md)
- [x] M3.5 Title plates rendered as EZ2PORT renders them (bundled Roboto and Noto Sans CJK; `node scripts/fetch-fonts.mjs`)
- [x] M3.6 Plate designer: words, version colours or your own, CJK forms, or your own 256x32 image; missing glyphs linted
- [x] M3.7 Preview picker: the window on the song's loudness, auditioned as the wheel loops it, rendered as EZ2PORT's importer renders it
- [x] M3.8 The song on the wheel: disc, swing, rail, preview dwell and eyecatch where EZ2PORT puts them, over your game's own select masks
- [x] M3.9 BGA: a movie EZ2PORT's build can decode (read from its headers), started on the chart's clock, previewed and published
- [x] M3.10 Issues grouped and filtered, with quick fixes (one undo step per chart, "Fix all" undone in all); F5 refuses a chart with errors
- [x] M3.11 Publish dialog: destination and whose folder it is, each chart's scores kept or reset, the art from the very bytes, then written at once
- [x] M3.12 The [song file](docs/song-file.md), requests to the port, timings in the [perf log](docs/perf-log.md), end-to-end specs for every page

### M4 - Stem slicing

- [x] M4.1 Long sounds kept decoded on disk: a 5-minute stem opens and publishes in a tenth of its decode time, bit for bit the same
- [x] M4.2 Onsets and tempo found in the engine (spectral flux, attacks placed on the waveform, tempo fitted to the beats)
- [x] M4.3 The slice model: a stem as the chart plays it, and cuts that never change the sound (oracle: the importer's own slices)
- [x] M4.4 Stem strips beside the lanes, on the chart's own axis, each slice in its tint
- [x] M4.5 Slicing by hand: cut, heal, move, key onto lanes, hear a slice, the knife tool (C)
- [x] M4.6 The strip panel: chop to the grid (silence left whole), cut at onsets, the stem's tempo as the chart's
- [x] M4.7 [How slicing works](docs/slicing.md), timings in the [perf log](docs/perf-log.md), end-to-end specs

### M5 - Importers

- [x] M5.1 bmson 0.21 and both `beat-10k` numberings open; what opening did shows in Issues (oracle: the port importer's reading)
- [x] M5.2 The game's keysound lists (`.ezi`) and chart settings (`.ini`), read as EZ2PORT reads them (oracle, random files)
- [x] M5.3 The game's song tables (`song.bin`) and titles (the port's manifest), read at run time (oracle)
- [x] M5.4 The game's own charts become songs, every note at the engine's millisecond (oracle, random charts)
- [x] M5.5 A new song folder written all at once, `.ssf` keysounds as WAVs with the same samples
- [x] M5.6 BMS/BME/BML: Shift-JIS and EUC-KR, `#RANDOM`/`#SWITCH`, exact timing, EZ2 lanes
- [x] M5.7 A stem cut at a MIDI file's notes, with its tempo or the chart's
- [x] M5.8 The import wizard, and the MIDI cut in the strip panel
- [x] M5.9 [How importing works](docs/importing.md), timings in the [perf log](docs/perf-log.md), end-to-end specs

### M6 - Exporters

- [x] M6.1 Korean (CP949) and Shift-JIS written by inverting the platform's decoders; BMS ids and channel maps both ways (and 10K/Catch "keys in order" fixed)
- [x] M6.2 Charts compiled for the cabinet: a game chart goes back as the game had it (oracle, random charts), EZ2PORT's packages unchanged (goldens)
- [x] M6.3 A song into one the game has: files by the game's own names, `song.bin` patched in place, keysounds that never overwrite (oracle)
- [x] M6.4 What the original executable does differently, linted: 128 KB files, 2047 keysounds, one sound per track
- [x] M6.5 Keysounds sent back as they came (16-bit PCM rewrapped), and a game folder written all or nothing, with a backup and Restore
- [x] M6.6 The host's export commands, and the browser build's
- [x] M6.7 BMS/BME export, read back note for note by the importer
- [x] M6.8 The Export dialog: review, into the game or a folder, BMS, past exports
- [x] M6.9 [How exporting works](docs/exporting.md), timings in the [perf log](docs/perf-log.md), end-to-end specs

The cabinet export writes v8 (encrypted) charts; the older plaintext v6 is
deferred.

### Later

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
GPL-3.0-or-later and is used by tests only. The desktop app links
[SDL 3](https://libsdl.org) (zlib licence, Copyright (C) 1997-2026 Sam Lantinga)
to read game controllers, as EZ2PORT does. See [`AI-DISCLOSURE.md`](AI-DISCLOSURE.md)
for how this project was written.
