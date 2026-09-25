# Changelog

What each release of EZ2BMS brings. The milestones behind it are in the
README's checklist; what has been checked on real machines is in
AI-DISCLOSURE.md.

## 0.2.0 - not yet released

The first release: everything from the chart editor to the cabinet, in
English, Korean and Japanese.

### Charting

- Chart on the play field itself, in every EZ2 mode EZ2PORT plays (5K ONLY,
  SCRATCH, RUBY, 5K STANDARD, 7K, 10K, 14K), with Andromeda and Catch for
  the cabinet; your game's own lanes and note art when a game folder is set.
- Hear and judge the chart exactly as EZ2PORT will: the same compile, voice
  rules, judgement, holds and gauge; test play with EZ2PORT's keys or your
  controller; F5 runs it in EZ2PORT itself.
- Keysound workbench, and Classic mode: placing a note keys the sound
  already playing there, so charting over a finished mix never changes it.
- Stems: waveform strips on the tick axis, cut by hand, to the grid or at
  detected onsets, slices dragged onto lanes; long stems cached on disk.
- Record mode: play along and the presses become notes, with latency
  calibration; ScratchMix fret and strum.
- Hold kinds' instalments shown; scroll-speed changes edited, played and
  published as EZ2PORT plays them.

### Songs, publishing and the cabinet

- The song manager: the chart matrix, shared info, category, title plate
  designer, disc and eyecatch, preview window, BGA, and a preview of the
  song select wheel.
- Publish an EZ2PORT package safely: another song's package or a shipped
  song's key is never overwritten, rankings kept for unchanged charts, a
  pre-flight check with quick fixes.
- Import the game's own charts, BMS/BME/BML (Shift-JIS and EUC-KR,
  `#RANDOM`), bmson 0.21 and MIDI cut points.
- Export to the original game (encrypted charts, keysounds, song.bin
  levels) with a backup and Restore, or to a BMS folder.

### This release (M9)

- **Korean and Japanese** for the whole app, following the system's
  language or chosen in Preferences (Ctrl+,). First drafts by an AI: a
  native speaker's corrections are welcome (docs/i18n-glossary.md).
- `.bmson` and BMS files open in EZ2BMS from the file manager; a second
  launch hands its file to the window already open.
- Updates: the app looks for a new release at most once a day, shows what
  changed and installs it when you say so (the Windows installer and the
  AppImage; the `.deb` points to the release page).
- A log on your machine: after a run that did not close, the next start
  offers it; About shows the version and copies a report for a bug.

### Fixed before release

- The playfield draws in the installed app. The app's security policy
  forbids code built from text, which the drawing library used, so the
  chart area stayed empty with a WebGL message; it now uses the library's
  version without it. The browser tests now run under the same policy.
- Narrow windows: the top bar keeps the chart buttons and the Edit/Play
  switch in view down to the smallest window (960 px), hiding the name,
  time and zoom first; the open chart's button is scrolled into view.
- Touchscreens: two fingers scroll the chart and pinch its zoom.
- A browser preview of the editor, to share as a web page
  ([docs/hosted-preview.md](docs/hosted-preview.md)).
