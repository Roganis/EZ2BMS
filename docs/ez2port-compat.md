# EZ2PORT compatibility

EZ2PORT (the owner's native EZ2AC engine) is the reference for everything
EZ2BMS publishes. This page lists where EZ2BMS follows it exactly, where it
deliberately does something else, and what is still unknown. Every "exact"
row is proven by a test against the vendored engine core
(`crates/ez2port-oracle`); the snapshot is EZ2PORT build 1582.

## Exact (oracle-tested)

| Area                                                    | EZ2BMS                   | Test                                                      |
| ------------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| EZFF `.ez` read/write, v5-v8                            | `io/ez/ezff.ts`          | `ezff.oracle.test.ts` - every field, every record         |
| Tempo map and every record's time (f32 BPM, ms)         | `timing/engine-tempo.ts` | bit-identical milliseconds                                |
| `.gds` descriptors                                      | `ez2data/gds.ts`         | `ez2data.oracle.test.ts`                                  |
| `.pvi` skins (tracks, target bar, note art)             | `ez2data/pvi.ts`         | same                                                      |
| `.abm` decode (all six header variants, 8/16/24/32-bit) | `ez2data/abm.ts`         | RGBA hash identical                                       |
| `.abm` encode (Final EX, 24-bit)                        | `ez2data/abm.ts`         | byte-identical to `ez2_abm_write`                         |
| File cipher                                             | `ez2data/crypt.ts`       | byte-identical for random tables                          |
| Velocity/pan arithmetic                                 | `ez2data/mixparam.ts`    | same integers                                             |
| Chart file names (mode, song, tier)                     | `modes/filenames.ts`     | same as `ez2_chart_id_parse`                              |
| Mode lane sets                                          | `modes/registry.ts`      | same tracks as `ez2/mode.c`                               |
| Published package (`song.ini`, `.ez`, `.ezi`, `.ini`)   | `publish/package.ts`     | `publish.oracle.test.ts` - the engine reads the plan back |
| Lane notes and background sounds of a bmson             | `publish/chart-plan.ts`  | same records as the port's own `ez2_bmson_import`         |
| Judgement, combo, gauge, score and the hold machine     | `engine/score.ts`        | `engine.oracle.test.ts` - random scripts, op for op       |
| The synthetic player (`tools/ez2judge.c`)               | `engine/judge-sim.ts`    | same counts, score, gauge and grade                       |
| Published keysounds (`.ssf`, 16-bit 44.1 kHz stereo)    | `ez2bms-audio` `cut.rs`  | `ez2port-oracle/tests/audio.rs` - header and PCM hash     |

## Deliberate differences

| What                     | EZ2PORT's bmson importer                               | EZ2BMS                                                   | Why                                        |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------ |
| Hold across a STOP       | converts the unshifted length: the hold gets shorter   | shifts the hold's end like any position                  | keeps the hold as charted                  |
| Mode                     | keywords in chart_name / file name first               | `mode_hint` as written; the keyword reading is linted    | an explicit field should not be overridden |
| Tier                     | keywords (`hd`, `shd`, `ex`) in names                  | `info.x_tier`, file named to match                       | same                                       |
| Two BPMs at one tick     | written; order then depends on the C library's `qsort` | never written                                            | the engine's sort is not stable            |
| Velocity, pan, hold kind | fixed at 127 / 64 / 0                                  | `x_vel`, `x_pan`, `x_kind` per note                      | EZ2 charts use them                        |
| Judgement and gauge      | windows scaled from `judge_rank`, gauge fixed          | `judgement_deltas` / `life_deltas` written to the `.ini` | per-chart, as the original game does       |
| `up` (release) notes     | the whole note is dropped                              | kept as a plain note; only the release re-trigger goes   | the press is still charted                 |
| Slice cut points         | rounded to 1 ms                                        | exact frames from the published f32 tempo                | consecutive slices join without a click    |
| Background tracks        | first track free at that tick                          | first track whose last sound has finished                | the original has one voice per track       |
| End of the stage         | 26 frames after the last record                        | a closing tempo record after the last sound's tail       | the last sound is not cut off              |

## Followed from the port's platform code (not in the oracle)

The mixer lives in EZ2PORT's platform layer (`platform/common/ezaudio.c`),
outside the vendored core, so these are transcribed and unit-tested rather than
compared against C: a retrigger restarts the sound on its voice; backing and
autoplay play on the sample's own voice, presses on the lane's; level is
`10^(dB/2000)` with -100 dB as silence; pan turns one side down and leaves the
other; the output passes a soft knee at 0.9 and a clamp.

Two deliberate differences: EZ2BMS resamples with a proper filter (the port
steps through a non-44.1 kHz sample nearest-neighbour), and it publishes every
keysound at 44.1 kHz so the port never has to resample one.

## The game's own play field (scene/skin.c, not in the oracle)

With a game folder set, the playfield draws with the mode's own panel, the way
EZ2PORT's `scene/skin.c` does. That file is outside the vendored core, so this
is transcribed and checked with unit and Playwright tests on a synthetic panel
(`apps/editor/src/bridge/demo-skin.ts`), not compared against C.

- **Which files.** `system/<Mode>/panel/STYLE_<Mode>1_<player>.pvi` - style 1,
  the plain panel. Every path component matches in any case; a texture
  reference is tried as `.abm` first (the name up to its first dot), then as
  written, in the panel folder and then under the game root; a numbered series
  stops at the first gap; exact black is transparent, as on the cabinet. A
  texture the folder lacks is not drawn and is listed in the EZ2PORT tab.
- **Which track is which lane.** Lane _i_ of the mode's `.gds` (player one's
  slot, in file order) draws with `[Track`_i+1_`]`. Without a `.gds` the
  bundled order is used, in which 5KeyMix's and ScratchMix's keys are
  Track2-Track6 (their descriptors open on the turntable).
- **Drawn as the port draws them:** one black gradient (alpha 0x96 to 0xff)
  under every Track box, only when Track1's colours are set - `BkColor1/2` are
  not lane fills; the border lines, outside the lane; each note at its
  texture's own size, centred in the lane, in the colour variant picked by the
  position in the beat (variant 0 for a third of the beat, then 1-4 a sixth
  each); holds as the three-slice bar (top half, one stretched middle row,
  bottom half); the beam lines above and below each note (a fourteenth of the
  lane's height at the scroll rate, `BkColor1`'s alpha, each channel scaled
  255/200); the key panel at its texture's size; the target bar, its frame
  cycling with the beat, additive, swaying a pixel or two while playing; the
  measure-line texture; the press glow and press beam while a key is down.
- **Different on purpose.** The field is centred in the window rather than at
  the panel's x, with the judge line as far above the bottom as on the
  480-line screen. The press beam is drawn at full height while the key is
  down (the port grows and shrinks it). The gauge, score, combo, judgement
  clips, bombs and groove lights are not drawn; the editor's HUD shows those.
  D3D blend pairs are reduced to normal or additive. Black, CV2Mix and the
  other styles and note skins are not offered yet.
- **2P.** The game's 2P panel keeps 1P's lane order, moved to the right (the
  port measured the original doing so), and the editor follows the panel. The
  neon skin still mirrors 2P, as BmsTWO's P2 skins do.

## Port behaviour worth knowing

- **Some hold kinds make 100% unreachable, or pass it.** The maximum score
  is `notes * 300`, with `notes` from the engine's counter
  (`ez2_note_counted`). Kinds 4 and 5 are counted by the counter's own ladder
  but pay a single instalment, so a perfect play falls short. Kinds 9-12
  are not counted, yet their head still scores. Play mode reproduces both
  (a synthetic 7K chart scores 121 of 156 under autoplay, as the port's own
  tool does); lint will flag these kinds on holds.

## Open questions

- **5 KEY ONLY and SCRATCH lanes.** `docs/gds-slots.md` lists the turntable and
  pedal tracks (10, 11) in the shipped `5keymix` and `ScratchMix` descriptors,
  while `ez2/mode.c` and every official chart use keys 1-5 only. EZ2BMS charts
  those modes on keys 1-5; with a game folder configured it reads the real
  `.gds`, and lint reports turntable/pedal notes in those modes.
- **Andromeda and Catch** have no bmson convention and EZ2PORT's packages
  cannot carry them yet; EZ2BMS keeps them for cabinet export only.
