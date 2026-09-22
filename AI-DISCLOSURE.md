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
