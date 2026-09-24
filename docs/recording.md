# Recording, controllers and calibration

Milestone 7 lets you chart by playing along, with the keyboard or the
cabinet's own controls, and measures how late this machine hears, shows and
takes a press so that what you play lands where you meant it.

## Recording a take

**R** in the editor starts recording from the cursor:

1. **Count-in.** The chart starts that many beats before the cursor (4 by
   default) with a click on every beat, the first of each bar accented.
   Presses in the count-in are not recorded.
2. **Recording.** Play along. Each press shows on the field straight away,
   snapped as it will land. **R** or **Esc** stops, and so does the chart's
   end.
3. **Review.** The take stays on the field, each note in the colour of what
   it would become:
   - green: it will be placed;
   - red: the lane already has a note there (a take never overwrites);
   - grey: in a Classic song, nothing is sounding there to key.

   The panel also shows how the presses sat against the grid (mean and
   median, early and late), which is what a latency setting needs.
   - **Keep** (**Enter**) puts the take into the chart as **one undo step**
     and selects what it placed.
   - **Retake** (**R**) records again from the same place.
   - **Discard** (**Esc**) drops it.

What a press becomes:

- **In a song charted in Classic mode** (the song's Classic switch), a press
  keys the background sound playing at that spot: a note already there, or
  a split of a sound playing through. The music stays exactly as it was:
  each keying is checked like a Classic edit and refused if it would change
  the sound. Only background sounds are taken, never another lane's. A
  press is silent while recording, because the music already holds that
  sound.
- **In any other song**, a press is a note with the brush sound, which it
  plays on its lane as you press.
- **ScratchMix** records as EZ2PORT plays it: a key alone is nothing, the
  turntable strums the keys held on its side (and a key pressed just after
  a strum still counts), and every note is a tap - the port's scratch game
  has no holds.

Options, in the review panel (kept in the settings):

| Option           | Default | What it does                                                                                                               |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Holds from       | 200 ms  | A press held this long becomes a hold to its snapped release. A hold that would swallow a note becomes a tap, and says so. |
| Grid / EZ2 exact | Grid    | Snap to the editor's grid (`[` `]`), or to EZ2's own 1/48 beat.                                                            |
| Count-in         | 4 beats | Beats before the cursor.                                                                                                   |
| Metronome        | off     | A click on every beat while recording.                                                                                     |
| Mute the lanes   | off     | The chart's own lane sounds are silent while recording (never in Classic, where it would leave holes).                     |

Changing holds or the grid in review snaps the take again; the others apply
to the next take.

## Bindings

Everything that plays - test play, recording, step input and the latency
tests - goes through one set of bindings, EZ2BMS's own, in EZ2PORT's
`keys.ini` grammar (the palette: **Controls and timing…**):

- Each of EZ2PORT's 29 channels (Key1-7, the scratch pair, Pedal, Start,
  Effect1-4, the same for player 2, Test, Service, Coin) takes up to four
  bindings: keys, controller buttons, hats. **+** and press one to add it.
  A row lights while its channel is down, and says where it plays in the
  open chart's mode (in ScratchMix the scratch channels strum).
- Each turntable takes an axis: **+** and turn it. **reversed** (`:rev`)
  flips its direction; **speed, not position** (`,vel`) is for an axis that
  reports how fast it spins rather than where it is.
- **Debounce** (8 ms, as EZ2PORT): a second edge on a channel within this
  time of the last is switch chatter, not a press.

The first time, EZ2BMS takes EZ2PORT's own `keys.ini` (and `settings.ini`'s
`Debounce`) from where the port keeps them - the `ez2port` folder of the
game's data folder when ez2play is dropped in there (a cabinet), else
`$XDG_CONFIG_HOME/ez2port`, `~/.config/ez2port` or `%APPDATA%\ez2port`, or
the file `EZ2_KEYS` names - and keeps them as its own. After that the two
are separate:

- **Import from EZ2PORT** takes the port's file again.
- **Copy as keys.ini** puts EZ2BMS's bindings on the clipboard, in the
  port's own layout, to paste into its file. EZ2BMS never writes EZ2PORT's
  files.
- **EZ2PORT defaults** goes back to the port's keyboard layout: Z S X D C
  for keys 1-5, V B for 6-7, the left Ctrl and Shift for the turntable,
  Space for the pedal, F G H J for the effectors.

While something listens (test play, recording, the latency tests), a bound
key is the game's: with Ctrl as the turntable, Ctrl+Z is Key1 and a
scratch, not an undo. Step input takes only presses without Ctrl, Alt or
Meta, so shortcuts keep working around it.

## Controllers

EZ2BMS reads game controllers with SDL 3, as EZ2PORT does, so a board has
the same name and the same button, hat and axis numbers in both programs,
and a binding copied between them presses the same control:

- A board is named by its make, `vid:pid` in hex: `0810:e501`. A second
  board of the same make is `0810:e501#1`, the third `#2`, in the order SDL
  lists them - so two identical boards can swap names if they are listed
  the other way round, as they do in the port. Plugging or unplugging
  renumbers them.
- **Controllers** in the dialog lists what SDL has open, with a live
  readout of each board's buttons, hats and axes.
- A press is timed by SDL's own stamp, not when the editor got to it, and,
  as in EZ2PORT, a press more than 200 ms old is taken as happening now.

### The cabinet's HID bridge

The EZ2 I/O bridge (`ez2-io`, `firmware/ez2_hid_bridge`) is one game pad with
32 buttons and two axes. Its make is the board's: an Arduino Micro normally
shows as `2341:8037`, a Leonardo as `2341:8036` - the Controllers page says
which. Button _N_ is `/b(N-1)` in a binding:

| Bridge            | Binding        | Channel                         |
| ----------------- | -------------- | ------------------------------- |
| Buttons 1-5       | `/b0`-`/b4`    | Key1-Key5                       |
| Buttons 6-10      | `/b5`-`/b9`    | P2Key1-P2Key5                   |
| 11, 12 (Start)    | `/b10`, `/b11` | Start, P2Start                  |
| 13-16 (effectors) | `/b12`-`/b15`  | Effect1-Effect4                 |
| 17, 18 (pedals)   | `/b16`, `/b17` | Pedal, P2Pedal                  |
| 19, 20            | `/b18`, `/b19` | Test, Service                   |
| 21, 22 (TT1 +/-)  | `/b20`, `/b21` | Scratch1, Scratch2 (pulses)     |
| 23, 24 (TT2 +/-)  | `/b22`, `/b23` | P2Scratch1, P2Scratch2 (pulses) |
| 25 (Coin)         | `/b24`         | Coin                            |
| X axis            | `/a0`          | Turntable                       |
| Y axis            | `/a1`          | P2Turntable                     |

For the turntables, bind either the axes (EZ2PORT's analog turntable: any
movement raises the scratch channel for 90 ms, a reversal drops the other
direction at once) or the pulse buttons - not both. As a `keys.ini`:

```ini
[Keys]
Key1 = Z, 2341:8037/b0
Key2 = S, 2341:8037/b1
; ... and so on down the table
Pedal = Space, 2341:8037/b16
Effect1 = F, 2341:8037/b12

[Analog]
Turntable = 2341:8037/a0
P2Turntable = 2341:8037/a1
```

### When controllers are open

EZ2BMS opens the controllers only while something needs them - test play,
recording, the Controls dialog, step input and the latency tests - and
closes them for the whole of a **Test in EZ2PORT** (F5) run. On Windows SDL
reads a board like the bridge through DirectInput, which opens it for one
program at a time: a board EZ2BMS holds is a board the game cannot read.
Running EZ2PORT outside F5 while EZ2BMS is test playing or recording can
leave the game without it; stop those first.

### Linux permissions

SDL reads a controller through `/dev/input/event*` (and, for boards it has
a HIDAPI driver for, `/dev/hidraw*`). Desktop systems usually give the
logged-in user access to joysticks; if the Controllers page stays empty,
check the device nodes' permissions, add yourself to the `input` group, or
give the board to the logged-in user with a udev rule, for example
`/etc/udev/rules.d/70-ez2-io.rules`:

```
SUBSYSTEM=="input", ATTRS{idVendor}=="2341", ATTRS{idProduct}=="8037", TAG+="uaccess"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="2341", ATTRS{idProduct}=="8037", TAG+="uaccess"
```

then `sudo udevadm control --reload` and plug it in again.

## Calibration

Three offsets, under **Timing** in the Controls dialog. EZ2PORT has none of
them: they are for playing and recording in EZ2BMS only.

| Offset  | Means                                                | Set by                                      |
| ------- | ---------------------------------------------------- | ------------------------------------------- |
| Audio   | The chart is heard this much later than the clock    | by hand                                     |
| Picture | The screen shows a frame this much later             | the picture test; the cursor is drawn ahead |
| Input   | A press reaches the editor this much after it's made | the sound test; taken off every press       |

- **The sound test** plays 20 clicks at 120 BPM. Tap any bound key or button
  on each. The first four are for finding the beat; slips (a tap far from
  the rest) are left out by the median absolute deviation, and what is left
  gives its median. Taps are timed against the audio clock, which already
  allows for the sound device's own buffering, so the answer is how late a
  press lands after the sound: the input offset. Run it first.
- **The picture test** flashes, silently, on the same beat. Its taps have
  the input offset taken off already, so how late they land is how late the
  screen is: the picture offset. The editor then draws the cursor that much
  ahead of what is heard.

Each test says how late the taps landed, how many it used and how spread
they were; **Use as the … offset** applies it. After calibrating, record a
short take on a steady part and look at the review's mean and median: near
zero means the take lands where you played.
