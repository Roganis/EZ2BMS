/* The channel resolver: a channel is the OR of its bindings.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * This one links the BACKEND, because the resolver is where a binding name
 * becomes a scancode and a level becomes an event - the half ez2core cannot
 * hold. It opens no window (SDL_VIDEODRIVER=offscreen) and needs no device.
 *
 * WHY IT EXISTS. The old resolver set a channel's level straight from the key
 * event that matched it, which is correct for exactly one binding. With two -
 * which is the normal case the moment a channel can be reached from a keyboard
 * AND a panel - releasing either one released the channel while the other was
 * still held. That is a stuck note, or worse a dropped hold, and it would show
 * up as "the port feels wrong" rather than as anything a person could report.
 */
#include "../platform/platform.h"
#include "../platform/common/ezinput.h"

#include <SDL3/SDL.h>

#include <stdio.h>
#include <string.h>

static int failures;

static void check(int cond, const char *what)
{
    printf("%s %s\n", cond ? "ok:  " : "FAIL:", what);
    if (!cond)
        failures++;
}

static void drain(void)
{
    EzInputEvent ev[32];

    while (ezInputEvents(ev, 32) > 0)
        ;
}

/* How many events came out FOR ONE CHANNEL, and what the last of them said.
 *
 * Filtering by channel is not tidiness. The default map binds `A` to Scratch1,
 * so a test that pressed A and counted every event would see two - its own
 * channel and the default one - and read a correct resolver as broken. It did,
 * the first time this ran. */
static int pump(int channel, int *last_down)
{
    EzInputEvent ev[32];
    int n = ezInputEvents(ev, 32), i, hits = 0;

    for (i = 0; i < n; i++) {
        if (ev[i].channel != channel)
            continue;
        hits++;
        if (last_down)
            *last_down = ev[i].down;
    }
    return hits;
}

static void test_or(void)
{
    const char *two[2] = { "A", "B" };
    int down = -1;

    check(ezBindControls(EZ_IN_KEY1, two, 2) == 2,
          "a channel takes two bindings");
    drain();

    ez2_input_key(SDL_SCANCODE_A, 1, 100);
    check(pump(EZ_IN_KEY1, &down) == 1 && down == 1 && ezInputDown(EZ_IN_KEY1),
          "the first goes down and the channel follows");

    ez2_input_key(SDL_SCANCODE_B, 1, 110);
    check(pump(EZ_IN_KEY1, &down) == 0 && ezInputDown(EZ_IN_KEY1),
          "the SECOND going down is not a second press - the channel was "
          "already down, so no event is emitted");

    /* THE REGRESSION. Releasing one while the other is held must NOT release
     * the channel. */
    ez2_input_key(SDL_SCANCODE_A, 0, 120);
    check(pump(EZ_IN_KEY1, &down) == 0 && ezInputDown(EZ_IN_KEY1),
          "releasing one while the other is HELD leaves the channel down - "
          "this is what the old resolver got wrong");

    ez2_input_key(SDL_SCANCODE_B, 0, 130);
    check(pump(EZ_IN_KEY1, &down) == 1 && down == 0 && !ezInputDown(EZ_IN_KEY1),
          "and letting the last one go releases it, once");
}

static void test_timing(void)
{
    const char *one[1] = { "C" };
    EzInputEvent ev[4];

    ezBindControls(EZ_IN_KEY2, one, 1);
    drain();

    ez2_input_key(SDL_SCANCODE_C, 1, 4321);
    check(ezInputEvents(ev, 4) == 1 && ev[0].time_ms == 4321 &&
          ev[0].channel == EZ_IN_KEY2 && ev[0].down == 1,
          "an event carries the time it ARRIVED, not the frame's - which is "
          "the whole reason judgement takes events");
    ez2_input_key(SDL_SCANCODE_C, 0, 4327);
    check(ezInputEvents(ev, 4) == 1 && ev[0].time_ms == 4327,
          "and so does the release");
}

static void test_repeat(void)
{
    const char *one[1] = { "D" };

    ezBindControls(EZ_IN_KEY3, one, 1);
    drain();

    ez2_input_key(SDL_SCANCODE_D, 1, 200);
    ez2_input_key(SDL_SCANCODE_D, 1, 210);
    ez2_input_key(SDL_SCANCODE_D, 1, 220);
    check(pump(EZ_IN_KEY3, 0) == 1, "a key REPEAT is not a new press");
    ez2_input_key(SDL_SCANCODE_D, 0, 230);
    check(pump(EZ_IN_KEY3, 0) == 1, "and the release is one event");
}

static void test_specs(void)
{
    const char *pad[1]  = { "0810:e501/b3" };
    const char *hat[1]  = { "0810:e501/h0.up" };
    const char *junk[1] = { "0810:e501/b" };
    const char *axis[1] = { "0810:e501/a0" };

    check(ezControlNameValid("S") && ezControlNameValid("/") &&
          ezControlNameValid("Left Ctrl"),
          "key names resolve, punctuation included");
    check(!ezControlNameValid("Semicolon") && !ezControlNameValid(""),
          "and a name SDL does not have is reported rather than bound");

    /* A pad binding is accepted with the device ABSENT - refusing it would
     * delete a player's bindings on the one launch they forgot the
     * controller. */
    check(ezControlNameValid("0810:e501/b3") &&
          ezControlNameValid("0810:e501/h0.up"),
          "a pad binding is valid whether or not the device is plugged in");
    check(!ezControlNameValid("0810:e501/b"),
          "but a malformed one is not");

    check(ezBindControls(EZ_IN_KEY4, pad, 1) == 1 &&
          ezBindControls(EZ_IN_KEY5, hat, 1) == 1,
          "and both bind to a channel with nothing connected");
    check(ezBindControls(EZ_IN_KEY6, junk, 1) == 0,
          "a malformed spec binds nothing");
    check(ezBindControls(EZ_IN_KEY7, axis, 1) == 0,
          "and an AXIS is not a channel binding - a turntable is analog, and "
          "silently accepting it here would give a key that never fires");
}

static void test_analog(void)
{
    check(ezBindAnalog(EZ_TT_P1, "0810:e501/a0"), "a turntable takes an axis");
    check(ezBindAnalog(EZ_TT_P1, "0810:e501/a0:rev"), "reversed");
    check(ezBindAnalog(EZ_TT_P2, "vtt:4"), "the virtual one");
    check(ezBindAnalog(EZ_TT_P1, "mouse/x:8"), "and the mouse");
    check(!ezBindAnalog(EZ_TT_P1, "0810:e501/b3"),
          "but not a button - a wheel bound to a button could not turn");
    check(!ezBindAnalog(EZ_TT_P1, "S"), "nor a key");

    check(ezBindAnalog(EZ_TT_P1, 0) && !ezAnalogBound(EZ_TT_P1),
          "and null unbinds it");
    check(ezAnalogPos(EZ_TT_P1) == 128,
          "an unbound turntable rests at the middle of the encoder's range");
}

/* THE DEBOUNCE: a second edge within the window is chatter and is dropped,
 * the first edge is never delayed, and a change that outlives the window
 * lands when the level is next read. */
static void test_debounce(void)
{
    const char *one[1] = { "D" };
    EzInputEvent ev[8];

    ezBindControls(EZ_IN_KEY3, one, 1);
    drain();
    ezInputDebounce(8);
    ez2_input_key(SDL_SCANCODE_D, 1, 1000);
    check(ezInputEvents(ev, 8) == 1 && ev[0].down == 1 && ev[0].time_ms == 1000,
          "the press lands at once");
    ez2_input_key(SDL_SCANCODE_D, 0, 1002);         /* chatter */
    ez2_input_key(SDL_SCANCODE_D, 1, 1004);         /* chatter */
    check(ezInputEvents(ev, 8) == 0 && ezInputDown(EZ_IN_KEY3),
          "two bounces inside the window are nothing");
    ez2_input_key(SDL_SCANCODE_D, 0, 1040);
    check(ezInputEvents(ev, 8) == 1 && ev[0].down == 0 && ev[0].time_ms == 1040,
          "the real release, past the window, lands");
    ez2_input_key(SDL_SCANCODE_D, 1, 1043);         /* chatter on the way up */
    check(ezInputEvents(ev, 8) == 0 && !ezInputDown(EZ_IN_KEY3),
          "a bounce on release is nothing either");
    ez2_input_key(SDL_SCANCODE_D, 0, 1050);         /* level settles */
    ez2_input_key(SDL_SCANCODE_D, 1, 1100);
    check(ezInputEvents(ev, 8) == 1 && ev[0].down == 1,
          "the next real press lands");
    ez2_input_key(SDL_SCANCODE_D, 0, 1200);
    drain();
    ezInputDebounce(0);
}

/* THE SEAT: with side 1 the banks swap in everything reported - a press on
 * 2P's key 1 is 1P's key 1 to the game, and ezInputDown agrees. */
static void test_seat(void)
{
    const char *p1[1] = { "E" }, *p2[1] = { "F" };
    EzInputEvent ev[8];

    ezBindControls(EZ_IN_KEY1, p1, 1);
    ezBindControls(EZ_IN_P2_KEY1, p2, 1);
    drain();
    ezInputSeat(1);
    ez2_input_key(SDL_SCANCODE_F, 1, 2000);
    check(ezInputEvents(ev, 8) == 1 && ev[0].channel == EZ_IN_KEY1 && ev[0].down,
          "2P's key 1 reports as 1P's under seat 1");
    check(ezInputDown(EZ_IN_KEY1) && !ezInputDown(EZ_IN_P2_KEY1),
          "and the level reads the same way");
    ez2_input_key(SDL_SCANCODE_F, 0, 2100);
    drain();
    ez2_input_key(SDL_SCANCODE_E, 1, 2200);
    check(ezInputEvents(ev, 8) == 1 && ev[0].channel == EZ_IN_P2_KEY1,
          "1P's key 1 reports as 2P's");
    ez2_input_key(SDL_SCANCODE_E, 0, 2300);
    drain();
    ezInputSeat(0);
    ez2_input_key(SDL_SCANCODE_F, 1, 2400);
    check(ezInputEvents(ev, 8) == 1 && ev[0].channel == EZ_IN_P2_KEY1,
          "seat 0 restores the banks");
    ez2_input_key(SDL_SCANCODE_F, 0, 2500);
    drain();
}

int main(void)
{
    /* The resolver is backend code but needs no window; the harness asks for
     * the offscreen driver so this runs on a build machine. */
    if (!SDL_Init(SDL_INIT_VIDEO)) {
        printf("SKIP: no SDL video (%s)\n", SDL_GetError());
        return 77;
    }

    ezInputDebounce(0);      /* the timing cases tap faster than a switch chatters */
    test_or();
    test_timing();
    test_repeat();
    test_specs();
    test_analog();
    test_debounce();
    test_seat();

    SDL_Quit();
    printf(failures ? "\nFAILED (%d)\n" : "\nPASSED\n", failures);
    return failures ? 1 : 0;
}
