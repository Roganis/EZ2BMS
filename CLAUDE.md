# EZ2BMS - working rules

An arcade-native chart editor for EZ2PORT (the native EZ2AC engine) and EZ2AC
cabinets. Tauri 2 + Svelte 5 + PixiJS front end, Rust back end. Read
`docs/architecture.md` first; the approved plan is summarised in README.md's
milestone checklist.

## Commands

```sh
pnpm install
pnpm test                      # Vitest: chart-core + editor
pnpm typecheck                 # tsc / svelte-check
pnpm lint                      # eslint + prettier --check
pnpm e2e                       # Playwright (browser build + mock back end)
cargo test                     # default members: audio, launch, oracle (no webkit needed)
cargo clippy --all-targets -- -D warnings
```

In the cloud container Chromium is preinstalled under `/opt/pw-browsers`
(Playwright 1.56.1 matches it). webkit2gtk and ALSA headers are NOT installed,
so `src-tauri` and the `cpal` feature build only in CI or on a desktop; every
other crate builds with `--no-default-features` / the `null` audio backend.

## Rules

- **One implementation per concern.** Chart logic and every byte format live in
  `packages/chart-core` (TypeScript, no DOM). Anything touching samples or
  processes lives in Rust. Don't duplicate a format in both.
- **EZ2PORT is the reference.** Its behaviour comes from the port's source and
  docs; `third_party/ez2port-core` is a vendored, unmodified snapshot used ONLY
  by tests (`crates/ez2port-oracle`). New format or rule code needs an oracle
  test that proves parity, or a written reason in `docs/ez2port-compat.md` for
  deviating.
- **Never commit game content.** No key tables, no `.ez`/`.ezi`/`.ssf`/`.abm`
  from a game install, no art, no decrypted data. Test fixtures are synthetic,
  written by hand in the documented format or generated at test time. Tests that
  need a real install read `EZ2_ROOT` / `EZ2_EXE` and skip when absent.
- **Byte-stable output.** Saving a bmson that wasn't edited must reproduce the
  input bytes for files EZ2BMS wrote. Unknown JSON fields are always preserved.
- **Comments explain why**, in the style of the port: what the engine does,
  where that is written down, what breaks if it changes.
- Commits end with the Co-Authored-By trailer the session supplies. Update
  `AI-DISCLOSURE.md` when a session adds a new area of work.
