# EZ2PORT compatibility

EZ2PORT (the owner's native EZ2AC engine) is the reference for everything
EZ2BMS publishes. This page lists where EZ2BMS follows it exactly, where it
deliberately does something else, and what is still unknown. Every "exact"
row is proven by a test against the vendored engine core
(`crates/ez2port-oracle`); the snapshot is EZ2PORT build 1582.

## Exact (oracle-tested)

| Area                                                                                                                                         | EZ2BMS                                 | Test                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EZFF `.ez` read/write, v5-v8                                                                                                                 | `io/ez/ezff.ts`                        | `ezff.oracle.test.ts` - every field, every record                                                                                                                                                                                                                                                                                                       |
| Tempo map and every record's time (f32 BPM, ms)                                                                                              | `timing/engine-tempo.ts`               | bit-identical milliseconds                                                                                                                                                                                                                                                                                                                              |
| `.gds` descriptors                                                                                                                           | `ez2data/gds.ts`                       | `ez2data.oracle.test.ts`                                                                                                                                                                                                                                                                                                                                |
| `.pvi` skins (tracks, target bar, note art)                                                                                                  | `ez2data/pvi.ts`                       | same                                                                                                                                                                                                                                                                                                                                                    |
| `.abm` decode (all six header variants, 8/16/24/32-bit)                                                                                      | `ez2data/abm.ts`                       | RGBA hash identical                                                                                                                                                                                                                                                                                                                                     |
| `.abm` encode (Final EX, 24-bit)                                                                                                             | `ez2data/abm.ts`                       | byte-identical to `ez2_abm_write`                                                                                                                                                                                                                                                                                                                       |
| File cipher                                                                                                                                  | `ez2data/crypt.ts`                     | byte-identical for random tables                                                                                                                                                                                                                                                                                                                        |
| Velocity/pan arithmetic                                                                                                                      | `ez2data/mixparam.ts`                  | same integers                                                                                                                                                                                                                                                                                                                                           |
| Chart file names (mode, song, tier)                                                                                                          | `modes/filenames.ts`                   | same as `ez2_chart_id_parse`                                                                                                                                                                                                                                                                                                                            |
| Mode lane sets                                                                                                                               | `modes/registry.ts`                    | same tracks as `ez2/mode.c`                                                                                                                                                                                                                                                                                                                             |
| Published package (`song.ini`, `.ez`, `.ezi`, `.ini`)                                                                                        | `publish/package.ts`                   | `publish.oracle.test.ts` - the engine reads the plan back                                                                                                                                                                                                                                                                                               |
| Lane notes and background sounds of a bmson                                                                                                  | `publish/chart-plan.ts`                | same records as the port's own `ez2_bmson_import`                                                                                                                                                                                                                                                                                                       |
| Judgement, combo, gauge, score and the hold machine                                                                                          | `engine/score.ts`                      | `engine.oracle.test.ts` - random scripts, op for op                                                                                                                                                                                                                                                                                                     |
| The synthetic player (`tools/ez2judge.c`)                                                                                                    | `engine/judge-sim.ts`                  | same counts, score, gauge and grade                                                                                                                                                                                                                                                                                                                     |
| Published keysounds (`.ssf`, 16-bit 44.1 kHz stereo)                                                                                         | `ez2bms-audio` `cut.rs`                | `ez2port-oracle/tests/audio.rs` - header and PCM hash                                                                                                                                                                                                                                                                                                   |
| `song.ini` as the port reads and lists it                                                                                                    | `publish/songini-read.ts`              | `songini.oracle.test.ts` - `ez2_usersongs_merge`, random files                                                                                                                                                                                                                                                                                          |
| Disc (`disc.abm`) and stretched eyecatch (`eyecatch.abm`)                                                                                    | `ez2bms-media` `art.rs`                | `art.oracle.test.ts` - byte-identical to `write_disc` / `write_eyecatch`, random sizes up and down                                                                                                                                                                                                                                                      |
| Title plates (`songname.abm`): layout, rasteriser, colour, halo, oblique, CJK faces                                                          | `ez2bms-media` `text.rs`               | `plate.oracle.test.ts` - byte-identical to `ez2_ttf_render_box` / `ez2_textspec_render`, random text and plates                                                                                                                                                                                                                                         |
| The song preview (`preview.ssf`): the importer's window, mix, fades, normalising                                                             | `ez2bms-audio` `preview.rs`            | `preview.oracle.test.ts` - PCM identical to `write_preview` for random songs, mixed at unity                                                                                                                                                                                                                                                            |
| The BGA a bmson names (`[Bga] File`, `StartMs`): the earliest event's movie, its time through tempo changes and STOPs                        | `publish/bga.ts`                       | `bga.oracle.test.ts` - equal to `ez2_bmson_import`'s for random charts (to 1 ms with BPMs f32 cannot hold, see below)                                                                                                                                                                                                                                   |
| The song select's wheel: every disc and title plate placed, the scroll's chase, the disc's swing per tier                                    | `ez2data/selectwheel.ts`               | `selectwheel.oracle.test.ts` - placements within a thousandth of a pixel of `ez2_select_wheel_place` / `_rail_place`, chase and swing frame for frame                                                                                                                                                                                                   |
| A stem chopped by M4's slicing (continuation notes only): its background sounds, slice for slice                                             | `slice/ops.ts`                         | `publish.oracle.test.ts` - equal to `ez2_bmson_import`'s records for random grids, resolutions and tempi; the engine reads each keysound as planned                                                                                                                                                                                                     |
| bmson 0.21, and legacy `beat-*` lane numbering, as EZ2BMS opens them                                                                         | `io/bmson/{v021,legacy-remap,open}.ts` | `legacy-bmson.oracle.test.ts` - publishes to `ez2_bmson_import`'s records of the same file written as 1.0; a spec-numbered beat-10k to its records once renumbered EZ2's way                                                                                                                                                                            |
| A chart's keysound index (`.ezi`) and settings (`.ini`) as an import reads them                                                              | `io/ez/ezi.ts`, `engine/songini.ts`    | `ezi-ini.test.ts` - random files, every entry and value equal to `ez2_ezi_parse` / `ez2_song_ini_parse`, quirks included                                                                                                                                                                                                                                |
| A mode's song table (`song.bin`): its cipher, entries, levels, BPM, category groups and views, and which chart files and folder an entry has | `ez2data/songdb.ts`                    | `songdb.test.ts` - random tables (and cut ones) equal to `ez2_songdb_parse` / `_category_view`, bytes equal to `ez2_songdb_decrypt` for random tables, files and folders equal to `ez2_songdb_charts` / `_song_dir`; a real install's every table with `EZ2_ROOT`/`EZ2_EXE`                                                                             |
| A game chart imported (`.ez` + `.ezi` + `.ini`): every note's time, its lane, and the chart republished                                      | `io/ez/import.ts`                      | `ez-import.test.ts` - random charts (tempo records on any track, doubled and out of range; notes and holds on every track): every note's millisecond equal to `ez2_tempo_ms`, and the republished `.ez` giving back each lane's records (track, tick, keysound, velocity, hold) and the background sounds; every shipped song with `EZ2_ROOT`/`EZ2_EXE` |

## Deliberate differences

| What                                                                  | EZ2PORT's bmson importer                                                                                    | EZ2BMS                                                                                                                                | Why                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hold across a STOP                                                    | converts the unshifted length: the hold gets shorter                                                        | shifts the hold's end like any position                                                                                               | keeps the hold as charted                                                                     |
| Mode                                                                  | keywords in chart_name / file name first                                                                    | `mode_hint` as written; the keyword reading is linted                                                                                 | an explicit field should not be overridden                                                    |
| Tier                                                                  | keywords (`hd`, `shd`, `ex`) in names                                                                       | `info.x_tier`, file named to match                                                                                                    | same                                                                                          |
| Two BPMs at one tick                                                  | written; order then depends on the C library's `qsort`                                                      | never written                                                                                                                         | the engine's sort is not stable                                                               |
| Velocity, pan, hold kind                                              | fixed at 127 / 64 / 0                                                                                       | `x_vel`, `x_pan`, `x_kind` per note                                                                                                   | EZ2 charts use them                                                                           |
| Judgement and gauge                                                   | windows scaled from `judge_rank`, gauge fixed                                                               | `judgement_deltas` / `life_deltas` written to the `.ini`                                                                              | per-chart, as the original game does                                                          |
| `up` (release) notes                                                  | the whole note is dropped                                                                                   | kept as a plain note; only the release re-trigger goes                                                                                | the press is still charted                                                                    |
| Slice cut points                                                      | rounded to 1 ms                                                                                             | exact frames from the published f32 tempo                                                                                             | consecutive slices join without a click                                                       |
| Background tracks                                                     | first track free at that tick                                                                               | first track whose last sound has finished                                                                                             | the original has one voice per track                                                          |
| End of the stage                                                      | 26 frames after the last record                                                                             | a closing tempo record after the last sound's tail                                                                                    | the last sound is not cut off                                                                 |
| Disc crop                                                             | the centred square                                                                                          | the centred square unless you move or size it                                                                                         | the jacket's subject is not always central                                                    |
| Eyecatch framing                                                      | the whole image squeezed to 1024x512                                                                        | 2:1 art as the importer; other art a 4:3 crop filling the top-left 640x480 the select screen shows, carried on right and down         | a 4:3 or square jacket is not squashed                                                        |
| Transparent images                                                    | alpha ignored: the colour under it shows                                                                    | composited onto black                                                                                                                 | a transparent corner is the port's key colour, as intended                                    |
| Photos turned by EXIF                                                 | decoded as stored (the port's decoder hook)                                                                 | turned upright, as a browser shows them                                                                                               | what you crop is what you see                                                                 |
| Which chart names the art                                             | the first chart's info only                                                                                 | the first chart (in mode and tier order) that names an image                                                                          | the same when one chart names it; never empty when another does                               |
| Title plate position                                                  | baseline 23, a long title scaled down both ways                                                             | the shipped plates' layout: baseline 22, condensed to 236 px, a subtitle on 27                                                        | lines up with the game's own titles on the wheel                                              |
| Plate fonts                                                           | the machine's bold sans; a Korean title may get boxes                                                       | Roboto Bold and Noto Sans CJK Bold, shipped                                                                                           | the same plate on every machine                                                               |
| A plate image of your own                                             | none (the importer always renders text)                                                                     | fit to 256x32 with the importer's box average, black kept as the see-through key                                                      | art made for the wheel goes in as it is                                                       |
| Preview mix                                                           | raw samples summed, velocity and pan ignored; only sounds of 20 s or more carried across the window's start | the chart as the engine plays it: velocity, pan, voices cutting, every sound under way picked up                                      | the preview sounds like the song                                                              |
| Preview window                                                        | 20 s from the first note a quarter of the way in, 1 s fades                                                 | that by default; your own start (on a note, or anywhere), 5-30 s, your fades                                                          | a song's best 20 s are rarely a quarter of the way in                                         |
| A preview file of your own                                            | `preview_music`: its first 30 s, as they are, no fades                                                      | your window of it, faded and normalised like a mix                                                                                    | the wheel restarts it hard: unfaded, it clicks                                                |
| BGA timing                                                            | the event's time from the bmson's double BPMs                                                               | the engine's clock (f32 BPMs), which may be 1 ms off the importer's at a rounding edge                                                | the movie keeps time with the notes the engine plays                                          |
| BGA movie                                                             | the first chart's earliest event only; copied under its own name                                            | the first chart naming one, or any movie you choose, started when you say; copied as `bga.<ext>`                                      | an ASCII name every build and file system reads                                               |
| A BGA the port cannot play                                            | copied and written; the stage shows nothing                                                                 | refused by lint (AVI, MPEG, Theora, HEVC, AV1...), from the movie's headers                                                           | found before publishing, not on the cabinet                                                   |
| bmson 0.21                                                            | refused: it reads 1.0 only                                                                                  | upgraded to 1.0 as it opens (BmsONE's own mapping), saved as 1.0; the 0.21 `total` kept as `x_total_v021`                             | old BmsONE files open                                                                         |
| `beat-10k` numbered the bmson spec's way (2P keys x 9-13, scratch 16) | always EZ2's numbering (2P keys x 11-15): the 2P side lands two lanes off                                   | notes on x 9 or 10 mean the spec's numbering; 2P notes only on x 11-13 fit both and are read the port's way, with a warning in Issues | BmsTWO's BMS import and other spec tools write it                                             |
| `.ezi` lines named like MIDI keys (`C#0 1 mix-st.wav`)                | `atol`'d to note 0, as the original does: every such line lands on one slot                                 | read as octave x 12 + semitone, so each note of the chart finds its own sound                                                         | old charts use them; checked against a real install (`ezi-ini.test.ts`, `EZ2_ROOT`/`EZ2_EXE`) |
| An imported original's category                                       | (a package's is its song.ini's)                                                                             | the first version bank (1st ... TT) its `song.bin` lists it in, else CUSTOM                                                           | HOT/NEW/ALL, level and alphabet banks say nothing about the song                              |

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

## Classic mode: keying never changes the music (not in the oracle)

Classic mode (BmsTWO's Classic BMS Mode) charts over a song that is already
complete in the background: placing a note keys the sound playing there,
deleting sends it back. Its promise is that **what autoplay plays does not
change**, and it is kept by checking, not by construction: every Classic
edit - key, un-key, a lane move, split, heal, reset all - is dry-run first
and refused, with the reason, if anything audible would differ.

What "audible" means is chart-core's `publish/audible.ts`, built from the
same per-channel code as the publisher (`ChartClock`, `channelEvents`). For
each sound file, every event becomes a segment: when it starts, which part
of the sample (the published frame cut, 22-frame minimum included), until
when, at what velocity and pan. An event plays on the voice of its keysound
identity (file, first frame, last frame), and the next event on that voice
cuts it - the editor's engine and EZ2PORT agree here because the port's
voice is the keysound's `.ezi` slot, and the publisher gives each identity
exactly one slot. Contiguous pieces are merged (only when both the time and
the sample frames meet), so a slice chain and the whole sound it was cut
from compare equal. A sample of unknown length keeps a symbolic end, valid
whatever the length turns out to be.

Tested by `audible.test.ts` (one test per rule: cuts, merges, a sound
ringing past a chain, STOPs, same-tick ties), a model-based run over random
songs and random Classic edits with undo and redo (`classic.test.ts`: the
whole chart's fingerprint never moves), the real mixer
(`audible.render.test.ts` renders both sides of 120 random cases at 44.1
and 48 kHz: equal fingerprints render within 1e-5 - float summation order -
and the check has teeth: most different ones differ audibly), and
`classic.spec.ts` in the editor.

What the check cannot see, and so is not promised:

- **Frame timing in the port.** EZ2PORT fires sounds per video frame, the
  background before the lanes within a frame; the editor orders a tick's
  events by lane. Moving a sound between the background and a lane changes
  that order only for two events on one voice in one frame, and such ties
  are refused - but two different voices starting in one frame may start a
  frame apart in the port either way.
- **Two players.** With both sides seated the port pans lane sounds to the
  player's side; the promise is for one player (and for autoplay).
- **Misses.** In test play a missed note is silent, as in the game, so a
  keyed sound is only heard when it is hit. That is what keying means.
- **The original cabinet.** The original executable has one voice per
  track, not per keysound: on a lane a keyed sound is cut by the lane's next
  note. The promise is for EZ2PORT; cabinet export (M6) will lint it.
- **Unknown lengths.** A sound that has not loaded is never taken to be
  sounding, so Classic offers less (and refuses more) until it loads.
- Not ported from BmsTWO: the automatic split at a long note's release, and
  "right-click clears x_stop" (`xStop` is not published).

## Slicing stems (M4)

Slicing writes nothing EZ2PORT does not already read: a cut is a background
continuation note (`c: true`), a keyed slice a lane note, and the package is
the one M1 publishes (`slicing.md`). So a chopped stem is in the oracle
above - our package's background sounds are the importer's own, slice for
slice - and cuts join sample-exactly into the uncut stem (the importer's
1 ms rounding is the deliberate difference already listed).

Like Classic mode, slicing promises that autoplay sounds the same after
every cut, move, heal or key, and keeps it by checking: each edit is
dry-run through `publish/audible.ts` and refused if anything audible would
differ (`slice.test.ts`: a model-based run of random slicing never moves
the fingerprint, and chopped stems render through the real mixer within
1e-5 of the uncut stem at 44.1 and 48 kHz). The same
caveats as Classic mode apply (frame timing in the port, two players, the
original cabinet's one voice per track).

What is EZ2BMS's own, with no counterpart in the port:

- **Onsets and tempo** (`ez2bms-audio` analysis.rs) are suggestions shown
  on the strip; nothing is cut until asked. They are tested on signals made
  in the tests, not on the port.
- **The disk cache** keeps long files decoded exactly as the decoder gives
  them (a hit is compared bit for bit with a decode), so a package is the
  same whether the cache had a stem or not. The crate's version is in every
  entry's name: a new build never reads an older build's audio.
- **Silence** when chopping is judged on the engine's peak mipmap at
  -48 dBFS; a quieter stretch stays on the end of the slice before.

## The BGA movie (scene/bga.c, media/video.c, not in the oracle)

A package's `[Bga]` movie is played by the port's scene/bga.c through
ffmpeg, outside the vendored core; EZ2BMS follows that code and checks
what it can from the movie's headers (chart-core `media/movie.ts`, tested
on containers built by hand).

- **What plays.** The Windows build's ffmpeg is cut down to the readers
  `asf`, `mov` (MP4, MOV), `matroska` (MKV, WebM) and `ogg`, and the video
  decoders for WMV 7-9 / VC-1, the Microsoft MPEG-4 variants, H.264,
  MPEG-4 part 2, VP8, VP9 and (for images) Motion JPEG
  (`thirdparty/fetch-ffmpeg.sh`). Anything else is a lint error. The Linux
  build links the distribution's full ffmpeg and plays more.
- **How it shows.** Frame 0 at `StartMs` of chart time; nothing before it;
  every frame converted to RGBA at its own size and stretched to 640x480
  behind the play field; nothing after the last frame - it never loops; its
  sound is not played. The BGA page's preview does the same with the
  webview's own player, which is not the port's decoder: a movie the
  webview cannot show may still play in EZ2PORT, and the page says so.
- **Size.** A 1280x960 H.264 movie "drew nothing on the cabinet" (the port's
  own note in `fetch-ffmpeg.sh`): lint warns above 1024 on either side.
- **Test in EZ2PORT** passes `--bga`, so the movie shows whatever the
  operator ini says.

## The song select as the wheel preview draws it (select.c, not in the oracle)

The Song manager's "Wheel" page draws the song on EZ2PORT's song
select. Where each disc and plate sits, the chase and the swing are the
oracle-checked `selectwheel.ts`; the drawing around them follows
`tools/ez2play/select.c`, outside the vendored core, and is checked with
Playwright on the synthetic game folder (`bridge/demo-skin.ts`).

- **The carousel.** A disc on the arc is `system\disc\disc-mask.bmp`
  multiplied (blend 9,6), its thumb added (2,2), `shape_mask.bmp` multiplied
  3 px larger - all tinted by the placement's brightness. The disc at rest
  under the cursor, with a disc to show, is the focus: the mask twice and the
  art turned by the swing, the ring still. Blend (9,6) with a tint `b` is
  exactly canvas `multiply` at alpha `b`, and (2,2) is `lighter`.
- **The rail.** `System\SongSelect\VF\b_mask_2.bmp` multiplied at (0, 64),
  its own width by 490; every plate added at its own size, its left edge white
  and its right edge the row's band (a negative band makes the original's
  `ffffffXX`), half a pixel in each way.
- **The dwell.** The preview starts when the wheel has not moved for more than
  30 ticks, and on the screen's first tick; a step stops it at once.
- **The exit eyecatch.** The eyecatch at its own size from (0, 0), replacing;
  `system\Channel_Eyecatch\common\Stage_Mask.bmp` multiplied,
  `Stage_1.bmp` added, faded in from black ten levels a tick.
- **Different on purpose.** The animated backdrop, the rail cursor and the
  frame (`.str`, Milestone 8) are a neon stand-in; so is any mask the game
  folder lacks. The neighbours are made-up songs, their plates rendered like
  this song's. Canvas filters with its own bilinear sampling, and ticks at
  60 Hz from the display's frames.
- **What it shows about the port.** A package's disc has no picture while it
  flies along the arc: the port looks for that thumbnail in the game tree's
  `system\discsmall`, never in the package (a request in
  `ez2port-requests.md`). A song without a disc is never the turning focus;
  its masks alone show.

## Importing the game's own songs (M5, not in the oracle)

- **What is kept but not published**: scroll-speed records (type 6, which
  the engine plays: 6333 of them in 24 shipped charts), track volumes,
  beats-per-measure, marks and the engine-ignored stops, in `x_ez_records`;
  Issues says so for each chart. A background note's length is kept as
  `x_len`: publish writes background notes as taps, as the engine plays them.
- **Voices**: each `.ezi` slot is a voice in EZ2PORT; after an import two
  slots naming one file are one channel, so one voice. Issues counts them.
- **No v4/v5 BPM correction**: some tools (rizu, the Bible) scale old charts'
  tempo by 0.99723; EZ2PORT does not, and neither does the import.

- **Titles** come from the port's `text/manifest.songs.ini` (beside
  `ez2play`, else `<game>/text`), read at run time: the game itself has
  titles only as plate bitmaps. The reading follows `textspec.c`
  `read_manifest`/`parse_line` (a `;` outside quotes is a comment, the
  outermost quotes of a line's first field are the words, a second quoted
  line is the subtitle); there is no oracle command for it because the port
  renders the lines rather than returning them. Without the manifest the
  title is the song's key.

## Importing BMS (M5, not in the oracle)

EZ2PORT reads no BMS, so there is nothing of the port's to compare with. The
reading follows the BMS command memo as LR2, beatoraja (jbms-parser) and
BmsTWO read it, and `bms.test.ts` checks it against the memo's own
arithmetic: for random files (measure lengths, tempo changes on channels 03
and 08, STOPs, any slot grid) every note's position is exact and its time
within a nanosecond of the memo's. Where players disagree, EZ2BMS follows
beatoraja: a later line wins a tempo change at one spot, `#BASE 62` is read
before anything else, EUC-KR and Shift-JIS are both in the wild. What an
EZ2 chart cannot hold - hidden notes, mines, scroll and speed changes,
image BGAs - is left out or kept unplayed, and Issues says which.

Korean text is CP949 (windows-949) as the game's Windows and every browser
read it. Node's `TextDecoder('euc-kr')` (ICU) is plain EUC-KR - KS X 1001
only, without CP949's 8822 extra Hangul syllables or the euro and registered
signs of KS X 1001:1998 - so the unit tests, which run in Node, decode such
a file without those characters, while the editor, which decodes in its
webview, reads them. Writing is the same everywhere: `io/legacy-text.ts`
takes only the KS X 1001 region from the decoder (Node and Chromium agree
on all 8224 pairs) and computes the rest, which is Unified Hangul Code's
own definition (checked against Chromium's decoder: all 8822).

## Cutting a stem at a MIDI file's notes (M5, not in the oracle)

EZ2PORT reads no MIDI. The file says only where to cut: the cuts are M4's
(standard continuation notes, each checked to keep the sound), so what the
package holds is covered by the chopped-stem row above. Taking the MIDI's
tempo is an ordinary tempo edit, published like any other; the plan counts
the other notes it moves in time before you agree to it.

## Port behaviour worth knowing

- **A package is listed in one bank.** `ez2_usersongs_merge` adds it to
  its `Category`'s bank only, where every shipped table also fills ALL: a
  user song is never in ALL (a request in `ez2port-requests.md`).

- **Some hold kinds make 100% unreachable, or pass it.** The maximum score
  is `notes * 300`, with `notes` from the engine's counter
  (`ez2_note_counted`). Kinds 4 and 5 are counted by the counter's own ladder
  but pay a single instalment, so a perfect play falls short. Kinds 9-12
  are not counted, yet their head still scores. Play mode reproduces both
  (a synthetic 7K chart scores 121 of 156 under autoplay, as the port's own
  tool does); lint will flag these kinds on holds.

## Plates: how the renderer matches

The plate renderer is the port's `ez2_ttf_render_box` and
`ez2_textspec_render` transcribed to Rust around the same stb_truetype
(v1.26 as the port vendors it; upstream has since changed composite glyphs,
see `third_party/stb/PROVENANCE.md`), with the f32 arithmetic in the same
order. Both are built with `NDEBUG`, as EZ2PORT's builds are: stb asserts
on some tiny glyph edges (a hyphen four pixels tall), and a build without
it aborts where the port renders on. Equality is proven on Linux x86-64;
the stb C is compiled without floating-point contraction so other
machines round the same way, which the owner's Windows machine can confirm.

## Open questions

- **What the eyecatch shows.** It is drawn at its own size into the 640x480
  select screen (`tools/ez2play/select.c`), so only its top-left 640x480
  should be visible, and the `visible` framing is built on that. How a
  widescreen build shows it has not been seen on a real screen.

- **5 KEY ONLY and SCRATCH lanes.** `docs/gds-slots.md` lists the turntable and
  pedal tracks (10, 11) in the shipped `5keymix` and `ScratchMix` descriptors,
  while `ez2/mode.c` and every official chart use keys 1-5 only. EZ2BMS charts
  those modes on keys 1-5; with a game folder configured it reads the real
  `.gds`, and lint reports turntable/pedal notes in those modes.
- **Andromeda and Catch** have no bmson convention and EZ2PORT's packages
  cannot carry them yet; EZ2BMS keeps them for cabinet export only.
- **Legacy `.ezi` note names.** Reading `C#0` as octave x 12 + semitone
  comes from the charts' own keysound numbers, not from the game's code
  (which, like EZ2PORT, reads it as 0). The real-install test
  (`ezi-ini.test.ts`) checks that it never finds fewer of a chart's
  keysounds than the port's reading; it has not been run on a game yet.
- **An imported original's category.** Its first version bank in the song
  tables is a choice, not a rule of the game (a song sits in several banks);
  CUSTOM when it has none.
