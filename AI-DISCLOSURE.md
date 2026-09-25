# AI Disclosure

This project is written with AI assistance. This file records what was done by
whom and, more importantly, **what has been verified and how**, so a reader can
judge how much weight to put on any claim.

The distinction that matters most is between behaviour **checked against
EZ2PORT's own code** (the vendored oracle, run in tests), behaviour **checked on
real hardware or the real engine by the owner**, and behaviour that is an
**inference** from documentation.

---

## Human work

- The product direction, the choice of stack, target engine, formats and
  workflows, and every trade-off decision recorded in the plan (2026-09-22).
- EZ2PORT itself, BmsTWO, ez2-io and the reverse-engineering knowledge they
  carry, which this project builds on.
- Running the editor, EZ2PORT and the cabinet: anything in the verification
  table marked "owner".

## AI work

### Planning and M1 scaffold, 2026-09-22

An AI assistant (Claude, via Claude Code) researched the owner's repositories
(BmsTWO, circus2bmson, ez2-io, rizu-arcade) and the EZ2PORT build 1582 source
bundle, proposed the architecture, and after the owner's decisions wrote the
plan and began Milestone 1: the workspace layout, build and CI configuration,
the renderer performance spike and the documentation in `docs/`.

It had no access to a GPU, an audio device, the game data, the executable or a
cabinet. Nothing it measured says anything about those; see the table.

### Chart core and engine emulation (M1.1-M1.7), 2026-09-22

The assistant vendored EZ2PORT's engine core unmodified as a test oracle,
then wrote `packages/chart-core`: the chart model and bmson dialect, timing,
the mode registry, the `.ez`/`.gds`/`.pvi`/`.abm` formats and the cipher, the
editing core, the package publisher and a TypeScript port of the engine's
judgement and scoring. Every format and rule it claims to share with EZ2PORT
is checked against the vendored C code (`docs/ez2port-compat.md`). All test
inputs are synthetic; no game file was read by any test.

### Audio engine (M1.8), 2026-09-22

The assistant wrote `crates/ez2bms-audio`: decoding, resampling, the sample
cache, waveform peaks, the real-time mixer with EZ2PORT's voice rules
(transcribed from the port's `ezaudio.c`), the audio clock, the null and cpal
backends, offline rendering and `.ssf` cutting. It was built and tested in a
container with no sound card: the cpal backend compiles here but has never
produced sound.

### Editor (M1.11-M1.15), 2026-09-22

The assistant wrote the editor front end in `apps/editor`: the bridge and
its in-browser twin, state, commands and palette, the start screen and
drawers, the Pixi playfield, the editing tools, playback on the audio clock
and Play mode. It was exercised with Playwright in headless Chromium against
the in-browser backend (silent audio); nobody has yet charted a song with it,
heard it through a sound card, or played it on a keyboard in real time.

### Desktop host (M1.10), 2026-09-22

The assistant wrote `src-tauri`: the commands above, the window and bundle
configuration, and the app icon (`src-tauri/icon-source.svg`, drawn for this
project). The app was built here and started under a virtual display for
twelve seconds; with no sound card it fell back to the silent clock as
designed. It has not been run on Windows.

### Launcher and requests to the port (M1.9), 2026-09-22

The assistant wrote `crates/ez2bms-launch` (it reads `ez2play`'s options from
the executable, writes packages into a songs folder by staging and renaming,
and runs ez2play with its output captured) and `docs/ez2port-requests.md`, the
spec for the port-side features EZ2BMS will use when they exist. It checked the
probe against the owner's build 1582 `ez2play.exe` locally; nothing from that
file is in the repository, and the tests use a synthetic stand-in and a shell
script in place of the game.

### Publish, pre-flight check, new charts and hardening (M1.16-M1.18), 2026-09-22

The assistant wrote chart-core's lint rules and the editor's Issues tab,
Publish and Test in EZ2PORT, the new-chart dialog, autosave and crash
recovery, the synthetic test songs (`pnpm fixtures`), the 50k-note benchmarks
and the release workflow. Publish was exercised against the in-browser backend
and its files are read back by the oracle; publishing into a real songs
folder, F5 on a real EZ2PORT and the release workflow (it runs on a tag) have
not been run.

### The game's own play field (M1.12b), 2026-09-22

The assistant wrote the reader for a mode's panel (`.pvi`, its `.abm` art and
the `.gds`) and the renderer's game-skin path, transcribed from EZ2PORT's
`scene/skin.c`. That file is outside the vendored core, so there is no oracle
for it: it was tested on a panel drawn in code for the purpose
(`apps/editor/src/bridge/demo-skin.ts`). No real panel has been loaded, so how
close it looks to the port with real art is unchecked.

### Keysound workbench and Classic-mode charting (M2), 2026-09-23

The assistant wrote Milestone 2 after the owner's decisions (unused files
are only listed, renaming renames the file, grouping is a faithful port of
BmsTWO's, Classic mode is saved per song):

- chart-core's `sound/` (names to files, the port of BmsTWO's
  `SampleGrouping`, song-wide usage, rename planning);
- `publish/audible.ts`, an exact model of what a chart sounds like, and the
  Classic-mode operations in `edit/classic.ts` that are refused whenever
  that model says the music would change;
- a Rust example that renders two event lists through the real mixer, so a
  test can check the model against actual samples;
- the host's waveform thumbnails, import and rename commands;
- the grouped background rack, Classic mode in the editor, the keysound
  workbench, and import by file chooser and drop.

What "the music does not change" covers is written down, with its limits,
in `docs/ez2port-compat.md`. The claim is tested three ways in the
container: a property test over random songs and random Classic edits, the
real mixer rendering both sides of 120 random cases, and the editor
end to end. It has not been heard: there is no sound card here, and
nobody has keyed a song in Classic mode and listened to it in EZ2PORT. The
grouping port was checked against the test vectors in BmsTWO's own
`tools/fuzz_history.cpp`, not by running BmsTWO side by side. Dropping
files from the operating system into the desktop app goes through Tauri's
drag-drop event, which only the browser build's DOM path exercises here.

Found and fixed on the way: the rack's hit list was never cleared (M2.8),
and at 1 280 px the top bar was wider than the window, which made the
playfield re-bake its textures every frame (see `docs/perf-log.md`).

### Milestone 3: the song manager and full publish (M3.1-M3.12), 2026-09-23

The assistant wrote Milestone 3 step by step after the owner's
decisions (a bundled CJK font for plates, rankings kept only for charts
whose `.ez` and `.ini` are unchanged, the wheel preview drawn from the
owner's own game art):

- the song model (`song/*`: one set of song info across charts, the 48
  categories, the song file) and the song manager overlay;
- publishing into the real songs folder: whose package a folder is, a
  refusal for a shipped song's key, ranking tables carried over, the
  replaced package kept in `.ez2bms-backup`;
- song art: the `ez2bms-media` crate (decode, crop, and a transcription of
  the port importer's disc and eyecatch arithmetic), the host command that
  cuts them, and the cropper in the song manager;
- title plates: the port's text renderer transcribed around the same
  stb_truetype, with Roboto Bold (EZ2PORT's copy, Apache-2.0, committed)
  and Noto Sans CJK Bold (OFL-1.1, fetched by a pinned hash and shipped
  with the app). Font licences are in `fonts/`;
- the song preview: rendered through the real mixer and finished in the
  port importer's integer arithmetic, picked on the song's loudness and
  auditioned as the wheel loops it.
- the wheel preview: the song select's placement, chase and swing
  arithmetic transcribed from the port (`ez2/selectwheel.c`), and a Canvas
  scene layered as `tools/ez2play/select.c` layers it, over the owner's
  own select masks read at run time or neon stand-ins;
- the BGA: movie headers read in TypeScript (MP4/MOV, Matroska/WebM, ASF,
  AVI, MPEG, Ogg) against the codec list of the port's Windows build, the
  importer's pick of the charts' movie, a copy by path in the package
  writer, and a `<video>` preview through the asset protocol;
- lint quick fixes: each a pure edit of one chart in one undo step, checked
  on random charts to clear its finding and undo exactly;
- the Publish dialog, which works out the whole package before writing it.

The disc and the stretched eyecatch are checked byte for byte against
EZ2PORT's own importer through the oracle, on random images; plates
against the port's own text renderer on random lines and plates, Korean
and Japanese included (on Linux; Windows is expected to round the same); the song.ini
reader against the port's `ez2_usersongs_merge`; the publish rules in Rust
temp-folder tests and end to end. What has not been seen: a published disc
spinning on the real wheel, what the eyecatch shows on the owner's screens
(the `visible` framing assumes the top-left 640x480, read from the port's
code), and a publish while EZ2PORT has the old package open on Windows.
The wheel's placements are checked against the port's own to a thousandth of
a pixel, its chase and swing frame for frame; the drawing is checked only on
a made-up game folder, never beside the real select screen.

### Milestone 4: stem slicing (M4.1-M4.7), 2026-09-23

The assistant wrote Milestone 4 after the owner said to go ahead with it,
taking the open design choices itself and stating them in the plan (slices
stay standard continuation notes; every slicing edit keeps the sound; strips
beside the lanes; onsets and tempo as suggestions; an exact f32 disk cache
with a 2 GB cap). New areas of work:

- signal analysis in the audio crate: onset detection by spectral flux with
  the SuperFlux vibrato filter, attacks placed on the waveform, and a tempo
  estimate fitted to the beats - written from the published methods, not
  copied from a library;
- a disk cache for decoded audio, with LRU eviction, checksums and atomic
  writes, shared by the editor and publishing;
- the slice model and slicing operations in chart-core, built on M2's
  `audible()` check and Classic mode's analysis cache;
- stem strips in the renderer (a per-row mapping from the tick axis through
  the tempo map to the file, painted on a canvas texture), their gestures,
  the knife tool and the strip panel.

What is checked: the disk cache in Rust temp-folder tests (a hit equals the
decode, damage and staleness are misses); onsets and tempo on signals made
in the tests (drum hits, notes over ringing notes, click tracks at 64-230
BPM); every slicing edit by a model-based test (the fingerprint never
moves, refusals change nothing, undo round-trips), against the real mixer
(chopped stems render as the uncut stem), and against EZ2PORT's own
importer through the oracle (a chopped stem packages to the importer's
slices); the strips and gestures end to end on the browser build. What has
not been seen: onsets and tempo on real stems (drums, vocals, pads), how
hovering a slice sounds on a real device, the strips' smoothness on
WebKitGTK and WebView2, and a song with long stems reopened from the disk
cache in the desktop app.

### Milestone 5: importers (M5.1-M5.9), 2026-09-23

The assistant wrote Milestone 5 after the owner said to go ahead with it.
The owner chose what a MIDI import is (tempo and cut points for a stem, as
BmsTWO does, not notes on lanes or a circus2bmson run) and how an old
`beat-10k` bmson is read (its numbering detected from its notes); the
assistant took the rest and stated it in the plan:

- a new song folder per import (or beside the BMS files);
- a new key for an imported original;
- its category from its version bank;
- legacy `.ezi` note names read as notes;
- everything without a bmson home kept and reported.

New areas of work:

- readers for the game's own data, transcribed from EZ2PORT's C and checked
  against it: the keysound lists, chart settings, song tables and their
  cipher (the tables read from the user's executable at run time), and the
  titles in the port's text manifest;
- turning the game's charts into bmson on the engine's exact clock;
- a BMS reader: text-encoding detection (Shift-JIS vs EUC-KR/CP949), the
  BMS control flow, exact rational timing, lane maps;
- reading bmson 0.21 (after BmsONE's converter) and both `beat-10k`
  numberings;
- a Standard MIDI File reader and cutting a stem at a MIDI's notes;
- writing a new song folder atomically, `.ssf` keysounds rewrapped as WAV;
- the import wizard.

What is checked:

- **Against EZ2PORT's own code, through the oracle, on made-up data:**
  - random `.ezi` and `.ini` files, entry for entry;
  - random song tables, and their cipher byte for byte;
  - the chart files and folders a table resolves to;
  - random game charts imported with every note at the engine's millisecond
    and republished to the same lane records;
  - a 0.21 bmson and a spec-numbered `beat-10k` against the port's importer.
- **Against the BMS memo's arithmetic** (random files): BMS timing.
- **Rust tests:** the WAV rewrap (the same samples by any reader).
- **End to end, on a made-up game folder and made-up BMS files:** the
  wizard.

Tests that read a real install (`EZ2_ROOT`, `EZ2_EXE`) are written but have
not been run: every table decrypting, every offered tier having its chart,
every shipped song importing, and legacy note names never finding fewer
keysounds. Also not yet seen: real BMS packs in both encodings, and a MIDI
exported from a DAW cutting its own stem.

### Milestone 6: exporters (M6.1-M6.9), 2026-09-23

The assistant wrote Milestone 6 after the owner said to go ahead with it.
The owner chose:

- what a cabinet export may change: it remixes songs the game already has,
  and only that song's `song.bin` record changes;
- where it writes: into a game folder with a backup and Restore, or into a
  new folder shaped like the game, chosen per export;
- v8 only (v6 deferred);
- WAV for BMS sounds that must be cut or converted.

The assistant took the rest and stated it in the plan:

- keysound files never overwritten;
- tempo rewritten on track 0;
- missing sounds kept silent;
- `.ini` files written only when they change;
- when the table's BPM is kept;
- imported charts keeping their shape;
- the backup's place;
- the BMS folder's layout.

New areas of work:

- writing the original game's files: charts compiled to its track layout
  (an imported chart's own tracks, raw lengths, records and header kept),
  encrypted with the tables from the user's executable, and `song.bin`
  patched in place;
- writing into a game folder as a transaction: expectations checked,
  staged, a backup and manifest, a rollback, and a restore;
- keysounds for the cabinet (16-bit PCM rewrapped, the rest cut), and
  finding a keysound already in the game by its audio;
- checks for what the original executable does differently (file size,
  keysound count, one sound per track);
- a BMS/BME writer, and text encoders for CP949 and Shift-JIS built by
  inverting the platform's decoders;
- the Export dialog.

What is checked:

- **Against EZ2PORT's own code, through the oracle, on made-up data:**
  - random game charts imported and compiled for the cabinet read back note
    for note, record for record, with the same tempo map and header;
  - the encrypted chart, `.ezi` and `.ini` decrypt and parse to what was
    written;
  - a patched `song.bin` reads with the new levels, and an added tier's
    chart is found;
  - exported keysounds pass the port's `.ssf` reader with the same samples.
- **Unit tests:**
  - `song.bin` patches change only the edited bytes;
  - every checking rule;
  - the encoders against every code pair, and against Chromium's decoders;
  - EZ2PORT's publish output unchanged by the new compiler (50 goldens).
- **BMS read back by EZ2BMS's own reader:** random charts, every note at
  its beat and time.
- **Rust tests (Linux and Windows CI):** the rewrap, same-audio, and the
  transaction's rollback and restore.
- **End to end, on the made-up game:** export, change, export again, and
  restore both to a byte-identical folder; folder mode; BMS.

Nothing has been run against the original executable or a real install.
The tests that read a real install (`EZ2_ROOT`, `EZ2_EXE`) are written but
have not been run:

- every shipped chart re-planned;
- the largest encrypted file measured against 131068 bytes;
- `song.bin` re-patched with its own values;
- every shipped `.ssf` sent back as the same audio.

On the cabinet, to confirm:

- exported files load, and a new tier appears with its level;
- the compact `.ini` is accepted;
- keysounds at other rates than 44.1 kHz play at the right pitch;
- whether `total_ticks`, the second BPM and the header names matter;
- two-player files with both sides seated;
- the voice cuts sound as linted;
- Restore on the real drive.

Also not yet seen: the BMS output in LR2 (Shift-JIS, CP949) and beatoraja
(UTF-8, fractional stops, long notes).

### Milestone 7: record mode and the cabinet controller (M7.1-M7.13), 2026-09-24

The assistant wrote Milestone 7 after the owner said to go ahead with it.
The owner chose:

- controllers read with SDL3, as EZ2PORT reads them;
- bindings kept in EZ2BMS's own settings, EZ2PORT's `keys.ini` only read;
- a recorded press keying the background sound in a Classic song, and
  otherwise a note with the brush sound;
- a take reviewed first, then kept as one undo step.

The assistant took the rest and stated it in the plan:

- recording from the cursor after a count-in;
- the grid a take snaps to, and the hold threshold;
- a take never overwriting a note;
- pads open only while something needs them;
- the sound and picture tests;
- the metronome off by default.

New areas of work:

- **reading game controllers:** SDL3 built from source and linked into the
  host, on a thread of its own; boards named and events timed as EZ2PORT's
  (`crates/ez2bms-input`); pads closed for every EZ2PORT test run;
- **EZ2PORT's input layer in TypeScript:** `keys.ini`, binding tokens and
  `settings.ini`'s Debounce, all checked against the port's own code, plus
  the parts that are platform code and cannot be run by the oracle
  (alternates, debounce, hats, the analog turntable), transcribed with the
  port's own test cases;
- **one input path** for keyboard and controllers, with EZ2PORT's age rule,
  into test play (ScratchMix as fret-and-strum), step input and recording;
- **recording:** takes snapped to the grid, reviewed, and applied as one
  undo step, keying what plays in a Classic song;
- **latency calibration:** generated clicks, the sound and picture tests,
  and their statistics; the picture offset applied to the cursor;
- the Controls dialog.

What is checked:

- **Against EZ2PORT's own code, through the oracle, on made-up data:**
  `keys.ini` files and binding tokens (fixed and random) read and written
  back; `settings.ini`'s Debounce (fixed and random files).
- **Unit tests:**
  - the mapper against the port's own input tests, and the turntable's
    rules;
  - ScratchMix's strum rule by rule;
  - takes: snapping, clashes, holds, one undo, a Classic take with the
    sound unchanged;
  - the input hub (times, the age rule, keys kept from shortcuts only while
    something listens, a rescan releasing held buttons, seeding from the
    port's files);
  - the calibration's arithmetic.
- **Rust tests (Linux and Windows CI):**
  - with SDL's virtual joysticks: two boards of one make named `vid:pid`
    and `vid:pid#1`; button, hat and axis events in order on the host
    clock; unplugging renumbering; closing closing;
  - chart-core's scancode names against SDL's own;
  - where the port keeps its settings;
  - the pads closing for a test run;
  - the click sound.
- **End to end, with a pretend controller pressed at exact times:**
  - a pad press judged at its time, and ScratchMix strumming;
  - binding by pressing; import, copy and reset;
  - a brush take landing on its pulses and undone in one step; a Classic
    take keeping the sound; Discard; a ScratchMix take;
  - the latency tests setting the offsets; the cursor leading by the
    picture offset.

Nothing has been run with a real controller, the cabinet or a sound
device. To confirm on the owner's machines:

- the bridge on Windows and Linux: its buttons are `/b0`-`/b24` as
  EZ2PORT names them, and two boards number `#n` as in the port;
- the turntable's feel (steps and the 90 ms hold) on the bridge's axes;
- DirectInput with EZ2PORT running, and the pads released during F5;
- Linux `/dev/input` permissions;
- latency: calibrate, then record a take and see it land where it was
  played;
- ScratchMix's strum feel;
- Ctrl and Shift as the turntable not triggering editor shortcuts in
  WebView2 and WebKitGTK;
- the clicks' sound and loudness over a mix.

### Milestone 8: EZ2-native extras (M8.1-M8.6), 2026-09-24

The assistant wrote Milestone 8 after the owner chose it. The owner decided:

- scroll-speed changes (EZFF type 6): edit, play and publish them, as
  EZ2PORT plays them;
- per-track volume (type 2): show and keep, nothing new authored;
- Test from the cursor: wait for the port (build 1582 has no `--start`);
- sprite BGA: deferred.

The assistant took the rest and stated it in the plan:

- the bmson member `x_scroll_events: [{y, rate}]`, written only when there
  are some;
- an imported change keeping its track and second word;
- charts imported before M8 keeping their changes as records, still played
  and published, with a quick fix to make them the chart's own;
- F5 passing the Play view's speed;
- K cycling the common hold kinds, the Inspector offering all of 0-12.

New areas of work:

- **the hold-kind preview:** where each hold kind pays its instalments,
  shown on the field and counted in the Inspector;
- **scroll-speed changes:** the chart model and bmson member; the field's
  scroll arithmetic transcribed from EZ2PORT and checked bit for bit; the
  play loop's handling of the records (from `reference/play.c`, which the
  oracle does not build); publishing them to packages and the cabinet; the
  Play view scrolling with them;
- **the game chart's kept records** shown in the editor, with what each
  engine does with them.

What is checked:

- **Against EZ2PORT's own code, through the oracle, on made-up data:**
  - the scroll arithmetic (target, chase, offset, y) on random scripts, bit
    for bit, through a new oracle command;
  - packages' scroll changes read back by the port's chart parser at the
    chart's ticks with the same f32, on random charts;
  - random game charts with scroll records on any track and random words
    still going back to the cabinet record for record.
- **Unit tests:**
  - hold previews against the (oracle-checked) play session in autoplay,
    for random kinds and lengths: the same instalments, each within a
    millisecond;
  - the bmson member's round trip and byte stability, the edit command
    and its undo, rescale, lint, the legacy quick fix (the cabinet getting
    the same records), the kept records' descriptions;
  - publish output unchanged for charts without scroll changes (the
    pre-M8 hashes are kept and checked).
- **End to end:** the Inspector's counts and K; adding, changing, saving
  and undoing a scroll change; the Play field's rate before, after and
  while easing across a change; an imported game song's scroll change and
  kept records.

Nothing has been run in EZ2PORT or on the cabinet. To confirm on the
owner's machines:

- a published scroll chart in EZ2PORT scrolls as the Play view does;
- an imported shipped scroll chart looks right in the editor and plays the
  same in EZ2PORT after publishing;
- F5 starting ez2play at the Play view's speed;
- the hold ticks against what EZ2PORT pays while a hold is held (the
  session they are checked against is itself oracle-checked).

### Milestone 9: polish and distribution (M9.1-M9.9), 2026-09-24

The assistant is writing Milestone 9 after the owner chose it. The owner
decided:

- installers unsigned for now; updates signed with Tauri's own key, and a
  Windows certificate used by the release workflow once one is added;
- the repository made public by the owner, so the app can update from its
  releases;
- `.bmson` and BMS files opening in EZ2BMS;
- Korean and Japanese for the whole app, following the system's language
  with a switch; the docs stay English.

New areas of work:

- **a local log and crash report** (M9.1): a rotating log file, a panic
  hook, the next start's offer, the About box;
- **opening files from the system** (M9.2): launch arguments, one running
  window, file associations and the Linux MIME types;
- **updates and releases** (M9.3): the updater's settings added by the
  release workflow only when the owner's key exists, the daily check, and a
  scan of the history for anything that must not be published;
- **translations** (M9.4 on): the message catalogs (ICU MessageFormat), the
  language setting, and every screen reading its words from them. **The
  Korean and Japanese are drafted by the assistant**, marked as drafts in
  the app, and need reading by a native speaker before they are relied on.
- **the Korean and Japanese translations themselves** (M9.7, M9.8): every
  message of the editor and chart-core, about 1,430 in each language,
  written by six assistant helpers working area by area on both languages,
  following a glossary the assistant wrote first and the helpers extended
  (`docs/i18n-glossary.md`: the players' words for charts, keysounds and
  long notes; the game's own terms kept in Latin letters; counters,
  punctuation and Korean particles after a value). None of it has been read
  by a native speaker. The helpers listed the messages they were least sure
  of in their reports; the glossary's choices, the Japanese spacing around
  Latin words, and the HUD capitals kept in English are the first things to
  check.
- **every English string moved into the catalogs** (M9.5, M9.6): about
  1,050 messages in the editor and 380 in chart-core, converted by several assistant
  helpers working area by area in parallel, each told to keep the English
  exactly as it was. Lint findings and import notes now carry a message key
  beside their English, so a song file's notes are said in the language
  chosen later; the desktop host's errors carry a kind.

What is checked so far for translations:

- every message parses; a translation takes the same parameters as the
  English;
- no screen has English written into its markup (a scan of the Svelte
  source), and every command's title is in the catalog;
- the host's error kinds each have a sentence (read from the Rust source);
- the English is unchanged: the whole unit and end-to-end suites pass on
  their existing text, and for lint a comparison of the old and new code on
  random songs gave the same findings, word for word; the helpers compared
  every other message they converted with the text it replaced;
- switching language live, following a Korean system, and the
  pseudo-language, end to end; and a sweep of every screen in the
  pseudo-language, in Korean and in Japanese, finding no English outside
  the catalogs but names (the game's, formats', folders') and the demo
  song's data;
- both translations are complete by type: each language's catalogs are
  typed as the whole English record, so a message without its translation
  does not compile;
- what a translation says is checked by nobody yet but the assistant.

To confirm on the owner's machines and with native speakers:

- the Korean and Japanese read naturally to players of EZ2 (and fit the
  narrow places: the top bar, the drawers, the status bar);
- the UI's fonts per language on Windows and Linux (Malgun Gothic, Yu
  Gothic; on Linux, Noto CJK must be installed);
- file associations, the second launch handing over its file, and the
  `.deb`'s MIME types on the owner's desktops;
- an update from one published release to the next (Windows installer,
  AppImage), after the repository is public and the key is set;
- the log after a real crash.

### A browser preview, and what building it found, 2026-09-25

The owner has no machine to run the app on for now and asked for the
browser build as a private web page. New area of work: **the hosted
preview** (`docs/hosted-preview.md`): a build of the browser version as one
page for claude.ai's Artifact host, with an opening card that says what
works there and what needs the desktop app, and lets the visitor add the
browser build's made-up game install (the host passes no query string).

Building it found a bug in the desktop app. **The installed app's content
security policy (`default-src 'self'`, no `'unsafe-eval'`) forbids the
functions PixiJS builds from text, and Pixi then refuses to start: the
playfield showed a WebGL error instead of the chart.** Development runs
(`pnpm tauri dev`) and every browser test ran without that policy, so
nothing saw it. The renderer now imports `pixi.js/unsafe-eval` (Pixi's
versions without generated code), and `vite preview` serves the e2e suite
under the policy read from `tauri.conf.json`: with the import removed, the
suite's playfield tests fail. One test helper that built a function from
text was rewritten to pass data. Both were also seen in the real Linux
webview: the desktop app built with its web files embedded (as a release
build is), run under Xvfb on a test song, showed only the WebGL error
without the import and drew the chart with it.

Also from looking at the app at a tablet's and a phone's size:

- the top bar overflowed below about 1100 px (the desktop allows 960): the
  chart pills shrank to nothing and the Edit/Play switch was cut off. The
  name, the time, the zoom, then snap and undo/redo now give way in turn;
- the open chart's pill is scrolled into view in the pill row;
- two fingers scroll the chart and pinch its zoom on a touchscreen.

Each has an end-to-end test (`tests/e2e/layout.spec.ts`) that fails
without it.

To confirm on the owner's machines:

- the playfield draws in an installed build on Windows (WebView2);
- the preview page opens and runs in the owner's browser (it was checked
  here in Chromium under a policy like the host's, not on the host itself);
- two-finger scrolling on a real touchscreen.

---

## Verification status

| Claim                                                                               | Basis                                                    | Verified              |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| Renderer JS cost is ~1 ms/frame at ~10k sprites                                     | headless Chromium (software GL)                          | Yes, in the container |
| Renderer frame rate on WebKitGTK / WebView2                                         | not yet measured                                         | **No** - owner        |
| Every format EZ2BMS writes reads back in EZ2PORT's core as planned                  | oracle (build 1582), synthetic inputs                    | Yes, in the container |
| Play mode judges and scores like EZ2PORT                                            | oracle: random scripts, `ez2judge` player                | Yes, in the container |
| `.gds`/`.pvi`/`.abm` readers on real game files                                     | not run (no game data here)                              | **No** - owner        |
| A published song shows and plays in EZ2PORT                                         | not run                                                  | **No** - owner        |
| Mixer: exact starts, voice cuts, mid-sample resume, gapless slices                  | unit tests through the offline renderer                  | Yes, in the container |
| The renderer never allocates                                                        | a counting allocator in a test                           | Yes, in the container |
| Published `.ssf` files load in EZ2PORT's parser                                     | oracle                                                   | Yes, in the container |
| Sound on a real device (cpal), latency, no glitches                                 | not run (no audio device here)                           | **No** - owner        |
| The probe reads build 1582's options and commit                                     | run on the owner's `ez2play.exe` locally                 | Yes, in the container |
| F5 plays a chart in EZ2PORT (Windows, path with spaces)                             | a fake ez2play on Linux only                             | **No** - owner        |
| The desktop app starts (Linux)                                                      | Xvfb, silent-clock fallback                              | Yes, in the container |
| The desktop app starts (Windows, WebView2) and plays sound                          | CI builds and tests only                                 | **No** - owner        |
| Editing: place, hold, move, resize, erase, undo, save byte-stable                   | Playwright on the real playfield                         | Yes, in the container |
| Playback follows the clock; Play mode judges and shows a result                     | Playwright, silent clock                                 | Yes, in the container |
| Test play feels right: latency, key response, sound on press                        | not run                                                  | **No** - owner        |
| Lint catches what EZ2PORT would hide, reject or mis-play                            | unit tests, rules taken from the port                    | Yes, in the container |
| The release workflow builds the installers                                          | not run (needs a tag)                                    | **No**                |
| Game skin: lane boxes, note variants, holds, beams, target bar                      | unit + Playwright tests, synthetic panel                 | Yes, in the container |
| The game skin on real panels looks like EZ2PORT's field                             | not run (no game data here)                              | **No** - owner        |
| Grouping matches BmsTWO's `SampleGrouping`                                          | BmsTWO's own test vectors                                | Yes, in the container |
| Classic-mode edits never change what autoplay plays (editor)                        | exact model, property test, real mixer                   | Yes, in the container |
| ...nor what EZ2PORT plays (per-frame timing, one or two players)                    | reasoned from the port's code; see compat                | **No** - owner        |
| Keying in Classic mode sounds right on a real device                                | not run (no audio device here)                           | **No** - owner        |
| Workbench: waveforms, filters, rename and replace with undo                         | Playwright, browser build                                | Yes, in the container |
| Import never overwrites; renames never replace another file                         | Rust tests (Linux and Windows CI), e2e                   | Yes, CI               |
| Import by dropping files from the OS into the desktop app                           | not run (browser build's DOM path only)                  | **No** - owner        |
| Workbench scrolls smoothly on WebKitGTK / WebView2 with 1500 sounds                 | headless Chromium only                                   | **No** - owner        |
| `song.ini` is read and listed as EZ2PORT does                                       | oracle: `ez2_usersongs_merge`, random                    | Yes, in the container |
| Publishing keeps rankings, refuses shipped keys, backs up                           | Rust temp-folder tests, e2e                              | Yes, CI               |
| Disc and stretched eyecatch bytes equal the port importer's                         | oracle, random images up and down                        | Yes, in the container |
| The disc and eyecatch look right in EZ2PORT (wheel, select exit)                    | not run (no game here)                                   | **No** - owner        |
| Publishing while EZ2PORT runs (Windows file locks)                                  | not run                                                  | **No** - owner        |
| Title plates equal the port's own renderer's, CJK included                          | oracle, random text and plates (Linux)                   | Yes, in the container |
| A plate on the real wheel beside the game's titles (a Korean one)                   | not run (no game here)                                   | **No** - owner        |
| The preview's PCM equals the importer's (window, fades, normalising)                | oracle, random songs mixed at unity                      | Yes, in the container |
| The preview loops cleanly on the wheel at a sensible loudness                       | not run (no game or sound device here)                   | **No** - owner        |
| The wheel places discs and plates, chases and swings as EZ2PORT does                | oracle, random wheels and tier sequences                 | Yes, in the container |
| The wheel preview looks like the real select screen with its masks                  | synthetic masks only (no game here)                      | **No** - owner        |
| `[Bga] StartMs` and the movie picked equal the port importer's                      | oracle, random charts (1 ms at f32 edges)                | Yes, in the container |
| Movie headers read right (codec, size, length)                                      | containers built by hand from the specs                  | Yes, in the container |
| A published BGA plays in sync in EZ2PORT (H.264, VP9, WMV; Windows)                 | not run (no game here)                                   | **No** - owner        |
| The `<video>` preview on WebView2 and WebKitGTK                                     | not run (Chromium, a movie of headers)                   | **No** - owner        |
| The disk cache: a hit is the decode, damage and staleness are misses                | Rust temp-folder tests (Linux, Windows CI)               | Yes, CI               |
| Onsets and tempo on test signals (hits, ringing notes, click tracks)                | Rust tests on signals made in the tests                  | Yes, in the container |
| Onsets and tempo on real stems (drums, vocals, pads)                                | not run (no real stems here)                             | **No** - owner        |
| Slicing never changes what autoplay plays                                           | exact model, property test, real mixer                   | Yes, in the container |
| A chopped stem packages to the port importer's own slices                           | oracle, random grids, resolutions, tempi                 | Yes, in the container |
| Strips draw each slice where it plays; gestures cut, move and key                   | Playwright, browser build (made-up stem)                 | Yes, in the container |
| Strips stay smooth while playing on WebKitGTK / WebView2                            | headless Chromium only                                   | **No** - owner        |
| Hovering a slice plays it promptly on a real device                                 | not run (no audio device here)                           | **No** - owner        |
| A song with long stems reopens from the disk cache (desktop app)                    | Rust tests only                                          | **No** - owner        |
| The game's `.ezi`/`.ini`/`song.bin` read as EZ2PORT reads them                      | oracle, random files and tables                          | Yes, in the container |
| An imported game chart plays at the engine's clock, republishes same                | oracle, random charts                                    | Yes, in the container |
| Every shipped song imports; tables decrypt; legacy `.ezi` names hold                | tests written for `EZ2_ROOT`/`EZ2_EXE`                   | **No** - owner        |
| BMS timing, control flow and lanes                                                  | the BMS memo's arithmetic, random files                  | Yes, in the container |
| Real BMS packs in Shift-JIS and EUC-KR import with the right text                   | hand-made bytes only                                     | **No** - owner        |
| bmson 0.21 and both `beat-10k` numberings open as the port reads them               | oracle against the port's importer                       | Yes, in the container |
| An imported song folder is written all or nothing, `.ssf` as the same PCM           | Rust temp-folder tests                                   | Yes, CI               |
| A DAW's MIDI of a song cuts its stem where the hits are                             | MIDI files made in the tests                             | **No** - owner        |
| A game chart compiled for the cabinet reads back as the game had it                 | oracle, random game charts                               | Yes, in the container |
| Cabinet files decrypt and parse; `song.bin` patches read and list a tier            | oracle, made-up game                                     | Yes, in the container |
| A game folder export is all or nothing, and Restore gives it back                   | Rust temp-folder tests (Linux, Windows CI), e2e          | Yes, CI               |
| Every shipped chart re-plans; sizes fit; `.ssf` go back unchanged                   | tests written for `EZ2_ROOT`/`EZ2_EXE`                   | **No** - owner        |
| Exported songs load and play on the original cabinet                                | not run (no cabinet here)                                | **No** - owner        |
| BMS export reads back note for note                                                 | EZ2BMS's BMS reader, random charts                       | Yes, in the container |
| BMS output in LR2 and beatoraja                                                     | not run                                                  | **No** - owner        |
| `keys.ini`, binding tokens and `settings.ini`'s Debounce read as EZ2PORT reads them | oracle, fixed and random files and tokens                | Yes, in the container |
| The input layer (alternates, debounce, hats, turntable) as the port's               | the port's own input tests, transcribed                  | Yes, in the container |
| Controllers named and timed as EZ2PORT's (SDL virtual joysticks)                    | Rust tests (Linux and Windows CI)                        | Yes, CI               |
| The cabinet bridge's buttons, axes and `#n` numbering match the port's              | not run (no controller here)                             | **No** - owner        |
| Pads released for F5 runs; DirectInput shared with EZ2PORT                          | Rust test of the pause; not run on Windows               | **No** - owner        |
| A pad press is judged at its time; ScratchMix strums                                | Playwright, pretend controller                           | Yes, in the container |
| A take lands on its pulses, is one undo step, keeps a Classic song's sound          | unit tests and Playwright, pretend controller            | Yes, in the container |
| The latency tests' offsets, and the cursor ahead by the picture offset              | unit tests and Playwright, pretend controller            | Yes, in the container |
| Recording and calibrating feel right on a real machine and cabinet                  | not run                                                  | **No** - owner        |
| Hold-kind previews: where each instalment is paid, what is counted                  | the oracle-checked play session, random holds            | Yes, in the container |
| Scroll arithmetic (target, chase, offset, y) as EZ2PORT's                           | oracle, random scripts, bit for bit                      | Yes, in the container |
| Scroll changes in a package read back at their ticks with their f32                 | oracle, random charts                                    | Yes, in the container |
| Scroll records go back to the cabinet as the game had them                          | oracle, random game charts                               | Yes, in the container |
| A published scroll chart scrolls in EZ2PORT as in the Play view                     | not run (no game here)                                   | **No** - owner        |
| A crash leaves a log; the next start offers it; About copies a report               | Rust tests; Playwright; killed under Xvfb                | Yes, in the container |
| Files handed over at launch and by a second launch                                  | Rust tests; Playwright; under Xvfb with D-Bus            | Yes, in the container |
| The `.deb` carries `%F`, the MIME types and their XML                               | built and read here; `update-mime-database`              | Yes, in the container |
| File associations and double-click on Windows and the owner's desktop               | not run                                                  | **No** - owner        |
| Updates: the check, the offer, install and restart                                  | Playwright (pretend updater); built with a throwaway key | Yes, in the container |
| An update from one published release to the next                                    | not run (the repository is private, no key yet)          | **No** - owner        |
| Every message parses; translations take the English parameters and are complete     | unit tests; types                                        | Yes, in the container |
| No screen shows English outside the catalogs, in any language                       | Playwright sweep of every screen (pseudo, ko, ja)        | Yes, in the container |
| The English is what it was before the catalogs                                      | the suites' text; old vs new lint on random songs        | Yes, in the container |
| The Korean and Japanese read naturally                                              | not read by a native speaker                             | **No** - owner        |
| The playfield starts under the desktop app's content policy                         | Playwright, Chromium, the policy from `tauri.conf.json`  | Yes, in the container |
| The playfield draws in a build with its files embedded (WebKitGTK)                  | built here, run under Xvfb, before and after the fix     | Yes, in the container |
| The playfield draws in an installed build on Windows (WebView2)                     | not run                                                  | **No** - owner        |
| The browser preview runs on its host                                                | Chromium under a policy like the host's                  | **No** - owner        |
