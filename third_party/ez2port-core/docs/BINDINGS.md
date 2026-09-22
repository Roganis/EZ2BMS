# Binding the port to real hardware

Built 2026-08-31, to the same scope 2EZConfig binds for the EZ2DJ/AC family.
The lamp half is `LIGHTS.md`; this is the input half and the summary of both.

---

## 0. What 2EZConfig binds, and where the port stands

2EZConfig's binding store is `src/libs/bindings/bindings.h`. For EZ2DJ/AC -
the family this port plays - it has three kinds:

| 2EZConfig | what it is | the port |
| --- | --- | --- |
| `ButtonBinding.vkCode` | a keyboard key | **was the only thing the port had** |
| `ButtonBinding.devicePath + buttonIdx` | a HID button | **added** |
| `ButtonBinding.analogType` (`HS_UP`..`HS_UP_LEFT`) | a hat direction as a button | **added** |
| `AnalogBinding.devicePath + axisIdx`, `reverse` | a turntable axis | **added** |
| `AnalogBinding.vttPlus/vttMinus`, `vttStep` | a *virtual* turntable from two buttons | **added** |
| `AnalogBinding.mousePath + mouseAxis`, `mouseSensitivity` | the mouse as a turntable | **added** |
| `LightBinding.devicePath + outputIdx` | a lamp output | **added** (`LIGHTS.md`) |

2EZConfig also binds **EZ2Dancer**'s pads and **Sabin Sound Star**'s buttons.
Those are different *games*, not different hardware for this one - the port
reads EZ2AC's charts and has no lanes to give them - so they are out of scope
rather than missing.

## 1. The grammar

A binding is one token, because `keys.ini` already separates a channel's
alternates with commas and the format should not grow a second separator.
`ez2/bindspec.h` is the reference; `ez2input --channels` prints it.

| written as | is |
| --- | --- |
| `S`, `Space`, `Left Ctrl`, `/` | a key, spelled as SDL spells it |
| `0810:e501/b3` | button 3 on that device |
| `0810:e501/h0.up` | hat 0 held up (`up upright right downright down downleft left upleft`) |
| `0810:e501/a0` | axis 0 — **a turntable, not a button** |
| `0810:e501/a0:rev` | …reversed |
| `mouse/x`, `mouse/y:8` | the mouse as a turntable, at sensitivity 8 (1..20, default 5) |
| `vtt`, `vtt:4` | the virtual turntable: that side's own two scratch keys, 4 units a frame |

**Anything not device-shaped is a key name.** That is what keeps every
`keys.ini` written before this valid, and it is load-bearing in a way that bit
once: `/` is SDL's name for the slash key *and* player two's sixth key in the
port's default map. Reading every slash as the device separator unbound it
silently. The prefix is now checked against `vid:pid[#n]` and `mouse` first,
and a token that is neither is a key whatever else is in it.

**The device key is `vid:pid`, with `#n` for the n-th board of that make** -
the same key `lights.ini` uses, so one vocabulary names both halves of the
machine. It is not 2EZConfig's Windows device path: that is meaningless here,
is not stable across a reboot on Linux either, and cannot be typed.

## 2. The file

`$XDG_CONFIG_HOME/ez2port/keys.ini`, else `~/.config/ez2port/keys.ini`.

    [Keys]
    Key1     = Z, 0810:e501/b3      ; the key OR the panel button
    Scratch1 = Left Ctrl
    Start    = Return, 0810:e501/h0.up

    [Analog]
    Turntable   = 0810:e501/a0      ; or /a0:rev to flip it
    P2Turntable = vtt:4

A channel takes up to four alternates and is **down when any of them is**,
which is what lets a cabinet keep an operator's keyboard bound alongside the
panel. A turntable takes exactly one - it is one physical control.

`P1 Turntable` / `P2 Turntable`, the spelling 2EZConfig and `lights.ini` use,
are accepted as aliases so a device key copied from either still lands.

**`;` starts a comment; `#` only does at the start of a name.** `#` is part of
a device key, and taking it as a comment mid-token would bind
`0810:e501#2/b3` to the *first* board of that make - a binding that reads fine
and drives the wrong device. `lights.ini` settled the same question the same
way.

## 3. Doing it

On the machine's own screen: **TEST MENU → PORT SETTINGS → INPUT MAP**. One row
per channel plus the two turntables. TEST arms a row and the very next control
takes it - key, pad button or hat direction. On a turntable row TEST hears an
**axis** instead, and FX3 steps the sources that are not axes (`vtt`,
`mouse/x`, `mouse/y`, off). FX1 saves.

An armed *button* row does not hear axes, and that is deliberate: a stick
resting off-centre emits axis motion constantly, and a row that listened would
bind itself to the stick before the player touched anything.

From a terminal, for a cabinet reached over ssh:

    ez2input --list                    controllers, and how many controls each
    ez2input --watch                   press things; it prints what to write
    ez2input --bind Key1 0810:e501/b3
    ez2input --analog Turntable 0810:e501/a0
    ez2input --check                   which bindings the backend understands

`--watch` is the one that makes the rest usable - everything else assumes you
already know the button under your left hand is number 3.

## 4. The turntable, and the one thing the port invents

The cabinet gives the game **both**: two digital scratch bits, which
`bindButtons @0x418c90` takes as slots `0x0f`/`0x10`, and a separate analog
encoder that `m40c4b0 @0x40c4b0` reads off ports `0x103`/`0x104` as a running
position. A USB turntable has only the second.

So an analog binding here **also raises the two scratch channels as it turns**:
a threshold on the movement (4 encoder units) and a hold (90 ms) so a steady
spin reads as a held scratch rather than a stutter of presses - a stutter being
a MISS on a hold note. The hold is deliberately longer than a frame at 60 Hz,
because movement arrives in bursts and a shorter one would break between them.

That synthesis has no counterpart in the original and is marked as an invention
in `platform/common/ezpad.c` rather than presented as a transcription. The
alternative - a turntable that moves the select wheel but cannot hit a scratch
note - would not be a turntable.

Everything downstream is unchanged: the wheel already steps on scratch edges,
and judgement already reads those channels, so one synthesis point makes an
analog wheel work everywhere a keyboard already did.

## 5. Timing: a pad is not second class

Joystick input arrives through the same SDL event queue the keyboard does and
carries the same nanosecond timestamp, so a pad button reaches judgement on
exactly the path a key does. `platform.h` explains why the port takes
timestamped events rather than polling a level once a frame - a 6 ms KOOL
window cannot be resolved at 16.7 ms of granularity. **Polling the pad once a
frame would have quietly made every pad player worse than every keyboard
player**, and it would not have shown up as a bug, only as a feel.

One related fix came out of the same work: a channel's level is now the **OR**
of its bindings, recomputed on every edge, where it used to be set straight
from the key event that matched. With one binding those are the same; with two,
releasing either one released the channel while the other was still held.

## 6. What is not done

* **Not tested against real hardware.** There is no controller and no lamp
  board on the machine this was written on. The grammar, the file and the lamp
  model are covered by `tests/test_bindspec.c`, `tests/test_lamps.c` and
  `tests/test_inputchannel.c` (which links the backend but opens no window and
  needs no device); the device layers themselves have been exercised only to
  the point of correctly reporting that nothing is plugged in. `ez2input --watch` and
  `ez2lights --walk` are the first two things to run with hardware present.
* **The turntable step and hold are guesses at feel**, not measurements. They
  are two named constants in `ezpad.c` and are the first thing to change if an
  analog wheel feels wrong.
* **The COIN channel is the 29th** (2026-09-03): cabinet slot 3, default F3,
  the key `bindButtons @0x418c90` gives it on the original's own keyboard. It
  and SERVICE bump `ez2/credit.[ch]`, which the title's START gate, the
  second seat, the press-start prompts and the START lamps read. 2EZConfig's
  "Coin" binding is not imported by `bindspec` yet.
* **Hot-plug renumbers `#n`.** A second identical board arriving changes which
  one `#1` means. That is the price of naming devices by make rather than by a
  path, and it is the right price - a path is not stable across a reboot either
  and cannot be typed into a config file.
