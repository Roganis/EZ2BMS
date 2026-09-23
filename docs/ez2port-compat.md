# EZ2PORT compatibility

EZ2PORT (the owner's native EZ2AC engine) is the reference for everything
EZ2BMS publishes. This page lists where EZ2BMS follows it exactly, where it
deliberately does something else, and what is still unknown. Every "exact"
row is proven by a test against the vendored engine core
(`crates/ez2port-oracle`); the snapshot is EZ2PORT build 1582.

## Exact (oracle-tested)

| Area                                                                                | EZ2BMS                    | Test                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| EZFF `.ez` read/write, v5-v8                                                        | `io/ez/ezff.ts`           | `ezff.oracle.test.ts` - every field, every record                                                               |
| Tempo map and every record's time (f32 BPM, ms)                                     | `timing/engine-tempo.ts`  | bit-identical milliseconds                                                                                      |
| `.gds` descriptors                                                                  | `ez2data/gds.ts`          | `ez2data.oracle.test.ts`                                                                                        |
| `.pvi` skins (tracks, target bar, note art)                                         | `ez2data/pvi.ts`          | same                                                                                                            |
| `.abm` decode (all six header variants, 8/16/24/32-bit)                             | `ez2data/abm.ts`          | RGBA hash identical                                                                                             |
| `.abm` encode (Final EX, 24-bit)                                                    | `ez2data/abm.ts`          | byte-identical to `ez2_abm_write`                                                                               |
| File cipher                                                                         | `ez2data/crypt.ts`        | byte-identical for random tables                                                                                |
| Velocity/pan arithmetic                                                             | `ez2data/mixparam.ts`     | same integers                                                                                                   |
| Chart file names (mode, song, tier)                                                 | `modes/filenames.ts`      | same as `ez2_chart_id_parse`                                                                                    |
| Mode lane sets                                                                      | `modes/registry.ts`       | same tracks as `ez2/mode.c`                                                                                     |
| Published package (`song.ini`, `.ez`, `.ezi`, `.ini`)                               | `publish/package.ts`      | `publish.oracle.test.ts` - the engine reads the plan back                                                       |
| Lane notes and background sounds of a bmson                                         | `publish/chart-plan.ts`   | same records as the port's own `ez2_bmson_import`                                                               |
| Judgement, combo, gauge, score and the hold machine                                 | `engine/score.ts`         | `engine.oracle.test.ts` - random scripts, op for op                                                             |
| The synthetic player (`tools/ez2judge.c`)                                           | `engine/judge-sim.ts`     | same counts, score, gauge and grade                                                                             |
| Published keysounds (`.ssf`, 16-bit 44.1 kHz stereo)                                | `ez2bms-audio` `cut.rs`   | `ez2port-oracle/tests/audio.rs` - header and PCM hash                                                           |
| `song.ini` as the port reads and lists it                                           | `publish/songini-read.ts` | `songini.oracle.test.ts` - `ez2_usersongs_merge`, random files                                                  |
| Disc (`disc.abm`) and stretched eyecatch (`eyecatch.abm`)                           | `ez2bms-media` `art.rs`   | `art.oracle.test.ts` - byte-identical to `write_disc` / `write_eyecatch`, random sizes up and down              |
| Title plates (`songname.abm`): layout, rasteriser, colour, halo, oblique, CJK faces | `ez2bms-media` `text.rs`  | `plate.oracle.test.ts` - byte-identical to `ez2_ttf_render_box` / `ez2_textspec_render`, random text and plates |

## Deliberate differences

| What                      | EZ2PORT's bmson importer                               | EZ2BMS                                                                                                                        | Why                                                             |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Hold across a STOP        | converts the unshifted length: the hold gets shorter   | shifts the hold's end like any position                                                                                       | keeps the hold as charted                                       |
| Mode                      | keywords in chart_name / file name first               | `mode_hint` as written; the keyword reading is linted                                                                         | an explicit field should not be overridden                      |
| Tier                      | keywords (`hd`, `shd`, `ex`) in names                  | `info.x_tier`, file named to match                                                                                            | same                                                            |
| Two BPMs at one tick      | written; order then depends on the C library's `qsort` | never written                                                                                                                 | the engine's sort is not stable                                 |
| Velocity, pan, hold kind  | fixed at 127 / 64 / 0                                  | `x_vel`, `x_pan`, `x_kind` per note                                                                                           | EZ2 charts use them                                             |
| Judgement and gauge       | windows scaled from `judge_rank`, gauge fixed          | `judgement_deltas` / `life_deltas` written to the `.ini`                                                                      | per-chart, as the original game does                            |
| `up` (release) notes      | the whole note is dropped                              | kept as a plain note; only the release re-trigger goes                                                                        | the press is still charted                                      |
| Slice cut points          | rounded to 1 ms                                        | exact frames from the published f32 tempo                                                                                     | consecutive slices join without a click                         |
| Background tracks         | first track free at that tick                          | first track whose last sound has finished                                                                                     | the original has one voice per track                            |
| End of the stage          | 26 frames after the last record                        | a closing tempo record after the last sound's tail                                                                            | the last sound is not cut off                                   |
| Disc crop                 | the centred square                                     | the centred square unless you move or size it                                                                                 | the jacket's subject is not always central                      |
| Eyecatch framing          | the whole image squeezed to 1024x512                   | 2:1 art as the importer; other art a 4:3 crop filling the top-left 640x480 the select screen shows, carried on right and down | a 4:3 or square jacket is not squashed                          |
| Transparent images        | alpha ignored: the colour under it shows               | composited onto black                                                                                                         | a transparent corner is the port's key colour, as intended      |
| Photos turned by EXIF     | decoded as stored (the port's decoder hook)            | turned upright, as a browser shows them                                                                                       | what you crop is what you see                                   |
| Which chart names the art | the first chart's info only                            | the first chart (in mode and tier order) that names an image                                                                  | the same when one chart names it; never empty when another does |
| Title plate position      | baseline 23, a long title scaled down both ways        | the shipped plates' layout: baseline 22, condensed to 236 px, a subtitle on 27                                                | lines up with the game's own titles on the wheel                |
| Plate fonts               | the machine's bold sans; a Korean title may get boxes  | Roboto Bold and Noto Sans CJK Bold, shipped                                                                                   | the same plate on every machine                                 |

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

## Port behaviour worth knowing

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
