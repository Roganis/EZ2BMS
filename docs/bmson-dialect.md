# The bmson dialect EZ2BMS writes

EZ2BMS projects are bmson 1.0 files that any bmson reader can open, with a
small number of documented additions for what EZ2 charts need and bmson
cannot say. BmsTWO opens them unchanged; EZ2PORT plays them through the
packages EZ2BMS publishes (see [`ez2port-compat.md`](ez2port-compat.md)).

## Lanes

Canonical EZ2 numbering, shared with BmsTWO's `ez2-*` view modes and
EZ2PORT's importer (`ez2/bmson.c`, `slot_for_x`):

| `x`     | Lane                                           |
| ------- | ---------------------------------------------- |
| 0       | background (auto-played)                       |
| 1 / 2   | 1P / 2P turntable (scratch)                    |
| 10 / 20 | 1P / 2P pedal                                  |
| 11-15   | 1P keys 1-5                                    |
| 21-25   | 2P keys 1-5 (keys 6-10 in 10K and 14K)         |
| 31-34   | effectors EF1-EF4 (keys 6/7 in 7K, 6-9 in 14K) |

A mode is a view that plays a subset of these; a note on a lane the mode does
not have stays in the file and is played as background by EZ2PORT (EZ2BMS
shows it dimmed and lint reports it).

Legacy BMS-numbered files (`mode_hint` `beat-5k`, `beat-7k`, `beat-10k`,
`beat-14k`, `-fp` variants) are renumbered to the canonical lanes once, when
opened, with EZ2PORT's own table (`io/bmson/legacy-remap.ts`).

## Modes

| `mode_hint`      | Mode                    | EZ2PORT package                    |
| ---------------- | ----------------------- | ---------------------------------- |
| `ez2-5k-only`    | 5 KEY ONLY (5KeyMix)    | yes                                |
| `ez2-5k-scratch` | SCRATCH (ScratchMix)    | yes                                |
| `ez2-ruby`       | RUBY (RubyMix)          | yes                                |
| `ez2-5k`         | 5K STANDARD (StreetMix) | yes                                |
| `ez2-7k`         | 7 KEY (7StreetMix)      | yes                                |
| `ez2-10k`        | 10 KEY (ClubMix)        | yes                                |
| `ez2-14k`        | 14 KEY (SpaceMix)       | yes                                |
| `ez2-andromeda`  | 16 KEY (AndromedaMix)   | no - cabinet export only, proposal |
| `ez2-catch`      | EZ2CATCH                | no - cabinet export only, proposal |

EZ2BMS reads `mode_hint` literally. EZ2PORT's own bmson importer does not: it
searches `chart_name` and the file name for keywords first (`7street`,
`7radio`, `space`, `club`, `10radio`, `ruby`, `5radio`, `street`, `scratch`,
`5key`, in that order) and only then looks at `mode_hint`. EZ2BMS computes both
readings and lint warns when they differ. Files are named in the port's own
convention (`streetmix1p-<key>-hd.bmson`) so the two agree.

## Additions

| Member             | Where         | Meaning                                                                                                                                                                                                                                        |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x_tier`           | `info`        | `NM`, `HD`, `SHD` or `EX`. Explicit, instead of guessed from names                                                                                                                                                                             |
| `judgement_deltas` | `info`        | `{KOOL, COOL, GOOD, MISS}` - the chart `.ini`'s `[JudgmentDelta]`, **in ticks of 1/192 beat**, stored raw (the engine adds 3 to each when it loads them)                                                                                       |
| `life_deltas`      | `info`        | `{COOL, GOOD, MISS, FAIL}` - the chart `.ini`'s `[GaugeUpDownRate]`. There is no KOOL entry: the engine mirrors COOL                                                                                                                           |
| `x_vel`            | note          | EZ2 note velocity 0-127 (absent = 127)                                                                                                                                                                                                         |
| `x_pan`            | note          | EZ2 note pan 0-127, 64 centre (absent = 64)                                                                                                                                                                                                    |
| `x_kind`           | note          | EZ2 hold kind byte: a hold's instalment step (absent = 0, a quarter beat)                                                                                                                                                                      |
| `up`, `x_stop`     | note          | BmsTWO's extensions; kept, but EZ2 has neither (dropped when publishing, with a lint message)                                                                                                                                                  |
| `x_color`          | sound channel | BmsTWO's channel colour; kept                                                                                                                                                                                                                  |
| `x_scroll_events`  | chart (root)  | `[{y, rate}]`, sorted by `y`: scroll-speed changes (EZFF record type 6). From `y` on, EZ2PORT scrolls at the player's speed × `rate`; timing is untouched. Published to EZ2PORT as type-6 records on track 0. Written only when there are some |

`judgement_deltas` and `life_deltas` come from BmsTWO's `EZ2_TEMPLATE.bmson`;
`x_vel`, `x_pan` and `x_kind` are the names EZ2PORT's `BMSTWO-EZ2.md` proposes,
so BmsTWO and the port can adopt them as they are. `x_scroll_events` has no
proposal to follow (that document's row for type 6 predates the port playing
them); it is EZ2BMS's, and `rate` is kept as the f32 the record will carry.

The keysound workbench and Classic mode (M2) add nothing to the file.
Classic mode's splits are ordinary background notes with `c: true`, keyed
notes are ordinary notes, and whether the song is charted in Classic mode
is kept beside the charts, as `classic` in `ez2bms.song.json`. Renaming a
sound in the workbench renames the file and rewrites each channel's `name`.

A chart imported from the game's own `.ez` (M5) keeps what bmson has no
place for. An EZ2PORT publish ignores it (but for scroll changes an older
import kept, which it publishes as the chart's own); a cabinet export (M6,
`exporting.md`) writes it back - background notes on their own tracks
(re-placed where the track is a lane in the mode), raw lengths where they
still fit the note, the kept records on their tracks, the header's names
(CP949), second BPM, track count and length - so an unedited chart returns
as the game had it:

| Member         | Where               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x_track`      | note, scroll change | the `.ez` track a background note or a scroll change was on (lane notes' tracks follow from the mode)                                                                                                                                                                                                                                                                                                                                                                                           |
| `x_raw1`       | scroll change       | the record's second word, when not 0                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `x_len`        | note                | the record's raw length when a publish would write another: a background note's (published as a tap), a lane tap's 1-6                                                                                                                                                                                                                                                                                                                                                                          |
| `x_ez`         | chart (root)        | the `.ez` header and `.ini` it came from: `file`, `version`, `name`, `name2`, `bpm`, `bpm2`, `total_ticks`, `last_tick` (its last record's tick), `ticks_per_measure`, `tracks`, `measure_scale`                                                                                                                                                                                                                                                                                                |
| `x_ez_records` | chart (root)        | records with no bmson home, `{track, y, type, value?, bpm?, raw?, scroll?}`: volume (2), beats (4), marks (5), stops (7), unknown kinds, out-of-range tempi, and scroll speeds (6) whose f32 is not a number. Moved by a change of resolution, not by other edits; not published to EZ2PORT. Charts imported before `x_scroll_events` existed hold their scroll changes here too: they count as the chart's (a package carries them), and an Issues quick fix turns them into `x_scroll_events` |

A chart imported from BMS (M5) keeps the headers EZ2 has no use for in
`info`: `x_bms_rank`, `x_bms_defexrank`, `x_bms_total`, `x_bms_player`,
`x_bms_difficulty`, `x_bms_lnmode`, each the header's text as the file had
it. A BMS export (M6) writes `#RANK`, `#DEFEXRANK`, `#TOTAL` and `#LNMODE`
back from them; `#PLAYER` and `#DIFFICULTY` it writes from the chart's mode
and tier.

Stem slicing (M4) adds nothing either: a cut is a background note with
`c: true` on the stem's channel, a keyed slice an ordinary lane note. Which
stems have strips is a view, kept in the app's settings, not in the song.

## Lossless reading

- Members EZ2BMS does not know are kept on the object they belong to and
  written back.
- A known member with the wrong type (`"level": "12"`) is kept verbatim, not
  interpreted, and reported. The exceptions are a note's required `l` and `c`,
  which fall back to `0` and `false`.
- Standard arrays a file did not have (`stop_events`, say) are not added on
  save unless something is put in them.
- A UTF-8 byte-order mark is accepted and never written: EZ2PORT's text parsers
  do not strip one.
- bmson 0.21 (no `version`, camelCase names, `bpmNotes`/`stopNotes` with `v`,
  `ID`) is read by renaming it to 1.0 first, member for member as BmsONE's
  converter does, and saved as 1.0. Its absolute `total` is kept as
  `info.x_total_v021`, since 1.0's `total` is relative.
- Legacy `beat-*` lane numbers are renumbered onto the EZ2 lanes as a chart
  opens, and the hint becomes the `ez2-*` one; Issues says what moved. A
  `beat-10k` chart with notes on x 9 or 10 is read in the bmson spec's
  numbering (2P keys x 9-13), anything else in EZ2's (x 11-15).

## Output

Sorted keys, 4-space indentation (Qt's `QJsonDocument` layout, so diffs
against BmsTWO stay small), notes grouped by channel in channel order and
sorted by `(y, x)` within a channel, one note per line. Saving an unchanged
EZ2BMS file reproduces its bytes.

## Timing

- Positions are pulses; `info.resolution` pulses to a quarter note (default
  240). EZ2 charts are 48 ticks to the beat, so a position converts exactly
  when `y * 48 % resolution == 0`; the snap grids EZ2BMS offers are exactly
  those.
- `lines` are kept, but EZ2 draws a measure line every 4 beats regardless.
- STOPs are kept in the project. EZ2 has no STOP: they are published as gaps
  (exact timing, but the scroll does not freeze) and lint says so.
