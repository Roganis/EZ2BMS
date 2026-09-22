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

---

## Verification status

| Claim                                           | Basis                           | Verified              |
| ----------------------------------------------- | ------------------------------- | --------------------- |
| Renderer JS cost is ~1 ms/frame at ~10k sprites | headless Chromium (software GL) | Yes, in the container |
| Renderer frame rate on WebKitGTK / WebView2     | not yet measured                | **No** - owner        |
