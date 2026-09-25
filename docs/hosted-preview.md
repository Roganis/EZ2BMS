# The hosted preview

The editor's browser build, published as one private web page, so the owner
(or anyone they share it with) can look at EZ2BMS without installing it.
It is the same app as `pnpm dev`: the in-memory back end, the demo song
(`bridge/demo.ts`), a silent clock. Nothing is saved anywhere: a reload
starts again from the demo.

## Building

```sh
pnpm --filter @ez2bms/editor build:hosted     # → apps/editor/dist-hosted/
```

`dist-hosted/hosted.html` is the page and `dist-hosted/assets/*` the files
beside it. The page is published as a claude.ai Artifact: the page file,
and every asset under its own path (`assets/<name>`), which is how the page
refers to them. Rebuilding changes the assets' hashed names; a republish
sends the new files (the old ones can be dropped).

## What the host asks for, and how the build answers

- **It supplies the document itself.** The host wraps the page in its own
  `<!doctype>`, `<html>`, `<head>` (charset and viewport) and `<body>`, so
  `vite.hosted.config.ts` strips those from the built page, and builds with
  paths relative to it (`base: './'`).
- **Its page is off-white.** The host's skeleton paints a light ground, and
  the app's own styles arrive only when the app starts, so `hosted.html`
  paints the page and the opening card itself (the values of
  `theme/tokens.css`).
- **No query string reaches the page.** The browser build's switches
  (`?modes`, `?skin`, `?game`) are read from the address, which the host
  does not pass on. The opening card offers them instead, and
  `bridge/flags.ts` hands them to the back end, which is created only after
  the card is answered (`src/hosted.ts` imports the app then).
- **Its content policy forbids `eval`.** Pixi builds functions from text to
  upload uniforms; `render/renderer.ts` imports `pixi.js/unsafe-eval`,
  which swaps in versions that do not. The desktop app's policy
  (`src-tauri/tauri.conf.json`) forbids it too, and `vite preview` serves
  the e2e suite under that policy, so the whole suite checks it.
- **No dialogs.** `alert`/`confirm`/`prompt` do nothing on the host; the
  app uses none. Downloads are blocked; the browser build offers none.
- **Storage may be missing.** Settings go to `localStorage` behind a
  try/catch (`bridge/web.ts`), and last for the visit when it throws.

## The opening card

`hosted.html` and `src/hosted.ts`. It says what works in a browser and what
needs the desktop app, then opens the demo song with:

- **a chart in every mode** (on by default: `modes`, each mode's lane tour);
- **a made-up EZ2AC install** (off: `game` and `skin`, the synthetic game of
  `dev/synthgame.ts` with the made-up panel art of `bridge/demo-skin.ts`,
  so Import and Export to EZ2AC have something to work with). Nothing in it
  comes from the game.

It opens on the demo's own 5K chart. Below 900 px wide (a phone held
sideways) the drawers start closed, or the chart would have no room; the
palette and the top bar's ⌘ reopen them. The card's words are English only;
the app's own language switch is in Preferences.

## Screens it is opened on

The editor is made for a computer. On a tablet it works in landscape: two
fingers scroll the chart and pinch its zoom (`ui/Playfield.svelte`), one
finger is the tool. A phone held upright is told to turn sideways. The top
bar drops its least-needed readouts as the window narrows (`ui/TopBar.svelte`);
`tests/e2e/layout.spec.ts` checks the desktop's narrowest window and the
two-finger gesture.
