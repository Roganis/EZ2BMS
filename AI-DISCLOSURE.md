# AI Disclosure

This project is written with AI assistance. This file records what was done by
whom and, more importantly, **what has been verified and how**, so a reader can
judge how much weight to put on any claim.

The distinction that matters most is between behaviour **checked against
EZ2PORT's own code** (the vendored oracle, run in tests), behaviour **checked on
real hardware or the real engine by the owner**, and behaviour that is an
**inference** from documentation.

---

## Human work

- The product direction, the choice of stack, target engine, formats and
  workflows, and every trade-off decision recorded in the plan (2026-09-22).
- EZ2PORT itself, BmsTWO, ez2-io and the reverse-engineering knowledge they
  carry, which this project builds on.
- Running the editor, EZ2PORT and the cabinet: anything in the verification
  table marked "owner".

## AI work

### Planning and M1 scaffold, 2026-09-22

An AI assistant (Claude, via Claude Code) researched the owner's repositories
(BmsTWO, circus2bmson, ez2-io, rizu-arcade) and the EZ2PORT build 1582 source
bundle, proposed the architecture, and after the owner's decisions wrote the
plan and began Milestone 1: the workspace layout, build and CI configuration,
the renderer performance spike and the documentation in `docs/`.

It had no access to a GPU, an audio device, the game data, the executable or a
cabinet. Nothing it measured says anything about those; see the table.

### Chart core and engine emulation (M1.1-M1.7), 2026-09-22

The assistant vendored EZ2PORT's engine core unmodified as a test oracle,
then wrote `packages/chart-core`: the chart model and bmson dialect, timing,
the mode registry, the `.ez`/`.gds`/`.pvi`/`.abm` formats and the cipher, the
editing core, the package publisher and a TypeScript port of the engine's
judgement and scoring. Every format and rule it claims to share with EZ2PORT
is checked against the vendored C code (`docs/ez2port-compat.md`). All test
inputs are synthetic; no game file was read by any test.

### Audio engine (M1.8), 2026-09-22

The assistant wrote `crates/ez2bms-audio`: decoding, resampling, the sample
cache, waveform peaks, the real-time mixer with EZ2PORT's voice rules
(transcribed from the port's `ezaudio.c`), the audio clock, the null and cpal
backends, offline rendering and `.ssf` cutting. It was built and tested in a
container with no sound card: the cpal backend compiles here but has never
produced sound.

### Editor (M1.11-M1.15), 2026-09-22

The assistant wrote the editor front end in `apps/editor`: the bridge and
its in-browser twin, state, commands and palette, the start screen and
drawers, the Pixi playfield, the editing tools, playback on the audio clock
and Play mode. It was exercised with Playwright in headless Chromium against
the in-browser backend (silent audio); nobody has yet charted a song with it,
heard it through a sound card, or played it on a keyboard in real time.

### Desktop host (M1.10), 2026-09-22

The assistant wrote `src-tauri`: the commands above, the window and bundle
configuration, and the app icon (`src-tauri/icon-source.svg`, drawn for this
project). The app was built here and started under a virtual display for
twelve seconds; with no sound card it fell back to the silent clock as
designed. It has not been run on Windows.

### Launcher and requests to the port (M1.9), 2026-09-22

The assistant wrote `crates/ez2bms-launch` (it reads `ez2play`'s options from
the executable, writes packages into a songs folder by staging and renaming,
and runs ez2play with its output captured) and `docs/ez2port-requests.md`, the
spec for the port-side features EZ2BMS will use when they exist. It checked the
probe against the owner's build 1582 `ez2play.exe` locally; nothing from that
file is in the repository, and the tests use a synthetic stand-in and a shell
script in place of the game.

---

## Verification status

| Claim                                                              | Basis                                     | Verified              |
| ------------------------------------------------------------------ | ----------------------------------------- | --------------------- |
| Renderer JS cost is ~1 ms/frame at ~10k sprites                    | headless Chromium (software GL)           | Yes, in the container |
| Renderer frame rate on WebKitGTK / WebView2                        | not yet measured                          | **No** - owner        |
| Every format EZ2BMS writes reads back in EZ2PORT's core as planned | oracle (build 1582), synthetic inputs     | Yes, in the container |
| Play mode judges and scores like EZ2PORT                           | oracle: random scripts, `ez2judge` player | Yes, in the container |
| `.gds`/`.pvi`/`.abm` readers on real game files                    | not run (no game data here)               | **No** - owner        |
| A published song shows and plays in EZ2PORT                        | not run                                   | **No** - owner        |
| Mixer: exact starts, voice cuts, mid-sample resume, gapless slices | unit tests through the offline renderer   | Yes, in the container |
| The renderer never allocates                                       | a counting allocator in a test            | Yes, in the container |
| Published `.ssf` files load in EZ2PORT's parser                    | oracle                                    | Yes, in the container |
| Sound on a real device (cpal), latency, no glitches                | not run (no audio device here)            | **No** - owner        |
| The probe reads build 1582's options and commit                    | run on the owner's `ez2play.exe` locally  | Yes, in the container |
| F5 plays a chart in EZ2PORT (Windows, path with spaces)            | a fake ez2play on Linux only              | **No** - owner        |
| The desktop app starts (Linux)                                     | Xvfb, silent-clock fallback               | Yes, in the container |
| The desktop app starts (Windows, WebView2) and plays sound         | CI builds and tests only                  | **No** - owner        |
| Editing: place, hold, move, resize, erase, undo, save byte-stable  | Playwright on the real playfield          | Yes, in the container |
| Playback follows the clock; Play mode judges and shows a result    | Playwright, silent clock                  | Yes, in the container |
| Test play feels right: latency, key response, sound on press       | not run                                   | **No** - owner        |
