# BmsTWO's EZ2 profile - what is missing against the original (2026-09-04)

A gap list for a later BmsTWO session. BmsTWO is the bmson editor at
`~/BmsTWO` (a fork of djkero's BmsONE, whose EZ2 support this fork "keeps
as-is", README.md "EZ2 support"). Its charts reach this port through
`ez2/bmson.c` (the C importer) and `tools/bmson2ez.py` (the converter),
both of which follow rizu's canonical `ez2-*` convention (BMSON.md). The
comparison below is against the original's chart model as the port reads it:
`ez2/chart.h` (EZFF records), `ez2/mode.h` (the mode table), `ez2/songini.h`
(the per-chart ini), `ez2/score.h` (the hold machine), and
`../../EZ2REWRITE/reverse-engineering/modes-and-lanes.md` (per-mode track
sets, verified across the library).

Items marked **[BmsTWO]** are changes in the editor; **[port]** are changes
here. Neither side is blocked on the other, but a field the editor writes is
only useful once the importer reads it.

## 1. Modes and lanes

BmsTWO defines six view modes in `src/ViewMode.cpp` (`ViewModeEZ5kOnly` ..
`ViewModeEZAndromeda`), on the canonical lane numbers: `1`/`2` scratch,
`10`/`20` pedal, `11..15` and `21..25` keys, `31..34` effectors. Those are the
numbers `ez2/bmson.c` and `bmson2ez.py` map to `.gds` slots, so files move
between the two programs cleanly.

| original mode (`ez2/mode.h`) | BmsTWO view mode | gap |
|---|---|---|
| 5KeyMix | `ez2-5k-only` | none |
| StreetMix | `ez2-5k` | none |
| 7StreetMix | `ez2-7k` | none |
| ClubMix | `ez2-10k` | none (5 keys + 2 scratch + pedal + keys 6-10) |
| SpaceMix | `ez2-14k` | none (5 keys + EF1-4 + keys 6-10 + 2 scratch) |
| AndromedaMix | `ez2-andromeda` | **missing lane 2, the second scratch.** The lane list has one scratch, two pedals, four effectors and ten keys (17 lanes); the original's charts use two scratches and two pedals (modes-and-lanes.md, "andromeda (16K)") |
| RubyMix | none | same lanes as StreetMix, a distinct mode. Reaches the port only through a `ruby` keyword in `chart_name` (`bmson2ez.py` `detect_mode`); rizu names it `ez2-ruby` |
| ScratchMix | none | rizu and the port take `ez2-5k-scratch`: five keys plus the turntable, no pedal, notes judged by spinning while the lane's key is held (`~/rizu/chartbase/bmson/ChartDecoder.lua`) |
| EZ2CATCH | none | ten keys, one scratch, one pedal (club minus the second scratch), catch gameplay. **No bmson convention exists anywhere** - rizu has a catch engine but no `ez2-catch` hint |
| CV2Mix | none | a container of ten sub-modes with its own play field (`ez2/mode.h`, `EZ2_CV2_SUBMODES`). No convention |
| 5RadioMix, RadioMix, 10RadioMix, 14RadioMix | not applicable | courses from `system/<mode>/stage.ini` (`ez2/stageini.h`), not charts. Nothing authors a course today |

**[BmsTWO]** add `ez2-5k-scratch`, `ez2-ruby` and `ez2-catch` view modes;
add lane 2 to `ez2-andromeda`. **[port]** `detect_mode` already accepts the
first two hints; catch needs a lane map in `ez2/bmson.c` and `bmson2ez.py`
once the hint exists. CV2 and the courses wait for a convention.

## 2. The EZ2 info fields nobody reads

`EZ2_TEMPLATE.bmson` ships `info.judgement_deltas` (KOOL/COOL/GOOD/MISS) and
`info.life_deltas` (COOL/GOOD/MISS/FAIL), and `EZ2_INFO.txt` gives ranges for
them. Three problems:

* **The editor does not model them.** `DocumentInfo.cpp` keeps unknown
  `info` keys in `bmsonFields` and round-trips them, and the Info panel
  shows them only in the raw "extra fields" JSON box. There is no typed
  field, no validation, no default.
* **Nothing consumes them.** rizu's `chartbase/ez2/ini.lua` ignores the
  `[JudgmentDelta]` and `[GaugeUpDownRate]` sections on purpose; this port's
  `ez2/bmson.c` (line ~1118) and `bmson2ez.py` (line ~689) read only
  `judge_rank`, scale the port's default windows by it, and write the
  default gauge deltas.
* **The units are not the original's.** The original's `[JudgmentDelta]` is
  in **chart ticks of 1/192 beat** (`ez2/songini.h`), the missing-file
  defaults are 6/24/36/72, and the game adds 3 to all four before judging
  (`ez2_song_ini_apply_judge_widening`). The template's 6/18/40/56 and the
  ranges in `EZ2_INFO.txt` (KOOL 4-7, COOL 15-30, GOOD 40-60, MISS 50-70)
  follow some other scale. The gauge block has the right shape: the original
  has no KOOL entry and mirrors COOL into it (@0x4206e0), and the port's
  defaults are 0.2/0.1/-1.8/-4.8; bmson's `total` does not map at all
  (BMSON.md).

**[BmsTWO]** a structured EZ2 panel: four window fields in ticks, four gauge
fields, seeded with the original's defaults, and `EZ2_INFO.txt` rewritten to
say ticks and what the +3 widening means. **[port]** honour
`judgement_deltas` and `life_deltas` when present, falling back to the
`judge_rank` scaling only when they are absent.

## 3. Note-level data the original has and bmson cannot hold

The EZFF type-1 record (`ez2/chart.h`, `ez2_note`) carries more than
`{x, y, l}`. The importers fill these with constants:

| field | original | importer today | proposal |
|---|---|---|---|
| velocity | u8, 127 = full | 127 | note extension `x_vel` |
| pan | u8, 0 left / 64 centre / 127 right | 64 | note extension `x_pan` |
| hold kind | the byte that sets a long note's instalment step: kind 1 = beat/2, 2 = beat/8, 3 = beat/16, 0/6/13+ = beat/4, 4/5 = the whole length, 7..12 pay nothing (`ez2/score.h`, the hold machine @0x42fbf0) | 0 | note extension `x_kind`; the editor shows the instalment count it implies |
| per-track volume events | record type 2, u8 | not written | no proposal yet; rarely used |
| the lights track | track 21 (modes-and-lanes.md) | not written | low priority: the port drives lamps from presses (`scene/lights.c`), not from the chart |
| types 6, 7, 8+ | raw words, meaning unknown | not written | nothing to author until the decomp reads them |
| sprite BGA | `.scr` timeline over `.str` clips | bmson carries a video only | the writers in MODDING.md section 2.1 |

BmsTWO already has per-note extra fields (`NoteEditTool::SetExtraFields`),
so the three extensions are a documentation entry in
`docs/Bmson-Extensions.md` plus typed controls, in the style of the existing
`up` / `x_stop` / `x_color`.

**[BmsTWO]** the three note extensions. **[port]** read them in
`ez2/bmson.c` and `bmson2ez.py`; the record already has the bytes.

## 4. The reverse direction: bmson features the original has no place for

Recorded so the editor can warn rather than silently lose them:

* `stop_events`: EZFF has BPM changes and no stops. The importers turn a
  stop into a gap - exact in time, but the scroll does not freeze
  (BMSON.md "Stops").
* `up` (release re-trigger): dropped by both importers (`ez2/bmson.c` ~634,
  `bmson2ez.py` ~609). The original's hold release pays instalments, it does
  not re-trigger a sample.
* `x_stop`: ignored; a sample plays to its end or until its slot is
  retriggered.
* mines and invisible notes: dropped.
* tier: no field. Both importers infer NM/HD/SHD/EX from `chart_name`
  keywords. A `chart_name` without one lands on NM.
* the `song.bin` era byte (1ST TRAX .. FINAL EX) and the title plate art:
  no field; the port shows a CUSTOM SONG plate (BMSON.md).

**[BmsTWO]** an "EZ2 export check" that lists these before saving. Optional.

## 5. Not gaps, for the record

* The `.ezi` keysound index needs nothing from the editor: the importer
  writes mode-1 lines, and the mode-2 second filename the original reads is
  discarded (`ez2/ezi.c`).
* 2P chart files (`<mode>2p-<key>.ez`): the port builds only the 1P name
  (`ez2/bmson.c` ~1103) and the game's 2P play reads the 1P chart, so a
  separate 2P authoring path is not needed. BmsTWO's per-side skins are
  display only.
* BmsTWO's headless export and external-viewer hooks work as they are; a
  `--viewer ez2play` line is a BmsTWO-side convenience, not a gap.
