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
