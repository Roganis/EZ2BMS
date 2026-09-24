# Quick start

This chapter walks you through a first session: open a song, place some notes and a hold, hear
them, see them in the Play view, check for problems, save, and then publish and test in EZ2PORT.
It takes about ten minutes. Each step links to the chapter with the details.

## Before you start

The easiest way to follow along is the [browser preview](02-installing.md#the-browser-preview),
which comes with a small demo song, "Neon Parade". Its audio is silent, but everything else in the
first seven steps works the same.

In the desktop app, open one of your own song folders instead (or a test song made with
`pnpm fixtures`). The steps are the same; only the sounds and notes differ.

## 1. Open the song

On the start screen, click **Open song folder** (or press <kbd>Ctrl</kbd>+<kbd>O</kbd>). In the
browser preview this opens Neon Parade straight away; in the desktop app, choose a song folder.

The editor opens. Neon Parade has two charts, shown as pills in the top bar: **5K STANDARD NM** and
**7 KEY HD**, each with its level. Click a pill, or press <kbd>Ctrl</kbd>+<kbd>1</kbd> or
<kbd>Ctrl</kbd>+<kbd>2</kbd>, to switch between them.

![The editor with Neon Parade open](img/editor.png)

## 2. Look around

- **Scroll** with the mouse wheel to move through the chart. The cursor line near the bottom of
  the field is where playback and typing start.
- **Zoom** with <kbd>Ctrl</kbd>+wheel, or <kbd>Ctrl</kbd>+<kbd>=</kbd> and <kbd>Ctrl</kbd>+<kbd>-</kbd>.
- **Jump** by clicking the minimap, the thin strip on the right edge of the field, or press
  <kbd>Home</kbd> and <kbd>End</kbd> for the start and the last note.
- The **Sounds** drawer on the left lists the song's sounds. The drawer on the right starts on the
  **Notes** tab.

[The editor tour](04-editor-tour.md) explains every part of the screen.

## 3. Place some notes

1. In **Sounds**, click a sound, for example `lead_1.wav`. That's your brush: new notes play it.
2. Make sure the Draw tool is on (press <kbd>D</kbd>).
3. Click an empty spot on a lane. A note appears, snapped to the grid. The **SNAP** readout in the
   top bar shows the grid; press <kbd>[</kbd> and <kbd>]</kbd> to make it coarser or finer.
4. Made a mistake? Right-click or right-drag over a note to erase it, or press
   <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo.

Tip: <kbd>Alt</kbd>+click an existing note to take its sound as your brush.

## 4. Make a hold

Press on an empty spot of a lane and drag **up**, then let go. The note becomes a hold that lasts
as far as you dragged. Drag the end of a hold to change its length.

You can also select a note and press <kbd>L</kbd> to turn it into a hold (or back). Press
<kbd>K</kbd> to cycle a selected hold through EZ2's hold kinds. [Charting](06-charting.md) covers
selecting, moving, holds and every tool.

## 5. Play it back

Press <kbd>Space</kbd> to play from the cursor, and <kbd>Space</kbd> again to stop.
<kbd>Shift</kbd>+<kbd>Space</kbd> plays again from where you last started. What you hear is
compiled exactly as EZ2PORT will play it.

## 6. Try the Play view

Press <kbd>Tab</kbd>. The field switches from **EDIT** to **PLAY** and scrolls the way EZ2PORT
does, at the **SPEED** shown in the top bar (<kbd>Ctrl</kbd>+wheel changes it).

- Press <kbd>Space</kbd> to watch an autoplay, with judgements and the HUD.
- Press <kbd>Shift</kbd>+<kbd>Tab</kbd> to play it yourself with EZ2PORT's keys, judged like
  EZ2PORT. Press <kbd>Esc</kbd> to stop.

Press <kbd>Tab</kbd> again to go back to editing. See [Playing and recording](10-play-and-record.md).

![The Play view](img/play-view.png)

## 7. Check Issues

Look at the right end of the status bar. It says **ready for EZ2PORT**, or how many errors and
warnings the song has. Click it (or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd>) to open
the **Issues** tab. Each finding says what's wrong, and many have a quick fix. Errors must be fixed
before you can publish or test; warnings are worth a look. See
[Chart info, notes and issues](12-chart-info-and-issues.md).

## 8. Save

Press <kbd>Ctrl</kbd>+<kbd>S</kbd>. A dot on a chart's pill means it has unsaved changes; it goes
away when you save. (In the browser preview, "saving" keeps the song in memory only.)

Unsaved work is also autosaved every few seconds, so a crash doesn't lose it. See
[Autosave and recovery](17-preferences-and-help.md#autosave-and-recovery).

## 9. Publish and test (desktop app)

Publishing and testing in EZ2PORT need the desktop app and your own game folder with EZ2PORT.

1. Open the **EZ2PORT** tab in the right drawer (press <kbd>Ctrl</kbd>+<kbd>K</kbd> and run
   **EZ2PORT settings**). Choose your game folder; EZ2BMS finds `ez2play` and the songs folder
   in it when they're in the usual places. See [EZ2PORT setup](05-ez2port-setup.md).
2. Press <kbd>F5</kbd> to test the chart in EZ2PORT, or <kbd>Shift</kbd>+<kbd>F5</kbd> to watch it
   autoplay there. The EZ2PORT log opens at the bottom of the field and shows what the game says.
   Testing uses a private copy of the song and doesn't touch your songs folder.
3. When you're happy, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>. The Publish dialog
   shows exactly what will be written; click **Publish** to write the song into EZ2PORT's songs
   folder.

See [Publishing and testing](14-publish-and-test.md) for the whole dialog.

## Where to go next

- Learn the screen: [Editor tour](04-editor-tour.md).
- Chart faster: [Charting](06-charting.md) and the [key reference](../keybindings.md).
- Set up a song's title, art and preview: [Song manager](13-song-manager.md).

Next: [Editor tour](04-editor-tour.md)
