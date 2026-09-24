# Exporting songs

**Export to EZ2AC…** and **Export as BMS…** (File, or the palette) open the
Export dialog. It works out everything the export would write and shows it
before anything is written. **Undo a cabinet export…** opens its list of
past exports.

## Back to the original game

A cabinet export **remixes a song the game already has**. Your charts take
the places of that song's charts, and its record in each mode's song table
(`system/<mode>/song.bin`) gets their levels and BPM. It cannot add a new
song: the game's tables have no room EZ2BMS could safely give it. The
target is:

- the song the last export went into (the song file's `cabinet`);
- otherwise the song it was imported from (`source.key`);
- otherwise one you pick. The dialog warns when it is not the song the
  project came from.

It needs the game folder and your unpacked executable, both set on the
EZ2PORT panel. The original only reads encrypted charts, and the keys are in
the executable. Nothing of the game is kept by EZ2BMS.

### What changes in the game

| For each chart             | Written                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<mode>1p-<key>[-tier].ez` | the chart, encrypted, under the name the game's file has (its case kept); a tier the song lacks gets the name the table implies                                                                                                                                            |
| `.ezi`                     | its keysound list, encrypted, CRLF as the game's                                                                                                                                                                                                                           |
| `.ini`                     | only when the game would read other values from it: kept when the one there says the same, left out when there was none and the chart plays by the engine's defaults. Written compact (`Key=value`, CRLF)                                                                  |
| its tier in `song.bin`     | the level, always. The BPM (the one the select screen shows) is kept for a chart that is this song's own import and starts on the tempo it had, and is otherwise the chart's start tempo. A tier the song lacked also gets its siblings' `a` value when they agree, else 0 |

Tiers you do not export stay as they are. `song.bin` is patched in place:
only the bytes of those values change, nothing else in the table moves.

**Keysounds are never written over.** A keysound whose audio (format and
samples) is already in the song's folder uses that file. Any other takes a
name no file has (`kick~2`). Other songs and charts reach into a song's
folder (`..\..\sound\<song>\...`), so a file there may be theirs too. A song
imported from the game and sent back unedited writes no keysounds at all. A
keysound in `.wav`, `.ssf` or `.ezw` at 16 bits goes as it is, samples and
rate untouched. Anything else is converted to 16-bit 44.1 kHz stereo, as
publishing does. A sound the project lacks keeps its `.ezi` line and writes
no file: it plays nothing, as the game's own missing sounds do.

### What an imported chart keeps

A chart imported from the game goes back as the game had it, unless you
changed it (proven against EZ2PORT's reader, `cabinet.oracle.test.ts`):

- background notes stay on their track;
- raw lengths, velocity, pan and hold kind are kept;
- scroll changes go back on the track, and with the second word, each had;
- the records bmson has no place for are kept: volume, beats, marks, stops
  and unknown kinds;
- the header: names, the second BPM, the track count, and the end of the
  stage;
- the tempo map.

New sounds are placed around the game's own. A chart that did not come from
the game gets the publish layout (64 tracks, a closing tempo record).

### Where it goes

- **Into the game folder.** Every file is checked first against what the
  plan read: each replaced file must still be those bytes, each new one
  must still be absent, and each reused keysound must be unchanged.
  Otherwise nothing is written ("plan it again"). Then:
  1. the files it replaces are copied to
     `<game>/.ez2bms-backup/<date>-<time>-<song>/`, with a manifest;
  2. the new ones are moved into place;
  3. a failure puts everything back.

  **Undo this export** (or **Past exports** later) restores the files the
  export replaced and removes the ones it added, wherever each is still
  what the export wrote. A file changed since is reported, and replaced
  only if you say so.

- **Into a new folder shaped like the game** (`sound/<song>/...`,
  `system/<mode>/song.bin`), to copy onto the cabinet yourself.
  `EZ2BMS-EXPORT.txt` in it says what each file replaces. "Also copy the
  keysounds the game already has" makes the folder the whole song.
  **`song.bin` is the whole table of your local game's mode**: copy it
  only onto a cabinet with the same game version, or the levels of its
  other songs change with it.

### What the review says

Before Export, each chart's row shows:

- which file it becomes, and whether that replaces a file or is new;
- its level and BPM before and after;
- its size against the 128 KB the original can load;
- what happens to its `.ini`.

Below come the keysounds (new, already there, missing, converted), the
`song.bin` changes, and the checks. Errors block Export:

| Rule                       | Severity        | What                                                                                                                                               |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cabinet-size`             | error           | a file over 131068 bytes: the original decrypts into a buffer that size                                                                            |
| `cabinet-slots`            | error           | more than 2047 keysounds, every slice counted                                                                                                      |
| `cabinet-table`            | error           | the mode's table does not list the song, or two charts for one tier                                                                                |
| `cabinet-level`            | error           | a level outside 1-20                                                                                                                               |
| `cabinet-sound-unreadable` | error           | a keysound file the host cannot read                                                                                                               |
| `cabinet-voice-backing`    | warning or info | a background sound cut short by the next sound on its track (the original plays one sound per track); info where the game's own chart has that cut |
| `cabinet-voice-lane`       | info            | a keyed sound cut by the lane's next note, in autoplay too                                                                                         |
| `cabinet-missing-sound`    | warning         | keysounds with no file                                                                                                                             |
| `cabinet-song-hidden`      | warning         | a mode would stop listing the song (its NM has no level)                                                                                           |
| `cabinet-2p`               | warning         | the game's two-player file for the tier stays as it is                                                                                             |
| `cabinet-gds`              | warning         | the game has no `.gds` for the mode: EZ2BMS's own lane table is used                                                                               |
| `cabinet-records-res`      | warning         | kept records fall between EZ2 ticks (a resolution changed by hand; a change of resolution in EZ2BMS moves them)                                    |
| `cabinet-tier-new`         | info            | a tier the song did not have, and the level it will show                                                                                           |
| `cabinet-tracks`           | info            | background notes moved off a track that is a lane in this mode, or tracks added                                                                    |
| `cabinet-kept`             | info            | records written back                                                                                                                               |
| `cabinet-name`             | info            | header-name characters Korean Windows (CP949) cannot write                                                                                         |
| `cabinet-convert`          | info            | keysounds converted rather than sent as they are                                                                                                   |

### How the cabinet differs from EZ2PORT

The original executable is not EZ2PORT, and a chart can play differently on
it:

- **One sound per track.** Each track plays one sound at a time, keyed or
  not, and a new one cuts the last. EZ2PORT plays every keysound as its
  own voice.
- **Loading limits.** A file must be at most 131068 bytes, and a chart can
  use at most 2047 keysounds.

The review lints all of these. What EZ2BMS could not test is in
`ez2port-compat.md` and the owner's checklist in `AI-DISCLOSURE.md`.

## As BMS

**Export as BMS** writes a new folder:

- one BMS per chart, named after its bmson;
- every sound beside them, flat.

LR2, beatoraja and other BMS players read it.

| In the song                    | In the BMS                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| lanes                          | **EZ2 BME** (keys 11-15, turntable 16, pedal 17, effectors 18/19; 2P 21-29) or **Keys in order** (each side's keys onto 1-5, 6, 7), as on import       |
| measures                       | EZ2's 4/4 (no `#xxx02`). Each line has as few slots as place its notes exactly; past 999 measures is refused                                           |
| the start tempo, tempo changes | `#BPM`; whole tempi 1-255 on channel 03, the rest on 08 (`#BPMxx`)                                                                                     |
| stops                          | channel 09, `#STOPxx` in 1/192 of a measure; a stop that is not a whole number of those is written as the decimal it is (beatoraja reads it), and said |
| holds                          | `#LNTYPE 1` pairs on 5x/6x. Two holds that meet on a lane cannot both end there, so the first ends a pulse sooner, and said                            |
| the background                 | channel 01, a line per layer                                                                                                                           |
| sounds                         | `#WAVxx`, base 36; `#BASE 62` past 1295 sounds; more than 3843 is refused                                                                              |
| tier, level                    | `#DIFFICULTY` (NM 2, HD 3, SHD 4, EX 5), `#PLAYLEVEL`                                                                                                  |
| eyecatch, preview, movie       | `#STAGEFILE`, `#PREVIEW`, `#BMP01` shown from its start time                                                                                           |
| what an imported BMS said      | `#RANK`, `#DEFEXRANK`, `#TOTAL`, `#LNMODE` as the file had them                                                                                        |

A chart that uses channels 17-19 or 27-29 (EZ2's pedals and effectors, the
6th and 7th keys to a BMS player) is `.bme`, others `.bms`.

**Text** is Shift-JIS when all of it fits (what LR2 reads); otherwise it is
Korean (CP949); otherwise it is UTF-8 with a BOM (beatoraja). The
encoding is chosen once for the song, file names included. You can choose
one yourself, and the dialog lists what it cannot write. A file name the
encoding cannot write uses the sound's ASCII name instead.

**Sounds**: each keysound is one file, and one table serves all the charts,
so charts that share a stem's slices share its files:

- a whole WAV or OGG is copied as it is, under its own name;
- EZ2's `.ssf`/`.ezw` become WAV with the same samples;
- FLAC and MP3 are decoded to WAV;
- a slice of a stem is cut to a WAV of its own, sample-exact as the cabinet
  and EZ2PORT cut it.

Names are unique whatever their case.

**Lost, and said:** velocity and pan (BMS has neither), scroll changes (LR2
has none, and beatoraja's `#SCROLL` jumps where EZ2PORT eases), and an
imported game chart's kept records.

The export is checked by reading it back with EZ2BMS's own BMS reader
(`bms-write.test.ts`): random charts come back with every note in its lane,
at its exact beat, with its length and sound, and at its time to the
microsecond.
