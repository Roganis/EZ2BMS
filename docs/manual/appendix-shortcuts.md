# Appendix: shortcuts

This page is a one-page cheat sheet of the shortcuts you'll use most. On macOS, Ctrl is Cmd.

The complete table of every command and its keys is [Keys and commands](../keybindings.md). It is
generated from EZ2BMS's code, so it is always up to date. Every command, including the ones with no
key, can also be run from the command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>) by typing its name.
Some take a value there: `goto 32`, `bpm 174`, `snap 1/12`, `speed 300`, `scroll 1.5`.

## File

| Keys                         | Command                         |
| ---------------------------- | ------------------------------- |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Open song folder…               |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save                            |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Preferences (language, updates) |

## Edit

| Keys                                                                                       | Command                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| <kbd>V</kbd>                                                                               | Select tool                                         |
| <kbd>D</kbd>                                                                               | Draw tool                                           |
| <kbd>C</kbd>                                                                               | Knife tool (cut stems)                              |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd>                                                               | Undo                                                |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd>              | Redo                                                |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copy / Cut / Paste at the cursor                    |
| <kbd>Ctrl</kbd>+<kbd>D</kbd>                                                               | Duplicate after itself                              |
| <kbd>Ctrl</kbd>+<kbd>A</kbd>                                                               | Select all notes                                    |
| <kbd>Esc</kbd>                                                                             | Select nothing                                      |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd>                                                  | Delete selected notes                               |
| <kbd>Ctrl</kbd>+<kbd>E</kbd>                                                               | Step input (place notes with the cabinet keys)      |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>                                              | Classic mode on / off (key the sound playing there) |
| <kbd>Q</kbd> / <kbd>Shift</kbd>+<kbd>Q</kbd>                                               | Classic: next / previous sound to key               |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>                                              | Cut the stem at its onsets…                         |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>                                              | Chop the stem to the grid…                          |

## Notes

| Keys                                                             | Command                          |
| ---------------------------------------------------------------- | -------------------------------- |
| <kbd>L</kbd>                                                     | Long note on/off                 |
| <kbd>K</kbd>                                                     | Next hold kind                   |
| <kbd>M</kbd>                                                     | Mirror keys                      |
| <kbd>Ctrl</kbd>+<kbd>M</kbd>                                     | Swap 1P / 2P                     |
| <kbd>Alt</kbd>+<kbd>Up</kbd> / <kbd>Alt</kbd>+<kbd>Down</kbd>    | Move later / earlier by one snap |
| <kbd>Alt</kbd>+<kbd>Left</kbd> / <kbd>Alt</kbd>+<kbd>Right</kbd> | Move one lane left / right       |

## Timing

| Keys         | Command          |
| ------------ | ---------------- |
| <kbd>B</kbd> | BPM change here… |
| <kbd>S</kbd> | STOP here…       |

## View

| Keys                                                        | Command                                    |
| ----------------------------------------------------------- | ------------------------------------------ |
| <kbd>Ctrl</kbd>+<kbd>K</kbd>                                | Command palette                            |
| <kbd>Tab</kbd>                                              | Switch Edit / Play view                    |
| <kbd>Up</kbd> / <kbd>Down</kbd>                             | Cursor up / down one snap                  |
| <kbd>PageUp</kbd> / <kbd>PageDown</kbd>                     | Cursor up / down one measure               |
| <kbd>Home</kbd> / <kbd>End</kbd>                            | Go to start / Go to last note              |
| <kbd>[</kbd> / <kbd>]</kbd>                                 | Coarser / Finer snap                       |
| <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> | Zoom in / Zoom out                         |
| <kbd>F2</kbd>                                               | Swap P1 / P2 view                          |
| <kbd>Ctrl</kbd>+<kbd>B</kbd>                                | Show / hide sounds                         |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>               | Keysound workbench                         |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>               | Song manager (info, category, every chart) |
| <kbd>Ctrl</kbd>+<kbd>I</kbd>                                | Inspector                                  |
| <kbd>Ctrl</kbd>+<kbd>J</kbd>                                | Chart info                                 |
| <kbd>Ctrl</kbd>+<kbd>T</kbd>                                | Timing                                     |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd>               | Issues (pre-flight check)                  |

## Play

| Keys                                          | Command                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| <kbd>Space</kbd>                              | Play / stop from the cursor                                                        |
| <kbd>Shift</kbd>+<kbd>Space</kbd>             | Play again from where playback last started                                        |
| <kbd>Shift</kbd>+<kbd>Tab</kbd>               | Test play from the cursor (your keys, judged like EZ2PORT)                         |
| <kbd>R</kbd>                                  | Record: play along from the cursor, then keep the take (R again stops, or retakes) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> | Mute / unmute background sounds                                                    |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Solo the lane under the pointer (again to clear)                                   |

## Chart

| Keys                                                        | Command             |
| ----------------------------------------------------------- | ------------------- |
| <kbd>Ctrl</kbd>+<kbd>N</kbd>                                | New chart…          |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> … <kbd>Ctrl</kbd>+<kbd>9</kbd> | Switch to chart 1-9 |

## EZ2PORT

| Keys                                          | Command                     |
| --------------------------------------------- | --------------------------- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | Publish to EZ2PORT          |
| <kbd>F5</kbd>                                 | Test in EZ2PORT             |
| <kbd>Shift</kbd>+<kbd>F5</kbd>                | Watch in EZ2PORT (autoplay) |

## Game keys in test play

While you test play in the Play view (<kbd>Shift</kbd>+<kbd>Tab</kbd>), the game keys belong to the
game. <kbd>Esc</kbd> ends the run. The keys are EZ2PORT's
defaults, or your own if your game folder has an `ez2port/keys.ini`. You can change them in the
Controls dialog (see [Controllers](11-controllers.md)).

| What          | Player 1 (1P)                                                                              | Player 2 (2P)                                                                              |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Keys 1-7      | <kbd>Z</kbd> <kbd>S</kbd> <kbd>X</kbd> <kbd>D</kbd> <kbd>C</kbd> <kbd>V</kbd> <kbd>B</kbd> | <kbd>M</kbd> <kbd>K</kbd> <kbd>,</kbd> <kbd>L</kbd> <kbd>.</kbd> <kbd>/</kbd> <kbd>;</kbd> |
| Turntable     | Left <kbd>Ctrl</kbd> / Left <kbd>Shift</kbd>                                               | Right <kbd>Ctrl</kbd> / Right <kbd>Shift</kbd>                                             |
| Pedal         | <kbd>Space</kbd>                                                                           | Right <kbd>Alt</kbd>                                                                       |
| Effectors 1-4 | <kbd>F</kbd> <kbd>G</kbd> <kbd>H</kbd> <kbd>J</kbd>                                        |                                                                                            |
| Start         | <kbd>Enter</kbd>                                                                           | <kbd>\\</kbd>                                                                              |

Next: [Glossary](appendix-glossary.md)
