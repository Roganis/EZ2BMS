# Provenance - `third_party/ez2port-core`

A verbatim snapshot of parts of **EZ2PORT**, the owner's native re-implementation
of EZ2AC, taken from the Windows bundle `ez2port-b1582-win64.zip`
(build 1582, `80d85c1-dirty`, bundle dated 2026-09-12), directory `source/port/`.

EZ2PORT is GPL-3.0-or-later (`LICENSE` here is its licence text; `ATTRIBUTION.md`
is its own attribution page, copied unchanged). EZ2BMS is GPL-3.0, which is
compatible.

## What is here and why

| Path | From | Used by |
|---|---|---|
| `ez2/*.c`, `ez2/*.h` | `source/port/ez2/` (all 99 files) | `crates/ez2port-oracle` compiles the `ez2core` file list from EZ2PORT's `CMakeLists.txt` |
| `third_party/stb_truetype.h` | `source/port/third_party/` | needed by `ez2/ttf.c` (public domain / MIT) |
| `tools/ez2judge.c` | `source/port/tools/` | reference for the oracle's synthetic-player loop |
| `reference/play.c`, `reference/ez2play.h` | `source/port/tools/ez2play/` | NOT built. The play loop (press matching, strays, expiry, keysound picking, voices) that `packages/chart-core/src/engine` ports |
| `reference/bmson2ez.py`, `reference/keys.example.ini` | `source/port/tools/`, `source/port/` | NOT built. Reference for package writing and default bindings |
| `docs/*.md` | `source/port/*.md`, `source/docs/*.md` | the port's own design notes this project cites |

`SHA256SUMS` lists the checksum of every copied file as it was in the bundle.

## Rules

- **Unmodified.** Nothing under this directory is edited. If a fix is needed,
  it goes to the port and a new snapshot is taken. (EZ2PORT's `ATTRIBUTION.md`
  asks that changes be marked; there are none.)
- **Tests only.** No shipped EZ2BMS binary links this code. The editor
  re-implements what it needs in TypeScript/Rust and proves parity against it.
- **No game content.** This code reads key tables and assets from the user's
  own install at run time; it contains only addresses and FNV-1a digests,
  which (as `ez2/keytable.h` notes) distribute nothing.

## Updating

Replace the files from a newer bundle or the port's repository, regenerate
`SHA256SUMS`, update the build number above, and re-run the oracle tests;
differences they report are either port changes to follow or regressions to
report to the port.
