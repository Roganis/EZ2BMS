# EZ2BMS

An arcade-native chart suite for **EZ2PORT** (the native EZ2AC engine) and real
EZ2AC cabinets. You chart on the play field itself - the lanes, notes and
judgement of the game, not a spreadsheet of channels - hit Tab to play what you
just wrote the way the engine will play it, and publish a song package the
engine loads as-is.

> Work in progress. Milestone 1 ("chart & play core") is being built; the
> checklist below is the source of truth for what exists.

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
| `docs/`                 | architecture, the bmson dialect, the EZ2PORT contract, performance log                     |

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
- [ ] M1.1 EZ2PORT oracle harness
- [ ] M1.2 Chart model + bmson read/write
- [ ] M1.3 Timing
- [ ] M1.4 Modes + EZ2 data parsers (`.gds`, `.pvi`, `.abm`, key tables, cipher)
- [ ] M1.5 Editing core
- [ ] M1.6 Publish plan + package writers
- [ ] M1.7 Engine emulation (judge, holds, gauge, score)
- [ ] M1.8 Rust audio engine
- [ ] M1.9 `ez2play` launcher
- [ ] M1.10 Tauri shell
- [ ] M1.11-15 Editor: UI, renderer + skins, tools, audio, Play mode
- [ ] M1.16-18 Test in EZ2PORT, new chart, lint, hardening

### Later

- M2 Keysound workbench + Classic-mode charting
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
