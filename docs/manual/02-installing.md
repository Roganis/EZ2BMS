# Installing

This chapter shows how to install EZ2BMS on Windows or Linux, how it keeps itself up to date, how to
try the browser preview, and how to build it from source.

## Downloading

Each release is on the project's
[release page](https://github.com/Roganis/EZ2BMS/releases/latest). It has three downloads:

| File                         | For                                | Updates itself |
| ---------------------------- | ---------------------------------- | -------------- |
| The Windows installer (.exe) | Windows                            | Yes            |
| The AppImage                 | Linux, any distribution            | Yes            |
| The .deb package             | Debian, Ubuntu and their relatives | No             |

There is no macOS build.

## Windows

1. Download the installer (`.exe`) from the release page and run it.
2. The installer isn't signed yet, so Windows SmartScreen warns you the first time you run it.
   Click **More info**, then **Run anyway**.
3. Follow the installer. EZ2BMS then appears in the Start menu.

EZ2BMS runs in Microsoft Edge WebView2, which Windows 10 and 11 usually already have.

## Linux

### The AppImage

The AppImage runs on most distributions without installing anything:

1. Download the `.AppImage` file.
2. Make it executable, either in your file manager's file properties or with
   `chmod +x EZ2BMS*.AppImage`.
3. Double-click it, or run it from a terminal.

### The .deb package

On Debian, Ubuntu and similar systems, install the `.deb` with your package manager, for example
`sudo apt install ./EZ2BMS*.deb`. EZ2BMS then appears in your applications menu.

The `.deb` doesn't update itself: Linux packages are updated by the package manager. When there
is a new release, EZ2BMS offers to open the release page instead, so you can download the new
`.deb`.

### Korean and Japanese on Linux

To show the app in Korean or Japanese on Linux, install a CJK font such as Noto Sans CJK from your
distribution's packages.

## Opening charts from your file manager

The Windows installer and the `.deb` register EZ2BMS for chart files, so you can double-click them:

- a `.bmson` file opens its song folder in EZ2BMS, at that chart;
- a BMS file (`.bms`, `.bme`, `.bml` or `.pms`) opens the import wizard on its folder (see
  [Importing](15-import.md)).

If EZ2BMS is already open, the file goes to the open window instead of starting a second copy. If
you have unsaved changes, EZ2BMS asks before it leaves the song.

## Updates

The Windows installer and the AppImage update themselves from the project's releases:

- When EZ2BMS starts, it looks for a new version, at most once a day. It never interrupts while a
  chart is playing.
- When there is one, a message says so, for example **EZ2BMS 0.3.0 is out (you have 0.2.0).** Click **What's new** to see what
  changed.
- Install it from that dialog when you're ready. Save your charts first: installing restarts
  EZ2BMS.

You can also look at any time with the **Check for updates** command, or turn the daily check off
in Preferences. Updates are signed, and EZ2BMS checks the signature before it installs anything.
See [Updates](17-preferences-and-help.md#updates) for the whole dialog.

## The browser preview

The browser preview runs the editor in a web browser, with a demo song and silent audio. It's handy
for looking around or trying the [quick start](03-quick-start.md) before you install anything, but
it can't open your own song folders, run EZ2PORT or play sound (see
[the desktop app and the browser preview](01-introduction.md#the-desktop-app-and-the-browser-preview)).

To run it, you need a copy of the source and the tools listed under
[building from source](#building-from-source). Then, in the source folder:

```sh
pnpm install
pnpm dev
```

and open <http://localhost:1420> in your browser. Add `?skin` to the address
(<http://localhost:1420/?skin>) to try the game-skin drawing with a made-up game folder.

## Building from source

You need:

- Node 22 or later, and pnpm 10;
- Rust (stable);
- a C compiler;
- the Tauri prerequisites for your system: on Debian or Ubuntu, `libwebkit2gtk-4.1-dev` and
  `libasound2-dev`; on Windows, WebView2.

Then, in the source folder:

```sh
pnpm install
node scripts/fetch-fonts.mjs   # the CJK font for title plates
pnpm tauri dev                 # run the desktop app
pnpm tauri build               # or build the installers
```

`pnpm fixtures` writes a folder, `fixtures-out/`, with one playable test song for each EZ2PORT
mode, made with synthesized sounds. It's a quick way to get songs to open, play and test.

Next: [Quick start](03-quick-start.md)
