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

### Publish, pre-flight check, new charts and hardening (M1.16-M1.18), 2026-09-22

The assistant wrote chart-core's lint rules and the editor's Issues tab,
Publish and Test in EZ2PORT, the new-chart dialog, autosave and crash
recovery, the synthetic test songs (`pnpm fixtures`), the 50k-note benchmarks
and the release workflow. Publish was exercised against the in-browser backend
and its files are read back by the oracle; publishing into a real songs
folder, F5 on a real EZ2PORT and the release workflow (it runs on a tag) have
not been run.

### The game's own play field (M1.12b), 2026-09-22

The assistant wrote the reader for a mode's panel (`.pvi`, its `.abm` art and
the `.gds`) and the renderer's game-skin path, transcribed from EZ2PORT's
`scene/skin.c`. That file is outside the vendored core, so there is no oracle
for it: it was tested on a panel drawn in code for the purpose
(`apps/editor/src/bridge/demo-skin.ts`). No real panel has been loaded, so how
close it looks to the port with real art is unchecked.

### Keysound workbench and Classic-mode charting (M2), 2026-09-23

The assistant wrote Milestone 2 after the owner's decisions (unused files
are only listed, renaming renames the file, grouping is a faithful port of
BmsTWO's, Classic mode is saved per song):

- chart-core's `sound/` (names to files, the port of BmsTWO's
  `SampleGrouping`, song-wide usage, rename planning);
- `publish/audible.ts`, an exact model of what a chart sounds like, and the
  Classic-mode operations in `edit/classic.ts` that are refused whenever
  that model says the music would change;
- a Rust example that renders two event lists through the real mixer, so a
  test can check the model against actual samples;
- the host's waveform thumbnails, import and rename commands;
- the grouped background rack, Classic mode in the editor, the keysound
  workbench, and import by file chooser and drop.

What "the music does not change" covers is written down, with its limits,
in `docs/ez2port-compat.md`. The claim is tested three ways in the
container: a property test over random songs and random Classic edits, the
real mixer rendering both sides of 120 random cases, and the editor
end to end. It has not been heard: there is no sound card here, and
nobody has keyed a song in Classic mode and listened to it in EZ2PORT. The
grouping port was checked against the test vectors in BmsTWO's own
`tools/fuzz_history.cpp`, not by running BmsTWO side by side. Dropping
files from the operating system into the desktop app goes through Tauri's
drag-drop event, which only the browser build's DOM path exercises here.

Found and fixed on the way: the rack's hit list was never cleared (M2.8),
and at 1 280 px the top bar was wider than the window, which made the
playfield re-bake its textures every frame (see `docs/perf-log.md`).

### Song manager, safe publishing, song art, plates and preview (M3.1-M3.7), 2026-09-23

The assistant is writing Milestone 3 step by step after the owner's
decisions (a bundled CJK font for plates, rankings kept only for charts
whose `.ez` and `.ini` are unchanged, the wheel preview drawn from the
owner's own game art):

- the song model (`song/*`: one set of song info across charts, the 48
  categories, the song file) and the song manager overlay;
- publishing into the real songs folder: whose package a folder is, a
  refusal for a shipped song's key, ranking tables carried over, the
  replaced package kept in `.ez2bms-backup`;
- song art: the `ez2bms-media` crate (decode, crop, and a transcription of
  the port importer's disc and eyecatch arithmetic), the host command that
  cuts them, and the cropper in the song manager;
- title plates: the port's text renderer transcribed around the same
  stb_truetype, with Roboto Bold (EZ2PORT's copy, Apache-2.0, committed)
  and Noto Sans CJK Bold (OFL-1.1, fetched by a pinned hash and shipped
  with the app). Font licences are in `fonts/`;
- the song preview: rendered through the real mixer and finished in the
  port importer's integer arithmetic, picked on the song's loudness and
  auditioned as the wheel loops it.

The disc and the stretched eyecatch are checked byte for byte against
EZ2PORT's own importer through the oracle, on random images; plates
against the port's own text renderer on random lines and plates, Korean
and Japanese included (on Linux; Windows is expected to round the same); the song.ini
reader against the port's `ez2_usersongs_merge`; the publish rules in Rust
temp-folder tests and end to end. What has not been seen: a published disc
spinning on the real wheel, what the eyecatch shows on the owner's screens
(the `visible` framing assumes the top-left 640x480, read from the port's
code), and a publish while EZ2PORT has the old package open on Windows.

---

## Verification status

| Claim                                                                | Basis                                     | Verified              |
| -------------------------------------------------------------------- | ----------------------------------------- | --------------------- |
| Renderer JS cost is ~1 ms/frame at ~10k sprites                      | headless Chromium (software GL)           | Yes, in the container |
| Renderer frame rate on WebKitGTK / WebView2                          | not yet measured                          | **No** - owner        |
| Every format EZ2BMS writes reads back in EZ2PORT's core as planned   | oracle (build 1582), synthetic inputs     | Yes, in the container |
| Play mode judges and scores like EZ2PORT                             | oracle: random scripts, `ez2judge` player | Yes, in the container |
| `.gds`/`.pvi`/`.abm` readers on real game files                      | not run (no game data here)               | **No** - owner        |
| A published song shows and plays in EZ2PORT                          | not run                                   | **No** - owner        |
| Mixer: exact starts, voice cuts, mid-sample resume, gapless slices   | unit tests through the offline renderer   | Yes, in the container |
| The renderer never allocates                                         | a counting allocator in a test            | Yes, in the container |
| Published `.ssf` files load in EZ2PORT's parser                      | oracle                                    | Yes, in the container |
| Sound on a real device (cpal), latency, no glitches                  | not run (no audio device here)            | **No** - owner        |
| The probe reads build 1582's options and commit                      | run on the owner's `ez2play.exe` locally  | Yes, in the container |
| F5 plays a chart in EZ2PORT (Windows, path with spaces)              | a fake ez2play on Linux only              | **No** - owner        |
| The desktop app starts (Linux)                                       | Xvfb, silent-clock fallback               | Yes, in the container |
| The desktop app starts (Windows, WebView2) and plays sound           | CI builds and tests only                  | **No** - owner        |
| Editing: place, hold, move, resize, erase, undo, save byte-stable    | Playwright on the real playfield          | Yes, in the container |
| Playback follows the clock; Play mode judges and shows a result      | Playwright, silent clock                  | Yes, in the container |
| Test play feels right: latency, key response, sound on press         | not run                                   | **No** - owner        |
| Lint catches what EZ2PORT would hide, reject or mis-play             | unit tests, rules taken from the port     | Yes, in the container |
| The release workflow builds the installers                           | not run (needs a tag)                     | **No**                |
| Game skin: lane boxes, note variants, holds, beams, target bar       | unit + Playwright tests, synthetic panel  | Yes, in the container |
| The game skin on real panels looks like EZ2PORT's field              | not run (no game data here)               | **No** - owner        |
| Grouping matches BmsTWO's `SampleGrouping`                           | BmsTWO's own test vectors                 | Yes, in the container |
| Classic-mode edits never change what autoplay plays (editor)         | exact model, property test, real mixer    | Yes, in the container |
| ...nor what EZ2PORT plays (per-frame timing, one or two players)     | reasoned from the port's code; see compat | **No** - owner        |
| Keying in Classic mode sounds right on a real device                 | not run (no audio device here)            | **No** - owner        |
| Workbench: waveforms, filters, rename and replace with undo          | Playwright, browser build                 | Yes, in the container |
| Import never overwrites; renames never replace another file          | Rust tests (Linux and Windows CI), e2e    | Yes, CI               |
| Import by dropping files from the OS into the desktop app            | not run (browser build's DOM path only)   | **No** - owner        |
| Workbench scrolls smoothly on WebKitGTK / WebView2 with 1500 sounds  | headless Chromium only                    | **No** - owner        |
| `song.ini` is read and listed as EZ2PORT does                        | oracle: `ez2_usersongs_merge`, random     | Yes, in the container |
| Publishing keeps rankings, refuses shipped keys, backs up            | Rust temp-folder tests, e2e               | Yes, CI               |
| Disc and stretched eyecatch bytes equal the port importer's          | oracle, random images up and down         | Yes, in the container |
| The disc and eyecatch look right in EZ2PORT (wheel, select exit)     | not run (no game here)                    | **No** - owner        |
| Publishing while EZ2PORT runs (Windows file locks)                   | not run                                   | **No** - owner        |
| Title plates equal the port's own renderer's, CJK included           | oracle, random text and plates (Linux)    | Yes, in the container |
| A plate on the real wheel beside the game's titles (a Korean one)    | not run (no game here)                    | **No** - owner        |
| The preview's PCM equals the importer's (window, fades, normalising) | oracle, random songs mixed at unity       | Yes, in the container |
| The preview loops cleanly on the wheel at a sensible loudness        | not run (no game or sound device here)    | **No** - owner        |
