# Performance log

Every renderer or audio change that could move a budget gets a row here, with
the machine it was measured on. Numbers from the cloud container are useful for
the **JavaScript** side only: its Chromium draws through SwiftShader (a software
GL), so its frame rate says nothing about a real GPU.

## Budgets (M1)

| What                                           | Budget                             |
| ---------------------------------------------- | ---------------------------------- |
| JS work per frame, Edit mode, 50k-note chart   | < 4 ms                             |
| Frame rate, WebKitGTK (Linux)                  | >= 60 fps                          |
| Frame rate, WebView2 (Windows)                 | up to the display (144 fps target) |
| Open + index a 50k-note / 1500-channel project | < 50 ms (excluding sample decode)  |

M2 adds two: working out what a note would key in Classic mode (every
hover) takes < 2 ms at the median, and a workbench scroll step fits in a
frame with 1 500 sounds.

## M1.0 renderer gate - `apps/editor/perf.html`

Pooled Pixi v8 sprites (WebGL2), one generated texture per lane kind, full
visible-range rebuild every frame (the worst case: the real renderer only
touches the pool when something moves). Run with
`pnpm --filter @ez2bms/editor build && pnpm --filter @ez2bms/editor preview`
then open `http://localhost:4173/perf.html?notes=N&density=D`.

| Date       | Machine / webview                                              | notes  | visible | JS work / frame | fps                    | frame p95 |
| ---------- | -------------------------------------------------------------- | ------ | ------- | --------------- | ---------------------- | --------- |
| 2026-09-22 | cloud container, headless Chromium 141, SwiftShader, 1920x1080 | 20 000 | ~4 800  | 0.5 ms          | 13.5 (software raster) | 82.7 ms   |
| 2026-09-22 | same                                                           | 50 000 | ~9 700  | 1.1 ms          | 7.5 (software raster)  | 154 ms    |
| 2026-09-22 | same, `density=8` (a realistic chart)                          | 50 000 | ~40     | 0.3 ms          | 60.0 (vsync)           | 16.8 ms   |
| _to do_    | owner's Linux desktop, WebKitGTK (Tauri)                       | 20 000 | ~4 800  |                 |                        |           |
| _to do_    | owner's Windows / cabinet PC, WebView2 (Tauri)                 | 20 000 | ~4 800  |                 |                        |           |

Reading: the JavaScript cost of placing ~10k sprites is about 1 ms, well inside
the budget, so the scene-graph approach holds. Whether the GPU side holds on
WebKitGTK is the open question the two _to do_ rows answer; the fallback plan
if it does not is in `docs/architecture.md` (Risks).

## M1.18 - the real editor on a 50k-note chart

`packages/chart-core/test/bench.test.ts` and `apps/editor/tests/e2e/perf.spec.ts`
build a synthetic 14K chart (`synthChart`: 50 000 notes, 1 500 sounds, holds
of several kinds, a BPM change every 16 measures) and time what the editor
does with it. Both run in CI with generous limits; these are the container's
numbers (Node 22, headless Chromium 141 with SwiftShader).

| Date       | What                                                         | Time         |
| ---------- | ------------------------------------------------------------ | ------------ |
| 2026-09-22 | Open: build the note index                                   | 29 ms        |
| 2026-09-22 | One frame's visible-range queries (every lane, two measures) | 0.02 ms      |
| 2026-09-22 | Place + move + undo twice                                    | 6.6 ms       |
| 2026-09-22 | Save (byte-stable bmson)                                     | 172 ms       |
| 2026-09-22 | Load (parse)                                                 | 59 ms        |
| 2026-09-22 | Compile for playback / publish (whole chart)                 | 159 ms       |
| 2026-09-22 | Pre-flight lint                                              | 31 ms        |
| 2026-09-22 | Playfield draw, JS only, Edit zoom (median / p95)            | 1.4 / 6.1 ms |
| 2026-09-22 | Playfield draw, JS only, zoomed right out (median / p95)     | 2.8 / 7.3 ms |

Reading: per-frame work is inside the 4 ms budget at the median; the p95
spikes are garbage collection and the software GL's texture uploads, to be
re-measured on real webviews. The compile runs after edits settle (160 ms
debounce), so at this size a recompile while playing is noticeable; making
it incremental (per channel) is the plan's next step for the audio sync.

## M2.12 - the keysound workbench, the grouped rack and Classic mode

The same 50k-note chart with its 1 500 sounds named in 60 kits of ~25
(`synthChart({ names: 'grouped' })`, e.g. `kick-a_01.wav`), and in the
browser build 1 500 matching files in the song folder (`?bench`). Same
container and browser as above; each figure is one run of
`packages/chart-core/test/bench.test.ts` or `apps/editor/tests/e2e/perf.spec.ts`.

| Date       | What                                                              | Time         |
| ---------- | ----------------------------------------------------------------- | ------------ |
| 2026-09-23 | Group the background into the rack (BmsTWO's grouping, 60 groups) | 10.7 ms      |
| 2026-09-23 | Song-wide sound usage (1 chart, 1 500 files)                      | 9.5 ms       |
| 2026-09-23 | Plan a file rename (every reference, every chart)                 | 2.9 ms       |
| 2026-09-23 | How one sound sounds (`audible`, one source)                      | 8.4 ms       |
| 2026-09-23 | How the whole chart sounds (`fingerprint`)                        | 109 ms       |
| 2026-09-23 | Classic: what a note would key, first hover (builds the cache)    | 31 ms        |
| 2026-09-23 | Classic: what a note would key, later hovers (median / p95)       | 1.8 / 4.5 ms |
| 2026-09-23 | Playfield draw, JS only, Edit zoom (median / p95)                 | 2.2 / 10 ms  |
| 2026-09-23 | Playfield draw, JS only, zoomed right out (median / p95)          | 2.7 / 5.4 ms |
| 2026-09-23 | Playfield draw while the rack scrolls sideways (median)           | 1.7 ms       |
| 2026-09-23 | Workbench: open over 1 512 sounds to the first cards              | 35 ms        |
| 2026-09-23 | Workbench: one scroll step, event to patched DOM (median / p95)   | 4.4 / 6.8 ms |

Reading: a hover in Classic mode stays under 2 ms at the median because
the check only re-analyses the sounds a candidate touches, against a cached
analysis of the rest; the first hover after an edit pays for the cache. A
whole-chart fingerprint (109 ms) is only for tests. The workbench keeps at
most 26 cards in the DOM while scrolling all 1 512, and 40 scroll steps
asked the engine for waveforms in 16 batches.

The rack's regrouping takes more than the 8 ms threshold at this size, so
while a drag streams edits it regroups at most every 150 ms.

A regression found on the way: at 1 280 px with both drawers open the top
bar (with M2.9's CLASSIC button) was wider than the window, so the page's
width followed the digits of the position readout and the playfield
resized - re-baking every note texture - on every frame. The draw median
had gone from 2.0 to 3.9 ms. Fixed in the layout; `editor.spec.ts` now
checks that the playfield keeps its size while the cursor moves.

Each frame in this headless browser also costs ~50 ms of wall time outside
the page (the software compositor reads the WebGL canvas back), which is
why the perf spec samples 60 frames per zoom rather than 240.

## M3.12 - song art, plates, the preview and the wheel

The host's work is timed by `cargo test --release --test perf -- --nocapture`
in `ez2bms-media` and `ez2bms-audio` (a release build in this container; the
tests themselves only hold loose bounds, so a debug build on CI passes). The
wheel is timed by `apps/editor/tests/e2e/perf.spec.ts` in headless Chromium.

| Date       | What                                                                | Time         |
| ---------- | ------------------------------------------------------------------- | ------------ |
| 2026-09-23 | Read the plate fonts, cold (Roboto Bold and the 20 MB Noto CJK TTC) | 12-17 ms     |
| 2026-09-23 | Render a two-line plate with a halo (Latin / Korean), first render  | 0.3 / 0.3 ms |
| 2026-09-23 | ...and again (the most of 20)                                       | 0.2 / 0.2 ms |
| 2026-09-23 | Decode a 4000x3000 PNG photo                                        | 184 ms       |
| 2026-09-23 | Cut it to the disc / to the eyecatch                                | 14 / 28 ms   |
| 2026-09-23 | Preview overview of a 3-minute song (2 880 hits of 40 sounds)       | 152 ms       |
| 2026-09-23 | Wheel preview, one frame, at rest (median / p95)                    | 0.8 / 1.3 ms |
| 2026-09-23 | Wheel preview, one frame, while the wheel chases (median / p95)     | 0.8 / 1.7 ms |

Reading: the cropper asks the host for a new cut on every committed crop,
and the host keeps the last two decoded images, so after the first decode a
crop costs the cut alone - tens of milliseconds for a phone photo. The fonts
are read whole (the CJK collection is 20 MB) the first time a plate is
rendered and kept, so the first plate of a session pays those milliseconds
once; after that a Korean plate costs what a Latin one does. The preview
overview mixes the whole song through the real mixer once per chart or file
chosen. The wheel's Canvas 2D frame is a small part of a 60 Hz frame even in
software rendering.

## M4.7 - stems: the disk cache, onsets and tempo, the strips

The host's work is timed by `cargo test -p ez2bms-audio --release --test
perf -- --nocapture` (a release build in this container; the tests hold
loose bounds and shorter signals in a debug build, for CI). The strips are
timed by `apps/editor/tests/e2e/perf.spec.ts` in headless Chromium: the
demo with three strips while the cursor moves as it does playing at 250 %
(each strip's waveform is painted again every frame then), and the bench
chart, whose five-minute stem is cut once a measure.

| Date       | What                                                                   | Time          |
| ---------- | ---------------------------------------------------------------------- | ------------- |
| 2026-09-23 | A 5-minute stereo WAV at 44.1 kHz opened at 48 kHz: decode + resample  | 0.6-1.3 s     |
| 2026-09-23 | ...the same from the disk cache (109 MB, bit for bit)                  | 0.10-0.12 s   |
| 2026-09-23 | Onsets and tempo of a 3-minute stereo stem (1 799 onsets, 150.00 BPM)  | 1.3 s         |
| 2026-09-23 | Playfield draw, demo, cursor moving (median / p95): no strips          | 1.0 / 2.9 ms  |
| 2026-09-23 | ...with three strips                                                   | 2.9 / 7.1 ms  |
| 2026-09-23 | Bench: 50k notes and three strips (the 5-minute stem's among them)     | 4.3 / 10.4 ms |
| 2026-09-23 | Chop the 5-minute stem at eighths (1 542 cuts, checked, one undo step) | 69 ms         |

Reading: decoding and resampling dominate opening a song with stems, and
the disk cache takes that to a read. The analysis runs once per file in the
background and is kept on disk beside it. A strip painted every frame costs
about 0.6 ms of JS (0.3 ms working out its rows, 0.4 ms painting them, from
0.8 ms before painting in runs of one colour with cached styles); at rest a
strip is not painted again. Chopping checks every cut against how the stem
sounds in one pass, so 1 500 cuts cost about what one does.

## M5.9 - importers

Timed by chart-core `test/bench.test.ts` ("importers at full size") in this
container (Node 22, one core).

| Date       | What                                                                       | Time   |
| ---------- | -------------------------------------------------------------------------- | ------ |
| 2026-09-23 | A 50k-note game chart (`.ez` + `.ezi`) into bmson: tempo, lanes, keysounds | 261 ms |
| 2026-09-23 | A 57 600-note BMS: encoding, commands, exact positions, lanes              | 147 ms |
| 2026-09-23 | The encoding of a megabyte of CP949 text                                   | 14 ms  |
| 2026-09-23 | Planning 10 000 cuts from a MIDI file's notes (the chart's tempo)          | 8 ms   |

Reading: an import is dominated by copying the keysounds, which the host
does (each `.ssf` rewritten as a `.wav` without decoding it); reading and
converting even the largest charts stays well under a second. The wizard
converts a BMS folder again on every choice, which these figures leave room
for.

## M6.9 - exporters

Timed by chart-core `test/bench.test.ts` ("exporters at full size") in this
container (Node 22, one core); three runs.

| Date       | What                                                                                                                        | Time       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 2026-09-23 | Build the CP949 encoder (invert the decoder's KS X 1001 region, compute the 8822 UHC syllables), once a session             | 6-9 ms     |
| 2026-09-23 | Build the Shift-JIS encoder, once a session                                                                                 | 4-6 ms     |
| 2026-09-23 | A 50k-note, 1500-sound chart into the synthetic game: plan, keysound names, encrypted `.ez`/`.ezi`, `song.bin`, every check | 300-336 ms |
| 2026-09-23 | ...its `.ez`, for scale (the original loads 128 KB)                                                                         | 641 KB     |
| 2026-09-23 | The same 50k notes (1500 whole sounds) written as a BMS                                                                     | 216-233 ms |
| 2026-09-23 | FNV-1a of 200 KB (what the export expects of each file it replaces)                                                         | 18 ms      |

Reading: making the bytes is a fraction of a second even for a chart five
times what the cabinet can load. An export's time is the host's: making
the keysounds, where only a new or changed one is written. The dialog
works the export out again on each choice, which these figures leave room
for.

## M7.13 - controllers and recording

The TypeScript figures are chart-core `test/bench.test.ts` ("takes at full
size", "input at full rate"); the controller figure is `crates/ez2bms-input`
`tests/sdl.rs` `pad_event_delay` (ignored by default:
`cargo test -p ez2bms-input --features sdl -- --ignored --nocapture`). This
container (Node 22, one core; Linux, no udev); three runs each.

| Date       | What                                                                                                   | Time                |
| ---------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| 2026-09-24 | A press on an SDL virtual board to the editor's stream: SDL, the controller thread, the batch (median) | 0.033-0.035 ms      |
| 2026-09-24 | ...its 95th percentile / worst of 200                                                                  | 0.05 / 0.08-0.25 ms |
| 2026-09-24 | ...the time it carries, from when the board changed (median)                                           | 0.027-0.029 ms      |
| 2026-09-24 | The input mapper, per turntable axis event (100 000: steps, holds, wrap)                               | 0.20-0.23 µs        |
| 2026-09-24 | The input mapper, per button event (100 000 presses and releases through the resolver)                 | 0.82-0.99 µs        |
| 2026-09-24 | Snapping a 5 000-press take to the grid                                                                | 5.5-8.0 ms          |
| 2026-09-24 | Applying a 1 000-press brush take to the 50k-note chart (one undo step)                                | 5.8-12.1 ms         |
| 2026-09-24 | Applying a 300-press Classic take to a sliced 5-minute stem (each keying checked for the sound)        | 300-340 ms          |

Reading:

- A virtual board changes inside the controller thread's own loop, so the
  first figures are EZ2BMS's share only. A real board adds its USB report
  interval (the cabinet bridge reports on change, or every 10 ms at the
  latest) and SDL's pump, which runs every millisecond while a board is
  open. Either way the press carries SDL's stamp, not its arrival, so what
  is judged and recorded is when it happened; the delay only decides how
  soon the field shows it.
- The bridge's turntables report at most every 10 ms or so each; at a
  fifth of a microsecond an event, the mapper is nowhere near the budget.
- Keeping a take is instant for the brush. A Classic take pays for the
  sound check each keying makes, about 1 ms a press on a dense stem, once,
  when Keep is pressed.

## M8.6 - hold previews and scroll changes

The TypeScript figures are chart-core `test/bench.test.ts` ("hold previews
and scroll changes at full size"); the drawing figures are
`apps/editor/tests/e2e/perf.spec.ts` (JS only, headless Chromium with
SwiftShader). This container (Node 22, one core); three runs each.

| Date       | What                                                                                     | Time                 |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------- |
| 2026-09-24 | Previewing every hold of the 50k-note chart (36 121 holds, kinds 0-12)                   | 46-55 ms             |
| 2026-09-24 | Placing 4 096 scroll changes (EZ2PORT's most) on the tick axis                           | 2.5-4.6 ms           |
| 2026-09-24 | The multiplier at the cursor, once a frame (binary search over 4 096)                    | 35-40 ns             |
| 2026-09-24 | Saving / loading the 50k-note chart with 4 096 scroll changes                            | 190-230 / 69-76 ms   |
| 2026-09-24 | Compiling it (the changes add no measurable time)                                        | 187-207 ms           |
| 2026-09-24 | Play field draw on the 50k-note chart as it plays: without / with 4 096 changes (median) | 0.9-1.2 / 1.3-1.5 ms |
| 2026-09-24 | Edit field draw on the 50k-note chart at zoom 56 (median): without / with the hold ticks | 4.8-5.1 / 5.4 ms     |

Reading:

- A hold's preview is computed once per chart version and kept (the
  renderer asks for the holds on screen, the Inspector for the selected
  ones), so the whole chart's cost above is paid only by a select-all.
- The multiplier walk is a binary search, cheap enough to do every frame;
  the points behind it are rebuilt once per chart version.
- Scroll changes cost the Play field a few tenths of a millisecond, most of
  it the flags. The hold ticks cost Edit about as much.
- The Edit figure is well above M1.18's 1.4 ms: the extras drawn since (the
  grouped rack, strips' columns, markers) and a busier synthetic chart, not
  M8, as the "without" column shows. It stays inside a 60 Hz frame.

## M9 - messages in three languages

chart-core `test/bench.test.ts` ("says every message …"). This container
(Node 22, one core); three runs each.

| Date       | What                                                                                     | Time               |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------ |
| 2026-09-24 | Every chart-core message (367) formatted in English, first time (each parsed once)       | 21-32 ms           |
| 2026-09-24 | … again (parsed messages kept)                                                           | 14-28 ms           |
| 2026-09-24 | Lint of the 50k-note chart: the code before M9.6 / with message keys, same chart         | 90-149 / 68-113 ms |
| 2026-09-24 | Its findings said again in another language (a switch)                                   | 0.4-0.6 ms         |
| 2026-09-24 | A language switch, 50k-note chart open with Issues showing, to the second frame (median) | 80-130 ms          |

Reading:

- A message is parsed once per language and kept; after that, saying one
  costs tens of microseconds. The editor says a few hundred at most on a
  screen, so a language switch re-renders in well under a frame's work of
  formatting; the rest is Svelte redrawing what changed.
- Findings keep their key and values, so a switch re-says them without
  linting again.
- The switch figure is `apps/editor/tests/e2e/perf.spec.ts` in headless
  Chromium, where every frame costs about 50 ms of wall time outside our
  code (the software compositor, see M1.18): two frames of it are most of
  the 80-130 ms. A switch is a click in Preferences, not something done
  while playing.
- Keeping a key beside each finding costs lint nothing measurable (the
  runs overlap). Lint is slower than M1's 31 ms because of the rules added
  since (holds covering notes, lane duplicates, scroll changes …), not M9.
- The log (M9.1) writes a few lines a session: the start, the update check,
  and errors. Its cost is a file append on the host, off the editor's
  frame.
