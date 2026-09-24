/* EZ2AC screen-oracle input script - the ONE interpreter both the injected
 * 2EZ.dll (driving the original) and the port's platform layer (driving
 * ez2play) compile, so a script means the same thing on both sides.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Design: ../tools/oracle/README.md. The point is a session nobody has to
 * sit through: the script says which buttons go down on which frame of
 * which screen, each side records what it drew, and the two recordings are
 * diffed offline.
 *
 * A script is text, one statement per line, `#` to end of line a comment:
 *
 *     screen NAME          wait for the screen NAME to be entered; the frame
 *                          cursor restarts at 0 there. NAME is canonical -
 *                          title, mode, select, play, result, ranking ... -
 *                          and each side maps its own screen identity onto it
 *     at N                 move the cursor to frame N of the current screen
 *     wait N               advance the cursor by N frames
 *     press BTN [N]        BTN down at the cursor, up N frames later (4)
 *     down BTN / up BTN    one edge at the cursor
 *     coin                 one coin pulse at the cursor
 *     tt SIDE UNITS N      turntable p1|p2 moves UNITS a frame for N frames,
 *                          starting at the cursor (the cursor does not move)
 *     quit                 end the run at the cursor
 *     zero SIDE N          on the runner named SIDE (orig or port), every
 *                          `at` of the current screen counts from frame N.
 *                          For a screen the two sides key differently - the
 *                          original's chart starts at play frame 316, the
 *                          port's at 380 - so one script hits on both
 *
 * A frame is one present. Actions stamped for a frame are delivered by
 * osc_frame() AFTER that frame's present, so they are what the NEXT frame's
 * update sees - the same relation a person's press has to the frame it
 * lands on. Nothing here has a clock; a runner that presents twice as fast
 * delivers the same actions on the same frames.
 *
 * Buttons are the cabinet's: start1 start2 fx1 fx2 fx3 fx4 service test
 * p1k1..p1k5 p1pedal p2k1..p2k5 p2pedal. */
#ifndef EZ2_OSCRIPT_H
#define EZ2_OSCRIPT_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    OSC_BTN_START1 = 0, OSC_BTN_START2,
    OSC_BTN_FX1, OSC_BTN_FX2, OSC_BTN_FX3, OSC_BTN_FX4,
    OSC_BTN_SERVICE, OSC_BTN_TEST,
    OSC_BTN_P1K1, OSC_BTN_P1K2, OSC_BTN_P1K3, OSC_BTN_P1K4, OSC_BTN_P1K5,
    OSC_BTN_P1PEDAL,
    OSC_BTN_P2K1, OSC_BTN_P2K2, OSC_BTN_P2K3, OSC_BTN_P2K4, OSC_BTN_P2K5,
    OSC_BTN_P2PEDAL,
    OSC_BTN_COUNT
};

enum { OSC_TT_P1 = 0, OSC_TT_P2 };

typedef struct osc_callbacks {
    void *user;
    void (*button)(void *user, int btn, int down);
    void (*coin)(void *user);
    void (*turntable)(void *user, int side, int units);
    void (*quit)(void *user);
    void (*log)(void *user, const char *msg);     /* may be null */
} osc_callbacks;

typedef struct osc osc;

/* Parse a script. On failure returns null and writes why into `err`. */
osc *osc_load(const char *path, const char *side, char *err, size_t errn);
osc *osc_parse(const char *text, const char *side, char *err, size_t errn);
void osc_free(osc *s);

/* The runner entered a screen. A name matching the next `screen` statement
 * advances the script there; any other name is noted and ignored. */
void osc_screen(osc *s, const char *name);

/* One present happened. Delivers every action due on this frame. */
void osc_frame(osc *s, const osc_callbacks *cb);

/* 1 once every action has been delivered (quit included, if there was one). */
int  osc_done(const osc *s);

/* The screen the script is waiting for, or null when it is not waiting. */
const char *osc_waiting_for(const osc *s);

/* Frames delivered on the current screen so far. */
unsigned osc_frame_in_screen(const osc *s);

int         osc_button_id(const char *name);      /* -1 when unknown */
const char *osc_button_name(int btn);

#ifdef __cplusplus
}
#endif

#endif
