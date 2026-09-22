# Gameplay audit — the port against the decomp, 2026-08-30

**Six of the original eight are fixed (eec9264, 2cbe245), plus a ninth the
third pass found (3f11be2).** Finding 5 is modelled with nothing to trigger
it; finding 6 is a feature left open on purpose. Each carries its status
under its own heading.

**The behavioural sweep is complete for the PLAY screen.** Four passes: the first found eight,
the second confirmed the judgement dispatch clean, the third found the dead
gauge, and the fourth established that everything still outstanding is
PRESENTATION - eight unparsed `.pvi` sections, enumerated there with file
counts and with the one whose rule is known spelled out.

A deliberate sweep of the PLAY screen, in the same spirit as the song-select
pass that turned up the missing name rail, the inverted B2/B4 and the
invented "SELECT DIFFICULTY" caption: not "what is missing" but **what the
port asserts that the binary contradicts**.

`../docs/PORT-DELTAS.md` is the mirror of this file written from the decomp
side; its findings 1-16 are all absorbed. Nothing below duplicates them.

## The shape of the result

The **scoring** half of gameplay is on firm ground and this audit found
nothing wrong with it. `PlayerSlot::commit` @0x42e620 is matched at 100%,
`port/oracle/run.sh` runs the original's own object against the port's on
6912 cases, and the hold machine, the gauge deltas, the grade ladder and the
note counter all trace to addresses.

Every finding below is in the **presentation and timing** half — how a note
gets from a chart tick to a pixel, and when its sample sounds. That half was
built before the panel family was read and none of it cites an address.

---

## 1. THE SCROLL IS TICK-BASED. The port's is time-based.

**STATUS: done** (eec9264). `ez2/scroll.[ch]` carries the placement, the
chase and the two randomiser factors; `ez2_tempo_tick_at_ms_f` gives the
fractional cursor; `ez2_song_ini_apply_measure_scale` is called at last, by
both `ez2play` and `ez2judge`. `tests/test_scroll.c` pins the geometry and
the property that matters most - that at the millisecond judgement calls a
note due, the draw has it exactly on the line, across two tempo changes.

**The port** (`tools/ez2play.c`, `draw_playfield`):

    y = jy - (note_ms - now_ms) * speed          /* px per millisecond */

with `speed` derived at `ez2play.c:5274` as

    speed = ez2_scroll_bpm(chart.bpm, pct) / 375.0 * 0.5;

whose own comment calls 375.0 "a constant of the playfield's choosing".

**The binary.** Four independent drawers - `Panel::m42af30` @0x42af30 and
`m42a630` @0x42a630 (keys), `GFPanel::m4637f0` @0x4637f0 and `m463210`
@0x463210 (scratch), `CatchPanel`'s pair, plus the hold-bar copies in
`src/panelholdbar.cpp` and `src/catchhold.cpp` - all place a note as

    y = t - 48/beat * (note.start - now) * st->rate * e->fe8 + e->f08

`note.start` and `now` are **chart ticks**: `now` is `Panel::update`
@0x42d5c0's `f28 = clock->now()`, and `beat` is `Panel::init`'s
`f2c = buf[2]` off the sink's tempo query - 48, the same number
`../docs/PORT-DELTAS.md` settled as "the beat" from the live trace. There is
no millisecond anywhere in the chain.

**Why it matters.** For a constant-BPM chart the two models agree up to a
constant. They diverge on **every chart with a BPM change**: the game keeps
pixels-per-TICK fixed, so a slow section's notes stay the same distance
apart and simply arrive later; the port keeps pixels-per-MILLISECOND fixed,
so a slow section spreads out and a fast one bunches up. The game's own
speed readout being a **BPM** (`songBpm * pct / 100`, @0x41e76e) only makes
sense under the first model.

**And the constant is knowable.** `e->fe8` is the lane's scroll rate, and
`Panel::resetLanes` @0x427680 seeds it from the director's `f320` - which
`m420640` @0x420640 identifies as the .gds **MeasureScale**, forced to 1.6
outside modes 6/7/8/9/12. `../docs/PORT-DELTAS.md` finding 16 ends "Nothing
in the port consumes the scale yet; when the playfield does, it takes it
from here." This is that moment. With `48/beat == 1` and `rate == 1` the
resting geometry is **1.6 px per chart tick = 76.8 px per beat**.

## 2. THE TWO SPEED MODELS ARE SWAPPED in `ez2/speed.h`

**STATUS: done** (eec9264). The header carries the evidence,
`ez2_speed_uses_index()` answers it, and `--speed` is the dial rather than a
pixel rate.

`ez2/speed.h`'s header says "the twelve normal modes: an INDEX" (0..20 into
the ladder at 0x48e6c8) and "CV2Mix: a PERCENT" (50..999). The binary has it
the other way round.

`EZ2DJMainGameDirector::m422f20` @0x422f20 (`src/ez2djkeys.cpp:60`), the
effector's key sink:

    if (key == 9) {                       /* speed up */
        if (g_1b2eb6c == 0) {             /* NOT CV2 */
            g_speedPercent += 25; if (>= 999) = 999; return;
        }
        g_1b2e914 += 1;                   /* CV2: the index */
        if (g_mixStyle != 7) clamp 20; else clamp 3;   /* StreetMix1st */
    }

`g_1b2eb6c == 1` is CV2Mix - proved on the other side of the tree by
`src/songselectctor.cpp`, which takes `system\CV2Mix\SongName\%s.bmp` on
that flag and `system\songname\%s.bmp` otherwise.

**Three more sites agree**, and they are the ones that actually move the
notes - each panel's `update2` picks the same way:

    Panel::update2       @0x429dd0   src/gamepanels.cpp:6204
    GFPanel::update2     @0x462af0   src/gamepanels.cpp:6079
    CatchPanel::update2  @0x471590   src/gamepanels.cpp:5962

        if (g_1b2eb6c == 0)  chase(target = (g_speedPercent * 0.01f) * g_1b2e708);
        else                 chase(target = ladder[slot->speedIndex] * g_1b2e708);

So for the twelve normal modes the scroll multiplier is
**`g_speedPercent / 100`, a 50..999 percent in steps of 25**. The 21-entry
0.25-step ladder is CV2Mix's, and `src/catchkeys.cpp` and `src/gfkeys.cpp`
carry the same split.

**Impact.** `ez2play --speed-index 0..20` and its 1.5x default apply CV2's
model to every mode. The range is wrong (0.25..5.25 against 0.50..9.99), the
step granularity is wrong, and the CV2 clamp to index 3 for StreetMix1st is
attached to the wrong branch.

## 3. A SPEED CHANGE EASES; the port snaps

**STATUS: done** (eec9264) - `ez2_scroll_tick`, including the absence of a
snap.

`chaseKeysScrollRate` (`src/gamepanels.cpp:6125`) moves the live rate
**10% of the remaining gap per tick** and only then calls `setScrollRate`.
The port assigns `speed` outright when the effector steps it.

## 4. THE CHART CARRIES ITS OWN SCROLL MULTIPLIER, and the port drops it

**STATUS: done** (eec9264). Collected at load and walked by the cursor.
Scanning all 12,359 shipped charts found 6333 of these across 24 files, so
this was live data and not a dormant field.

`KEZPlayer::applyEvent` @0x40fc50 (`src/kezplayer.cpp:175`):

    case 7:  g_1b2e708 = ev->v.fvalue;  break;

and `g_1b2e708` is the third factor in every one of the chase targets above.
`src/kezplayerreset.cpp:35` puts it back to 1.0 per stage.

`NoteConvert` @0x410ef0 (`src/note.cpp`) is the on-disk-to-runtime map, and
it renumbers:

    on-disk  0 1 2 3 4 5 6 7  >=8
    runtime  0 1 4 5 9 6 7 8  +2

So runtime kind 7 is **on-disk type 6** - which `ez2/chart.h` declares as
`EZ2_NOTE_T6 /* u32 payload */` and stores in `raw[2]` unread. It is a
**float scroll multiplier**, and it multiplies the scroll rate directly.

Two more names fall out of the same table, worth fixing in `chart.h` while
it is open:

* on-disk type **7** -> runtime 8 -> `Log("Stop")` and nothing else. The
  port's `EZ2_NOTE_T7` is inert at run time.
* on-disk type **3** -> runtime 5 -> `setSpeed(fvalue)`. The port's
  `EZ2_NOTE_BPM` is right; recording it because the renumbering makes it
  look wrong.

## 5. TWO SCROLL RANDOMIZERS, per note and per lane

**STATUS: modelled, no trigger** (eec9264). `ez2_scroll_offset` takes both
factors and `test_scroll.c` pins them, so the geometry is right the moment
something sets them. Nothing does: both are in-game OPTIONS and the port has
no in-game option input (finding 6). Wiring one would mean inventing a
binding, which is the mistake this audit exists to undo.

* **Per note.** `SlotState.rate` is 1.0 from the stage setup
  (`src/stagesetup.cpp:139`) and randomized to **1.0 .. 2.0** by
  `SlotOwner::randomizeHits` @0x422a60. It scales that note's distance.
* **Per lane.** `Panel::resetLanes` @0x427680 multiplies the lane's base
  rate by **0.5 .. 2.5** when `slot->f4a4` is set, and `f3248[]` keeps that
  factor so every later `setScrollRate` re-applies it.

Neither has a port equivalent. Both are options rather than defaults, so
this is a missing feature rather than a wrong default.

## 6. THE IN-GAME OPTION TABLE is unmodelled

**STATUS: open, and deliberately.** The port already has the ALGORITHMS -
`ez2/noteorder.c` implements the windowed scramble, the quarter-slice
shuffle, mirror and rotate, with all three modes' veto rules
(`PORT-DELTAS` findings 13 and 14) - and the effector already drives the
speed. What is missing is the forty-slot option WORD and the input that
sets it mid-song, and the cabinet reaches it through a panel the port does
not draw. That is a feature, not a correction, and it should be built from
the panel outward rather than bolted to a spare key.

`PlayerSlot::m42ebf0` @0x42ebf0 (`src/playeroption.cpp`) is forty options
with an explicit ladder:

    3, 5      scramble the run (3 with the lane check)   m421c30
    4, 0x17   shuffle in quarter slices (4 with check)   m4219c0
    0x15      rotate the lanes once                      rotateLanes
    0x16      mirror                                     reverseLanes
    0x11      re-apply the tracks
    0x12      +5 life
    0x13/0x14 speed down / up, clamped 0 .. 0x21 (33)
    9/0x0a    CV2 only: speed index, clamped 0 .. 0x14 (20)
    anything else, while option 7 is up: randomizeHits

Turning an option **off** clears its word and resets ONLY the speed - every
other effect is permanent for the run. The timed ones run from the clock's
now over `+0x3e0` (x2 .. x10).

Note the second speed counter: the per-player `f4e0`, range 0..33, distinct
from both the effector's `g_speedIndex` and `g_speedPercent`.

## 7. A MISSED NOTE IS SILENT, and the port sounds it

**STATUS: done** (2cbe245). `keysound_pick()` is reseedLane's search,
midpoint test included; the scheduled play is autoplay-only.

The port plays a note's sample when its time passes, in both the autoplay
and the MISS branches (`tools/ez2play.c:5685`), with the comment "a missed
note must not silence the song". It never plays a sample on a hit.

`KEZPlayer::applyEvent` @0x40fc50 (`src/kezplayer.cpp:153`):

    case 1:
        if (a->field_0x00 != 1) { bind; setVolume; setPan; m40f520(a); }

`a->field_0x00` is the lane entry's KIND, written by `setKind` - and the
stage setup gives **every one of the player's track handles kind 1**:

    ((SlotClock *)f3d8)->setKind(h, (g_1b5f2e0 != 0) + 1);
        src/stagesetup.cpp:132, src/gfstagesetup.cpp:118

so the song clock's event walk **skips them**. `g_1b5f2e0` is the autoplay
option (`include/judge.h:25` settles it), and it makes them kind **2** -
which is precisely what makes autoplay audible. The on-demand path is
`KEZPlayer::reseedLane` @0x40ffa0 (slot 32): given a lane it finds the
record nearest the clock, "kind-1 records may sit exactly on the cursor",
and re-runs bind / volume / pan / level. That is a keysound fired by a
press.

**Confirm before implementing:** `src/tinyleaves.cpp` comments `m40f520`
@0x40f520 as "stop the channel's target and mute it" (slot 5 then slot 4
with a zero). In this sequence - bind, volume, pan, then that - it can only
be the retrigger, i.e. slot 4 is play-not-looped. The behavioural conclusion
does not depend on the naming (it rests on the `!= 1` guard plus `setKind`,
and on autoplay's kind 2 being what makes autoplay sound), but the naming
should be settled. Filed in `REQUESTS.md`.

## 8. A per-song speed floor

**STATUS: done** (2cbe245) - `ez2_speed_min_index` / `ez2_speed_step_song`,
applied at the seed as well as at the step, with the variant tag trimmed
first the way `g_songInfoName` is.

`m422f20` again:

    if (_stricmp(g_songInfoName, "11ambit") == 0) { if (g_1b2e914 < 2) g_1b2e914 = 2; }

The speed cannot be stepped below index 2 on **11ambit**. One song, one
constant, and the sort of thing only the binary would say.

---

---

## Second pass, 2026-08-30: the judgement dispatch

The first pass took the judgement on trust from `docs/judge-timing.md`. Read
directly, it is CLEAN, and two things that looked like findings are not:

**The grader has TWO window tables and the port has one - and that is fine.**
`Judge::grade` @0x426500 picks the row by side:

    dt = pressTime - noteTime;
    if (dt < 0) { side = 1; dt = -dt; f24e8 = 1; }   // early
    else        { side = 2;           f24ec = 1; }   // late
    w = &lane->windows[side - 1][5];                 // [0] early, [1] late

so early and late presses are graded against separate ladders. But nothing
ever makes them differ: `setup` @0x426390 copies ONE 24-byte template into
both halves (`*(Tmpl24 *)(p - 12) = tmpl; *(Tmpl24 *)(p - 6) = tmpl;`), and
the only setter, `setWindows` @0x426ea0, writes each value into both
(`ids[i].a.w[k] = ids[i].b.w[k]`). So `ez2_judge`'s symmetric `|dt| <= w` is
right, and this note exists so nobody "fixes" it later.

**And the ladder maps straight onto the port's four .ini fields.**
`setWindows(f310, f30c, f308, f304)` fills entries 5, 4, 3, 2; entries 1 and
0 keep the template's -1, which is what makes grades 1 and 0 unreachable
(no `|dt|` is ever `<= -1`). The catch director's defaults are
`f310 = 6, f30c = 0x18, f308 = 0x24, f304 = 0x48` (src/maingame.cpp:1199) -
i.e. **kool 6, cool 24, good 36, miss 72**, exactly the port's fields in
exactly that order.

**FAST/SLOW is a grade-4 plate only, and the port already has it that way.**
The grader publishes `g_fastCount` / `g_showFast` (or the slow pair) inside
`if (g == 4)` and nowhere else, so the marker rides COOL alone.
`ez2_skin_on_judge` gates on `j == EZ2_J_COOL`.

**One micro-detail, recorded not implemented.** `f24e8` / `f24ec` are set on
EVERY grade call and cleared only inside the `g == 4` block, and the early
test returns before the late one. So a GOOD judged early leaves the early
flag standing, and the next COOL shows FAST whichever side it actually fell
on. It is a carry-over in the original rather than a design, it is invisible
except on the plate, and reproducing it would mean threading state through a
pure function for no gain. Named here so it is a decision, not an oversight.

---

## Third pass, 2026-08-30: the stage end

### 9. A DEAD GAUGE NEVER ENDED THE STAGE

**STATUS: done.** The port ended a stage only at `now > end_ms` - past the
last note - so a player whose gauge hit zero in the first bar still played
the whole chart. `sc.failed` was recorded and shown on the result, and that
was all it did.

The chain in the binary:

    Panel::m429170 @0x429170   count <= 0 latches b118, and
                               `b118 == 1 && g_1b5f19c >= 50` raises
                               the gauge-over flag g_1b2eba4
    update2 @0x4249e0          while g_1b2eba4 is up and countListA() != 2,
                               g_1b2e898 climbs one a tick; at 0x78 (120) it
                               fires m450420(2, 10, ...) - the leave - sets
                               g_1b2ea28 and clears g_1b2eba4

`g_1b5f19c` is the stage's AGE, not a grace period: it is zeroed at stage
reset (src/playerslot.cpp:31) and at the result screens, nothing resets it
when b118 latches, and m420570 @0x420570 uses the same fifty as a start-up
guard ("mode 1 wins only past fifty g_1b5f19c"). So the fifty is "the stage
has begun", and the hundred and twenty is the ramp.

The two-up gate is `countListA() != 2`, and it agrees with the sink's own
raise - checkBothPlayers @0x42e83e fires only when BOTH sides are down,
which the oracle already checks - so the port asks for both.

Verified: with no input at all, 6dancewith now ends at **18.6 s** of a
104.5 s chart with the gauge at 0; under autoplay it still runs the full
110.6 s and reports AUTOPLAY PERFECT.

### And one thing NOT changed, because it is not settled

`ez2/session.h` maps its `failed` input to `g_1b2ea28` @0x1b2ea28, citing
the mode runner @0x417670 - which reads `c = g_1b2ea28` right after
`runMainGame()`, ends the session when `round >= threshold && c == 1`, and
runs the RESULT SCREEN only when `c == 0`. But `g_1b2ea28` is set to 1 on a
normal finish too (m420570 @0x420570's arms, src/ez2djfinish.cpp), not only
on the gauge death (gfsink.cpp:34, `if (0.0f >= self->gauge)`). Taken
literally the result screen would never appear. Something between - the
stage-start clear at src/ez2djupdate2.cpp:67, or what `runMainGame` returns -
must separate the two, and it is not in reconstructed code.

Nothing depends on resolving it: the port feeds the session its own gauge
flag, which is the reading the runner's game-over arm supports. Filed in
REQUESTS.md so the ambiguity is on the record rather than in a comment.

---

## Fourth pass, 2026-08-30: what is left is PRESENTATION, and here it is exactly

The behavioural sweep is done. The last pass went looking for anything that
changes what the game DOES and found none - what remains is art the skins
carry and the port does not read.

### 10. EIGHT `.pvi` SECTIONS GO UNPARSED

`ez2/pvi.c` dispatches fifteen section kinds. Sweeping the section headers of
all **714** shipped `.pvi` files gives this, with the count of files carrying
each:

| section | files | what it holds | parsed |
| --- | --- | --- | --- |
| General, Track1..18, KeyPanel, GrooveGauge, GrooveLight, Judgment, JudgmentTex, CoolBomb, GoodBomb, LongNoteBomb, CoolCombo, MaxCoolCombo, Score, MeasureLine, TargetBar | 637-1076 | the field | yes |
| **ComboGauge** | 160 | a Back/Gauge coord + bitmap pair (`Enable=0` in the one read) | no |
| **Effector** | 62 | the in-game effector panel's layout | no |
| **SpecialNote** | 49 | `NoteAniTexture` - Catch's banana gem | no |
| **PuzzleNote** | 48 | **CORRECTED - see the thirteenth pass.** Not an indicator: a per-note TEXTURE table `[skin][lane]`, swapped in when either of two slot option words is set | no |
| **RubyGauge** | 48 | RubyMix's own gauge | no |
| **ComboEffect** | 48 | `Enable` + three `.str` - the combo burst | no |
| **RubyKeyPanel** | 8 | RubyMix's key panel | no |
| **PlayerSide** | 8 | which side a player's field sits on | no |

None of them changes behaviour. `PuzzleNote` is the *indicator* for options
`ez2/noteorder.c` already implements; `SpecialNote` is one texture prefix;
the two gauges and the two panels are layout.

**ComboEffect: SETTLED 2026-08-31 - IT NEVER FIRES. See the twelfth pass
below before building it.** The rule below is real; the gate is not reachable.

**And ComboEffect is worth its own line because its RULE is known.**
`Panel::m429650` @0x429650 reads the enable and the three charts, and the
press flash `m42d370` @0x42d370 fires them:

    int c = slot->combo;
    if (c >= 5 && c % 5 == 0)
        attach(charts[c / 5 % 3], 0);

so the burst plays on **every fifth combo, cycling three clips**, on the
PRESS - not on every combo change. All 48 files carrying the section are
RubyMix, and they name `comboef5.str`, `comboef1.str`, `comboef4.str`. The
port's `ez2_skin_on_combo` is the combo NUMBER readout (`combo0/00/000/0000`
by digit count), a different thing, and it is correct as it stands.

This is a list to work from, not a defect: every entry is art the port
declines to draw, and each one is a self-contained parse-plus-draw.

---

## Fifth pass, 2026-08-31: the RESULT screen

The play screen's audit found ten; this is the same pass on the screen you
see straight after it. `ResultDirector::update2` @0x451550 is an EIGHT-PHASE
machine on +0x2c40, and the port has none of it - it draws every clip from
frame zero and leaves on a timer.

### 11. THE SCREEN'S LENGTH WAS A WALL CLOCK

**STATUS: done.** The port sat for thirty seconds of real time. Every phase
in the original ends on its own TICK counter: case 4 at `f2c48 >= 0x1e0`
(480) and case 5 at `>= 0x30c` (780). Wall time meant `--fast` could not
shorten it and that the port's own ~125 fps bore no relation to the count.
480 ticks now - the ordinary result; 780 is the battle transfer's, which the
port does not run.

### 12. ONLY START ENDED IT

**STATUS: done.** Cases 2, 3, 4 and 5 all break on
`g_bigInstance->m419780()` - the "something was pressed" test - and the
prologue lets cabinet input 0x26 skip to phase 1 outright. Any input ends it
now, and a press during the roll-up finishes the roll-up first rather than
leaving, which is what a skip lands on in the original.

### 13. THE SCORE DOES NOT ROLL UP

**STATUS: done.** Phase 3 runs `m451040` @0x451040 once a tick -
`m_scoreLatch[id] += m_scoreStep[id]` while anything is pending - and the
phase's exit runs `m4510a0` @0x4510a0, which SNAPS the latch to the real
score. The step is the score over **forty** (src/gfresultctor.cpp:500,
`m_scoreStep[..] = st[9] / 40`), so the count takes forty ticks. The port
drew the final number from frame zero.

**REVERSED 2026-09-03 (SCREEN-AUDIT.md 6.3).** Phase 3 is never entered on
a one-player keys result: `ResultDirector::update2` @0x451550 sets only
phases 1, 4 and 7, nothing in `src/` or the Ghidra dumps writes 2, 3 or 5 to
`f2c40`, and `drawPlayers` @0x451b00 draws the static `m_2c64` every frame.
The number is complete from tick 0 and `result_1p.str`'s own alpha reveals
it. The roll-up the port built on this entry has been removed.

### 14. TWO PHASES THE PORT DOES NOT RUN AT ALL - open

* **Phase 2, the bonus.** `m451180` @0x451180 pays a pending bonus into the
  same word the roll-up gates on, stopping and replaying `m_28ec`
  (`bonus.wav`) as it does. It is gated `g_1b2eb6c != 0 && m_2c3c == 1` -
  CV2, and the all-combo latch - so it is a CV2 all-combo reward. The port
  computes `full_combo` already and shows the stamp; it pays nothing.
* **Phase 5, the battle transfer.** `m450fa0` @0x450fa0 rolls the winner's
  counter up and the loser's down until they meet, then snaps both. Excluded
  in mode 1. The port shows two final numbers side by side.

Neither is wrong on a 1P keys stage, which is why they have not been felt.
Both are needed before the two-player and CV2 results are honest.

## Sixth pass, 2026-08-31: the NAME ENTRY screen

Read `RankingDirector::m45aaf0` @0x45aaf0 (`../src/rankingname.cpp`) line by
line against `run_name_entry`. The port's model of the screen is right and
was already right: the 50-glyph wheel, the 5000-unit ring at 100 per glyph,
the third-of-the-gap ease with the wrap-shortest path and the one-unit snap,
the eighth character forcing the wheel to END and snapping the scroll to
4800, and the all-'A'/all-space rewrite to `EZ2AC_FN`. Two divergences came
out of the arms around them, and both are real.

### 15. DEL WAS NOT REPEATABLE

The stepper has two ways to erase, and they are not the same code. The
BACKSPACE arm (key rows 0 and 2) decrements the cursor, blanks the slot,
**and clears the wheel**. The DEL arm - the wheel parked on glyph 0x31,
confirmed with a white key - decrements and blanks and **leaves the wheel
alone**, which is what makes a second press delete again.

The port cleared the wheel in both, so DEL erased one character and then
started typing 'A's. Fixed: the clear belongs only to backspace.

### 16. BACKING OUT OF A FULL NAME LEFT THE WHEEL ON END

`if (f109db0[a] == 7) f109da8[a] = 0;` - the second, separate clear at the
end of the backspace arm. It fires exactly once, on the transition from a
full eight characters back to seven, and it undoes the clamp the eighth
character imposed: the wheel returns to 'A' rather than staying parked on
the END/DEL pair it was pinned to. Without it the player who typed eight
letters and backspaced one saw END sitting in the picker column.

Fixed. Note the port's clamp itself was already right - `pos >= 8` admits
only 48 and 49, matching `if (n > 0x2f && n <= 0x31)`.

### And the direction, which was already correct

`step = (b == 0) ? 1 : -1` at the head of the function: **the two sides step
the wheel in opposite directions.** Channel 15 (`g_rankKeyDown[0]`) drives
the name wheel -1 on side 0, which is the port's mapping, and it is worth
noting that the same channel drives the SONG SELECT wheel +1
(`../src/songselectinput.cpp:114`). The two wheels genuinely run opposite on
the same physical scratch motion; that is the cabinet's behaviour, not a
transcription slip, and the port reproduces it.

### 17. P2 NAME ENTRY DOES NOT EXIST - open

`run_name_entry` is one side. The original runs both, keyed by `a`/`b`, with
two 50-byte record tables (`this+0x20cc` and `this+0x85e04`), the second
written only when `f85df8 != 0` - the duo flag - and the per-side mirrored
step above. Nothing here is unknown; it is unbuilt, and it lands with the
rest of the two-player work alongside finding 14's battle transfer.

## Seventh pass, 2026-08-31: the RANKING screen

`RankingDirector::m459870` @0x459870 (`../src/rankingwalk.cpp`), the row
drawer `m4574c0` @0x4574c0, the state machine `update2` @0x45bc30
(`../src/rankingtick.cpp`) and the insert `m4570a0` @0x4570a0. The row art
was already transcribed call-exact; everything driving it was invented.

### 18. A SOLO SESSION DREW THE TWO-PLAYER LAYOUT

`m459870` is one source written twice, switched on `countListA()`, and the
call sites settle which runs (`../src/rankingupdate.cpp:128-136`):

    if (countListA() == 2) { m459870(63, scroll0, 0); m459870(383, scroll1, 1); }
    else if (countListA() == 1) { m459870(400, scroll0, 0); }

**One player is ONE column, at x=400.** The port drew the two-player pair at
63 and 383 for every session, with the right-hand one offset by a whole
50-row table - a second copy of the same list, scrolled, which is nowhere in
the original. The two-up branch also has its own geometry, not just its own
x: base 129 instead of 189, bottom edge 451 instead of 465, three rows of
lead instead of two, the head pinning below t=138 instead of t=92, and two
masking bars painted over y<129 and y>444. All of it is now in
`rank_column`, taking `two_up`.

`which` is the SIDE, by the way - each column takes that player's own scroll
and that player's own place. It is not a column index.

### 19. THE SCROLL DRIFTED; IT IS A RAMP TO YOUR OWN PLACE

The port ran `t += 0.75f` a frame and wrapped at the end of the table - an
attract crawl. `update2`'s state 2 is a ramp with a target, and the target is
this session's place times 46:

    if (place < 99 && !done) {
        target = place * 46.0f;
        if (target * 0.5f > t)  t = t * 1.5f + 0.2f;      // below half: MULTIPLY
        else                    t = (target - t) * 0.5f + t;  // past half: HALVE
    }
    if (target - t < 0.5)  t = target;
    if ((int)t / 46 != was)  rankingfall.play();

Two phases. Below half the target it multiplies - and the `+ 0.2` is not
noise, it is what lifts the scroll off a standing zero, since 1.5x alone
never leaves it. Past half it halves the remaining gap. Under half a pixel it
snaps, and every row boundary it crosses plays `rankingfall` - sample[1]
@0x109d88 of the ctor's manifest, which is what the counter falling down the
list sounds like on the cabinet. When both sides have arrived the state
advances.

A session that did not place leaves `place` at 99, the ramp never runs, and
the screen sits on the head of the list. That is the original's behaviour and
it is now the port's.

### 20. THE ROWS DID NOT FADE IN, AND YOUR OWN ROW WAS NOT WHITE

State 1 is `alpha += 10` to 255, about 26 ticks, and the alpha goes to every
row (`f109b44`, the fifth argument of `m4574c0`). The port passed a constant
0xff. And `m459870` draws `row == sel` white against 0x646464 for the rest -
the port passed `white = 0` unconditionally, so the player's own line was
indistinguishable from the table around it. Both fixed; `rank_row` already
took the arguments.

### The place itself

`m4570a0`'s insert point, reused for the display: the first slot whose score
is **strictly** less than the session's, so a tie leaves the incumbent above,
and 99 means it did not place. That is `mode_rank_place`. Computing it is not
writing the table - the port still does not write it, per the note in
`run_ranking_screen`'s header.

### And the name-entry samples were already right

The ctor's manifest (`../src/rankingctor.cpp:217`) maps `sample[0..4]` to
ranking_bgm, rankingfall, rankingmove, rankingnext, rank at 0x109d84..94,
which confirms the previous pass's guesses: the wheel turn is rankingmove,
the keystroke is rankingnext, the confirm is rank.

## Eighth pass, 2026-08-31: the TOTAL RESULT screen - DECODED, NOT BUILT

`TotalResultDirector`: the ctor @0x454990 (`../src/totalresultctor.cpp`,
588 lines), `update` @0x4546e0 and `update2` @0x454800
(`../src/totalresultupdate.cpp`). **The port has no such screen at all** -
not a wrong one, an absent one. Everything needed to build it is decoded and
written down here; one thing is not, and it is the reason this pass stops
short of building.

### 21. THE SCREEN IS UNBUILT - open, and one question blocks it

**What is settled.**

*The state machine* (`update2` @0x454800), five arms laid out 0, 4, 1, 2, 3:

    0: level += 10 -> 0xff, then arm 4
    4: log the three stage song names, then arm 1
    1: wait for a cabinet press (m4191c0) OR frame 0x438 (1080 = 18 s), then
       arm 3 and start the fader down
    3: level -= 10, FLOOR OF ONE (not zero - the compare is against the 1 the
       prologue materialized, and 1 is what is stored back), and tear the
       video down while it is still running

`update` draws every frame: the video, a banner across the top
(blend 9/6, -5,-1, 645 wide), four tween tables unconditionally, a FIFTH in
the four course modes 6..9 which re-seeks to frame 0x33 when it runs out, a
SIXTH always, re-seeking to 0x5a - and in phases 0 and 3 only, the same
-5,-5 645x485 overlay the other result screens use, its alpha from the
level.

*The asset manifest* (the ctor's own strings), radio spelling first:

    System\TotalResult\bg_r.str  |  bg.str
    bg\TRCourse_bg.spv            |  bg\TotalResult.spv
    TotalResult_R.str              |  TotalResult.str
    totalresult_scR.str            |  TotalResult_sc.str
    TotalR_SongName_R.str          |  TotalR_Songname.str
    TotalR_Allcombo_R.str          |  Total_Allcombo.str
    TotalR_csName_R.str            (courses only)
    font\BigFnt_ , font\SmlFnt_   (the two digit fonts)
    system\disc\%s.bmp , system\SongName\%s.bmp
    system\SongSelect\LvFont\LV%02d.bmp
    System\TotalResult\LvFont\lv%02d.bmp
    System\result\ModeIcon\Icon_%s.bmp
    System\TotalResult\AllCombo_not.bmp , AllCombo_not_m.bmp
    System\Channel_Tag\{5radio,radio,10radio,14radio}\%s.bmp
    system\modeselect\fadeblack.bmp , system\result\result_grad.bmp

**THE SCREEN DOES NOT LAY ITSELF OUT.** This is the part worth knowing
before anyone starts: the ctor never draws at a coordinate. It fills CELLS
of the loaded `.str` clip - `setCell(index, 0, texture)` for art and a
digit-run helper for numbers - and the clip carries every position. The
port already has the mechanism (`ez2_bga_clip_set_texture`, layer/slot);
what it lacks is the number helper, which writes a value into a run of
cells through one of the two fonts with a `%04d`/`%07d` format.

*The cell map*, read straight off the ctor:

    9, 0xd, 0x11     the three stage grades (g_1b2ebf8[0..2])
    0x3b             a fourth, course modes 6..9 only (g_1b2ebf8[3])
    0x15, 0x1c, 0x23 the three stage SCORES - and the source switches:
                       mode 10 -> g_1b2f058[0..2]
                       mode 11 -> g_1b2f094[0..2]
                       modes 6..9 and everything else -> g_1b2e590[0..2]
                     ...except the plain arm draws only TWO of them here
    0x3f             the third score, drawn by every mode
    0x2a             the rank art
    0x2e             the TOTAL - the three summed for modes 10 and 11, a
                     precomputed total otherwise
    0x35, 0x38       the rank art and stage art cells (plain modes; the
                     radio arm is out of line and clamps its bonus row
                     to 9999)

`g_1b2e590[5]` is published by `PlayerSlot::m42ef30`
(`../src/playerslot.cpp:855`), so the per-stage scores are already sitting
there when this screen opens - the port has the same numbers.

**What is NOT settled: WHERE IT SITS IN THE FLOW.** Nothing reconstructed
creates this director. `createTotalResultDirector` @0x455ad0 has no `call`
site anywhere in `.text` and its address appears in no table - it is reached
through the `KRuntimeClass` registry by name, and the screen-flow dispatcher
that does the naming is not reconstructed. The one adjacent clue is in the
ranking screen's own exit (`../src/rankingtick.cpp:206`): `g_elemCount >= 2`
- two or more stages played - takes a DIFFERENT exit arm (4, not 5), as do
the course modes. Something branches on multi-stage sessions. That is
consistent with a total-result screen for them and is not proof of where it
goes.

So the port does not place it. Guessing an arcade flow from memory is
exactly what this document exists to catch. Logged in `NEEDS-OWNER.md`.

## Ninth pass, 2026-08-31: the MODE SELECT screen

`ModeSelectDirector::update2` @0x44c860 (`../src/modeselectupdate2.cpp`),
`update` @0x4491b0 (`../src/modeselectupdate.cpp`) and the button confirm
`m44b4b0` @0x44b4b0. Most of this screen was already right and had been done
carefully - the five pages, the FX1 page chord, the white-key confirm with
START as the join, the plate coordinates, the hidden codes, the four sounds.
Two things were not, and one of them is felt on every scroll.

### 22. THE WHEEL WRAPPED; IT CLAMPS

Every per-page arm in the original is a BOUNDED step written twice:

    if (f18 < hi) f18 += 1;   if (f18 >= hi) f18 = hi;      // up
    if (f18 > lo) f18 -= 1;   if (f18 <= lo) f18 = lo;      // down

and that spelling repeats in the held-repeat block and in all four edge
blocks (P1/P2 x up/down) identically. There is no wrap anywhere. The port
wrapped both ways, so scrolling up off StreetMix rolled round to 5KeyMix and
down off 5KeyMix rolled to StreetMix - which the cabinet will not do. Fixed.

### 23. TWO PLAYERS IS A DIFFERENT GRAPH, and the port had it only in a comment

The page chord caps `f9628` at **3** for two players and 4 for one - FOUR
pages, and no special page at all. Its page-3 arm seeds **0xb** (ScratchMix)
where a solo cabinet seeds 0xa (EZ2Catch). The per-page wheel arms halve two
more ranges, and pin a third:

                     one player      two players
      basic            0 .. 2          0 .. 2
      stco             2 .. 5          2 .. 3
      course           6 .. 9          6 .. 7
      casual          10 .. 11         pinned to 11
      special         12               (page absent)

The port's own comment described this and none of it was in code - a duo
session could reach EZ2Catch, which is one-player-only, and the CV2 special
page. Now `kPageSeed2/kPageLo2/kPageHi2` carry the duo graph and the live
one is picked off the join every frame, the way the original re-tests
`countListA()` inside each arm.

And the DRAW follows: `update` @0x4491b0's casual arm blits only the
ScratchMix plate when `f18 == 11 && countListA() == 2`, carrying the full
highlight colour. Catch is absent, not greyed. The port now skips that plate
for a duo session.

### What was checked and found already correct

* the confirm is the white keys (0x0a/0x0c/0x0e for P1, 0x12/0x14/0x16 for
  P2), not START - and `m44b4b0` additionally aborts the confirm if START
  reads 2 or 3, so a white key pressed while holding START does nothing.
  Not modelled, and not observable without deliberately trying it.
* START is the JOIN (`getState(4)`/`getState(5)` -> `m44b290`), resetting the
  page and the cursor
* FX1 is the page chord, gated on neither join key being down
* the plate coordinates, both the vertical stacks and the two horizontal rows
  at y=211
* the hidden codes 6,7,8,9 and 6,7,6,7 on the effector row
* the mode name comes from `g_modeTables[f18 * 260]`, a 260-byte stride

The `f9454 >= 10` variant of the page chord was read and is functionally
identical to the other branch - the cases that differ are unreachable under
their own caps.

## Tenth pass, 2026-08-31: the TITLE screen's version plate

`TitleDirector`'s ctor @0x44e9b0 (`../src/titlector.cpp:163`), ticked by
`update` @0x44df60. The title screen had been worked over carefully already -
the background chart, the logo, the scanline, the prompt, the closing chart,
the START handoff. One piece was flagged in its own comment as "wants its
digits set through setCell and is not drawn yet". Now it is.

### 24. THE VERSION PLATE

Two spellings, on the +0xa48 chart under `System\Title`: at or under 999 it
is `common\ver.str`, over 999 `common\ver_over.str` with a fourth digit.
The cells are **1, 2, 4, 5 - three is skipped**, and each takes one of the
ten `common\ver_%d.bmp` glyphs:

    cell 1   thousands   (over form only)
    cell 2   hundreds
    cell 3   -- NOT SET: the separator, drawn by the .str itself
    cell 4   tens
    cell 5   ones

The number is `GameVersion` from `system\title\common\version.ini`, one of
the three profiles `KEngineApp::loadProfiles` @0x401240 loads through the same
encrypted-ini path as `EZ2AC.ini` (`../src/settings.cpp:123`). A file that
will not load leaves it at zero, which is the original's own fallback and now
the port's.

**Verified against the install: `GameVersion = 150`**, so the plate reads
1.50 - and that the dot falls in the skipped cell 3 is confirmation of the
cell map rather than an assumption about it. The tree also ships `ver_dot.abm`
and `ver_blank.abm` beside the ten digits, which is the same story from the
other side.

Two details worth keeping: the ctor really does load `ver.str` **twice** in
the under-1000 case (unconditionally, then again inside the arm) - what an
if/else edited from a common ancestor looks like, harmless, not reproduced.
And the digit glyphs must be handed to `ez2_bga_clip_set_texture` as
GAME-RELATIVE `.bmp` names: the tree ships `.abm` and only `ezTextureLoad`
knows the fallback, so resolving the path first would silently set no digits.

`ez2_ini_int_at` was split out of `ez2_operator_ini_int` for this - the same
parser against any profile path.

### Still open on this screen

The attract/demo loop. `update2` @0x44f4d0 restarts the attract song on
"whichever object the cabinet's state selects", and its three early exits
(inputs 1, 0x1c and 3) hand different values to the screen-advance slot -
input 3 being the start-a-game path, the other two menu escapes. The port
has START and the test/service keys and no attract rotation. Not a defect
of anything present; a screen behaviour not built.

## Eleventh pass, 2026-08-31: the RADIO CHANNEL wheel

`SongSelectDirector::inputRadioMix` @0x43cf30 and its three siblings -
`input5RadioMix` @0x43dc00, `input10RadioMix` @0x43e8d0, `input14RadioMix`
@0x43f390 (`../src/songselectinput.cpp`). The port's channel select gets its
own screen on the shared model and its comment already claimed the wheel is
un-eased. Reading the four handlers confirms that and turns up one thing they
have that the port did not.

### The un-eased claim is TRUE, and now it is evidenced

Every other wheel in that file - RubyMix, 5Key, Scratch, Street, Space, Club,
7Street, Catch, CV2 - steps with three statements together:

    f_bfdd8 = f84;  m_be8d8.reset();  f_20c0d8 += k_twoPi / (float)f7c;  f84 += 1;

a saved previous index, a transition chart restarted, and the ring rotated by
2*pi/rows. **The four radio handlers have none of it** - their arms are a bare
`f84 -= 1` / `f84 += 1` and a sound. They are also the only ones written
`else if`, so the two directions are mutually exclusive rather than two
independent tests that can cancel. And channel 0x0f steps the index DOWN
here where the song wheels step it up.

### 25. NO HOLD-TO-SPIN

What they do have is the repeat, and the port had no repeat at all - a held
scratch did nothing after the first step. The rule is the 150-tick arm every
wheel shares (`heldFor(0x1e) >= 0x96` gates the counter) and then:

    if (... || f_c0e20 >= 5) { f84 -= 1; ...; f_c0e20 = 0; }

**Threshold 5, and the counter RESETS on the step** - so the channels advance
once every five ticks for as long as it is held. That reset is the whole
difference from the song wheel, whose `> 0xa` / `> 3` arms never reset and so
step every single tick once they arm. Implemented, with `EZ2_WHEEL_REP_RADIO`
documented next to the two song-wheel constants.

P2's arms carry no repeat term at all - only the accumulator and the two key
edges. Not modelled; the port's channel select is one-sided anyway.

### And the song wheel was checked and is right

While in the file: the port's `ez2_select_wheel_step` already carries the
`count < 8` split that the nine non-radio handlers take - accumulator
threshold 0x14 against 0xa, repeat threshold 0xa against 3 - so a short wheel
really is stiffer to turn than a long one, and the port has had that right.

## Twelfth pass, 2026-08-31: ComboEffect is DEAD CODE - do not build it

Finding 10 listed the combo burst as the most attractive of the eight
unparsed `.pvi` sections, because its rule is fully known. Going to build it
turned up the reason it has never been seen on the cabinet.

`Panel::m429650` @0x429650 (`../src/panelgds.cpp:367`) parses the section -
an int, then three `.str` names, then the chart element the slot picks:

    readGdsInt(&f1dd4, p);          // the section's own Enable
    readGdsStr(&f1dd8, ...);        // comboef5.str
    readGdsStr(&f1ddc, ...);        // comboef1.str
    readGdsStr(&f1de0, ...);        // comboef4.str
    f1de4 = &g_panelCharts7[slot->index];
    optional = &g_panelChartSingle;
    f1dd4 = g_1b2e920;              // <-- AND THROWS THE Enable AWAY

**The last line overwrites the value it just read with a global.** The press
flash `m42d370` @0x42d370 then gates on that overwritten field:

    if (p->f1dd4 != 0) {
        int c = SLOT->f1dc;
        if (c >= 5 && c % 5 == 0)
            p->f1de4->attach((&p->f1dd8)[c / 5 % 3], 0);
    }

So the effect does not depend on the `.pvi` at all - it depends on
`g_1b2e920`. And `g_1b2e920`:

* is a plain int with no initialiser, at VA 0x1b2e920, which is **past the
  end of the image file** - BSS, zero at load;
* has exactly **two references in the whole of `.text`**, at 0x4296cc and
  0x471272, and both are `mov eax,[g]` - the two parser reads above
  (`Panel::m429650` and its Catch twin `CatchPanel::m471200` @0x471200,
  which does the identical overwrite into `f1c50`).

Nothing writes it. Ever. The gate is zero for the life of the process, the
burst never attaches, and the three `comboef*.str` clips the 48 RubyMix
`.pvi` files name are loaded and never played.

**So the port must NOT build it.** An effect the cabinet does not show is
exactly the class of thing this document exists to keep out, and this one
would have looked well-evidenced right up to the gate.

Two things worth keeping from the read anyway:

* `c / 5 % 3` starts the cycle at **index 1**, not 0 - combo 5 picks the
  second clip, 10 the third, 15 the first. Written down in case the gate ever
  turns out to be reachable from something unreconstructed.
* the same overwrite-what-you-just-read shape appears in
  `GFMainGameDirector`'s General arm, so it is an idiom in this codebase
  rather than a one-off slip - worth suspecting wherever a `.pvi` "Enable"
  seems not to matter.

The other seven sections of finding 10 stand as listed. `PuzzleNote`,
`SpecialNote`, `RubyGauge`, `RubyKeyPanel`, `ComboGauge`, `Effector` and
`PlayerSide` have not been checked for a gate of this kind; **each should be,
before it is built.**

## Thirteenth pass, 2026-08-31: the other seven sections, gate-checked

Having found ComboEffect's gate unreachable, the same question was put to the
rest of finding 10's list: is each section's Enable actually tested, and does
anything overwrite it the way `m429650` does?

**The overwrite is unique to ComboEffect.** Sweeping the panel loaders for
`field = g_...;` after a `readGdsInt` turns up only the two `g_1b2e920`
twins. (`g_1b2ea30` appears seven times but it is a clamp on a texture-series
index, a different thing.) So no other section is silently disabled.

Each Enable, and where it is tested:

| section | field | tested at | live |
| --- | --- | --- | --- |
| ComboGauge | `s1bd4.f00` | gamepanels.cpp:2432 | yes |
| RubyGauge | `f1c28` | panelgauge.cpp:28 | yes |
| Effector | `f1d30` | gamepanels.cpp:2438, 2830, 3762 (+3) | yes |
| RubyKeyPanel | `f1de8` | gamepanels.cpp:3876, panelpress.cpp:69 | yes |
| SpecialNote | (none) | six textures, no Enable | n/a |
| **PuzzleNote** | `f1e08` | **nowhere** | see below |

### 26. PUZZLENOTE IS NOT AN INDICATOR - finding 10 had it wrong

Finding 10 described PuzzleNote as "the note-order options' on-screen
indicator", read off the section's field names (FadeOut / FadeIn / Blink /
Random / SuperRandom / ManiacRandom / 4D). Its **use** says otherwise.

`m429770` @0x429770 parses an Enable and then **nine** six-texture series -
eight into `f1e0c[0..7][0..5]` and a ninth into `f268c`. The Enable is never
tested anywhere. The table is, at `../src/gamepanels.cpp:2086`:

    if (slot->f4f4 != 0 || slot->f51c != 0) {
        int v = st.skin;
        if (v == -1)          voice = e->f68[col];       // the normal texture
        else {
            KTexture *o = f1e0c[v][col];                 // [skin][lane]
            voice = o ? o : e->f68[0];
        }
    }

So it is a **per-note texture swap**: with either option word set, every note
whose record carries a skin index other than -1 draws from this table instead
of the lane's normal texture, indexed by that index and the lane. The two
walkers in `../src/holdtick.cpp:850` and `:942` take the same gate with the
same `st.skin != -1` test, so holds reskin too. `include/gamepanels.h:120`
says as much in one line: "Either of these asks the walkers to reskin notes
per st.offset."

The ninth series, `f268c`, has **no reader at all**.

**What is not established** is which player-facing option sets `f4f4` /
`f51c`. Both are option words inside the slot's 0x474..0x5b4 block
(`../src/stagesetup.cpp:11`), and stage setup also uses each to trigger a
sample-claiming pass (`m42f080` / `m42f1a0`) - but those two are about hold
SAMPLE handles, not skins, so they do not name the option. Until one of them
is named, the port cannot know when to turn the swap on, and building the
table without the trigger would draw nothing or draw it always.

Filed rather than built. This is the honest state: the mechanism is fully
read, the trigger is not.

## Fourteenth pass, 2026-08-31: the CV2 scroll reads a DIFFERENT ladder AND a
## different variable

Chasing `slot->f4e0` - the "second speed counter" finding 6 noted in passing -
turned up that `ez2/speed.h` describes the CV2 arm of the panels wrongly, and
the port's CV2 scroll is built on that description.

### 27. `g_panelRateLadder[slot->f4e0]`, not `ladder[g_1b2e914]`

`Panel::update2` @0x429dd0 (`../src/gamepanels.cpp:6203`):

    if (g_1b2eb6c == 0)  chaseKeysScrollRate(this, (g_speedPercent * 0.01f) * g_1b2e708);
    else                 chaseKeysScrollRate(this, g_panelRateLadder[slot->f4e0] * g_1b2e708);

The non-CV2 arm is what the port has. The CV2 arm is wrong twice over.

**Wrong table.** There are three quarter-step ladders in the image and they
are not the same:

| symbol | VA | shape |
| --- | --- | --- |
| (the CV2 effector's) | 0x48e6c8 | 0.25 to 5.25, 21 entries, even 0.25 steps |
| `g_panelSpeedLadder` | 0x4901a0 | the same run again - a copy |
| **`g_panelRateLadder`** | **0x490228** | **1, 1.5, 2, then 0.25 steps to 6, then 10, then 99** |

The scroll uses the third. Its **floor is 1.0x where the port's table starts
at 0.25x**, its first two steps are halves rather than quarters, and it ends
in two escape values, 10 and 99, that the even run has no equivalent for.
`ez2/speed.c`'s `kSpeed[]` is the 0x48e6c8 run and is right for what it is -
the effector's dial - but it is not what moves the notes.

**Wrong variable.** `slot->f4e0` is PER-PLAYER and the effector's keys never
touch it. It moves only in the in-game option table
(`PlayerSlot::m42ebf0` @0x42ebf0): options 9 and 10 step it in CV2, clamped
0..0x14; options 0x13 and 0x14 step it elsewhere, clamped 0..0x21; switching
either of the latter OFF resets it to `speedBase`, which stage setup takes
from `opts[13].b` (`../src/stagesetup.cpp:190`). Nothing else writes it.

The evidence that the effector is not in this path is a scan rather than a
reading: **`g_1b2e914` has 29 references in `.text`, 11 of them reads, and
not one read is in a panel** - they are the effector director (0x41cc64,
0x41cc9f, 0x41db72, 0x41e4c5), its own key sink (0x422f71, 0x423015,
0x423029) and the scratch/catch sinks. What `g_1b2e914` does drive is the
effector's own DISPLAY - `m_speedIndex` at +0x28 picks a texture
(`../src/panels.cpp:958`) - and it is carried between screens through
`g_1b2f06c`, which has six references and exactly **one** read, at 0x43585a
in song select.

### All three panels agree, which makes the design plain

The same check on the other two:

    GFPanel::update2    @0x462af0:  g_gfSpeedLadder[slot->f2f0]    @0x49a268
    CatchPanel::update2 @0x471590:  g_catchSpeedLadder[slot->f474] @0x49df40

Reading all five tables out of the image settles what they are. There are not
five ladders; there are **two**, each stored more than once:

* **THE DIAL** - 0.25 to 5.25 in even quarter steps. At 0x48e6c8 (the CV2
  effector's) and 0x4901a0 (`g_panelSpeedLadder`). Used for the effector's
  display and as the readout's gate, never for scrolling.
* **THE SCROLL** - 1, 1.5, 2, then quarter steps to 6, then 10, then 99. At
  0x490228, 0x49a268 and 0x49df40 - **one copy per panel class, and the three
  are identical to the float.**

So this is not a quirk of the keys panel: every game type scrolls off the same
rate ladder, indexed by its own per-player rung (`f4e0` / `f2f0` / `f474`),
each moved only by that game's option switch. Whoever builds the option panel
needs **one** table, not three.

### Not fixed, and why

The complete fix needs the option table, which finding 6 leaves open
deliberately. Swapping the port to `g_panelRateLadder` while still indexing
it with the effector's counter would drive the right curve from the wrong
variable - a new invention in place of the old one. So `ez2/speed.h` is
corrected in place, loudly, and behaviour is left alone.

**This raises finding 6's priority.** It was filed as "a feature, not a
correction"; it now also owns the CV2 scroll rate, which is a correction.

## Fifteenth pass, 2026-08-31: every cited address, mechanically

Finding 27 was a port header describing the binary with the wrong symbol in
it. That is mechanically checkable across the whole port, so it was:

* the decomp annotates **3369** addresses across `src/` and `include/`;
* the port cites **419** distinct addresses in the `.text`/`.rdata` range;
* **125** of those are not themselves annotated - but almost all are
  *interior* addresses, citing a particular instruction inside a function,
  which is deliberate and precise;
* narrowing to citations more than 0x600 past **any** annotated start leaves
  **21**, and all 21 sit inside the enormous song-select input handlers
  (`inputRubyMix` @0x43b8d0 and its twelve siblings run to 2-3 KB each), the
  mode-select update, or the ranking ctor.

Spot-checking the five that a comment calls a *function* ("the ctor
@0x448550", "the loader @0x4580e0", "the creator @0x458143") against a known
function start makes the contrast plain: `createTotalResultDirector`
@0x455ad0 is preceded by int3 padding and opens with a prologue, while all
five of those are preceded by ordinary code and start mid-stream. They are
interior addresses too - the wording is loose, the address is not wrong, and
the behaviour each describes was read from the right place.

**No second instance of finding 27 was found.** Recording the negative
result because it bounds the risk: the port's citations are sound, and
finding 27 was a mis-transcription of one expression rather than a habit.

## Sixteenth pass, 2026-08-31: sweeping the shipped assets

Two library-wide sweeps, both now permanent tests rather than one-off runs.

### The `.str` clips - and their ART

`tests/test_strscr.c` already walked every shipped clip for PARSE
correctness. It did not check that the art a clip names can be found, which
is the other half of getting a clip on screen and the harder half: a clip may
name `back` with no extension at all, or `fire.bmp` where the tree ships
`FIRE.abm`. The sweep now calls the same two library functions `scene/bga.c`
does, so it cannot drift from the renderer.

**127,441 texture references across 10,593 clips; 4,271 unresolved across 541
files - 3.4%.** Not a defect: `bg/stayrm/dance2.str` wants `girldance1xxxx`
and that directory holds no such file at all, so the cabinet has the same
gaps. The assertion pins the RULE, not the number - break the `.abm` fallback
or the case-insensitive lookup and it jumps by an order of magnitude.

### 28. THE `.pvi` EXTENSION CARRIES TWO FORMATS

`tests/test_pvi.c` checked eleven skins - the `STYLE_<mode>1_0.pvi` the game
opens by default. The tree carries **714**, the rest being the other styles,
the Black variants, the CV2 sub-modes and the 2P copies, and a parser that
choked on one of those would show as a blank play-field on exactly the option
nobody tests by hand. Sweeping all 714 found one that would not parse:
**`system/infoview/infoview.pvi`**, which has a `[Score]` section and no
`[General]` at all.

The parser is right to reject it, and the game agrees. `LoadPVI` @0x428700
(`../src/panelgds.cpp:209`) finishes the play-field descriptor, then changes
into `System\infoview` and reads `infoview.pvi` with a **second KParser** -
the decomp's own note calls it "a one-arm loop that only recognizes Score".
Two schemas, one extension, two parsers.

So the count stands at **714 files, 0 unparsed, 1 carrying no `[General]`,
713 declaring a Track1, and 431 unmodelled sections** - and that last number
is finding 10's hand-made census, now pinned. A section that silently stops
being recognised moves it, and nothing else here would notice.

**The port has no infoview reader.** It is one score readout on a screen the
port does not draw; noted rather than built.

## Seventeenth pass, 2026-08-31: every asset the game loads, against the port

The owner's CV2 and EZ2Catch reports were all one shape - a per-mode branch
the port had flattened to a single arm. That is sweepable: extract every asset
literal in the decomp (601 of them) and check each against everything the port
mentions, ignoring `.wav` / `.ssf` spelling since the tree substitutes.

It found, and these are fixed: the result PANEL and READOUT ladders (radio,
Catch and CV2 all wearing the keys pair), the catcher's `.str` clip, and the
song select's "uses keys" legend.

**What remains unreferenced is almost entirely screens the port does not
build** - the 2P and battle set, coin and credit art, the scratch result, the
total result, `showcredit`. Three leftovers were looked at individually and
none is work the port can honestly do today:

* **Per-tier disc art** (`system\disc\%s-hd.bmp` and friends) - a FALSE
  POSITIVE of the first, buggier sweep, which treated a leaf beginning with
  `%s` as its own stem. The port has done this all along, including the NM
  face `m431ae0` @0x431ae0 shows for the under-180 half of the disc's swing.
* **The result screen's spare voices** - `bonus.wav`, `NextStage.wav`,
  `fNextStage.wav`, `SetBonus.wav`, `BattleMessage.wav`. The ctor @0x451f10
  creates all five and **no reconstructed code plays any of them**; the tick
  @0x451550 touches only the CV2-gated third object at +0x28fc. Unlike
  ComboEffect these are object members rather than globals, so the
  reference-scan that settled that one cannot settle this. Placing them would
  mean inventing when they fire.
* **`difficulty_1p.str`** - not the difficulty panel of the main song select
  at all. It belongs to `InGameSongSelect` @0x4259c0, the between-stage course
  wheel, and loads from `system\clubmix\panel\`.

The sweep is recorded here because a negative result bounds the risk: after
this session's fixes, the port asks for everything the game asks for on every
screen it draws.

## Eighteenth pass, 2026-08-31: the per-MODE branches, not just the CV2 flag

The result-panel finding was a `g_modeIndex == 10` branch rather than a CV2
one, so the same sweep was run over `g_modeIndex ==`: **189 branches** across
the decomp. Most sit in screens the port does not build (`totalresultctor`
has 38 of them). The two that matter were checked:

* **`songselectdiffsel`** - the category pager on FX2/FX3. Its per-mode SKIPS
  (RubyMix jumps categories 0x1e..0x24 straight to 0x25, 5KeyMix 0x23..0x24 to
  0x25, and the mirrors going back up) and its gate - no pager at all in the
  radio modes or CV2 - are **already implemented exactly** in the port. Clean.
* **`resultctor`** - the panel, background and readout ladders are now done.
  The remaining branches are almost all the radio family, and they carry one
  real difference, below.

### 29. THE RADIO RESULT SHOWS A CHANNEL TAG, NOT A DIFFICULTY TAG - open

`../src/resultctor.cpp:508`: in modes 6..9 the ctor loads
`System\Channel_Tag\<family>\<channelName>.bmp` into `texChanTag`, where
every other mode loads `System\Result\Diff_Normal.bmp` and its three
siblings. The port fills that cell (`RSongDraw` cell 4) with the difficulty
tag for every mode, so a course result wears a difficulty it does not have.

**Two things stop this being a five-line fix.**

First, plumbing: `PlayResult` carries no channel name, and the result screen
would need one from the course.

Second, and the reason it is filed rather than guessed: **the mode-to-directory
map looks wrong in the original.** The ctor sends mode 6 to `Channel_Tag\Radio`
and mode 7 to `Channel_Tag\Radio` - the same directory - while modes 8 and 9
get `10Radio` and `14Radio`. But mode 6 is 5RadioMix, `Channel_Tag\5radio`
exists with **89** files where `Radio` has 56, and the SONG SELECT ctor sends
mode 6 to `channel_disc\5radio` (`../src/songselectctor.cpp:795`). All four
directories hold the same channel names in per-family art, so a 5Radio channel
that is not also in `Radio\` would find no tag at all on the cabinet.

That reads as a copy-paste slip in the original, and reproducing it faithfully
means some 5Radio results show no tag. Whether to match the cabinet or fix it
is the owner's call, so it is in `NEEDS-OWNER.md`.

## What was checked and found CLEAN

* **the play field itself, by eye, 2026-08-31** - captured headlessly at
  `--frames 1200` (9.6 s of chart on the virtual clock): the five-key panel,
  the gauge column, the judgement line, the score and combo readouts, the
  `.spv` movie behind, the grade percentage, and the in-lane COMBO plate
  drawn CENTRED on the lane. Two notes judged KOOL, score and gauge moved
  with them. One thing to know for anyone repeating it: with
  `SDL_AUDIODRIVER=dummy` and no `--fast` the chart clock does not advance,
  so the lane looks empty and nothing judges - that is the harness, not the
  game. Use `--fast`, which runs the virtual clock.
* **every asset class the port reads**, swept against the shipped tree by a
  test rather than by a note in a comment - see the sixteenth pass and the
  commits around it: 12,361 `.ez`/`.ezi`, 10,593 `.str` + 314 `.scr` (and
  their 127,441 texture references), 714 `.pvi`, 62,201 `.abm`, 179,542
  `.ssf`, 23 `.gds`.

## Reported 2026-09-01: three CV2Mix defects

Reported from play: the CV2 song select is silent, it opens a difficulty tab it
should not have, and the field wears the wrong panel. Three separate causes,
all of them the same shape - **CV2Mix is a container of ten modes and almost
every screen branches on its flag**, and the port took the ordinary arm.

### 1. The song select had no music

`update2` @0x446540's pump says which voice each mode owns:

    if (g_1b2eb6c == 0) { if (!playing) m_sndPreview->restart(); }
    else                { if (!playing) m_bfd44->restart(); }

`m_bfd44` is `System\CV2Mix\ModeSelect\Modeselect.wav`, loaded with the LOOP
flag by the ctor (src/songselectctor.cpp:918) - a 57-second bed. **CV2 plays a
looping BGM; every other mode plays the cursor song's preview.**

The port ran the preview path for all modes, and CV2's table **keys by
NUMBER** - `92` for `11ambit-5o1` - so it asked for `system\preview\92.ssf`,
found nothing, and the screen sat in silence. Now loaded once into the same
handle the preview uses, so every teardown already frees it.

### 2. It opened a difficulty tab

**CV2Mix does not use tiers at all** - `ez2/songdb.h` already recorded the
sweep: it names by `<song>-<variant>` and ships ONE chart per entry, all 99
resolving that way, with the tier walk finding none of them. Confirmed again
here: every entry returns exactly one chart. So the confirm now goes straight
to the game, where the port was opening a page with one row on it.

### 3. The field wore the wrong panel

`PlayerSlot::m430b50` @0x430b50 picks the panel DIRECTORY on the CV2 flag -
`"System\CV2Mix\%s\Panel", g_styleTag` against `"System\%s\Panel",
g_modeName` - and `PlayerRecord::m465d90` @0x465d90 does the same for the
scratch player. `ez2/pvi.c` tried the plain directory FIRST and CV2's only as a
fallback, so a sub-mode that also exists on its own - 5KeyMix does - won, and a
CV2 chart came up in 5KeyMix's field. They are different files:
`system/5keymix/panel/STYLE_5KeyMix1_0.pvi` is 10,016 bytes,
`system/CV2Mix/5keymix/panel/` 6,836.

**And the style number is fixed at ONE under CV2.** Both setups build
`STYLE_<tag>1_` (the scratch player hard-codes `STYLE_ScratchMix1_%d.pvi`);
neither consults the song select's style cycler, which belongs to the ordinary
modes. The port was passing the cycler and asking for a variant CV2 does not
ship.

`ez2_pvi_load_variant` and `ez2_skin_load_ex` now take a `cv2` flag that
decides which directory wins; the other is still tried as a fallback, so a tree
missing one still gets a field rather than none.

**Not verified by running it.** The BGM and the panel are confirmed loaded (the
path resolves, the file differs); the confirm going straight to the game is on
the interactive path, which autoplay bypasses - the reporter is the test.

## Reported 2026-08-31: ScratchMix played like 5-key

Reported from play: turntable mode plays like 5KeyMix, when it should be *hold
the notes and validate them by scratching*. Correct - and the reason the port
got it wrong is that **the mode's lane map gives nothing away**. Its own `.gds`
(`system\scratchmix\ScratchMix.gds`) declares a perfectly ordinary layout -
five key lanes on codes 10..14, the turntable on 15/16, the pedal on 17 - so a
port that reads the descriptor and stops there builds a 5-key game, which is
exactly what happened.

**ScratchMix is a fret-and-strum game**, and that lives in the director, not
the descriptor. `GFMainGameDirector::m45d200` @0x45d200 - GF *is* ScratchMix
(include/ezscreen.h:804) - splits its keys into two roles:

* **the TURNTABLE is the STRUM.** Codes 0x0f/0x10 (0x17/0x18 for side two) are
  read as a PAIR and drive `pick`, with a latch that counts up while held and
  drops past six frames (`if (bx[0] > 6) { pick = 0; bx[0] = 0; }`). The entry
  is marked on the judge (`setF0(lane, 1)`) and never judged as a lane;
* **the five keys are FRETS, and alone they do nothing.** The arm forces a
  held fret's state to 1 whenever no strum is latched - `if (bx[0] == 0 &&
  bx[2] == 0) st = 1;` - so it never CHANGES, and the dispatcher below only
  fires on a change. A press reaches the player exactly when a fresh strum
  lands with the fret down: `if (pick == 2) if (st == 2) if (bx[0] > 0 ||
  bx[2] > 0) handleEvent(i, 1)` - kind 1, judgePress
  (`PlayerRecord::handleEvent` @0x466da0, whose header note also records that
  **the scratch game has no kind 3**: no held-key pump, so no hold
  instalments).

**The shipped charts agree, and that is the check that settles it.** A
ScratchMix chart carries every note on its five Lines; the turntable and pedal
tracks are EMPTY, and there is not one hold-length note in the file. So the
"hold" in the report is the fret key in your hand, not a hold note - and the
mode having no holds at all is why the hold pump is missing from its judge.

Built in `tools/ez2play.c`: a fret press outside the latch sounds nothing and
judges nothing; a strum arms the latch and then plays and judges every fret
that is down; a fret pressed inside the latch still counts. The pedal is
excluded from the fret set, as `m45d200`'s own `code != 0x11 && code != 0x19`
excludes it.

**Two knowing divergences.** The latch is six frames measured in milliseconds
(the play loop is not paced - see the entry above), and it runs from the strum
rather than from the scratch still being held; the original drops `pick` when
the scratch is released, which this does not model. Both are noted here rather
than hidden.

**Not verified by running it.** Autoplay bypasses the input path entirely, so
`play_autoplay` proves only that nothing regressed - ScratchMix still
autoplays 686/686 KOOL. The strum itself needs hands on a keyboard, and the
reporter is the test.

## Reported 2026-08-31: GET READY START ran ~80x too fast

Reported from play, the day after the READY sequence was built: it goes by in
an instant. Measured, and it was **about eighty times** too quick - the whole
380-frame clip in roughly 79 ms.

The clip is authored at **60 fps** (`fps` is 60 in every `.str` the game
ships). I advanced it one frame per loop ITERATION, which is only the same
thing if the loop runs at 60. It does not:

* every OTHER screen in `ez2play` paces itself - `ezSleepMs(16)`, commented
  "the clip's own frame rate" in `run_clip_screen`, and `ezSleepMs(fast ? 0 :
  16)` on the mode select - so a per-iteration counter is right on those;
* the **PLAY loop deliberately does not**, so the picture is as fresh as the
  compositor will take it (`../LATENCY.md`: the loop never calls
  `SDL_GL_SetSwapInterval`, and even a vsynced loop would be 240 on this
  screen). Measured here: **~4,800 iterations a second**.

So the count now advances on a real clock and derives its frame from elapsed
milliseconds at the clip's own 60. Measured after the fix:

| clock | result |
| --- | --- |
| real | count ends after **6334 ms** - the 380 frames it is authored for |
| `--fast` | 6333 ms of clip time in 379 iterations, deterministic for tests |

**The same mistake was in the lamps**, unreported because it needs hardware to
see: `ez2_lamps_blink` is "fifteen frames of thirty" and BattleMode's pulse
"forty of sixty", and both were stepping once per iteration inside the same
unpaced loop - a one-second blink at 4,800 Hz. `ez2_lights_frame` now takes an
`advance` flag saying whether this iteration is a 60 Hz tick; the tracking, the
routing and the hardware write still happen every call, because those follow
the buttons rather than the clock.

**The rule this leaves behind:** a `.str` is a 60 fps artefact, and anything
driven by its frame number has to be driven by a clock. Only the paced screens
may count iterations, and the play loop is not one of them.

## Reported 2026-08-31: the mode select handed over too fast - AND THE FIX WAS WRONG

Reported from play: the mode select cuts to the song select faster than the
attract screen cuts to the mode select. I read `ModeSelectDirector::update2`
@0x44c860's case 3, found its 65-frame `Mode_Intro.str` hold, and built it into
`run_mode_select`. **The reporter then saw the transition play twice, which is
what it now did**, and reverted is where it stands.

**The port already had it.** `run_mode_intro` (tools/ez2play.c) models
`DrawModeIntroDirector` @0x46a260 - a screen of its own that attaches the same
`VF_ModeInout\Mode_Intro.str`, stamps the mode's plate into cells 4 and 5, and
plays `ModeIntro.wav` - and the session already ran it between the mode select
and the first song select, with a comment saying so in as many words: *"the
intro a player actually sees is the one between mode select and the first song
select (DrawModeIntroDirector), so play it here, once."* Adding the mode
select's own copy made two.

**The lesson is the cheap one and I paid full price for it:** grep for the
asset before building the behaviour. `Mode_Intro.str` was already in this file,
with its address, its cell numbers and a note about why it runs where it runs.
One `grep Mode_Intro` before writing a line would have found all of it.

**What is still genuinely open.** The reconstruction really does show
`Mode_Intro.str` in two places - `ModeSelectDirector`'s `m_1a40` under case 3
(setCell **1** and 5) *and* `DrawModeIntroDirector`'s `m_10` (setCell **4** and
5) - and case 3 really does gate the screen's exit on `m_1a40.isDone() &&
f9434 >= 0x1a4`. Whether the cabinet therefore plays the animation twice, or
whether the two are one continuous moment, is not settled by reading: the
reporter says twice is wrong, and that is the only evidence either way. So the
hold is NOT built, and if the hand-off still feels quick the thing to try is a
wait that does not replay the art - the BGM stop and a held last frame - rather
than a second run of the clip.

Also read while there, and untouched: case 3 stops the BGM on entry, and update
@0x44c1c0 draws `fadeBlack` only in states 0 and 2, so no fade runs under the
intro on the cabinet.

## Reported 2026-08-31: the stage began the instant it loaded

Reported from play: a song should not start the moment the gameplay scene
appears - there is a READY sequence first. Correct, and the port had none: it
opened the chart and started the clock on the same frame.

The original holds the whole stage. `BattleMode` @0x41c1a0 is created beside
the director as its `pending` object (src/maingame.cpp, three sites), and
`EZ2DJMainGameDirector::update2` @0x4249e0 opens with

    if (pending != 0) {
        if (pending->ready == 0)
            return;                    /* the WHOLE stage is held */
        if (ready == 0) { ...; ready = 1; start(); }
    }

so until the overlay is done nothing ticks - no clock, no scroll, no keysound,
no judgement, and `start()` has not been called. `pending->ready` is
BattleMode's `m_f2d`, which `update` @0x41c8e0 latches when its `chart0`
reports done.

**What chart0 is.** The ctor (src/panels.cpp) picks `BATTLE_READY.str` for a
real two-up keys battle (`countListA() > 1 && g_modeIndex != 1`) and
`READYCOUNT.str` otherwise. Both are **380 frames at 60 fps - 6.3 seconds** -
and their ten layers are the sequence: an instruction plate early on
(`count.bmp`, which is Korean text reading roughly "adjust your speed, the game
starts soon" - *not* a numeral strip, despite the file's name), then **GET**,
**READY**, and **START** (**FIGHT** on the battle clip).

**The three cues** are `update2` @0x41c660's, off chart0's own frame counter:

| frame | sound | at 60 fps |
| --- | --- | --- |
| 205 | `Battle-01` | 3.42 s |
| 265 | `Battle-01` again, stopped and rewound first | 4.42 s |
| 325 | `Battle-02` | 5.42 s |

Sixty frames apart - one a second. `Battle-01` is 311 ms and `Battle-02` is
1289 ms, so the shape is two short marks and a longer one on START.

Under the CV2 flag the clip is `System\CV2Mix\BattleMode\READYCOUNT.str`, 196
frames, and the cues move to 25/85/145 - the same three sounds at the same
spacing. **CV2Mix's own style (`g_mixStyle == 7`) has no count at all**:
`update` @0x41c8e0 latches `m_f2d` outright.

Built in `tools/ez2play.c`: the clip and its two samples load with the stage,
the loop re-bases the clock every frame while the count runs (so `now` stays at
zero and nothing ages, sounds or judges), the cues fire off the clip's frame,
and the overlay draws over the field. The lamp pulse in `scene/lights.c`
already keyed off the same `chart0.f8 >= 0xcd` gate.

**Not modelled:** the original's skip. `update2` clears chart0 and latches the
flag on `getState(0) == 2` (and `getState(0x26)` also skips the channel), but
slot 0 is the source-0 entry on keyState bit 0x1b and the port has no name for
that button - so there is nothing honest to bind it to yet. `--frames` bounds
it for tests, and every stage test in the suite still passes with the extra
380 frames in its budget.

## Reported 2026-08-31: an off-rate sample was cut at HALF its length

Reported from play, on **m-police**: the first long notes cut off midway
through the hold. Confirmed, found and fixed - and it was the one part of the
audio path no sweep had covered, because the sweeps all check that a file
*parses*, not that it *plays to the end*.

The live mixer stopped a voice when its **output** cursor reached the sample's
**source** frame count:

    if (s->cursor >= s->frames) { ... stop ... }        /* wrong */

`cursor` counts output frames. At 44.1 kHz the two numbers are the same and
everything was correct; a 22.05 kHz sample needs *two* output frames per source
frame, so it was cut at exactly half its length. The end of a sample is a fact
about the **source** position, which is what the fix tests.

Why it survived this long, and why m-police:

* **8% of the shipped library is 22.05 kHz** (344 of a 4,000-file sample), so
  most songs sound almost entirely right;
* **m-police is 48%** - 57 of its 118 samples - and its held notes are pads
  and a guitar, all 22.05 kHz. `1-Pad-01-01` is 1,826 ms and was stopping at
  913, inside a 1,611 ms hold. That is audible as the hold going quiet
  halfway, which is exactly what was reported;
* **`ez2render`'s offline mixer had it right all along**, testing the source
  position - so a chart rendered to a WAV sounded correct and the same chart
  in the game did not. Two copies of one rule, and only one of them wrong.

Measured before and after, dummy driver, relative to a 44.1 kHz reference in
the same song:

| sample | rate | before | after |
| --- | --- | --- | --- |
| `1-reverse-01` | 44100 | 492 | 492 (unchanged) |
| `1-Guitar-01-01` | 22050 | 355 | **695** |
| `1-Pad-01-01` | 22050 | 654 | **1294** |
| `1-Pad-01-03` | 22050 | 660 | **1296** |

The rule now lives once, in `ez2_ssf_src_frame` / `ez2_ssf_at_end`
(`ez2/ssf.h`), and both mixers call it. `tests/test_audio.c` pins it with
m-police's own numbers, so the half-length cut cannot come back quietly.

**Not the same thing:** the very first hold in the 5KeyMix chart (tick 432) is
`1-reverse-01`, a *reverse* cymbal - it swells from silence to a hit at its
end because that is what the sample is, and it is at 44.1 kHz so it was never
truncated. If a long note still seems to arrive late rather than short, that
one is the sample behaving correctly and is worth separating from the rest.

* the judgement windows, the +3-tick widening (`ez2play.c` cites @0x430793)
  and the grader itself - see the second pass above
* the hold machine end to end - findings 1-14 of `PORT-DELTAS.md`
* the gauge deltas, the mode bonuses and the course doubling - finding 15
* the score, combo, grade ladder and the two-player clamp - the oracle
* the note counter against the hold starter - finding 12
* the note-order options and all three shuffle veto rules - findings 13, 14
* the .ez record layout and the hold length's bias of 6
* the mode-to-lane mapping - `ez2lanes` verified it against all 12,361
  shipped charts, 12 of 13 modes clean (CV2Mix has no single layout), which
  is stronger evidence than a re-read would produce
