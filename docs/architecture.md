# Architecture

EZ2BMS is a Tauri 2 desktop application: a Svelte 5 + PixiJS front end in the
system webview, and a Rust back end for everything that touches audio samples,
processes or the disk. This page is the map; the per-format decisions live in
[`bmson-dialect.md`](bmson-dialect.md) and the engine contract in
[`ez2port-compat.md`](ez2port-compat.md).

## The rule: one implementation of each concern

| Concern                                                                                                                              | Lives in                           | Why                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Chart model, timing, modes, editing, undo, lint                                                                                      | `packages/chart-core` (TypeScript) | the editor edits it at 60+ fps without crossing IPC; Vitest tests it without a webview |
| Every byte format: bmson, BMS, EZFF `.ez`, `.ezi`, `.ini`, `song.ini`, `.abm`, `.gds`, `.pvi`, the cipher, PE key-table extraction   | `packages/chart-core`              | pure byte work on the model; one implementation, tested against the EZ2PORT oracle     |
| The EZ2PORT judge/score/gauge rules, voice rules, publish plan                                                                       | `packages/chart-core`              | Play mode and Publish must agree with each other by construction                       |
| Decode, resample, mix, render, cut, encode (`.ssf`/`.ezw`/wav)                                                                       | `crates/ez2bms-audio` (Rust)       | real-time and sample-exact work                                                        |
| Launching `ez2play`, capturing its log                                                                                               | `crates/ez2bms-launch` (Rust)      | process control                                                                        |
| Decoding images, cutting the disc and eyecatch, rendering title plates (the pixels; chart-core has the specs and encodes the `.abm`) | `crates/ez2bms-media` (Rust)       | decoders, fonts and per-pixel work, byte-checked against the port                      |
| Files, dialogs, settings, IPC glue                                                                                                   | `src-tauri` (Rust)                 | the host                                                                               |

The front end talks to native code only through one interface,
`apps/editor/src/bridge/types.ts` (`Backend`). `tauri.ts` implements it in the
app; `web.ts` implements it in a plain browser with an in-memory file system and
a silent clock, which is what Playwright and browser development use.

## Layout

```
packages/chart-core/src/
  model/      ChartDoc, NoteRec, channels, extras (unknown JSON kept), note index
  timing/     tempo map (f32-faithful), ticks (48/beat), measures, snap, rescale
  modes/      mode registry, lane kinds, bundled lane orders, file names
  ez2data/    .gds, .pvi, .abm, PE + key tables, cipher
  io/bmson/   parse / serialize / mode resolution / legacy renumbering
  edit/       ops + inverses, transactions, history, selection, clipboard, commands
  engine/     EZ2PORT emulation: voices, judge, holds, gauge, score, sessions
  publish/    the compiled plan and the package writers (EZFF, ezi, ini, song.ini, plate);
              audible.ts: what a chart sounds like, for Classic mode's checks
  sound/      chart names -> folder files, BmsTWO's grouping, song-wide usage, renames
  lint/       rules, grouped by severity
  input/      keys.ini and binding tokens, scancodes, channel routing, the input mapper,
              settings.ini's Debounce, latency calibration
apps/editor/src/
  bridge/ state/ commands/ input/ render/ skin/ audio/ port/ ui/ theme/
crates/
  ez2bms-audio/    sample cache, peaks, mixer with EZ2 voice rules, offline render, cutting
  ez2bms-launch/   ez2play discovery, capability probe, isolated temp songs root
  ez2bms-media/    song art (disc, eyecatch) and title plates, as the port makes them
  ez2bms-input/    game controllers through SDL3 (feature `sdl`), named and timed as the port's
  ez2port-oracle/  TEST ONLY: builds third_party/ez2port-core and answers JSON queries
third_party/ez2port-core/  vendored snapshot of EZ2PORT's ez2core (GPL-3.0-or-later)
```

## Two skins, one playfield

The playfield draws with a procedural neon skin, or, when a game folder is set
and holds a panel for the chart's mode and side, with the game's own
`.pvi`/`.abm` art: `skin/game.ts` finds and decodes it, `render/gameskin.ts`
turns it into textures once, and the renderer draws with it. The game skin
only changes the lane boxes, the judge line and how things look; scrolling,
hit testing and the tools are the same code. What is reproduced from the
port's `scene/skin.c`, and what is not, is in `ez2port-compat.md`.

Both skins read the game folder through `skin/vfs.ts`, the port's
any-case, `.abm`-first resolver. The song manager's wheel preview reads the
song select's masks through it too (`skin/select.ts`) and draws a Canvas 2D
scene (`render/wheel.ts`) rather than a second WebGL context beside the
playfield's; where the discs and plates sit, and how they move, is
chart-core's oracle-checked `ez2data/selectwheel.ts`.

## Big files stay on disk

A BGA movie can be hundreds of megabytes, so it never crosses the bridge:
chart-core's `media/movie.ts` reads its headers through ranged reads
(`fs_read_range`, a few kilobytes), the package writer copies it by path
(`WriteOptions.copies`), and the `<video>` preview loads it through Tauri's
asset protocol, whose scope holds only the files shown.

## One compiler for playback and publishing

`chart-core/src/publish/plan.ts` turns a chart into exactly what the package
writer will put on disk: slices become keysound entries, background notes are
allocated to tracks, STOPs become gaps, pulses become 1/48-beat ticks, tempo is
rounded to f32 the way EZFF stores it. The editor's preview and Play mode play
**that plan**, through the same voice rules EZ2PORT uses. What you hear in the
editor is what the engine will play.

## Edit and Play share one axis

EZ2PORT scrolls by ticks, not seconds: `1.6 px per tick x speed%`, so the space
between two beats never changes when the BPM does. The editor's Edit mode uses
the same pulse axis; Play mode only swaps who drives the position (the audio
clock instead of the user) and the zoom. Flipping between them is an animation,
not a different renderer. A chart's scroll changes (M8) rescale Play's zoom
as a whole, as EZ2PORT's live rate does; the axis stays linear.

## Audio

`crates/ez2bms-audio` plays what chart-core compiles; it makes no timing or
voice decisions of its own.

- **Samples.** Decoded once (WAV/OGG/FLAC/MP3 through symphonia, `.ssf`/`.ezw`
  directly), resampled to the device rate with the filter delay removed, and
  cached while the file is unchanged. Files of 20 s and more are also kept
  decoded on disk (`disk.rs`, `<app cache>/audio`, least recently used out
  past a cap): a hit is the decode bit for bit, so the editor and every
  publish can use it. Peak mipmaps feed waveform drawing (whole levels for
  thumbnails, 4096-bucket tiles for the stem strips) and sit on disk beside
  a long file, as does its onset and tempo analysis (`analysis.rs`).
- **Schedule.** Events carry song milliseconds from chart-core. A slice gives
  its fresh hit's time and the next note's time, so its bounds and the event
  times come from the same frame positions: a chain of slices plays exactly
  like the uncut sample at any device rate (tested bit for bit).
- **Voices.** EZ2PORT's rule: a sound on a voice that is already sounding cuts
  it and restarts. Every keysound has a voice (backing, autoplay) and every
  lane has one (presses); gains are DirectSound's (`10^(dB/2000)`, pan turns one
  side down), and the output stage is the port's soft knee and clamp.
- **Real time.** The renderer never allocates, locks or frees (a test counts
  allocator calls). The control side swaps whole transports (schedule, play,
  stop, seek) with `arc-swap` and keeps retired ones until the audio thread has
  let go; immediate sounds (auditions, test-play presses) go through an `rtrb`
  ring. Playing from any frame picks up every sound already under way,
  mid-sample, with voice cuts applied.
- **Clock.** Each buffer publishes frame, host time and output latency through
  a seqlock; `heard_frame_at(now)` is what the speaker is playing.
- **Backends.** `cpal` (feature) for the device, `null` for a real-time clock
  without one; `offline` renders through the same renderer for previews,
  bounces and tests.
- **Publish.** Keysounds are cut from 44.1 kHz audio into 16-bit stereo `.ssf`,
  the port's own format; consecutive cuts join exactly into the uncut sample.

## Sounds across the song (M2)

Each chart has its own channel list and undo history; what the charts of a
song share is the folder of sound files. The keysound workbench
(`apps/editor/src/ui/workbench`) shows that folder: every file and every
missing name as a card, grouped by chart-core's port of BmsTWO's
`SampleGrouping` (the same groups as the background rack), with where each
is used (`sound/usage.ts`). Only the cards on screen are built, and their
waveforms come from the host in batches (`audio/thumbs.ts`).

Two song-wide changes behave differently on purpose:

- **Replace** points channels at another file. The notes now play
  something else, so it is an edit: one undo step in each chart it touches,
  and the toast undoes them all.
- **Rename** renames the file on disk and every reference to it, in every
  chart, including their undo and redo history (`ChartDoc.renameSoundRefs`),
  so no undo can bring back a name that no longer exists. It is not an edit:
  charts without unsaved changes are saved at once, and the toast's Undo
  renames the file back. `sound/rename.ts` refuses a name another reference
  would start to mean.

**Classic mode** (`edit/classic.ts`, on per song in `ez2bms.song.json`)
charts over music already complete in the background: placing keys the
sound playing there, deleting un-keys it. Every such edit is dry-run
through `publish/audible.ts` - only for the sound files it touches, against
a cached analysis of the chart - and refused if the music would change.
What that promise covers, and what it cannot, is in `ez2port-compat.md`.

## Stems (M4)

A stem is a sound file a chart slices: a fresh hit and continuation notes,
which EZ2PORT plays as consecutive cuts of the file ([slicing](slicing.md)).

- **The model.** chart-core `slice/view.ts` turns the notes of the channels
  playing one file into slices (each note's part of the file, and when it
  plays) and the stretches that sound (`audible()`, voice cuts applied),
  cached per file in the document's analysis (`edit/analysis.ts`, shared with
  Classic mode) until those notes change. `whenHeard` maps a second of the
  file to every song time it plays at; `PlanTimeline` (now in chart-core)
  maps song time to pulses and back, STOPs as gaps.
- **The edits.** `slice/ops.ts` cuts, moves, heals and keys slices, chops to
  a grid and places onsets - all as standard notes, all dry-run through
  `classicCheck` so autoplay never changes.
- **The strip.** `render/striprows.ts` works out, per pixel row, the stretch
  of the file playing there and its slice; `render/strip.ts` paints the rows
  on a canvas shown as one texture in the playfield, again only when
  something it shows changed. Waveform tiles (`audio/peaktiles.ts`) come from
  the host as needed, answered meanwhile from the file's coarse whole level;
  onsets (`audio/analysis.ts`) once per file.
- **The state.** `state/strips.svelte.ts`: which files have strips, the
  slicing actions with their refusals, hover audition, the panel's plans;
  the pointer tool's strip gestures and the knife call into it.

## Importers (M5)

Everything an import reads is chart-core's, pure and synchronous over bytes
([importing](importing.md)); the editor supplies the bytes and writes the
result through one host command.

- **The game.** `ez2data/songdb.ts` (the song tables and their cipher),
  `io/ez/ezi.ts` and `engine/songini.ts` (a chart's keysounds and settings,
  EZ2PORT's parsers transcribed), `ez2data/songtext.ts` (titles from the
  port's manifest). `io/ez/game.ts` walks a data folder through a small
  async file system (`GameFs`), matching names in any case as the port does,
  and gathers one song's files; `io/ez/import.ts` turns them into bmson,
  the song file and a list of keysounds to copy.
- **BMS.** `io/bms/decode.ts` (encoding), `parse.ts` (commands and control
  flow, the random values chosen by the caller), `convert.ts` (exact
  positions, lanes by channel map), `song.ts` (a folder as one song, with
  per-file choices).
- **bmson.** `io/bmson/v021.ts` upgrades 0.21; `open.ts` is how the editor
  opens any bmson (upgrade, mode, legacy renumbering) and what it says.
- **MIDI.** `io/midi/smf.ts` reads note starts and tempo; `slice/midi.ts`
  plans and makes cuts through the M4 slice operations.
- **Notes.** What opening or importing says is `OpenNote`s: a chart's go to
  `LintChart.notes`, a song's to `LintSong.notes`, and an import's are kept
  in the song file (`source.notes`) so Issues shows them on every open.
- **Writing.** The host's `import_run` (ez2bms-audio `import.rs`) writes the
  new folder in a staging folder beside it and renames it into place; an
  `.ssf` becomes a `.wav` by putting a RIFF header on its unchanged PCM.
- **The wizard.** `state/importer.svelte.ts` holds what was found and
  chosen; `ui/import/ImportWizard.svelte` shows it. The browser build stages
  a made-up game folder (`?game`, chart-core `dev/synthgame.ts`) for tests.

## Exporters (M6)

The bytes are chart-core's, as publishing's are ([exporting](exporting.md));
the host makes the sounds and writes the files, all or nothing.

- **To the game.** `publish/chart-plan.ts` compiles a chart with
  `target: 'cabinet'`: an imported chart's `x_*` members pin its background
  notes to their tracks (the allocator in `publish/tracks.ts` keeps busy
  intervals and places everything else around them), and its kept records
  and header go back. `publish/cabinet.ts` plans a song into one the game
  has (`planCabinet`: files, one keysound table, the `song.bin` edits), names
  its keysounds against the folder (`nameSounds`) and makes the bytes
  (`finishCabinet`: encrypted with the executable's tables;
  `ez2data/songdb.ts` `patchSongdb` changes only the edited bytes).
  `lint/cabinet.ts` is what the original executable does differently.
  `io/legacy-text.ts` writes CP949 and Shift-JIS by inverting the platform's
  own decoders, with no table committed.
- **BMS.** `io/bms/write.ts` is the reader's inverse (`convert.ts`'s maps,
  turned around); `io/bms/export.ts` makes a song a folder.
- **The host.** `ez2bms-audio` `export.rs` makes each keysound: a 16-bit PCM
  file rewrapped untouched (so the game's own sound goes back as it was and
  is recognised in its folder), anything else cut as a publish cuts it.
  `ez2bms-launch` `gamepatch.rs` writes into a game folder: every file checked
  against what the plan read, staged, the replaced ones backed up with a
  manifest, then renamed into place, with a rollback; `restore` undoes it.
- **The dialog.** `apps/editor/src/port/{cabinet,bms}.ts` run the steps and
  build the job; `state/exporter.svelte.ts` holds the choices;
  `ui/export/ExportDialog.svelte` shows the review. `state/game.ts` is the
  game folder as both the importer and the exporter read it.

## Input and recording (M7)

Every press - keyboard or controller - takes one path, and each step is the
port's rule where the port has one ([recording](recording.md),
[compat](ez2port-compat.md#controllers-the-ports-input-layer-not-in-the-oracle)):

1. **Devices.** `crates/ez2bms-input` owns SDL3 on a thread of its own
   (joystick layer only, built from source and linked in). Boards are named
   `vid:pid[#n]` as `ezpad.c` names them; each event carries SDL's stamp,
   moved onto the audio engine's host clock by its age (both clocks read
   back to back per batch). Pads are open only while the editor holds them,
   and closed for every EZ2PORT test run (DirectInput is exclusive).
   `src-tauri` `input.rs` streams batches to the page.
2. **The hub** (`apps/editor/src/input/hub.svelte.ts`) is the one entry
   point: keys by `KeyboardEvent.code` → SDL scancode, pads from the stream,
   both on the host clock, EZ2PORT's 200 ms age rule applied once. Bound
   keys are kept from the editor's shortcuts while something listens.
3. **The mapper** (chart-core `input/mapper.ts`, `ezinput.c`/`ezpad.c`
   transcribed): bindings (`keys.ini` grammar, `input/keyconf.ts` and
   `bindspec.ts`, oracle-exact) turn raw events into channel edges - the OR
   of alternates, the debounce, hats, the turntable's steps and holds.
4. **Routing** (`input/channels.ts`): a channel goes to the lane EZ2PORT
   sends it to in the chart's mode, or, in ScratchMix, strums.
5. **Consumers.** Test play (`play/controller.svelte.ts` → the port's
   judge, `engine/strum.ts` for ScratchMix), step input, Record mode
   (`play/recorder.svelte.ts` → chart-core `edit/record.ts`: snap, review,
   apply as one undo step through `ChartDoc.group`), the latency tests
   (`state/calibrator.svelte.ts` → `input/calibrate.ts`) and the Controls
   dialog (binding by pressing: the mapper's capture).

Song time for a press is `AudioClient.songMsAtHost(hostMs)` - the same
clock arithmetic as the cursor - less the input offset. The metronome's
clicks are made in the host (`ez2bms-audio` `click.rs`) and scheduled as
engine events beside the chart's.

## EZ2-native extras (M8)

- **Hold kinds.** `engine/holdpreview.ts` says, for a hold, where each
  instalment falls due, how many a clean play is paid and what the note
  counter counts, from the same `holdStep`/`holdInstalments`/`noteCounted`
  the play session judges with; its test runs the session in autoplay and
  finds the instalments where the preview put them. The renderer draws a
  tick at each (cached per chart version) and the Inspector the counts.
- **Scroll changes.** `ChartData.scrollEvents` (bmson `x_scroll_events`),
  edited by `setScrollAt` in one transaction. `timing/scroll.ts` holds both
  halves of what EZ2PORT does: `ez2/scroll.c`'s arithmetic (oracle-checked
  bit for bit) and the play loop's walk of the records (`scrollPoints`,
  `multiplierAt`, from `reference/play.c`). `scrollEventsOf` adds the
  records charts imported before M8 kept, so they play and publish too.
  - Packages get them as type-6 records on track 0, the cabinet on their
    own tracks with their own second word.
  - The renderer multiplies Play's pixels per beat by the multiplier at the
    cursor, and while playing eases to it a tenth of the gap per 1/60 s.
- **Kept records.** `io/ez/kept.ts` describes what an imported game chart
  kept in `x_ez_records`; the renderer tags them in the gutter and the
  Timing panel lists them. A change of resolution moves them with the notes.

## The desktop host (`src-tauri`)

The host does what a browser cannot, and nothing else; chart logic never
crosses the bridge. Its commands, each mirrored by the web mock in
`apps/editor/src/bridge/`:

| Group    | Commands                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files    | `fs_read` (raw bytes), `fs_read_text`, `fs_write_text` / `fs_write_bytes` (atomic, optional `.bak`), `fs_list`, `project_scan`, `fs_copy_into` (import: never overwrites), `fs_rename`             |
| Settings | `settings_load`, `settings_save` (a JSON object the front end owns, in the app's config folder)                                                                                                    |
| Audio    | `audio_info`, `audio_load`, `audio_peaks`, `audio_thumbs` (a screenful of waveforms in one call), `audio_set_events`, `audio_play` / `seek` / `stop`, `audio_trigger`, `audio_set_master`          |
| Clock    | `audio_clock`, `audio_now` (for offset pings), `audio_clock_stream` (a snapshot every 8 ms over a Tauri channel)                                                                                   |
| EZ2PORT  | `port_locate`, `port_probe`, `port_publish` (cuts keysounds, writes the package whole), `port_test` / `port_stop` (pads closed for the run), `port_config_files` (where the port keeps `keys.ini`) |
| Import   | `import_run` (a new song folder, staged and renamed into place)                                                                                                                                    |
| Export   | `export_probe` (which keysounds the game's folder already holds), `export_game` (into a game folder, with a backup), `export_folder`, `export_backups`, `export_restore`                           |
| Input    | `input_devices`, `input_stream` (pad events in batches over a Tauri channel), `input_hold` (open or close the pads), `audio_clicks` (the metronome's samples)                                      |

Without an output device the audio engine falls back to a silent real-time
clock, so Play mode still runs. `port_test` publishes into a private songs
folder in the app cache, streams ez2play's output back line by line, and
removes the folder when the game exits.

## Risks and fallbacks

- **WebKitGTK WebGL speed** - see [`perf-log.md`](perf-log.md). Mitigations:
  draw only on change in Edit mode, pooled sprites, density view when zoomed
  out, no Pixi filters or backdrop blur; `WEBKIT_DISABLE_DMABUF_RENDERER=1` for
  NVIDIA blank-window issues; the Tauri CEF runtime as a last resort.
- **The oracle drifting from the live port** - `third_party/ez2port-core/PROVENANCE.md`
  records the build; re-vendor from a newer zip or repository when the port changes.
- **Nothing from the game ships** - key tables, lane layouts and art are read
  from the user's own install at run time, exactly as EZ2PORT does.

## The song file

`ez2bms.song.json` holds what bmson has no place for - the key, category,
plate, disc, eyecatch, preview and BGA - read and written byte-stably by
chart-core `song/songfile.ts`. Its members are in `song-file.md`.
