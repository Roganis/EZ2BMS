# Keys and commands

<!-- Generated from the command registry by apps/editor/src/commands/keybindings.test.ts
     (KEYS_UPDATE=1 pnpm --filter @ez2bms/editor test). Do not edit by hand. -->

Every action is a command: Ctrl+K finds any of them by name, and the ones
with a verb take an argument there (`goto 32`, `bpm 174`, `snap 1/12`).
On macOS, Ctrl is Cmd. Keys can be rebound in the settings file (`keys`).

While playing in the Play view (test play), the game keys belong to the
game: EZ2PORT's defaults (Z S X D C V B, Ctrl/Shift, Space, F G H J; 2P on
M K , L . / ;) or your own `<game>/ez2port/keys.ini`. Esc ends the run.

## File

| Command           | Keys     | Palette |
| ----------------- | -------- | ------- |
| Close song        |          |         |
| New song…         |          |         |
| Open song folder… | `Ctrl+O` |         |
| Save              | `Ctrl+S` |         |

## Edit

| Command                                             | Keys                    | Palette |
| --------------------------------------------------- | ----------------------- | ------- |
| Chop the stem to the grid…                          | `Ctrl+Shift+G`          |         |
| Classic mode on / off (key the sound playing there) | `Ctrl+Shift+K`          |         |
| Classic: next sound to key                          | `Q`                     |         |
| Classic: previous sound to key                      | `Shift+Q`               |         |
| Classic: reset all notes to the background          |                         |         |
| Copy                                                | `Ctrl+C`                |         |
| Cut                                                 | `Ctrl+X`                |         |
| Cut the stem at its onsets…                         | `Ctrl+Shift+O`          |         |
| Delete selected notes                               | `Delete` `Backspace`    |         |
| Draw tool                                           | `D`                     |         |
| Duplicate after itself                              | `Ctrl+D`                |         |
| Knife tool (cut stems)                              | `C`                     |         |
| Paste at the cursor                                 | `Ctrl+V`                |         |
| Redo                                                | `Ctrl+Shift+Z` `Ctrl+Y` |         |
| Select all notes                                    | `Ctrl+A`                |         |
| Select nothing                                      | `Escape`                |         |
| Select tool                                         | `V`                     |         |
| Step input (place notes with the cabinet keys)      | `Ctrl+E`                |         |
| Undo                                                | `Ctrl+Z`                |         |

## Notes

| Command                  | Keys        | Palette |
| ------------------------ | ----------- | ------- |
| Long note on/off         | `L`         |         |
| Mirror keys              | `M`         |         |
| Move earlier by one snap | `Alt+Down`  |         |
| Move later by one snap   | `Alt+Up`    |         |
| Move one lane left       | `Alt+Left`  |         |
| Move one lane right      | `Alt+Right` |         |
| Next hold kind           | `K`         |         |
| Swap 1P / 2P             | `Ctrl+M`    |         |

## Timing

| Command                 | Keys | Palette       |
| ----------------------- | ---- | ------------- |
| BPM change here…        | `B`  |               |
| Set BPM at the cursor…  |      | `bpm 174`     |
| Set STOP at the cursor… |      | `stop pulses` |
| STOP here…              | `S`  |               |

## View

| Command                                    | Keys              | Palette        |
| ------------------------------------------ | ----------------- | -------------- |
| Chart info                                 | `Ctrl+J`          |                |
| Coarser snap                               | `[`               |                |
| Command palette                            | `Ctrl+K`          |                |
| Cursor down one measure                    | `PageDown`        |                |
| Cursor down one snap                       | `Down`            |                |
| Cursor up one measure                      | `PageUp`          |                |
| Cursor up one snap                         | `Up`              |                |
| EZ2PORT log                                |                   |                |
| EZ2PORT settings                           |                   |                |
| Finer snap                                 | `]`               |                |
| Game skin on / off                         |                   |                |
| Go to last note                            | `End`             |                |
| Go to measure…                             |                   | `goto measure` |
| Go to start                                | `Home`            |                |
| Inspector                                  | `Ctrl+I`          |                |
| Issues (pre-flight check)                  | `Ctrl+Shift+I`    |                |
| Keysound workbench                         | `Ctrl+Shift+B`    |                |
| Play speed…                                |                   | `speed 250`    |
| Show / hide sounds                         | `Ctrl+B`          |                |
| Snap to…                                   |                   | `snap 1/16`    |
| Song manager (info, category, every chart) | `Ctrl+Shift+L`    |                |
| Stem strip for the picked sound on / off   |                   |                |
| Stem strips shown / hidden                 |                   |                |
| Swap P1 / P2 view                          | `F2`              |                |
| Switch Edit / Play view                    | `Tab`             |                |
| Timing                                     | `Ctrl+T`          |                |
| Zoom in                                    | `Ctrl+=` `Ctrl++` |                |
| Zoom out                                   | `Ctrl+-`          |                |

## Play

| Command                                                    | Keys           | Palette |
| ---------------------------------------------------------- | -------------- | ------- |
| Mute / unmute background sounds                            | `Ctrl+Shift+M` |         |
| Play / stop from the cursor                                | `Space`        |         |
| Play again from where playback last started                | `Shift+Space`  |         |
| Solo the lane under the pointer (again to clear)           | `Ctrl+Shift+S` |         |
| Test play from the cursor (your keys, judged like EZ2PORT) | `Shift+Tab`    |         |

## Chart

| Command                                                    | Keys              | Palette |
| ---------------------------------------------------------- | ----------------- | ------- |
| Import sounds…                                             |                   |         |
| New chart…                                                 | `Ctrl+N`          |         |
| Reload sound files (after editing them in another program) |                   |         |
| Remove unused sounds from every chart                      |                   |         |
| Switch to chart 1-9                                        | `Ctrl+1 … Ctrl+9` |         |

## EZ2PORT

| Command                     | Keys           | Palette |
| --------------------------- | -------------- | ------- |
| Publish to EZ2PORT          | `Ctrl+Shift+P` |         |
| Stop the EZ2PORT test       |                |         |
| Test in EZ2PORT             | `F5`           |         |
| Watch in EZ2PORT (autoplay) | `Shift+F5`     |         |
