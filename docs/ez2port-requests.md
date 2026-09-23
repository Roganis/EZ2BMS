# Requests to EZ2PORT

What EZ2BMS would like from EZ2PORT, written for whoever works on the port.
Each item says what it is for, what exactly to add, and how EZ2BMS will notice
it. Nothing here is required: EZ2BMS works with build 1582 as it is, and turns
each feature on when it finds it.

**How EZ2BMS detects a feature.** It reads `ez2play`'s option names out of
the executable without running it (`crates/ez2bms-launch/src/probe.rs`). A drop-in
`ez2play` started without a chart boots the whole arcade, so running it is not
a safe probe. ez2play parses options with `strcmp(argv[i], "--start")`, so each
option is a string literal in the binary. **Please keep the option names below
exactly as spelled** (each as its own literal), or tell EZ2BMS what changed.

## 1. `--start MS`: start a chart part-way through

**What it's for.** "Test from cursor": the charter presses a key on measure 64 and
plays measure 64, not the whole song from the top.

**What to add.**

- `--start MS` with a whole number of song milliseconds (the chart's own timeline:
  `ez2_tempo_ms_at`). EZ2BMS always passes milliseconds.
- **Backing audio.** Every backing sound that would still be ringing at `MS` starts
  mid-sample, at the offset it would have reached. A sound cut by a later
  retrigger of the same sample before `MS` is not resumed. EZ2BMS's own
  player does this (`Schedule::resume_at` in `crates/ez2bms-audio`), and
  it's worth matching.
- **Notes.**
  - Notes before `MS` are neither judged nor counted: MISS count, gauge and combo start clean.
  - A hold whose head is before `MS` and whose tail is after it is simply skipped.
  - The score's maximum and rate use only the notes from `MS` on, so the grade on the result card still means something.
- **Visuals.** The scroll and BGA clock start at `MS`.

**Detection:** the literal `--start`.

## 2. `--no-ready`: skip the READY count

**What it's for.** Iteration speed. The 6.3 s count before every test run adds
up over a charting session.

**What to add.** `--no-ready` starts the chart clock immediately, with no
countdown clip or voice cues. Everything else about the stage is unchanged.

**Detection:** the literal `--no-ready`.

## 3. `--viewer PORT`: one window, driven over a socket

**What it's for.** Each test today is a new process: window creation, asset
loading and the audio device open every time. A long-lived viewer makes
"edit, press F5, play" feel instant, and lets the editor stop and restart
without the window flickering.

**What to add.**

- `ez2play --viewer PORT --root R [--exe X] [--songs S] [--windowed]` opens the
  window and waits. It listens on `127.0.0.1:PORT` (loopback only), one client
  at a time.
- It speaks a line protocol: UTF-8, one command per line, paths quoted with `"` and `\"` escapes.

  **Commands:**

  ```
  play "<chart.ez>" <Mode> <start_ms> [auto]
  stop
  reload
  quit
  ```

  - `play` is the same as the command line: `<Mode>` is the `--mode` name, `start_ms` is as in item 1, and `auto` means `--auto`.
  - `stop` returns to the idle screen.
  - `reload` re-reads the song's files and plays again from the same start.
  - `quit` closes the window.

  **Replies:**
  - `ok` or `error <message>` for each command.
  - Unprompted `ended {json}` when a stage finishes, with the same object as the plugin `stage_result` below.

- **Reload hazard.** Charts and keysounds must be re-read on every `play`/`reload`,
  not cached across them. EZ2BMS rewrites the package between runs.

**Detection:** the literal `--viewer`. EZ2BMS then keeps one viewer per session
and falls back to spawning per test if the socket fails.

## 4. A stable stage result

**What it's for.** After a test play, EZ2BMS shows the port's own numbers
beside the editor's prediction (Play mode's judge is a port of `score.c`). A
disagreement then means a bug on one side.

**What to add.** Take `stage_result` (PLUGINS.md) off provisional, at
least `mode`, `tier`, `level`, `score`, `notes`, `max_combo`, `rate`, `rank`,
`counts`, `cleared` and `failed`. A `--result FILE` option that writes that
one object to a file at stage end would save EZ2BMS from shipping a plugin
program just to receive it.

**Detection:** the literal `--result`, else `--plugin`.

## 5. Importer fixes (`ez2/bmson.c`)

**What it's for.** EZ2BMS writes packages itself and doesn't depend on these.
Anyone who drops a bmson into the songs folder does, though, and the two paths
should give the same song.

**What to fix.** In rough order of how much they change a chart:

1. **A STOP inside a hold shortens the hold.** The hold's length is converted
   without the STOP's gap. Shift the end like any other position.
2. **`mode_hint` loses to keywords.** A chart named "Hard 5K" in a 7K file
   imports as 5K. Let an explicit `mode_hint` win, and read `info.x_tier`
   (NM/HD/SHD/EX) before guessing the tier from names.
3. **Velocity, pan and hold kind are fixed at 127/64/0.** Read the note
   fields `x_vel` (0..127), `x_pan` (0..127, 64 centre) and `x_kind` (the hold
   instalment kind), as `BMSTWO-EZ2.md` proposes.
4. **The judgement and gauge are fixed.** Write
   `info.judgement_deltas` (`KOOL`/`COOL`/`GOOD`/`MISS` in ticks) and
   `info.life_deltas` (`COOL`/`GOOD`/`MISS`/`FAIL`) to the chart's `.ini` when present.
5. **Slices are cut to the millisecond.** A continuation starts up to 0.5 ms
   off, and consecutive slices overlap or gap by a few samples: an audible
   click on sustained sounds. Cut at the frame (`t * 44100`, rounded once, from
   the same time as the note starts).
6. **A folder imports once, ever.** Re-import when the bmson is newer than
   the package.
7. **A key can hijack a shipped song.** Refuse, or rename, a key that is a
   folder under `sound/`.
8. **`up` notes are dropped whole.** EZ2 has no release sound, but the press is
   still a note. Keep it, drop only the release.
9. **Title plates are Latin-only.** Render CJK titles with the CJK face when
   one is installed.

**Detection:** none needed. `docs/ez2port-compat.md` lists these as the
differences between the importer and EZ2BMS, and they shrink as they are fixed.

## 6. Andromeda and Catch packages

**What it's for.** EZ2BMS can chart both (`ez2-andromeda`, `ez2-catch` in its
bmson dialect), but a package cannot carry them: there is no mode name or
file prefix for them in `song.ini` / `usersongs.c`.

**What to add.** The `[Charts]` mode names and chart file prefixes for the two,
and the lane sets their `.gds` use, following the pattern of the other modes.

**Detection:** EZ2BMS can't detect this from the binary; it will check the
build's `docs/BMSON.md`. Until then it offers these modes for cabinet export
only.

## 7. A package's disc on the arc

**What it's for.** On the song select, a disc flying along the arc (every
disc but the focus) is drawn from `system\discsmall\<key>.bmp`
(`select_disc_path`, the original's format string at `0x48cfd0`). The big
disc at the focus already asks the package first (`ez2_usersongs_asset(key,
"Disc")`), but this path never does, so a package's disc is a bare mask
while the wheel turns and pops in only at rest.

**What to add.** Ask `ez2_usersongs_asset(key, "Disc")` before the
`system\discsmall` path, drawing the package's 256x256 `disc.abm` at the
thumb's size, as the result screen already does.

**Detection:** none needed; EZ2BMS's wheel preview shows the bare mask until
the build's `select.c` says otherwise.

## For information: scores that can't reach 100%

This is not a bug in the port: it reproduces the original. EZ2BMS's lint warns
about it, and the port may want to say so too:

- Hold kinds 4 and 5 are counted by the engine's counter ladder, but pay one
  instalment. A perfect play of a chart that uses them scores under the maximum.
- Kinds 9-12 score a head that the counter doesn't count.
