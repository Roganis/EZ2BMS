# Importing songs

**Import…** on the start screen (or "Import a song…" in the palette, or a
BMS file dropped on the window) makes an EZ2BMS song out of the game's own
charts, a folder of BMS files, or a bmson. Every guess the reading makes is
shown before anything is written, and can be changed. What could not come
across is listed. It stays in Issues with the song until you choose
"Forget what the import said".

A new song is written into a new folder, all at once: if anything fails,
there is no half-written song. The folder is then opened.

## The game's own songs

This needs the game folder (the one with `sound/` and `system/`) set on the
EZ2PORT panel. The songs listed are the ones the game's own song tables
(`system/<mode>/song.bin`) offer, and titles come from EZ2PORT's text
manifest (`text/manifest.songs.ini`, beside `ez2play`). The game has no
titles as text, only the plate images; without the manifest a song goes by
its folder name.

The tables and charts are encrypted with keys that live in your unpacked
EZ2AC executable, the one set on the EZ2PORT panel. If none is set, EZ2BMS
looks for an `.exe` in the game folder that holds the keys, as EZ2PORT does.
Nothing of the game is kept by EZ2BMS: it reads your files when you import.

What a song becomes:

| In the game                                        | In the song                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| each `<mode>1p-<key>[-tier].ez` a table offers     | a bmson, named for the new key                                                                                                                   |
| ticks (1/48 beat)                                  | pulses at resolution 240: exactly 5 a tick, nothing rounded                                                                                      |
| the tempo (header and type-3 records)              | `init_bpm` and BPM events, the same f32 values, so every note plays at the engine's millisecond                                                  |
| lane tracks (the mode's `.gds`)                    | lane notes; velocity, pan and hold kind as `x_vel`/`x_pan`/`x_kind`                                                                              |
| other tracks                                       | background notes, keeping their track (`x_track`)                                                                                                |
| `.ezi` keysounds                                   | one sound channel per file. `.ssf` files become `.wav` with the same samples; another song's sound goes under that song's name (`stay/p_MR.wav`) |
| the `.ini`                                         | judgement and gauge (`judgement_deltas`, `life_deltas`); with no `.ini`, the engine's defaults                                                   |
| the level in `song.bin`                            | the chart's level (the `.ini`'s when the table has none)                                                                                         |
| the song's version bank in `song.bin` (1st ... TT) | its category (otherwise CUSTOM)                                                                                                                  |

The new song gets a **new key**. Publishing under the game's own key would
replace that song on the wheel, so the key comes from the title with a
digit added until no `sound/` folder has it. The original key is kept in
the song file, for a cabinet export to write the song back.

Scroll-speed changes become the chart's own (`x_scroll_events`): the Play
view scrolls with them, the Timing panel edits them, and they publish. Each
keeps the track and second word it had, so a cabinet export writes the same
record back.

Nothing is dropped, and Issues says what will not publish:

- track volumes, beats-per-measure, marks and the stops the engine ignores
  (kept in `x_ez_records`, shown as grey tags in the gutter and in the
  Timing panel, read-only);
- a background note's length (publishing writes background notes as taps,
  as the engine plays them);
- two `.ezi` slots naming one file, which become one voice;
- keysounds the folder does not have, and notes on slots the `.ezi` does
  not list.

Some old `.ezi` files name their notes like MIDI keys (`C#0 1 mix-st.wav`).
EZ2PORT reads all of those as note 0. EZ2BMS reads them as notes
(octave x 12 + semitone), so each note keeps its own sound (see
`ez2port-compat.md`).

## BMS, BME, BML

Choose (or type) a folder. Each `.bms`/`.bme`/`.bml`/`.pms` in it becomes one
chart of the song. For each file the wizard shows:

- **Text**: its encoding. It is UTF-8 when the bytes are valid UTF-8,
  otherwise Shift-JIS or EUC-KR/CP949, told apart by the bytes; a guess is
  marked `?`. If the title looks wrong, pick another.
- **Random**: each `#RANDOM` (and `#SWITCH`) block, with the value it takes.
  The default is 1; nested blocks are followed.
- **Lanes**: how BMS channels map to lanes:
  - **EZ2 BME**: EZ2's own channels (keys 11-15, turntable 16, pedal 17,
    effectors 18/19; the 2P side 21-29);
  - **Keys in order**: the IIDX/beat layout, each side's keys (1-5, 6, 7)
    onto that side's keys left to right; a double mode's keys are split into
    a left and a right half. It differs from EZ2 BME on SpaceMix's and
    Andromeda's 2P side (EZ2 puts the effectors between the sides), and
    leaves 17/27 (EZ2's pedals) to the background.
- **Mode and tier**: guessed from the lanes used (the smallest mode that has
  them all) and from `#DIFFICULTY` or the file name. Two files cannot be the
  same chart; the second is marked until you give it another tier.

Positions are exact. A measure's length (`#xxx02`) is read as the fraction
it stands for (0.75 is 3/4, 0.333 is 1/3), and the song's resolution is the
least that places every note on a whole pulse. Tempo comes from `#BPM`,
channels 03 and 08; stops from channel 09. EZ2 has no stops, so publishing
turns each one into a gap. Long notes come from channels 5x/6x
(`#LNTYPE` 1 and 2) and `#LNOBJ`.

Left out, and said: hidden notes (3x/4x; an option makes them background
sounds), mines, `#SCROLL`/`#SPEED`. BGA images are kept, but EZ2PORT plays
only movies. `#STAGEFILE` becomes the eyecatch and `#PREVIEW` the preview.

**Beside the BMS files** writes the bmson and the song file into the BMS
folder itself, copying nothing, for large packs.

## bmson

A bmson opens as it is: open its folder.

- **bmson 0.21** (BmsONE's older format) is read as 1.0, and saved as 1.0.
- **Lanes numbered the BMS way** (`beat-7k`, `beat-10k`) are moved onto
  EZ2's. `beat-10k` is written two ways; notes on x 9 or 10 mean the bmson
  spec's numbering.
- **BmsTWO's bmson** is already 1.0.
- **circus2bmson's output** (all background sounds, resolution 480 or the
  MIDI's) opens the same way.

Issues says what changed.

## A MIDI file of the song

A stem's strip panel has **Cut at a MIDI file's notes**. The MIDI of the
same song, exported from the DAW the stem came from, says where each hit is
better than onset detection can. Only where notes start matters, not their
pitch.

The MIDI's time 0 is the stem's first hit. Then either:

- **keep the chart's tempo**: each note is placed at its MIDI time; or
- **take the MIDI's tempo** from that hit on: each note sits on its beat.
  Changing the tempo moves anything else charted after the hit, and the
  panel says how many notes that is before you cut.

Cuts go on the nearest 1/48 beat (EZ2's finest) or the snap grid. The panel
says how far the furthest one lands from its note. Like every slicing edit
(`slicing.md`), a cut keeps the sound. The tempo change and the cuts are
one undo step.
