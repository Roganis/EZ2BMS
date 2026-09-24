# Latency, measured

Measured 2026-08-31 on the owner's machine, not estimated. Every number below
came from a run; where something is *not* measured it says so.

Machine as found: Wayland, PipeWire, an RX 7900 GRE, a **240 Hz** display
(2048x1152, 4.17 ms a refresh), output on the motherboard analog sink.

## The short answer

| path | the port's own share | the system's share | total |
| --- | --- | --- | --- |
| press -> **judgement** | ~0.65 ms mean, ~1.3 ms worst | keyboard + kernel, not measured | ~2-9 ms |
| press -> **picture** | ~1 ms | ~4-8 ms compositor + scanout | ~5-9 ms |
| press -> **keysound** | ~1 ms | ~8 ms shared, ~6 ms exclusive | **~9-12 ms, ~7-9 ms exclusive** |

**The audio chain is the long pole**, at roughly two to three times the video
path - though it is 2.9 ms shorter than when this was first measured, see the
buffer section. That is the number to attack if any is attacked. For scale: a typical PC
rhythm game lands 20-40 ms; an arcade cabinet with dedicated hardware is under
5. The port sits well inside PC territory.

**Judgement accuracy is a separate question and is not affected.**
`ezAudioTimeMs` counts frames the device has actually consumed and subtracts
what is still queued, so the game's "now" is what the player HEARS. A constant
output latency shifts what you feel, never what you are graded against.

## Input: ~0.65 ms mean, and the structure guarantees it

`ezPlatformPump` drains SDL at the top of `ezBeginFrame` (tools/ez2play.c:6766)
and `ezInputEvents` is read 45 lines later, before any drawing - so an event is
judged in the same frame it arrives. The events carry **SDL's own timestamp**
(`e.key.timestamp`, platform/gl/gl_platform.c:463), not the time the port got
round to looking, so the figure is honest.

The worst case is an event landing just after a pump: it waits one loop period.
Interactive the loop is 0.315 ms of render plus an `ezSleepMs(1)`, so **~1.3 ms**,
mean half that. A previous instrumented run measured **0.6 ms mean, 2 ms worst**
over 370 edges, which agrees.

NOT included: the keyboard's own polling (1 ms on a 1000 Hz device, up to 8 on a
cheap one), libinput, and the compositor's delivery. Those are the port's
biggest input unknown and they are outside it.

## Graphics: not the problem

* render **0.315 ms/frame** - 3000 frames of 5KeyMix with the BGA in 0.95 s,
  3173 fps, offscreen on the real GPU;
* **swap does not block**: no `SDL_GL_SetSwapInterval` call anywhere, and the
  default here is **0**. Measured with a real visible window: 400 swaps in
  37.3 ms, **0.093 ms a swap**, 10,723 fps. The compositor does not throttle
  the loop;
* the display then shows it within one refresh, **4.17 ms** at 240 Hz, plus the
  compositor's own pipeline (typically another frame).

So the port renders roughly 770 fps interactively (render + the 1 ms sleep) and
the picture is at most a few ms stale. There is no gain available here worth
chasing.

## Audio: 11 ms of software, and where it goes

From `pw-top` with the game running:

    node             QUANT  RATE   BUSY     ERR
    ez2play            256  44100  10.9us     0     the port's mixer
    alsa_output..analog 256  48000   9.3us     5     the sink

* the port's stream buffer is **128 frames at 44.1 kHz = 2.90 ms**, and
  PipeWire grants the request exactly (`SDL_HINT_AUDIO_DEVICE_SAMPLE_FRAMES`) -
  it was 256 until the measurement below;
* the sink runs **256 frames at 48 kHz = 5.33 ms**;
* between them PipeWire **resamples 44.1 -> 48** (pw-top marks the node `=`);
* the mix callback costs **10.9 us** and logged **zero xruns**.

So ~8.2 ms of software, plus the ALSA hardware buffer and the analog stage.

### The buffer: 256 -> 128, and where it breaks

**DONE, 2026-08-31.** Each candidate was run through a real chart with the BGA
while every core was saturated, with `pw-top` watching for xruns:

    256 frames   5.80 ms   ERR 0   mixer 17.0us
    128 frames   2.90 ms   ERR 0   mixer  6.4us, wait ratio 0.07
     64 frames   1.45 ms   ERR 6   <- glitches

128 is the setting: **half the latency, still nothing dropped under full CPU
load, and the failure a clear factor of two below it.** The port now runs there,
so the audio chain is ~8 ms rather than ~11.

If a slower machine crackles, raise it back to 256 - one constant in
`platform/common/ezaudio.c`, and the comment there carries this table.

### And one that is NOT worth it

Running the mixer at 48 kHz would drop PipeWire's resampler and save 0.47 ms of
buffer. **Don't.** The port's own resampler is nearest-neighbour
(`platform/common/ezaudio.c:119`) and **167,909 of the 179,542 shipped samples
are 44.1 kHz** - so matching the graph would push 93% of the library through the
crude path to save half a millisecond. Keeping 44.1 kHz puts the library on the
fast path and lets PipeWire's proper resampler do the conversion. The current
choice is right.

Writing a real resampler would change this, and would be worth it for the 7% of
off-rate samples on its own merits.

## Vsync, and the late present (2026-09-05)

Vsync is now ON by default (the cabinet's CRT showed 230 unsynchronised
frames a second, torn), and the first build with it made the keysound path
much worse there: the swap blocks until the refresh, the loop pumps input at
the top of the pass, so a press was handled once per refresh - up to 16.7 ms
late on 60 Hz, 8 on average - on top of the audio chain below.

The fix keeps vsync and moves the wait (`platform/common/ezlate.c`). In the
play loop `ezPresent` SKIPS the swap while the next refresh is further away
than a margin (3 ms, `EZ2_PRESENT_MARGIN_MS`), and the loop goes round again:
pump, judge, keysound, redraw. The swap is made just before the predicted
vblank and blocks for the margin only. The refresh is predicted from the
smallest recent interval between blocking swaps; a miss costs one refresh and
re-syncs on the next return; nothing is shown torn. Measured here at 240 Hz
with `EZ2_TRACE_FRAMES=1`:

    margin 3 ms:  240 fps, 480 presented / 2 s, 120 skipped, swap 2.2 ms
    margin 1 ms:  720 passes/s, 480 presented / 2 s, 960 skipped, swap 0.3 ms

Both present every refresh with none missed; at 1 ms the input path is back
to the unsynchronised loop's ~1.4 ms mean. On a 60 Hz screen the 3 ms default
leaves ten passes between refreshes. The menus do not opt in: they pace
themselves to 60 and present once per pass.

**And the picture is drawn for the moment it is shown** (later the same
day: "the scrolling isn't as smooth as the original on the CRT"). Two
things made the field step unevenly on a 60 Hz screen. The shared audio
clock advances once per device period - 2.9 ms here, but WASAPI shared
pulls ten milliseconds at a time - and a note placed by a clock that moves
in 10 ms steps lands on a 16.7 ms grid unevenly; `ezAudioTimeMsF` now
carries the time forward on the wall clock between device steps, never
past the step it is inside and never backwards. And the pass that presents
is the first one inside the margin, so its render sat a variable
millisecond or so before the vblank; the play loop now draws the field for
`now + ezPresentEtaMs()`, the predicted refresh, so consecutive frames are
exactly one refresh apart in chart time. Judgement still uses `now`. The
gate's refresh estimate is the median of the last sixteen blocking swaps
(the minimum undershot under compositor jitter and reported misses that
were not), and a swap that comes back three quarters of a refresh late
counts as a miss and widens the margin by half a millisecond, to 8 at most;
the frame trace prints `missed`.

## On a 60 Hz screen

Written when vsync was off by default; with it on, the late present above
keeps the input path at the loop's rate. The rest still holds: **the port's
loop is not display-paced.** It never calls `SDL_GL_SetSwapInterval`, the default here
is 0, and with a properly mapped window (the first attempt at this measured a
window that was not presenting, and read 0 for both):

    interval 0:  0.06-0.11 ms/swap    ~9000-17000 fps   DOES NOT BLOCK
    interval 1:  4.171 ms/swap             240 fps      BLOCKS, exactly refresh

Interval 1 lands on 4.171 ms, which is 240 Hz to three figures - so the
mechanism is confirmed, and the port is on the arm that does not use it.

That means moving to 60 Hz changes **only the picture**:

| path | 240 Hz | 60 Hz |
| --- | --- | --- |
| press -> judgement | ~0.65 ms | **~0.65 ms, unchanged** |
| press -> keysound | ~9-12 ms | **~9-12 ms, unchanged** |
| press -> picture | ~5-9 ms | ~18-25 ms |

The loop still runs ~770 fps (0.315 ms of render plus the 1 ms sleep) because
nothing gates it on the refresh; a finished frame simply waits longer for the
next scan-out, up to 16.67 ms instead of 4.17, plus the compositor's own frame.

**The game stays as playable and grades identically**, because judgement is
anchored to the audio clock and not to the picture. What a 60 Hz player loses
is visual immediacy and smoothness - notes step 16.67 ms at a time - not
fairness.

Rendering far faster than the display is not waste from a latency point of
view: with interval 0 the compositor takes the most recent finished buffer at
its own vblank, so a higher frame rate means a fresher picture. The only
self-imposed delay in the loop is the `ezSleepMs(1)`, worth ~0.5 ms mean, and
removing it would spin a core to save half a millisecond against a ~10 ms audio
path - not a trade worth making.

## Do audio and video wait on each other? No - measured

Structurally they cannot. The mix runs **inside SDL's audio callback**, on
SDL's own audio thread (`feed`, platform/common/ezaudio.c:99). The game thread
only ever flips a voice's cursor and gain under a mutex held for microseconds;
the render thread never touches that lock at all, and file reading and decoding
happen outside it. A stalled frame moves the picture and never the music.

Confirmed under deliberate abuse: the game running a real chart with the BGA
while **every core was saturated** with spinners.

    node       QUANT  RATE   WAIT      BUSY     ERR
    ez2play      128  44100    -        6.4us     0     <- zero xruns
    ez2play      256  44100    -       17.0us     0     <- zero xruns

The mixer meets a 2.9 ms deadline using 6.4 microseconds of it - 0.2% - and
logged no dropouts with the CPU fully contended. The sink's own ERR 5 predates
the test and is not the port's.

The one place the two do meet is the TRIGGER: a keysound is started by the game
thread during input handling, once per frame. At ~1.3 ms a frame that adds
under a millisecond, and it is the same path the judgement takes, so the sound
and the grade agree with each other by construction.

## The exclusive path: taking the card outright

`--audio-exclusive [DEVICE]` opens the ALSA hardware directly and leaves the
system mixer out of the path entirely. Default off; the device defaults to
`hw:0,0`, which on this machine is HDMI, so **name your card**.

Measured on the analog output, `hw:1,0`:

| | shared (PipeWire) | **exclusive (ALSA direct)** |
| --- | --- | --- |
| SDL stream buffer | 128 @ 44.1 kHz = 2.90 ms | 128 @ 44.1 kHz = 2.90 ms |
| between it and the card | graph quantum 128 @ **48 kHz**, plus a 44.1 -> 48 **resample** | **nothing** |
| the card itself | 48 kHz, period 1024, MMAP | **44.1 kHz native**, period 128, buffer 256 |
| `ez2play` nodes in the graph | 1 | **0** |

Two things go, not one: the mixer's own quantum and headroom, **and the
resampler** - the card takes the port's 44.1 kHz directly, so the library's
93%-native samples reach the DAC untouched. Worth roughly 2-3 ms and a small
quality gain.

What it costs: the device is genuinely taken. Nothing else can play while the
game holds it, and if anything already has the card the open fails - so it
**falls back to the shared device** rather than refusing to start, saying so
and listing the machine's cards:

    ezAudioInit: exclusive hw:1,0 unavailable (Device or resource busy)
                 - falling back to the shared device
    ezAudioInit: cards on this machine: ...
    audio: shared - the exclusive open failed, see the log above

PipeWire suspends idle devices, so in practice the card is free unless
something is actually playing.

**Windows has the same switch and a different implementation.** SDL's WASAPI
backend has no exclusive mode, so the Windows build carries its own
`IAudioClient` in `AUDCLNT_SHAREMODE_EXCLUSIVE` with its own render thread -
`platform/common/ezwasapi.c`, and `../port/WINDOWS.md` for why it had to be
written rather than configured. The gain should be the same in kind and larger
in degree, because Windows' shared mixer resamples *everything* to the
endpoint's mix format (usually 48 kHz) and 93% of this game's samples are
44.1 kHz native. It is **not measured**: no Windows machine has run it yet,
and wine does not implement exclusive mode, so the numbers above are Linux's
alone.

### Which card, and why the default is usually wrong

`hw:0,0` is card **zero**, device zero, and card zero is whatever the kernel
enumerated first. On the machine these numbers were measured on that is a USB
DAC; the HDMI outputs are card 1, and the motherboard analog jack anybody would
mean is `hw:2,0`. Guessing gets it wrong more often than right, and the failure
is quiet - exclusive falls back to shared and all the latency work above simply
does not happen.

So the list is offered rather than guessed at:

    ez2play --audio-devices          # no window, no --exe, no audio opened

      hw:0,0     DSD TECH USB Audio Device - USB Audio
      hw:1,3     HDA ATI HDMI - HDMI 0
      hw:2,0     HD-Audio Generic - ALC1220 Analog   <- settings.ini names this one
      hw:2,1     HD-Audio Generic - ALC1220 Digital

and the same list is a row on the **TEST MENU → PORT SETTINGS** page,
**AUDIO DEVICE**, whose first choice is `AUTO` - an empty `AudioDevice` in
`settings.ini`, which still means `hw:0,0`. Capture-only PCMs are left out;
they are not somewhere to send a keysound.

It comes from `/proc/asound/pcm` and `/proc/asound/cards`, parsed by
`ez2/alsadev.c` - the file reading is in the platform layer, the format is in
`ez2core` and is tested against canned text, so a build machine with no sound
card still checks it.

    ./ez2play ... --audio-exclusive hw:1,0     # by flag, for one run
    ./ez2play ... --audio-devices              # to find out which

## What is not measured here

* the keyboard's hardware and driver path;
* the compositor's internal pipeline depth;
* the ALSA hardware buffer and the analog output stage.

All three are outside the port. An end-to-end figure would want a high-speed
camera or a loopback rig, which is the only way to settle them.
