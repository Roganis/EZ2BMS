# EZ2PORT compatibility

EZ2PORT (the owner's native EZ2AC engine) is the reference for everything
EZ2BMS publishes. This page lists where EZ2BMS follows it exactly, where it
deliberately does something else, and what is still unknown. Every "exact"
row is proven by a test against the vendored engine core
(`crates/ez2port-oracle`); the snapshot is EZ2PORT build 1582.

## Exact (oracle-tested)

| Area                                                    | EZ2BMS                   | Test                                              |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| EZFF `.ez` read/write, v5-v8                            | `io/ez/ezff.ts`          | `ezff.oracle.test.ts` - every field, every record |
| Tempo map and every record's time (f32 BPM, ms)         | `timing/engine-tempo.ts` | bit-identical milliseconds                        |
| `.gds` descriptors                                      | `ez2data/gds.ts`         | `ez2data.oracle.test.ts`                          |
| `.pvi` skins (tracks, target bar, note art)             | `ez2data/pvi.ts`         | same                                              |
| `.abm` decode (all six header variants, 8/16/24/32-bit) | `ez2data/abm.ts`         | RGBA hash identical                               |
| `.abm` encode (Final EX, 24-bit)                        | `ez2data/abm.ts`         | byte-identical to `ez2_abm_write`                 |
| File cipher                                             | `ez2data/crypt.ts`       | byte-identical for random tables                  |
| Velocity/pan arithmetic                                 | `ez2data/mixparam.ts`    | same integers                                     |
| Chart file names (mode, song, tier)                     | `modes/filenames.ts`     | same as `ez2_chart_id_parse`                      |
| Mode lane sets                                          | `modes/registry.ts`      | same tracks as `ez2/mode.c`                       |

## Deliberate differences

| What                     | EZ2PORT's bmson importer                               | EZ2BMS                                                   | Why                                        |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------ |
| Hold across a STOP       | converts the unshifted length: the hold gets shorter   | shifts the hold's end like any position                  | keeps the hold as charted                  |
| Mode                     | keywords in chart_name / file name first               | `mode_hint` as written; the keyword reading is linted    | an explicit field should not be overridden |
| Tier                     | keywords (`hd`, `shd`, `ex`) in names                  | `info.x_tier`, file named to match                       | same                                       |
| Two BPMs at one tick     | written; order then depends on the C library's `qsort` | never written                                            | the engine's sort is not stable            |
| Velocity, pan, hold kind | fixed at 127 / 64 / 0                                  | `x_vel`, `x_pan`, `x_kind` per note                      | EZ2 charts use them                        |
| Judgement and gauge      | windows scaled from `judge_rank`, gauge fixed          | `judgement_deltas` / `life_deltas` written to the `.ini` | per-chart, as the original game does       |

## Open questions

- **5 KEY ONLY and SCRATCH lanes.** `docs/gds-slots.md` lists the turntable and
  pedal tracks (10, 11) in the shipped `5keymix` and `ScratchMix` descriptors,
  while `ez2/mode.c` and every official chart use keys 1-5 only. EZ2BMS charts
  those modes on keys 1-5; with a game folder configured it reads the real
  `.gds`, and lint reports turntable/pedal notes in those modes.
- **Andromeda and Catch** have no bmson convention and EZ2PORT's packages
  cannot carry them yet; EZ2BMS keeps them for cabinet export only.
