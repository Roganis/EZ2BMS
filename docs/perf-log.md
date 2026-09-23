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
