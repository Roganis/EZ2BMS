# Modding tools - a review for later (written 2026-09-04)

> **NOT YET. Do not start any item here until the port is fully functional
> with no open issues** - `SCREEN-AUDIT.md` closed, `SCREEN-ROADMAP.md`
> landed, `GAMEPLAY-AUDIT.md` clean, `NEEDS-OWNER.md` empty and `./check.sh`
> green with the game-dependent tests running. Everything below moves the
> port from *playing the game's data* to *authoring it*, and authoring on top
> of a screen model that is still changing would be built twice. This file
> records the design so it is not re-derived when the time comes.

The ask that produced it: a suite of tools to change the game's `.str` /
`.scr` clips and timelines, a tree of the buttons and actions on every
scene so new scenes (a tutorial, indications during play) can be added and
assets changed, and whatever else the port's own tools make interesting.

## 1. Where the port stands today (the evidence)

* **Every format is read, none is written.** `ez2/str.c`, `ez2/scr.c`,
  `ez2/abm.c` are parse-only and bulk-verified against the library (10,593
  of 10,593 clips, 294 of 294 `SCR0` timelines, 62,201 of 62,201 textures -
  README). `tools/ez2asset` converts *out* to PNG only.
* **Screens are code, not data.** Each screen is a `run_*` function in
  `tools/ez2play.c` (`run_title` ~7971, `run_mode_select` ~8440,
  `run_select` ~3837, `run_result` ~4929, `run_warning` ~9540, ...). Each
  opens its clips by literal VFS path through `ez2_vfs_resolve` +
  `ez2_bga_clip_open`, polls input channels inline, counts its own frames
  and returns the next screen. There is no scene description anywhere that
  a tool could read or a mod could override.
* **One data-driven layer exists and is the pattern to copy.** `text/`
  (TEXT.md): a manifest names textures, a strings file supplies words, and
  the loader asks the manifest, then the HD pack, then the game's own file.
  That precedence rule is the mod overlay in miniature.
* **The VFS has no mod overlay.** `ez2/vfs.[ch]` resolves against the game
  root and the user-songs root only.
* **The plugin pipe is one-way by design** (PLUGINS.md) and stays so until
  parity. A scene manifest (section 2.4) is what would later give a plugin
  a safe vocabulary to ask for a screen.
* **Instrumentation already exists** for a scene tracer to grow from:
  `trace_screen` and `--shot` / `--shot-skip` in `ez2play.c`, the oracle
  trace (`docs/oracle-trace.md`), `tools/ez2trace.c`.

## 2. The suite, in build order

Each step is usable on its own and the next one stands on it. Do them in
this order; the later ones are the expensive ones and the early ones are
what make them cheap.

### 2.1 Writers and a plain-text interchange form

* `ez2_str_write`, `ez2_scr_write`, and an `.abm` encoder, beside the
  readers in `ez2/`.
* JSON in both directions through the existing `ez2/json.c`: `.str` <->
  `.str.json`, `.scr` <-> `.scr.json`. `ez2asset` grows `to-json`,
  `from-json` and `png -> abm`.
* **Acceptance test is the readers' own:** parse then write every file in
  the library and require byte identity - all 10,593 clips, all 294 `SCR0`
  timelines, every texture at every depth. Add it to `./check.sh` under the
  game-dependent group.
* **Gotchas already known.** Floats must survive the round trip exactly -
  print hex floats or 9 significant digits, never `%g`. The `.scr` section
  `size` word is *wrong* in 23 of 2,940 headers (short by 20 per type-4/5
  record, `ez2/scr.h`); a writer that computes it correctly breaks byte
  identity, so reproduce the authoring tool's arithmetic (144 per type-4/5
  record) and note it. The three `.str` variants (v148, ascii, legacy) need
  three writers or a documented decision to write v148 only and accept the
  13 legacy files as non-round-tripping.
* Why first: a clip that round-trips is a clip the original engine would
  also read, which keeps every mod portable back to the cabinet, and every
  later tool reads and writes through this.

### 2.2 A mod overlay in the VFS

* `mods/<name>/system/...` resolved *before* the game tree, with the
  text loader's precedence: mod, then HD pack, then the game's own file. An
  ordered list of enabled mods in `settings.ini` and a `--mod DIR` flag.
* The clip loader accepts a `.str.json` where it looked for a `.str`, so a
  modder never touches the binary format.
* A `mod.ini` per pack: name, version, the game data version it targets
  (the `version.ini` number the title already reads), so the overlay can
  refuse a pack built against different data.
* Keeps the original data out of the repo for free: a mod is only the
  files it changes.

### 2.3 Generate the scene tree, do not draw it

* `ez2play --trace-scenes`: per screen, log every clip opened (path,
  position, loop flag, layer order), every input channel the screen polls
  and what it does, every timer and its length in ticks, and the transition
  the screen returns. Grow it out of `trace_screen` and the `--shot`
  plumbing.
* Emit Graphviz / Mermaid. The result is the button-and-action map of the
  whole attract flow, and it stays true because it comes from the running
  code rather than from a document.
* This is the cheap step and it is what tells you the exact contents of
  each screen manifest in 2.4.

### 2.4 Screen manifests, cheapest screens first

* One INI per screen, in the port's `.pvi` / `manifest.ini` style:
  a `[clip.N]` list (path, x, y, loop, layer), a `[bind]` table from
  channel to action, `[timer]` entries in ticks, and `next =` the
  transition. Ticks are the original's 60 Hz frames, paced by the frame
  pacer from `SCREEN-ROADMAP.md` item 2.
* A fixed, small action vocabulary: `goto <screen>`, `play <clip>`,
  `sound <ssf>`, `set <var> <value>`, `wait <ticks>`. Do not grow it into a
  language.
* Convert in this order: warning short / warning, eyecatch, game over,
  ending (each is a clip, a timer and a key), then the mode intro /
  interlude / clip screens, then title, then mode select. **Result, song
  select, name entry and the test menu stay in C** - their logic is the
  game and a manifest would only hide it.
* The port's C screens become the *default* manifests plus code for what a
  manifest cannot say; a mod overrides a manifest the same way it overrides
  a clip.

### 2.5 A flow file and a custom screen type

* `flow.ini`: which screen follows which, with the conditions the original
  has (credit gate, seat count, mode). A mod inserts a screen between two
  existing ones without touching code.
* A `custom` screen type driven entirely by its manifest. A **tutorial** is
  then clips plus native text plates (through `text/` strings, so it is
  translated for free) plus `wait`-for-key steps. **Indications during
  play** (a calibration hint, a lane-cover explanation, a hold-note
  reminder) are the same thing as an overlay layer on the play screen with
  its own binding table and a `dismiss` action.

### 2.6 Inspector overlay and hot reload

* A key that toggles, on any screen: layer names, positions, the current
  binding table, the frame counter. Reload the screen manifest and any
  `.str.json` when the file changes on disk.
* Editing text with a live preview gets most of the value of a visual
  editor for a small fraction of the cost. Build this before any GUI.

### 2.7 A visual clip editor - last, and only if used

* Timeline, layer stack, keyframe drag, texture picker, live preview
  through the port's own renderer (so the sixteen combiner recipes are
  what the author sees). Immediate-mode UI in C (Nuklear or microui are
  licence-compatible) or an external Python tool driving `ez2bga` through
  the JSON form.
* Start it only when people are actually authoring clips through 2.1 and
  2.6 and the text form is what slows them down.

## 3. What else the port's own tools make interesting

* **A skin editor.** `.pvi` is already parsed (`ez2/pvi.c`, `scene/skin.c`);
  with 2.2 a skin ships as a mod pack.
* **Practice mode.** The judge and oracle are exact, so section looping, a
  hit-error bar, an offset calibration screen and a speed trainer are
  mostly UI - and the calibration screen is the first customer of 2.5's
  indications.
* **Replays and ghosts.** The oracle trace already captures per-stage input
  (`ez2/trace.c`); a replay file and a ghost score on the field are a small
  step from it.
* **A chart preview tool.** `tools/bmson2ez.py` converts; a checker that
  plays the result through `ez2judge`, shows note density and the chart's
  own windows (in 1/192-beat ticks, `ez2/score.c`) makes custom charts far
  easier to verify.
* **A course / radio channel editor.** The channel configs are data the
  original froze (`../../EZ2REWRITE/reverse-engineering/channel-configs`),
  so an editor is safe to build now and ships through 2.2.
* **A lamp show editor.** LIGHTS.md documents the layer; cabinet owners
  would use it.
* **Mod packs as a distribution unit.** A zip with the `mod.ini` of 2.2; the
  overlay refuses a pack built against different game data.
* **A two-way plugin channel, later.** PLUGINS.md parks this until parity,
  and that stays right. When it opens, the scene manifest is the safe
  vocabulary: a plugin may ask for a *named* screen with *named* strings
  and nothing else.

## 4. Constraints that carry over

* Every tool operates on the user's own data and **nothing it reads or
  writes may be committed** - the rule `tools/ez2asset.c` already states,
  and `../CLAUDE.md`'s handling rules for the original.
* The writers stay bit-exact against the library (2.1), so a modded clip is
  still a clip the original engine reads.
* This is EZ2PORT's tooling, not EZ2AC's; see `../docs/DISTRIBUTION.md`.
* `port/` is owned by the port session (`OWNERSHIP.md`); requests from the
  decomp side still arrive in `REQUESTS.md`.
