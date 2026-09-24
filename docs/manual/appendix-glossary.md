# Appendix: glossary

This page explains the words EZ2BMS uses. EZ2 players will know many of them already; the entries
say what each means in EZ2BMS in particular. The same words are used on every screen, and the
Korean and Japanese versions of EZ2BMS follow the same list (see
[the translation glossary](../i18n-glossary.md)).

## Charts and notes

- **Chart**: One playable chart of a song, for one mode and one tier, such as 7 KEY HD. A song can
  have many charts. EZ2BMS saves each chart as a bmson file.
- **Song**: A song folder with its charts, sounds and pictures. What every chart shares (title,
  artist, song key, category, art) is the song's.
- **Mode**: The layout of lanes a chart is played on. EZ2BMS names the modes EZ2PORT plays **5 KEY
  ONLY**, **SCRATCH**, **RUBY**, **5K STANDARD**, **7 KEY**, **10 KEY** and **14 KEY**, which
  EZ2PORT calls 5KeyMix, ScratchMix, RubyMix, StreetMix, 7StreetMix, ClubMix and SpaceMix. **16
  KEY** (AndromedaMix) can go to the cabinet but can't be published to EZ2PORT yet.
- **Lane**: One column of the playfield, played by one key, the turntable, the pedal or an effector.
- **Turntable, pedal, effector**: The cabinet's controls besides the keys. The turntable is also
  called the scratch.
- **Note**: One thing to hit on a lane. A note that isn't a long note is a **tap**.
- **Long note, hold**: A note you keep pressed. The two words mean the same thing.
- **Hold kind**: How EZ2 pays a hold while you keep it pressed: every 1/4 beat (kind 0, the
  default), every 1/2, 1/8 or 1/16 beat, once at the end, or nothing. Some kinds count a hold
  differently from how they pay it, so a perfect play can't score exactly 100%. See [Hold length and
  hold kind](12-chart-info-and-issues.md#hold-length-and-hold-kind).
- **Instalment**: One of a hold's judged ticks while it is held.
- **Background note, background sound**: A note on no lane. It plays by itself, like the music under
  the keyed notes.
- **Keysound**: The sound a note plays. In EZ2, almost the whole song is made of keysounds, keyed on
  lanes or playing in the background.
- **Sound**: A sound file in the song folder, or the chart's entry for it. Notes play sounds.
- **Keysound slot**: A numbered place in a chart's list of sounds. The game and EZ2PORT can load
  only so many.
- **Velocity, pan**: How loud a note plays (0 to 127), and where it sits between left and right (0
  to 127, with 64 the centre). They are what the cabinet's mixer does with the note.

## Time and the grid

- **Measure, beat**: EZ2 charts are in 4/4: four beats to a measure.
- **Snap, grid**: The steps notes are placed on, such as 1/16 or 1/12. <kbd>[</kbd> and <kbd>]</kbd>
  make the snap coarser or finer.
- **Pulse, resolution**: A pulse is the finest step a position in a bmson can have. The resolution
  is how many pulses make a beat. EZ2BMS uses 240 unless an imported chart needs another.
- **EZ2 tick**: 1/48 of a beat, the finest step a game chart has. At resolution 240, one tick is 5
  pulses. Notes between ticks are rounded when they go to EZ2PORT, and Issues tells you.
- **BPM change**: A change of tempo at a point in the chart.
- **STOP**: A pause in the scroll, as BMS has it. EZ2 has no STOP, so EZ2PORT gets a gap in time
  instead and the scroll doesn't freeze.
- **Scroll change**: A chart's own speed change: the field scrolls faster or slower from that point,
  without changing the timing.
- **Scroll speed**: The player's own speed setting in the Play view, as a percentage.

## Playing and judging

- **Judgement**: How close to the note you pressed. From best to worst: **KOOL**, **COOL**,
  **GOOD**, **FAIL** (a press outside the GOOD window, or a hold let go too soon) and **MISS** (a
  note never pressed).
- **Judgement windows**: How wide the KOOL, COOL, GOOD and MISS windows are, set per chart in the
  Chart tab.
- **Gauge**: The life gauge. Each judgement fills or drains it; at zero, the stage is failed.
- **Tier**: A chart's difficulty: **NM**, **HD**, **SHD** or **EX**. EZ2PORT lists a song in a mode
  only when that mode has an NM chart of level 1 or more.
- **Level**: The number shown on the song wheel, from 1 to 20.
- **Autoplay**: The game plays the chart by itself, so you can watch it.
- **Test play**: Playing the chart in EZ2BMS's Play view with your keys, judged like EZ2PORT.
- **Step input**: Placing notes by pressing the cabinet's keys, one step at a time.
- **Record, take**: Recording means playing along to place notes; a take is one recording, which you
  keep, retake or discard.

## Sounds and slicing

- **Stem**: A long sound, such as a whole drum track, that you cut into slices so notes can play its
  parts.
- **Slice**: The part of a sound one note plays. A stem cut into slices plays exactly as the whole
  stem did.
- **Cut**: Where one slice ends and the next begins.
- **Chop**: Cutting a stem into slices on the grid.
- **Onset**: Where a sound's attack starts. EZ2BMS can find onsets and cut there.
- **Strip**: The waveform column beside the lanes that shows a stem and its cuts.
- **Classic mode**: A way of charting where the music is already complete in the background, and
  placing a note moves the sound playing there onto a lane, without changing what you hear. The name
  comes from BmsTWO.
- **Keysound workbench**: A grid of every sound of the song, with waveforms.

## The song and its pictures

- **Song key**: The song's short name in EZ2PORT: its folder's name, 1-15 lowercase letters or
  digits. Every chart file is named after it. It is not a keysound and not a keyboard key.
- **Category**: The bank of the song wheel a song appears in, such as HOT, a game version, a level
  or CUSTOM. EZ2PORT lists your song in that one bank only.
- **Title plate**: The 256×32 picture of the title that the song wheel and result screen show. It is
  the only title they show.
- **Disc**: The round picture that spins on the song wheel.
- **Eyecatch**: The picture that fills the screen when the song is chosen.
- **Preview**: The short loop the song wheel plays while your song is highlighted.
- **BGA**: The movie EZ2PORT plays behind the play field.
- **Song wheel, song select**: The game's screen for choosing a song, with the songs on a turning
  wheel.

## EZ2PORT and the game

- **EZ2AC**: The EZ2 arcade game whose data you set as your game folder, and which a cabinet runs.
- **Cabinet**: The arcade machine. A **cabinet export** writes your song back into the original
  game.
- **The original game**: The cabinet's own executable, as against EZ2PORT. It has its own limits,
  such as one sound per track.
- **Game folder**: Your EZ2AC data folder, the one with `sound/` and `system/` in it.
- **Unpacked executable**: Your EZ2AC program file, unpacked. The game's charts are encrypted with
  keys that are inside it.
- **EZ2PORT**: A port of the EZ2AC engine that plays the original game's data and your own songs.
- **ez2play**: EZ2PORT's player program. EZ2BMS starts it to test a chart.
- **Songs folder**: The folder where EZ2PORT keeps packages. It is not your song's own folder.
- **Package**: A song as EZ2PORT reads it, in a folder named after the song key inside the songs
  folder.
- **Publish**: Write your song as a package into EZ2PORT's songs folder. See [Publishing and
  testing](14-publish-and-test.md).
- **Export, import**: Export writes your song out for something other than EZ2PORT (the cabinet, or
  BMS players). Import makes a song out of the game's songs, BMS files or bmson. See
  [Exporting](16-export.md) and [Importing](15-import.md).
- **Shipped song**: A song the game comes with. Publishing under a shipped song's key is refused,
  because EZ2PORT would play your package in its place.
- **bmson, BMS**: Chart file formats. bmson is the one EZ2BMS saves in; BMS (with BME and BML) is
  the older format LR2 and beatoraja play.

## The editor

- **Inspector**: The Notes tab of the right-hand drawer, where you change the selected notes.
- **Chart info**: The Chart tab of the right-hand drawer.
- **Issues**: The pre-flight check: everything that would stop a publish, or play differently in
  EZ2PORT.
- **Error, warning, info**: A finding's level. Errors block Publish and testing in EZ2PORT; warnings
  and info (shown as **Notes**) don't.
- **Quick fix**: A button in Issues that fixes a finding for you, as one undo step.
- **Command palette**: The box <kbd>Ctrl</kbd>+<kbd>K</kbd> opens, which finds any command by name.
- **Brush**: The sound the next note you place will play.
- **Knife tool**: The tool for cutting stems.

Next: [Back to the contents](README.md)
