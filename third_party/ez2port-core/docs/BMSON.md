# Adding songs: bmson into the port (brainstorm, 2026-09-03)

A design note, not a plan. The question is how a new song - written as a
bmson, the format the rizu fork at `~/rizu` already plays for EZ2AC - gets
into this port's select wheel and play field. Three routes are laid out
below with what each costs and what each can never do, then the decisions
that are the same on every route, then a recommendation.

## 1. What a song IS to this engine

Nine things, all keyed by one short name (the "song key", 15 characters at
most - it is a `char[0x10]` in `song.bin` and a folder name under `sound/`):

| piece | where | format | who reads it |
|---|---|---|---|
| the table entry | `system/<mode>/song.bin` | 0x56-byte record: key, name, kind, four `{level, a, b}` tiers; whole file under a fourth cipher whose tables live in the exe | `ez2/songdb.c`; the select wheel, the level plates, the category pager |
| the chart(s) | `sound/<key>/<mode>1p-<key>[-hd|-shd|-ex].ez` | EZFF, XOR-ciphered (tables in the exe): 64 tracks of fixed-width records - type 1 note (key index, velocity, pan, length), 2 volume, 3 BPM, 4 beats/measure, 5 mark, 6 scroll, 7, 8+ | `ez2/chart.c`; `play_chart` |
| the keysound index | `sound/<key>/<same name>.ezi` | ciphered text, `<note> <mode> <file>` per line, 0x800 slots | `ez2/ezi.c` |
| the samples | `sound/<key>/*.ssf` | raw PCM under an 18-byte WAVEFORMATEX-shaped header, no magic | `ez2/ssf.c`, the audio layer (ssf is the ONLY sample format it decodes) |
| the per-chart metadata | `sound/<key>/<same name>.ini` | ciphered ini: `[General] Level, MeasureScale`; `[JudgmentDelta] Kool/Cool/Good/Miss` in chart ticks; `[GaugeUpDownRate] Cool/Good/Miss/Fail` | `ez2/songini.c`: THE JUDGEMENT WINDOWS AND GAUGE DELTAS ARE PER CHART, not per mode - only a missing file falls back to fixed defaults. A separate song-level `<key>.ini` carries `PlayDelayTime` / `PlayStartPos` (the preview cue) |
| the disc | `system/disc/<key>.abm` | XOR-headed BMP | the wheel, the result, the total result |
| the title plate | `system/songname/<key>.bmp` | rasterised ART of the title, not text | the wheel's rows |
| the preview | `system/preview/<key>.ssf` | ssf | the wheel after 0x1e idle ticks |
| the background | `bg/<key>/<key>.scr` + `.str` + `.abm`, or `video/<key>/<key>.spv` (ASF/WMV3) | the sprite timeline, or a movie the port decodes through ffmpeg | `scene/bga.c`, `media/video.c` |

Plus two things it WRITES: `sound/rank_<mode>_<key><tier>.bin` (the
five-row table the name entry fills) and, at a radio course's end,
`system/ranking/ranking_<mode>_<channel>.bin`.

And ONE thing that is fixed per MODE, not per song: the lane order and
the key-to-lane map (`system/<mode>/<mode>.gds`, `ez2/gds.h`). The
judgement windows and the gauge deltas are NOT the mode's - they come from
each chart's own `.ini` above (a window is in 1/192-beat ticks, so the same
number is a different number of milliseconds on every chart).

## 2. What a bmson brings

One JSON file per chart (`~/rizu/chartbase/bmson/ChartDecoder.lua` is the
reader to crib from):

* `info`: title, artist, genre, level, init_bpm, `resolution` (pulses per
  quarter note, 240 by default), `mode_hint`, `chart_name`, jacket images
  (`title_image`, `eyecatch_image`, `banner_image`), `preview_music`.
* `lines` (bar lines), `bpm_events`, `stop_events`.
* `sound_channels`: one per sample file (WAV or OGG), each with notes
  `{x, y, l, c}` - lane, pulse, long-note length, and the "continuation"
  flag that slices one sample across successive notes.
* `bga`: `bga_header` (id -> file, usually MP4/WebM) and `bga_events`.

rizu's EZ2 convention, which is the one to adopt so charts are shared
between the two programs (`ChartDecoder.lua:105-150`):

* `mode_hint`: `ez2-5k-only`, `ez2-5k-scratch`, `ez2-ruby`, `ez2-5k`,
  `ez2-7k`, `ez2-10k`, `ez2-14k`; `chart_name` keywords override
  (`7street`, `club`, `space`, `ruby`, `street`, `5key`...).
* canonical lanes, mode-independent: `x=1` 1P scratch, `2` 2P scratch,
  `10` 1P pedal, `20` 2P pedal, `11..15` 1P keys 1-5, `21..25` 2P keys
  1-5, `31..34` effectors EF1-4 (= keys 6-9 on 7K/14K); `x=0` is BGM.
* a legacy `beat-5k`/`beat-7k`... numbering with BMS-style x, which the
  decoder still accepts.

For the port those map onto the `.gds` input slots: keys 1-5 = slots
10..14, scratch = 15/16, pedal = 17, keys 6/7 = slots 6/7, 2P keys =
18..22 with scratch 23/24 - `ez2/gds.h` has the constants and
`ez2_gds_lane_for_key` turns a slot into a lane. So the map is `bmson x ->
gds slot -> lane`, fixed per mode, about ten lines of table.

## 3. Three routes

### A. Convert to native, into the game tree ("the song becomes an EZ2AC song")

An offline tool (Python, the shape of rizu's `tools/import-ez2-assets.py`
in reverse) turns a bmson folder into the nine pieces above and writes them
into the game tree: appends a record to the mode's `song.bin`, writes the
ciphered `.ez`/`.ezi`/`.ini`, renders the samples to `.ssf`, makes the disc
and title `.abm`s, the preview `.ssf`, and a background.

* **The port needs no change at all**, and neither does anything else:
  the song is on the wheel of THIS binary's data. Every cipher involved is
  a symmetric XOR the port already reads with tables it pulls from the
  user's exe at run time (`ez2_decrypt`, `ez2_songdb_load`), so the tool
  can write them the same way, and the repository still never carries a
  table.
* **It might also work in the original executable.** That is the unique
  prize of this route and it is untested. The risks: whatever fixed-size
  song arrays the original's select allocates (the row table at
  `0x1b2ec18 + index * 0x80` is a fixed block), the `.ini` fields the
  original's loaders insist on, and the background: the original's movie
  player takes `.spv` (ASF/WMV3), which ffmpeg cannot encode - a `.scr`
  timeline of `.str` frames could be generated from a video instead
  (frames as `.abm` textures), which is what old songs ship.
* **It writes into the player's game tree** and edits `song.bin` in place.
  A mistake corrupts a shipped table; the tool must back up and be
  idempotent (re-import = replace, keyed by song key).
* **Lossy by construction**: EZFF quantises to 192 ticks per measure, has
  BPM changes but NO stops, one sample per note (no slicing), velocity
  and pan per note (bmson has neither: defaults 127/64), and 0x800
  keysound slots. See section 4 for what each costs.

Effort: the tool is the work - a few hundred lines of Python plus ffmpeg
for audio and a font for the title plate; the port side is zero.

### B. A runtime bmson loader in the port

`ez2/bmson.c` parses the JSON and hands `play_chart` the same in-memory
things it builds from an `.ez` today: an `ez2_chart` (tracks of records in
192-tick measures), the tempo map, the key-index-to-sample map; an
"overlay" song list scanned from a `songs/` folder is merged into the
per-mode `songdb` after `song.bin` is read; the wheel loads the jacket and
title from PNG and text.

* **Nothing is written to the game tree**; `song.bin` and the ciphers are
  untouched. A song is a folder you drop in, exactly as in rizu.
* **New dependencies in the engine**: a JSON parser (jsmn/cJSON), WAV and
  OGG decoders (dr_wav, stb_vorbis - single headers, public domain), PNG
  (stb_image), and a text-rendered title plate (the port already draws
  text for its debug HUD and the test menu, so that is a font choice, not
  a subsystem).
* **Two chart formats inside the play code.** The conversion to 192-tick
  records happens in memory instead of on disk, so the quantisation and
  the no-stops limit are the same as A unless the tempo model is extended
  (a stop is a zero-BPM segment the scroll freezes in - a port-only
  feature the original never had, doable in `ez2_tempo` but every consumer
  of ticks-per-ms would need to agree).
* Slicing (`c: true`) can be honoured at run time by playing a sample from
  an offset - the audio layer's voices are cursors into a buffer, so that
  is a small change - where A has to pre-cut the sample into files.
* **Invisible to the original executable**, by definition.

Effort: the largest of the three on the C side; the payoff is that bmson
becomes a first-class input and rizu's library plays unchanged.

### C. Convert offline to a plain package, overlay at run time (the middle)

The tool from A produces a per-song folder in the port's own space
(`userdata/songs/<key>/`) holding PLAINTEXT EZFF (`ez2_chart_parse` takes
decrypted bytes already - accepting an unciphered file is a magic check),
a plaintext `.ezi`, `.ssf` samples, the jacket as `.abm` or PNG, a preview
`.ssf`, and a small `song.ini` with the table fields. The port merges an
overlay list from that folder into the songdb and resolves those songs'
files there instead of under `sound/`.

* The port side is small and contained: the overlay list, one lookup
  fallback in `ez2_stage_chart` / the asset resolvers, and the plaintext
  acceptance. No new decoders if the tool renders everything to the
  engine's own formats.
* No writes into the game tree; the original's `song.bin` is never
  touched.
* Same losses as A (it IS A's converter), but A's "export into the game
  tree" becomes an optional second command of the same tool later, if the
  original-exe experiment is ever wanted.
* Still not visible to the original executable unless that export is run.

Effort: the tool (shared with A) plus a day of port work.

## 4. Decisions that are the same on every route

* **Lane numbering**: adopt rizu's canonical `ez2-*` scheme above, and
  accept its legacy `beat-*` numbering with the same fallback rules, so
  one bmson serves both programs.
* **Which mode**: `mode_hint` -> the port's mode name: `ez2-5k-only` ->
  5KeyMix, `ez2-ruby` -> RubyMix, `ez2-5k` -> StreetMix, `ez2-7k` ->
  7StreetMix, `ez2-10k` -> ClubMix, `ez2-14k` -> SpaceMix,
  `ez2-5k-scratch` -> ScratchMix; `chart_name` keywords first, as rizu
  does. EZ2Catch and CV2Mix have no bmson convention yet.
* **Tiers**: a song folder holds up to four bmson for one mode; the tier
  comes from the file name or `chart_name` (`NM`/`HD`/`SHD`/`EX`, rizu's
  files are `5k-NM.bmson`, `5k-HD.bmson`), the level from `info.level`.
* **Quantisation**: bmson pulses to 192 ticks per measure is exact when
  `4 * resolution` is a multiple of 192 (240 -> 960 = 5 pulses a tick;
  rizu's converted charts use 6144 -> 24576 = 128 a tick). Anything else
  rounds; report the worst rounding error per chart in the tool's output
  and refuse above a threshold rather than ship a chart that drifts.
* **Stops**: not representable in EZFF or in `ez2_tempo`. Reject charts
  with `stop_events` (with a clear message) until someone wants the
  port-only extension.
* **Long notes**: `l` pulses -> the record's `length` with the +6 bias
  (`ez2_note_hold_ticks`); a hold shorter than a tick is a tap.
* **Keysound slicing** (`c: true`): pre-cut into separate samples
  offline (A, C) or play from an offset at run time (B). Either way the
  0x800-slot ceiling applies after cutting.
* **Velocity and pan**: 127 and 64 for every note; bmson has no per-note
  gain.
* **The song key**: derive a 15-character-or-shorter ASCII key from the
  folder name (the ranking files and every asset are named by it; it
  must not collide with a shipped key - check `sound/` first).
* **Title and disc art**: the wheel draws a title PLATE, not a string.
  Render `info.title` with a font into the plate's dimensions (rizu's
  import tool went the other way and could not: rasterised art cannot be
  read back as text, but text can always be rasterised). Jacket from
  `title_image` / `eyecatch_image`, scaled to the disc's size.
* **Preview**: `preview_music` if present, else the BGM channel's first
  20 seconds mixed down; the song-level `.ini`'s `PlayStartPos` cue can
  point the wheel at the chorus instead.
* **The chart `.ini`**: the converter must write one per chart, because
  the engine takes its windows and gauge from it. bmson's `judge_rank`
  (a percentage of a player's default windows, 100 = normal) maps onto
  the EZ2 defaults scaled: `72/36/24/6` Miss/Good/Cool/Kool are the
  missing-file defaults, most shipped charts run 73/53/27/9. Under route 3
  the emitted `.ini` is plaintext, so an author can tune it by hand.
  bmson's `total` does NOT map: it describes a BMS groove gauge that
  starts low and clears at 80%, where EZ2's starts full and fails at
  zero; emit the EZ2 gauge defaults (or a per-level preset) and say so in
  the converter's output. `MeasureScale` (the mode's scroll base) and
  `Level` go in the same file.
* **Background**: the port's ffmpeg path opens any container, so an MP4
  from `bga_header` plays as-is on routes B and C; only the original
  executable needs `.spv` or a `.scr` timeline.
* **Rankings**: `rank_<mode>_<key><tier>.bin` gets created on the first
  write, as for any shipped song; nothing to do.

## 5. Recommendation

Start with **C**, built so that **A** is one extra flag away:

1. Write the converter (Python) against rizu's library as the source of
   truth: bmson folder in, port package out. Reuse rizu's decoder rules
   for modes and lanes verbatim so the two programs never disagree.
2. Teach the port the overlay: a `userdata/songs/` scan merged into the
   per-mode songdb, plaintext EZFF/EZI accepted, asset resolvers falling
   back to the package folder. Small, contained, testable with one song.
3. Only then decide whether the "export into the game tree" step (A) is
   worth trying against the original executable - it is the same
   converter writing ciphered files and a patched `song.bin`, and the
   answer to "does the original play it?" is one experiment on a copy of
   the tree.

Route B is the right answer only if the goal becomes "play any bmson
library without a conversion step"; then the converter's mapping code
moves into C and the losses stay the same.

## 6. Questions that change the plan

* Do you want new songs to work in the ORIGINAL executable too, or only
  in the port? (A vs C.)
* Is rizu's `userdata/charts/bms/EZ2/` library the source of truth for
  the charts, or will bmson come from elsewhere (other EZ2AC-convention
  bmson authors)?
* Are the backgrounds MP4 (rizu's convention) - fine for the port - or
  do you want them to follow the original's `.scr`/`.str` sprite model?
* Should stops be rejected, or is the port-only stop extension wanted?

## 7. The route-3 package, as `tools/bmson2ez.py` writes it (2026-09-03)

The converter exists: `tools/bmson2ez.py FOLDER... --root <game root>
[--out userdata/songs] [--key K] [--link] [--force] [--judge-scale F]`.
`--root` is required because the lane-to-track map is read from the game's
own plaintext `system/<mode>/<mode>.gds` rather than hardcoded. One folder
per song comes out, named by the song KEY (the folder name reduced to
lowercase ASCII letters and digits, 15 at most, or `--key`):

    <key>/
      song.ini            [Song] Key, Title, Artist, Genre, Source, Converter
                          [Charts] <Mode>.<Tier> = <level> ; <file>.ez
                          [Assets] Disc, Songname, Eyecatch, Preview
                          [Bga] File, StartMs            (only when there is a movie)
      <mode>1p-<key>[-hd|-shd|-ex].ez   PLAINTEXT EZFF, version 8 (13-byte records):
                          notes type 1 (key index, velocity 127, pan 64, kind 0,
                          length = hold ticks + 6), BPM changes type 3 in track 0
      <same>.ezi          plaintext: "<slot> 1 <name>.wav", slots from 1
      <same>.ini          [General] Level, MeasureScale=1.6
                          [JudgmentDelta] the 9/27/53/73 norm scaled by judge_rank
                          [GaugeUpDownRate] the 0.2/0.1/-1.8/-4.8 defaults
      *.ssf               every keysound (and slice), 16-bit 44.1 kHz stereo
      disc.abm            256x256, from eyecatch_image (the stagefile), cut to the
                          radius-125 CIRCLE on keyed black every shipped disc uses,
                          the art's own black lifted to (1,1,1) - Final EX .abm
      songname.abm        256x32, the TITLE RENDERED AS TEXT, white on keyed black
      eyecatch.abm        1024x512, from title_image
      preview.ssf         preview_music, else 20 s mixed down on rizu's keysound-
                          preview plan (sphere/ui/keysound_plan.lua): EVERY note's
                          sound, a window starting a quarter of the way in, long
                          background samples already sounding seeked in, 1 s fades
      <movie>             the first bga_header file, copied (or symlinked with --link)

The mode's file prefix is the `.gds` folder name (`streetmix1p-`,
`7streetmix1p-`, ...), so a package chart is named exactly like a shipped
one and the tier suffix is the game's own. What the port side has to do to
play one of these (next): merge `userdata/songs/*/song.ini` into the
per-mode song list after `song.bin`, resolve a package song's chart, `.ezi`,
`.ini`, samples and art from its folder, accept the plaintext (the `.ez`,
`.ezi` and `.ini` readers currently expect ciphered bytes and get the
tables from the exe), raise the 0x800 keysound cap, and start the movie
at `StartMs`.

How the converter decides things:

* mode: `chart_name` keywords first, then `mode_hint` (`ez2-*`, or the
  legacy `beat-*` with rizu's BMS-style lane numbering); tier: `SHD`, `HD`,
  `EX`, `NM` tokens in the file name or `chart_name`, else NM.
* lanes: rizu's canonical `x` (1 scratch, 10 pedal, 11-15 keys, 21-25 2P,
  31-34 effectors) -> `.gds` input slot -> `SongTrack`. `x=0` and any
  lane the mode lacks go to auto tracks (20 upward, then the rest),
  packed so no two land on one track at the same tick.
* time: tick = round(pulse * 48 / resolution); the worst rounding is
  reported. Stops become gaps: everything after a stop shifts by its
  duration, exact in time, the scroll does not freeze.
* keysounds: a fresh hit followed by another fresh hit is the whole file
  (the engine's own retrigger cuts it); a note followed by a continuation,
  and every continuation, is its own `[offset, next)` slice, cut with
  ffmpeg and deduplicated. A channel with no file becomes `silence.ssf`.
* dropped, with a count: mines, release notes (`up`), invisible notes
  (`key_channels`). `total` is ignored and said so.

First run, on rizu's `Cat's_rule` (StreetMix NM + HD, 6144 pulses a
quarter): 2,815 records, 842 keysound slots, worst rounding 0.49 tick, 851
`.ssf`, the movie and the three plates; the chart reads back with every
record in order and every `.ezi` entry resolving. `TOKYO-RHYTHM No.524`
(5K + 7K) converts too; its BMS-style image BGA is not a movie and is
reported as such.

## 8. The port side (2026-09-03) - done

`ez2/usersongs.[ch]` is the module; `--songs DIR` names the packages'
folder (default: the config directory's `songs/` when it has any). What was
hooked, each a few lines:

* `ez2_songdb_open_for_mode` merges every package offering charts for the
  mode AFTER `song.bin` - one entry (key, title as the name, the four tier
  levels) and the key into the song.ini's `Category` group (1..47, 1 when
  unsaid); a shipped key is never shadowed.
* `ez2_songdb_song_dir` and `ez2_stage_chart` look in the package folder
  first, so the chart list and the stage runner find `streetmix1p-<key>.ez`
  there; `ez2_ranking_path` keeps the package's `rank_*.bin` beside it.
* `ez2_file_read_decrypted` recognises PLAINTEXT by content - a chart that
  begins `EZFF`, an index or ini whose first bytes are printable - and hands
  it over without a cipher or an executable.
* `EZ2_EZI_SLOTS` is 0x10000, the record's key width; the original's 0x800
  stays as `EZ2_EZI_SLOTS_ORIGINAL` for the converter's warning.
* `ez2_bga_open_movie(path, start_seconds)` plays the package's movie,
  offset to the bmson's first bga event; `play_chart` uses it for a
  package song and the game tree's scene otherwise.
* the wheel's disc, title plate, preview and the eyecatch, and the result's
  plate and disc, ask `ez2_usersongs_asset` before the game tree.

Verified with the converted `Cat's rule`: `--song catsrule --select` seats
the package on the wheel and its eyecatch; the HD chart plays under
`--auto` with all 842 samples resolved and the movie decoding, 623 KOOLs
over the first 69 s. `tests/test_usersongs.c` covers the merge, the
lookups, the plaintext readers and the ranking path.

Not done, and known: the movie is stretched to the screen like a `.spv`
(a 16:9 file is squashed); packages are listed at merge time only (a new
one needs a restart); the title plate is a plain white font.

## 9. In the port itself (2026-09-03) - done

The converter now lives in the port as `ez2/bmson.[ch]`, a line-for-line
restatement of `tools/bmson2ez.py` in C (the Python tool stays as the
reference and the offline path), with three helpers it needed:

* `ez2/json.[ch]` - a small JSON reader (tree, unescaping, BOM);
* `media/audio.c` / `media/image.c` - the samples and the jacket through
  the ffmpeg the video layer already links (plus libswresample); with no
  ffmpeg, PCM `.wav` samples still convert through a reader in bmson.c and
  the art is skipped;
* `ez2_abm_write` in `ez2/abm.c` - the Final EX `.abm` encoder, the
  decoder inverted.

The title plate is drawn with the game's own bitmap font
(`system/common/fontEn.dat`, ez2/font.h), so it looks like the game's text.

**How it is used.** Drop a bmson folder into the songs directory
(`--songs DIR`, default the config directory's `songs/`). On the next start,
every subfolder that has `.bmson` files and no `song.ini` is converted into
`<songs>/<key>/` - the log says what it did - and the package is on the
wheel that same start. A folder whose key already has a package is left
alone. `ez2play --songs DIR --import FOLDER` converts one folder now and
exits. Cat's rule (two charts, 851 samples, the movie) imports in under six
seconds and comes out record-for-record identical to the Python tool's
package.

`tests/test_bmson.c` converts a synthetic three-note chart with PCM `.wav`
keysounds and no codec library, reads it back through chart.c, ezi.c and
ssf.c, and checks the stop-to-gap shift, the lane-to-track map, the slice
count, the resampled sample and both ini files.

**The title plate (2026-09-03, later).** The shipped `system/songname/*.abm`
are rasterised art: a bold humanist sans, white, antialiased, right-aligned
with the ink ending at x=246, nine-pixel capitals on a baseline at row 23.
Both converters now render that: `ez2/ttf.[ch]` through `third_party/
stb_truetype.h` (public domain) and the closest bold sans the machine has -
Roboto, Open Sans, Liberation Sans, DejaVu Sans, or Windows' Arial / Segoe
UI Bold, `EZ2_TITLE_FONT=<file>` to name one - sized by the face's capital
height and squeezed to fit a long title; the Python tool does the same with
Pillow. With no TrueType face at all, the game's bitmap font as before.

## 10. The font, the badge and the category (2026-09-03, later)

* **Roboto Bold ships with the port** - `third_party/fonts/` (Apache-2.0,
  ATTRIBUTION.md), copied to `fonts/` beside the executable by the build
  and into the drop-in folder. `ez2/ttf.c` looks there first, so no system
  font is needed; `EZ2_TITLE_FONT` still overrides.
* **The version badge under the focused song's name is now drawn for
  every song**: `ani_Version.str` (m_be8d8), its cell 1 the 128x16
  `Version\version_NN` plate picked by the song's version index, which is
  the `song.bin` record's kind byte (0..18 = 1ST TRAX .. FINAL EX - the
  table's 436 songs use exactly those nineteen values). Re-armed per wheel
  step, held from frame 0x78 once done (m439f00). It was audit item 3.14's
  "missing". An imported song wears a "CUSTOM SONG" plate rendered once per
  run in the same style (right-aligned to x=123, eight-pixel capitals on
  row 12, the art's cyan) to `<songs>/version_custom.abm`.
* **A CUSTOM category**: the song table's 47 groups get a 48th
  (`EZ2_SONGDB_GROUPS`), the default for a package's `song.ini` when it
  names none; the select's strip becomes a 48-bank ring when user songs are
  on, with a "CUSTOM" label rendered in the Sortimage style for the bank
  that has no art. Measured off the shipped labels: a LIGHT geometric sans,
  centred on x=62, eleven-pixel capitals on row 13, white; rendered from
  Fira Sans Light (vendored, OFL 1.1; `EZ2_LABEL_FONT` overrides), with the
  antialiasing carried in the colour values as the shipped art carries it,
  because the strip draws additively and an alpha-only edge would add full
  brightness and read as bold. A label wider than the widest shipped one
  (35 px, "1.5-2.0") is CONDENSED to that width - the capitals keep their
  height - which is how the shipped long names keep their bank's room. On the ring
  it sits after the game's last bank (`category_47`, "OTH") and before its
  first ("HOT"), so it is one step left of the opening page. The pager's
  wrap moved from bank 0x2e to the ring's end.
* `EZ2_SELECT_CAT=<0-based bank>` opens the wheel on a bank (a screenshot
  hook, like EZ2_PANEL_DEMO).

## 11. What the cabinet taught (2026-09-05)

Three conversions that worked on Linux and not on the cabinet, each a
Windows fact the importer now honours (`ez2/bmson.c`, `media/mpath.h`,
`thirdparty/fetch-ffmpeg.sh`):

* **The minimal ffmpeg decides what converts.** The Windows build links a
  cross-built ffmpeg with `--disable-everything`; the first cut had the
  `.spv` movie codecs only, so a bmson's OGG keysounds and PNG jacket were
  "missing or undecodable" while its charts converted fine. The script now
  carries OGG/Vorbis, WAV, FLAC, MP3, PNG (with a cross-built zlib), JPEG,
  BMP, and for a bmson BGA H.264/MPEG-4 in MP4/MOV and VP8/VP9 in WebM/MKV.
* **ffmpeg takes UTF-8 paths on Windows; the port's are ANSI.** A folder
  with non-ASCII characters in its name converted its charts (read through
  `fopen`) and none of its samples (read through `avformat_open_input`,
  which could not find the folder). The media layer converts at the
  boundary.
* **Windows is case-insensitive, and so must the `.ssf` names be.** Cat's
  rule ships `LH_1.wav` and `lh.1.wav` (36 such pairs); the stem rule turns
  the dot into an underscore, and on the cabinet's disk the two `.ssf`
  files were one. Linux never saw it. A stem another source already owns,
  case aside, gets `~2`, `~3`...

Also from that day: BGM notes go on the first auto track free at their tick,
from 20 up, as `tools/bmson2ez.py` does (the C importer round-robined them
over every unused track); and a folder converting on the way into the song
select draws "ADDING NEW SONGS / <folder> / CONVERTING k OF n" instead of a
frozen frame (`ez2_usersongs_set_progress`).
