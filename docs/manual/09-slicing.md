# Slicing stems

This chapter covers charting from a finished mix: cutting the mix's stems into slices and putting
the slices on lanes, so that the player's key plays exactly the part of the stem that would have
played there anyway. On macOS, Ctrl is Cmd.

## What slicing is for

Many EZ2 songs are charted from a finished mix. Instead of one short sound per note, the song's
stems (the drum track, the bass track, the lead, and so on) play in the background, cut into
slices. Each slice you move onto a lane becomes the player's key, and each slice left in the
background is autoplay's.

EZ2BMS draws each stem beside the lanes, where the chart plays it, and lets you cut it there.
Slicing never changes what autoplay plays: cutting a stem where it plays, moving a cut, healing a
cut, or moving a slice between the background and a lane at the same moment all leave the sound as
it was. EZ2BMS checks each slicing edit before it makes it, and refuses one that would change what
you hear, with the reason.

Slicing works well together with [Classic mode](08-sounds.md#classic-mode), which keys what is
already playing in the background.

## The strip

In the Edit view, each stem gets a _strip_: a column between the lanes and the background rack that
shows the stem's waveform where the chart plays it.

A stem is a sound file that a chart already slices, or one that lasts 20 seconds or more. Until you
choose, up to three stems get a strip, the longest first.

### Choosing which stems have strips

- To give the picked sound a strip, or take its strip away, run **Stem strip for the picked sound
  on / off** from the [command palette](06-charting.md#the-command-palette). Up to four strips can
  show; adding a fifth drops the oldest.
- In a strip's panel (see [The strip's panel](#the-strips-panel)), **Remove the strip** takes that
  strip away.
- **Stem strips shown / hidden**, in the palette, hides every strip or shows them again.

Your choice is kept for each song folder, in EZ2BMS's own settings. It is not part of the song.

### Reading a strip

The strip follows the chart's own scroll, which is even in beats rather than in seconds. So a stem
whose tempo matches the chart lines up with the beat lines. A STOP is a pause in the scroll while
the music runs on, so the audio during a STOP is squeezed into a single row. A stem that starts
again from a later note is drawn again from its beginning.

A strip shows:

- The waveform. Each slice has its own tint: background slices alternate between cyan and violet,
  and a slice keyed onto a lane takes that lane's colour and a badge.
- A bright line where a sound starts, and a thin line with a red cross at each cut.
- The file's onsets (where its hits start) as ticks along the right edge.
- The beats, drawn faintly.
- A header with the file's name, its length and its tempo.

## Cutting a stem

These work in a strip whatever tool you have:

| Do                                | What happens                                              |
| --------------------------------- | --------------------------------------------------------- |
| Right-click                       | Cuts the stem there. On a cut, heals it.                  |
| Drag a cut                        | Moves it, anywhere between the cuts either side of it.    |
| Click a slice                     | Selects it. <kbd>Shift</kbd>-click adds to the selection. |
| Drag a slice sideways onto a lane | Keys it there, at its own time.                           |
| Drag its note from the lane back  | Sends it back to the background.                          |
| Hover over a slice for a moment   | Plays it.                                                 |
| Click the header                  | Opens the strip's panel.                                  |

A line shows where a cut will go before you make it. Cuts snap to the grid. Hold
<kbd>Shift</kbd> to snap to the stem's nearest onset instead, or <kbd>Alt</kbd> to cut anywhere.

### The knife

The knife tool (<kbd>C</kbd>) cuts with a plain click. Click in a strip to cut it there, or click on
the lanes to cut the strip in focus at that height. The strip in focus is the one you used last, or the first strip
if you haven't used one yet. Press <kbd>D</kbd> to
go back to drawing.

## The strip's panel

The panel holds the strip's bigger tools: finding the tempo, chopping to the grid, and cutting at
onsets or at a MIDI file's notes. Nothing changes until you click one of its buttons, and every
count it shows is what that button would do.

To open it:

- Click the strip's header.
- Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> (**Chop the stem to the grid…**) for the
  strip in focus.
- Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> (**Cut the stem at its onsets…**) for the
  strip in focus. This also shows the suggested cuts on the strip.

Press <kbd>Esc</kbd> or click **×** to close it. Each of the panel's actions is one undo step.

### Finding the tempo

The first time a strip shows a file, EZ2BMS listens to it for its onsets and its tempo, which can
take a moment (**Listening for the beat…**). Under **Tempo**, the panel then shows:

- **Sounds like _n_ BPM**: the likeliest tempo first, and the half or double tempo when that fits
  too.
- **First beat _n_ ms into the file · _n_% sure**: where the stem's first beat is, and how sure
  EZ2BMS is about it.

Click **Use _n_ BPM** to make that tempo the chart's start BPM. Do this before you chop to the grid:
chopping is only useful once the grid matches the stem. The button works only when the chart has a
single tempo. If the chart changes tempo, set it on the [Timing](07-timing.md) tab instead.

If there is no clear beat, the panel says **No steady beat found.**

### Chopping to the grid

**Chop to the grid** puts a cut on every step of a grid.

1. Under **Every**, pick the grid, for example 1/16.
1. Check what it covers: **over the selected slices** when slices of this stem are selected,
   otherwise **over the whole stem**.
1. Leave **Leave silence uncut (under -48 dB)** on to skip steps whose slice would be almost
   silent. The silence then stays on the end of the slice before, instead of becoming keysounds of
   its own.
1. Click **Chop**.

The count above the button shows the cuts it will make and how many keysounds the chart will have.
If that is more than 2047, the most EZ2AC's own executable loads, the panel warns you.

### Cutting at onsets

**Cut at onsets** cuts where the stem's hits start.

- **Sensitivity** sets how weak an onset can be and still count.
- By default each cut goes on the snap grid. An onset further than a third of a step from the grid
  is left out. Turn on **Exactly (to 1/48 beat), not to the snap grid** to cut at each onset on
  EZ2's finest grid instead.
- **Show them on the strip** draws the suggested cuts before you make them.

The count shows how many cuts it will make. Click **Cut at onsets** to make them.

### Cutting at a MIDI file's notes

If you have a MIDI file of the same song, for example exported from the program the stem came
from, its notes say exactly where each hit is. Only where the notes start matters, not their pitch
or length.

1. Under **Cut at a MIDI file's notes**, click **MIDI file…** and pick the file.
1. Choose the tracks whose notes should cut. Every track with notes is on at first.
1. Choose the tempo:
   - **Keep the chart's tempo**: each cut goes where the MIDI note falls in time, through the
     chart's own tempo.
   - **Take the MIDI's tempo from the stem's first hit**: from the stem's first hit on, the chart
     takes the MIDI file's tempo, and each cut goes on its MIDI beat. The MIDI file's start is
     lined up with the stem's first hit. Anything else charted after that point moves in time with
     the new tempo, and the panel warns you how many notes that is.
1. Turn on **On the snap grid, not the nearest 1/48 beat** to put the cuts on the snap grid.
1. Check the count, which says how many cuts there will be and how far the furthest one lands from
   its MIDI note, then click **Cut**.

The tempo change and the cuts are one undo step together.

## Long stems

Sound files of 20 seconds or more are kept decoded on disk, so a song with long stems opens and
publishes without decoding them again. You can set how much disk this uses, or clear it, under
**Long sounds** on the EZ2PORT tab: **Disk to use (MB, 0 = off)**, 2048 MB by default. This is not
available in the browser preview. See [Setting up EZ2PORT](05-ez2port-setup.md).

## Details

This section is for readers who want to know exactly what a slice is in the song's files. For the
file format itself, see [bmson-dialect.md](../bmson-dialect.md) and
[ez2port-compat.md](../ez2port-compat.md).

### What a slice is

A slice is a standard bmson note, with no new fields. On one sound channel:

- a _fresh hit_ (`c: false`) starts the file from its beginning;
- a _continuation_ (`c: true`) plays on from where the fresh hit's sound has reached by then (its
  time minus the fresh hit's time into the file), up to the channel's next note;
- a fresh hit with no continuation after it plays the whole file.

That is how EZ2PORT's own bmson importer reads a chart, and how EZ2BMS publishes one: each slice
becomes a keysound cut from the file sample-exactly at 44.1 kHz, so consecutive slices join into
the uncut stem with no gap and no click. (EZ2PORT's importer rounds its cuts to 1 ms.) A slice on a
lane is the player's key; in the background it is autoplay's.

Every slicing edit is tried out first with the same check Classic mode uses, and refused, with the
reason, when anything you would hear differs. For example, EZ2BMS refuses a cut past the file's
end, a cut closer than 0.5 ms to another (EZ2PORT never cuts a slice shorter), or a slice keyed onto
a lane where a note already is.

### How onsets and the tempo are found

EZ2BMS's audio engine finds them the first time a strip shows a file, and keeps them on disk with
the file:

- Onsets are found by spectral flux: 46 ms windows every 5.3 ms, on log magnitudes, with
  SuperFlux's vibrato filter, taking peaks above a moving median. Each onset is then placed on the
  waveform itself, at the start of the attack.
- The tempo comes from the flux's autocorrelation over 60-240 BPM, preferring tempos near 150 when
  a half or double fits as well, corrected by the strength of the off-beats, then fitted to the
  onsets on its beats.

On test signals, drum hits are found within 3 ms; notes that start under others still ringing,
95 % within 3 ms; and click tracks from 64 to 230 BPM to within 0.05 BPM, with their first beat
within 5 ms. On real music these are suggestions: nothing is cut until you say so.

### How the strip is drawn

Each pixel row of a strip is a stretch of pulses. It is turned into song time by the tempo map the
chart publishes with (a STOP is a gap in time, so its audio sits in one row), and into seconds of
the file by the chain of slices playing it. The waveform comes from the audio engine's peak data,
square-root scaled so that quiet stems still read.

### The long-stem cache

Long stems are kept decoded in the app's cache folder (`<app cache>/audio`), bit for bit what a
decode gives. A 5-minute stem reads back in about a tenth of the time it takes to decode. An entry
whose file has changed, or that is damaged, is decoded again.

Next: [Playing and recording](10-play-and-record.md)
