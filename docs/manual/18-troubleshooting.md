# Troubleshooting

This chapter answers common questions about problems: what a message means and what to do about it.
Some things aren't problems with your setup but known limits of this version; check
[Known limits](01-introduction.md#known-limits) first if something seems missing.

## Installing and starting

### Windows warns me that the installer "protected your PC"

The installer isn't signed yet, so Windows SmartScreen warns you the first time. Click
**More info**, then **Run anyway**. See [Installing](02-installing.md#windows).

### The window stays blank on Linux

Some Linux systems, notably with NVIDIA graphics, show a blank window with the WebKitGTK engine
EZ2BMS runs in. Try starting EZ2BMS from a terminal with `WEBKIT_DISABLE_DMABUF_RENDERER=1` in front
of the command, for example `WEBKIT_DISABLE_DMABUF_RENDERER=1 ./EZ2BMS*.AppImage`.

### The play field says "The playfield needs WebGL"

The play field is drawn with WebGL. If your system's graphics driver doesn't provide it to EZ2BMS,
the field can't be drawn. Updating your graphics driver usually helps.

### Korean or Japanese text shows as boxes on Linux

Install a CJK font, such as Noto Sans CJK, from your distribution's packages, then start EZ2BMS
again.

### Double-clicking a chart file doesn't open EZ2BMS

The Windows installer and the `.deb` register EZ2BMS for `.bmson` and BMS files. The AppImage
doesn't install itself, so open the files from EZ2BMS instead (**Open song folder** or
**Import…**). See [Installing](02-installing.md#opening-charts-from-your-file-manager).

## Sound

### It says "No audio device - playing silently"

EZ2BMS couldn't open your audio device when it started. The status bar then shows **no audio
device**. Everything else still works: playback, the Play view and test play run on a silent
clock, so you can go on charting.

To get sound back:

1. Check that your speakers or headphones are connected and working in other programs.
2. Close any program that might hold the device for itself.
3. Quit EZ2BMS and start it again: it opens the audio device when it starts.

The message also says what the system reported, in brackets, which helps in a bug report.

### I hear nothing in the browser preview

That's expected: the browser preview's audio is silent. Use the desktop app to hear your charts.

## EZ2PORT and your game folder

### My game folder isn't detected

EZ2BMS recognises your game folder by the `sound` and `system` folders in it. If the folder you
chose isn't that folder, EZ2BMS can't find `ez2play`, the songs folder or the game's panel in it. In
the [EZ2PORT tab](05-ez2port-setup.md):

- choose the game folder itself, not `sound`, `system` or a folder above it;
- **ez2play** is found by itself only when `ez2play` (`ez2play.exe` on Windows) is directly in the
  game folder. If yours is elsewhere, click **Choose…** beside **ez2play** and pick it;
- **Publish into** is filled in with `ez2port/songs` inside the game folder. If EZ2PORT keeps its
  songs elsewhere, choose that folder.

If a warning under **ez2play** says the file **is not EZ2PORT's ez2play**, you picked another
program: choose EZ2PORT's player.

### F5 says "Set your game folder (and ez2play) in the EZ2PORT tab first"

Testing in EZ2PORT needs both. EZ2BMS opens the EZ2PORT tab for you: set **Game folder** and check
that **ez2play** is found. Testing and publishing to your songs folder also need the desktop app;
they don't work in the browser preview.

### Publish or F5 is blocked by errors

Both refuse a chart with errors, because EZ2PORT would reject it or play something other than what
you charted.

- **F5** says how many problems the chart has to fix first and opens **Issues**.
- The **Publish** dialog says how many problems there are to fix first; click
  **Show them in Issues**.

In **Issues**, each finding says what's wrong and where. Many have a quick fix, and **Fix all**
fixes them all at once (one undo step in each chart). Warnings don't block anything, but are worth
a look. See [Chart info, notes and issues](12-chart-info-and-issues.md).

### F5 tests from the start, not from the cursor

The current EZ2PORT build can't start part-way through a chart, so EZ2BMS tests from the start.
When your cursor isn't at the start, the log says so. The **This ez2play** list in the EZ2PORT tab shows whether your build has
**Test from the cursor (--start)**. See [Known limits](01-introduction.md#known-limits).

### EZ2PORT ended with a message in the log

The EZ2PORT log at the bottom of the field shows how each test ended:

- **EZ2PORT closed normally.** Nothing went wrong.
- **EZ2PORT did not understand the command line (exit 2)**: your `ez2play` may be older or newer
  than EZ2BMS expects. Check the **This ez2play** list in the EZ2PORT tab.
- **EZ2PORT could not find the game data it needs (exit 77).** Check that your game folder is
  complete and is the one set in the EZ2PORT tab.
- Other endings show EZ2PORT's exit code. The lines above it are what EZ2PORT printed, and usually
  say why.

### The play field doesn't use my game's look

Open the EZ2PORT tab and look under **Play field**:

- **Draw with the game's own panel** must be ticked, and it can only be ticked once a game folder
  is set;
- the line underneath says what happened, for example that there's no panel file for this mode in
  your game folder;
- if some pictures weren't found, open **Not found** to see which ones;
- after changing your game files, click **Reload the panel**.

See [EZ2PORT setup](05-ez2port-setup.md#the-play-field).

## Controllers

### My controller isn't seen on Linux

On Linux, your user needs permission to read the controller's device. See
[Linux permissions](11-controllers.md#linux-permissions) for how to set that up, and for checking your controller in the
Controls dialog.

## Your work

### EZ2BMS crashed. Is my work lost?

Probably not. EZ2BMS autosaves unsaved charts every few seconds. Open the song again and click
**Recover** in the message that appears, then save. See
[Autosave and recovery](17-preferences-and-help.md#autosave-and-recovery).

## Logs and bug reports

### Where are the logs?

EZ2BMS keeps a log on your computer and never sends it anywhere. To find it, run **About EZ2BMS**
from the command palette: the **Log** line shows the folder, and **Open the log folder** opens it
in your file manager. You can also run the **Open the log folder** command directly.

The log is usually in:

- Windows: `%LOCALAPPDATA%\io.github.roganis.ez2bms\logs\`
- Linux: `~/.local/share/io.github.roganis.ez2bms/logs/`

### How do I report a bug?

1. If you can, make the problem happen again.
2. Open **About EZ2BMS** and click **Copy a report** (or run the **Copy a problem report** command).
   The report has the version, your system, this run's errors and the end of the log.
3. Open an issue on the project's
   [GitHub page](https://github.com/Roganis/EZ2BMS/issues), describe what you did, what you
   expected and what happened, and paste the report.

If EZ2BMS crashed, report it after the next start: the report then also says that the previous run
didn't close. See [Copying a report for a bug](17-preferences-and-help.md#copying-a-report-for-a-bug).

Next: [Appendix: shortcuts](appendix-shortcuts.md)
