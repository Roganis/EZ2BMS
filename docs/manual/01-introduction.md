# Introduction

This chapter explains what EZ2BMS is, which modes it charts, what you need to use it, and what it
can't do yet.

## What EZ2BMS is

EZ2BMS is a chart editor made for **EZ2PORT** (the native EZ2AC engine) and for real EZ2AC
cabinets. You chart on the play field itself: the lanes, notes and judgement of the game, not a
spreadsheet of channels. Press <kbd>Tab</kbd> to see what you just wrote the way the engine will
play it, and publish a song package that EZ2PORT loads as it is.

With EZ2BMS you can:

- chart every EZ2 mode EZ2PORT plays, on either player side;
- work the three ways EZ2 songs are made: from hundreds of pre-cut keysounds, from full-length
  stems that you slice with notes, or by converting existing material (BMS, bmson or the game's
  own charts);
- hear and judge your chart exactly as EZ2PORT will: the editor compiles the chart the same way it
  publishes it, and plays it with EZ2PORT's own voice, judgement, hold and gauge rules;
- test play with EZ2PORT's keys or your controller, or run the chart in EZ2PORT itself;
- publish a complete EZ2PORT song package (charts, keysounds, title plate, disc, eyecatch,
  preview and BGA) straight into the engine's songs folder;
- send a song back into the original game in place of one it has, with a backup you can restore,
  or export a BMS/BME folder for LR2 and beatoraja.

The whole app is in English, Korean (한국어) and Japanese (日本語).

## EZ2PORT and the cabinet

EZ2PORT is a native engine for EZ2AC that plays the game's data from your own copy of the game.
It also loads extra song packages from a songs folder. EZ2BMS writes those packages: this is
**publishing**, and it's the main way to get your chart into a game.

EZ2BMS can also run EZ2PORT's player, `ez2play`, on the chart you're editing, so you can check it
in the real engine with one key (<kbd>F5</kbd>). See [Publishing and testing](14-publish-and-test.md).

For a real EZ2AC cabinet, EZ2BMS exports a song into one of the songs the game already has,
written as the game expects it. See [Exporting](16-export.md).

## Supported modes

EZ2BMS names each mode as the cabinet does. The EZ2PORT name is in brackets.

| Mode        | EZ2PORT name | Where it plays      |
| ----------- | ------------ | ------------------- |
| 5 KEY ONLY  | 5KeyMix      | EZ2PORT and cabinet |
| SCRATCH     | ScratchMix   | EZ2PORT and cabinet |
| RUBY        | RubyMix      | EZ2PORT and cabinet |
| 5K STANDARD | StreetMix    | EZ2PORT and cabinet |
| 7 KEY       | 7StreetMix   | EZ2PORT and cabinet |
| 10 KEY      | ClubMix      | EZ2PORT and cabinet |
| 14 KEY      | SpaceMix     | EZ2PORT and cabinet |
| 16 KEY      | AndromedaMix | Cabinet export only |
| EZ2CATCH    | EZ2CATCH     | Cabinet export only |

EZ2PORT's song packages can't carry Andromeda (16 KEY) and Catch charts today, so you can chart
them, but they only leave EZ2BMS through the [cabinet export](16-export.md).

## What you need

### Your own game data

EZ2BMS contains no game content: no key tables, no lane layouts and no art. Like EZ2PORT, it reads
those from **your own** EZ2AC game folder (the folder with `sound` and `system` in it) and, for
some features, your unpacked game executable. To test in the engine you also need EZ2PORT's
`ez2play`. You tell EZ2BMS where these are in the [EZ2PORT panel](05-ez2port-setup.md).

### What works without a game folder

You can do most of your charting without any game data. Without a game folder, EZ2BMS still:

- opens, edits and saves songs in every mode, drawn with its own neon skin;
- plays your chart back, shows it in the Play view, and lets you test play it, judged as EZ2PORT
  judges it (with EZ2PORT's default keys);
- imports BMS, BME, BML and bmson songs, and exports BMS;
- runs the pre-flight check in **Issues**;
- publishes an EZ2PORT package into any folder you choose.

What needs your game folder (and, for testing, `ez2play`):

- drawing the play field with the game's own panel and note art;
- testing in EZ2PORT with <kbd>F5</kbd>;
- importing the game's own songs, and exporting to the cabinet.

## The desktop app and the browser preview

EZ2BMS is a desktop app for Windows and Linux. There is also a **browser preview**: the same editor
running in a web browser, for trying it out and for development (see
[Installing](02-installing.md#the-browser-preview)). The start screen and the status bar say
**browser preview** when you're in it.

The browser preview is limited:

- its files live in memory, and it opens a small demo song, "Neon Parade", instead of your
  folders;
- its audio is silent;
- it can't run EZ2PORT or write to your songs folder, and it has no long-sound disk cache;
- the **New song** button isn't on its start screen;
- it doesn't update itself, and it keeps its settings in the browser.

Where a feature only works in the desktop app, this manual says so.

## Keys on macOS

This manual writes shortcuts with <kbd>Ctrl</kbd>. On macOS, Ctrl is Cmd. Every shortcut is in the
[key reference](../keybindings.md).

## Known limits

EZ2BMS was written with AI assistance (see `AI-DISCLOSURE.md` in the repository). Much of it is
checked against EZ2PORT's own code in automated tests, but some things haven't been tried on real
machines yet, and some features are still to come.

### Not yet checked on real machines

- **Sound on real audio devices.** Playback, latency, keying in Classic mode and slice auditions
  haven't been heard on a real sound card.
- **Windows.** The Windows build is made and tested automatically, but the desktop app hasn't been
  run by hand on Windows: starting up, playing sound, file associations and updating from one
  release to the next are still to be confirmed.
- **A real game and cabinet.** <kbd>F5</kbd> in the real EZ2PORT, published songs on the real
  song select wheel (disc, eyecatch, plate, preview and BGA), publishing while EZ2PORT is running,
  and exported songs on the original cabinet haven't been seen yet.
- **Real controllers.** Controllers, the cabinet's controller bridge, recording and calibration
  have been tested only with simulated controllers.
- **Korean and Japanese.** The translations are first drafts by an AI and haven't been read by a
  native speaker yet. Corrections are welcome.

### Not in this version

- **Plaintext (v6) cabinet charts.** The cabinet export writes the encrypted v8 charts only.
- **Testing from the cursor.** <kbd>F5</kbd> always tests from the start of the chart: the current
  EZ2PORT build has no way to start part-way through. The EZ2PORT panel shows whether your
  `ez2play` can.
- **Sprite BGA.** A song's BGA is a movie file; sprite BGAs aren't supported yet.
- **The wheel preview's backdrop.** The song manager's preview of the song select wheel doesn't
  draw the game's animated backdrop; it shows a stand-in.
- **A key-rebinding screen.** You can change editor shortcuts only by editing the settings file
  (see [Preferences and help](17-preferences-and-help.md#changing-editor-shortcuts)).
- **A macOS build.** Releases are made for Windows and Linux only.

Next: [Installing](02-installing.md)
