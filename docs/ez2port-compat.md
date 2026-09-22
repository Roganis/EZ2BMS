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
