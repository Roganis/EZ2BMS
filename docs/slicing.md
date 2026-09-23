# Slicing stems

EZ2 songs made from a finished mix are charted by cutting the mix's stems
into slices and putting slices on lanes: the player's key plays exactly
the part of the stem that would have played there anyway. EZ2BMS draws
each stem beside the lanes, where the chart plays it, and cuts it without
ever changing what autoplay plays.

## What a slice is

A slice is a standard bmson note - no new fields. On one sound channel:

- a **fresh hit** (`c: false`) starts the file from its beginning;
- a **continuation** (`c: true`) plays on from where the fresh hit's sound
  has reached by then - `t - t(fresh hit)` into the file - up to the
  channel's next note;
- a fresh hit with no continuation after it plays the whole file.

That is how EZ2PORT's own importer reads bmson (`ez2/bmson.c`
walk_channels) and how EZ2BMS publishes it: each slice becomes a keysound
cut from the file sample-exactly at 44.1 kHz, so consecutive slices join
into the uncut stem with no gap and no click (the importer rounds its cuts
to 1 ms; see `ez2port-compat.md`). A slice on a lane is the player's key;
in the background it is autoplay's.

So cutting a stem where it plays, moving a cut between its neighbours,
healing one, or moving a slice between the background and a lane at the
same time changes nothing that plays. EZ2BMS checks this rather than
trusting it: every slicing edit is dry-run through chart-core's
`publish/audible.ts` (the same check Classic mode uses) and refused, with
the reason, when anything audible would differ - a cut past the file's
end, one closer than 0.5 ms to another (EZ2PORT never cuts a slice
shorter), a slice keyed onto a lane where a note already is.

## The strip

Each stem gets a strip between the lanes and the background rack (Edit
view). Stems are the files a chart slices, or that last 20 s or more;
up to three show, longest first, until the song picks its own (the
palette's "Stem strip for the picked sound"; kept per song folder in the
app's settings).

The strip is on the chart's own axis, which is linear in beats, not in
time: each pixel row is a stretch of pulses, turned into song time by the
published tempo map (STOPs are gaps - the audio runs on while the scroll
holds, so a STOP's audio sits in one row), and into seconds of the file
by the chain playing it. A stem retriggered by a later fresh hit is drawn
again from its start. What it shows:

- the waveform (from the engine's peak mipmap, square-root scaled so quiet
  stems read), each slice in its own tint - background slices alternate
  cyan and violet, a keyed slice takes its lane's colour and a badge;
- where a sound starts (a bright line) and each cut (a thin line and the
  rack's red cross);
- the file's onsets, as ticks on the right edge;
- the beats, faintly; the header gives the file, its length and its tempo.

## Cutting

In a strip, whatever the tool:

| Do                                | What happens                                |
| --------------------------------- | ------------------------------------------- |
| Right-click                       | Cut there (on a cut: heal it)               |
| Drag a cut                        | Move it, between the cuts either side of it |
| Click a slice (Shift adds)        | Select it                                   |
| Drag a slice sideways onto a lane | Key it there, at its own time               |
| Drag its note from the lane back  | Back to the background                      |
| Hover a slice a moment            | Hear it                                     |
| Click the header                  | The strip's panel                           |

Cuts snap to the grid; with Shift, to the stem's nearest onset (on the
nearest 1/48 beat); with Alt, anywhere. The knife tool (C) cuts with a
click, in a strip or on the lanes for the strip in focus.

The panel (Ctrl+Shift+G / Ctrl+Shift+O):

- **Tempo** - what the stem sounds like (and the half or double), where
  its first beat is and how sure that is. "Use this BPM" makes it the
  chart's start tempo when the chart has one tempo: chopping to the grid is
  only useful once the grid matches the stem.
- **Chop to the grid** - a cut every step, over the selected slices or the
  whole stem. Steps whose slice would be quieter than -48 dBFS are left
  uncut, so silence stays on the end of the slice before instead of
  becoming keysounds of its own. The count shows the keysounds the chart
  would have: EZ2AC's own executable loads at most 2047.
- **Cut at onsets** - the file's onsets, snapped to the grid (within a
  third of a step) or exactly to the nearest 1/48 beat, with a sensitivity;
  shown on the strip before they are made.

Each is one undo step.

## Onsets and tempo

Found by the engine (`crates/ez2bms-audio` analysis.rs) the first time a
strip shows a file, and kept on disk with it:

- onsets by spectral flux (46 ms windows every 5.3 ms, log magnitudes,
  SuperFlux's vibrato filter, peaks above a moving median), each then
  placed on the waveform itself at the start of the attack;
- the tempo from the flux's autocorrelation over 60-240 BPM, preferring
  tempi near 150 when a half or double fits as well, corrected by the
  strength of the off-beats, then fitted to the onsets on its beats.

On test signals: drum hits within 3 ms; notes starting under others still
ringing, 95 % within 3 ms; click tracks from 64 to 230 BPM to 0.05 BPM and
their first beat to 5 ms. On real material they are suggestions: nothing
is cut until you say so.

## Long stems

Files of 20 s or more are kept decoded on disk (`<app cache>/audio`, 2 GB
by default, set on the EZ2PORT panel), bit for bit what a decode gives, so
a song with long stems opens and publishes without decoding them again: a
5-minute stem reads back in about a tenth of its decode time. A changed or
damaged entry is decoded again.
