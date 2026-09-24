/* Pads, sticks and turntables - the device half of input, shared by every
 * backend.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../../LICENSE.
 *
 * ---- what this adds ------------------------------------------------------
 *
 * The port could bind a channel to a KEY and to nothing else. 2EZConfig can
 * bind one to a HID button, a hat direction, or - for the two turntables - an
 * axis, a mouse axis, or a pair of buttons driving a virtual encoder. This is
 * the machinery for the rest of that list; the grammar a person writes is
 * ez2/bindspec.h and the file it lives in is ez2/keyconf.h.
 *
 * ---- devices are named the way lamps are ---------------------------------
 *
 * A device key is `vid:pid`, with `#n` for the n-th board of that make - the
 * same key `lights.ini` uses (ez2/lampcfg.h argues why). One vocabulary: the
 * board that reads your buttons and the board that lights your lamps are named
 * the same way, and `#n` means the same thing in both.
 *
 * ---- EVENTS, not polling, and that is not a detail -----------------------
 *
 * Joystick input arrives through the same SDL event queue the keyboard does,
 * and carries the same nanosecond timestamp, so a pad button gets exactly the
 * judgement timing a key gets (../platform.h explains why the port takes
 * timestamped events rather than polling a level once a frame - a 6 ms window
 * cannot be resolved at 16.7 ms of granularity). Polling the pad once a frame
 * would have quietly made every pad player worse than every keyboard player.
 *
 * ---- the turntable, and the one place the port INVENTS something ---------
 *
 * The cabinet gives the game BOTH things: two digital scratch bits, which
 * bindButtons @0x418c90 takes as slots 0x0f/0x10, and a separate analog
 * encoder that m40c4b0 @0x40c4b0 reads off ports 0x103/0x104 as a running
 * position. A USB turntable has only the encoder. So an analog binding here
 * ALSO raises the two digital scratch channels as it turns - a threshold on
 * the movement, and a short hold so a steady spin reads as a held scratch
 * rather than a stutter.
 *
 * That synthesis has no counterpart in the original and is marked as an
 * invention rather than presented as a transcription. The alternative - an
 * analog turntable that moves the select wheel but cannot hit a scratch note -
 * would not be a turntable.
 */
#include "../platform.h"
#include "ezinput.h"
#include "../../ez2/bindspec.h"

#include <SDL3/SDL.h>

#include <stdarg.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_PADS    8
#define MAX_BUTTONS 64
#define MAX_HATS     8
#define MAX_AXES    16

typedef struct pad {
    char           key[32];
    char           name[128];
    SDL_JoystickID id;
    SDL_Joystick  *j;
    int            buttons, axes, hats;
    unsigned char  btn[MAX_BUTTONS];
    unsigned char  hat[MAX_HATS];      /* the raw SDL_HAT_* mask */
    int            axis[MAX_AXES];     /* -32768..32767 */
} pad;

static pad g_pad[MAX_PADS];
static int g_pad_count;
static int g_pad_ready;

/* ---- enumeration -------------------------------------------------------- */

static void key_for(char *out, size_t n, Uint16 vid, Uint16 pid, int seen)
{
    if (seen == 0)
        snprintf(out, n, "%04x:%04x", vid, pid);
    else
        snprintf(out, n, "%04x:%04x#%d", vid, pid, seen);
}

static int count_same(Uint16 vid, Uint16 pid)
{
    char base[32];
    size_t bl;
    int i, n = 0;

    snprintf(base, sizeof(base), "%04x:%04x", vid, pid);
    bl = strlen(base);
    for (i = 0; i < g_pad_count; i++) {
        if (strncmp(g_pad[i].key, base, bl) == 0 &&
            (g_pad[i].key[bl] == 0 || g_pad[i].key[bl] == '#'))
            n++;
    }
    return n;
}

static void pads_close(void)
{
    int i;

    for (i = 0; i < g_pad_count; i++) {
        if (g_pad[i].j)
            SDL_CloseJoystick(g_pad[i].j);
    }
    memset(g_pad, 0, sizeof(g_pad));
    g_pad_count = 0;
}

int ezPadRescan(void)
{
    SDL_JoystickID *ids;
    int count = 0, i;

    if (!g_pad_ready) {
        if (!SDL_InitSubSystem(SDL_INIT_JOYSTICK)) {
            SDL_Log("pads: no joystick subsystem - keyboard only");
            return 0;
        }
        g_pad_ready = 1;
    }
    pads_close();

    ids = SDL_GetJoysticks(&count);
    if (!ids)
        return 0;
    for (i = 0; i < count && g_pad_count < MAX_PADS; i++) {
        SDL_Joystick *j = SDL_OpenJoystick(ids[i]);
        pad *p;

        if (!j)
            continue;
        p = &g_pad[g_pad_count];
        memset(p, 0, sizeof(*p));
        p->id      = ids[i];
        p->j       = j;
        p->buttons = SDL_GetNumJoystickButtons(j);
        p->axes    = SDL_GetNumJoystickAxes(j);
        p->hats    = SDL_GetNumJoystickHats(j);
        if (p->buttons > MAX_BUTTONS) p->buttons = MAX_BUTTONS;
        if (p->axes    > MAX_AXES)    p->axes    = MAX_AXES;
        if (p->hats    > MAX_HATS)    p->hats    = MAX_HATS;
        key_for(p->key, sizeof(p->key), SDL_GetJoystickVendor(j),
                SDL_GetJoystickProduct(j),
                count_same(SDL_GetJoystickVendor(j), SDL_GetJoystickProduct(j)));
        {
            const char *nm = SDL_GetJoystickName(j);

            snprintf(p->name, sizeof(p->name), "%s", nm ? nm : p->key);
        }
        g_pad_count++;
    }
    SDL_free(ids);
    return g_pad_count;
}

int ezPadDevices(EzPadDevice *out, int max)
{
    int i, n = 0;

    if (!out || max <= 0)
        return 0;
    for (i = 0; i < g_pad_count && n < max; i++) {
        memcpy(out[n].key, g_pad[i].key, sizeof(out[n].key));
        memcpy(out[n].name, g_pad[i].name, sizeof(out[n].name));
        out[n].key[sizeof(out[n].key) - 1]   = 0;
        out[n].name[sizeof(out[n].name) - 1] = 0;
        out[n].buttons = g_pad[i].buttons;
        out[n].axes    = g_pad[i].axes;
        out[n].hats    = g_pad[i].hats;
        n++;
    }
    return n;
}

/* ---- what ezinput.c asks of us ------------------------------------------ */

int ez2_pad_index_for(const char *device)
{
    int i;

    if (!device || !device[0])
        return -1;
    for (i = 0; i < g_pad_count; i++) {
        if (strcmp(g_pad[i].key, device) == 0)
            return i;
    }
    return -1;
}

int ez2_pad_button(int p, int button)
{
    if (p < 0 || p >= g_pad_count || button < 0 || button >= MAX_BUTTONS)
        return 0;
    return g_pad[p].btn[button] != 0;
}

/* A hat DIRECTION is held when the hat's mask contains it. The diagonals are
 * their own directions, as 2EZConfig's HS_* set has them, so `up` is NOT held
 * while the hat reads up-right - a diagonal is a distinct control, and binding
 * `up` would otherwise fire on two of the eight positions. */
static unsigned char hat_mask(int dir)
{
    switch (dir) {
    case EZ2_HAT_UP:        return SDL_HAT_UP;
    case EZ2_HAT_UPRIGHT:   return SDL_HAT_RIGHTUP;
    case EZ2_HAT_RIGHT:     return SDL_HAT_RIGHT;
    case EZ2_HAT_DOWNRIGHT: return SDL_HAT_RIGHTDOWN;
    case EZ2_HAT_DOWN:      return SDL_HAT_DOWN;
    case EZ2_HAT_DOWNLEFT:  return SDL_HAT_LEFTDOWN;
    case EZ2_HAT_LEFT:      return SDL_HAT_LEFT;
    case EZ2_HAT_UPLEFT:    return SDL_HAT_LEFTUP;
    default:                return 0;
    }
}

int ez2_pad_hat_dir(int p, int hat, int dir)
{
    unsigned char want = hat_mask(dir);

    if (p < 0 || p >= g_pad_count || hat < 0 || hat >= MAX_HATS || !want)
        return 0;
    return g_pad[p].hat[hat] == want;
}

int ez2_pad_axis(int p, int axis)
{
    if (p < 0 || p >= g_pad_count || axis < 0 || axis >= MAX_AXES)
        return 0;
    return g_pad[p].axis[axis];
}

/* ---- the turntables ----------------------------------------------------- */

/* How far the encoder has to move before the digital scratch channel fires,
 * and how long it stays down with no further movement. Both are port
 * inventions (see the header) and both are what a turntable FEELS like rather
 * than something read off the original:
 *
 *   - the step is in the same 0..255 units the cabinet's encoder byte uses, so
 *     a full turn of a 256-count wheel is 256 of them. ONE, as the original:
 *     m40c4b0 @0x40c4b0 raises the direction bit on any non-zero movement in
 *     a tick (src/analogread.cpp). It was four - "large enough that resting
 *     a hand on the wheel does not chatter" - and on the cabinet's own wheel
 *     (252 counts a turn, traced 2026-09-05) four counts were six degrees of
 *     rim before a scratch registered, which read as the wheel misbehaving;
 *   - the hold is longer than a frame at 60 Hz (16.7 ms) on purpose. A steady
 *     spin delivers movement in bursts, and a hold shorter than the gap
 *     between them would read one continuous scratch as a stutter of presses -
 *     which is a MISS on a hold note.
 */
#define TT_STEP_UNITS 1
#define TT_HOLD_MS    90

typedef struct turntable {
    ez2_bindspec spec;
    int   bound;
    int   pos;                 /* 0..255, the cabinet's encoder byte */
    int   accum;               /* signed movement not yet spent on a step */
    int   delta;               /* since the last ezAnalogDelta */
    int   raw;                 /* the axis reading it was last built from */
    int   have_raw;
    int   vel_frac;            /* a velocity axis: movement not yet a whole unit */
    /* the synthesised digital pair */
    int   up_until, down_until;
    int   up_down, down_down;
} turntable;

/* THE ENCODER RESTS AT 128, WHETHER OR NOT ANYTHING IS BOUND. The cabinet's
 * board reports a byte and the game reads it raw - the operator's INPUT TEST
 * page prints it as three digits, and on the original it reads 128 with
 * nobody at the turntable (measured). ezBindAnalog already seeds 128; this is
 * the same value for the case where no analog device is bound at all, where
 * the port used to report 000. */
static turntable g_tt[EZ_TT_COUNT] = {
    { { 0 }, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
    { { 0 }, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0 }
};

/* EZ2_TRACE_TT=1: every axis reading and every synthesised channel edge to
 * the log, with the time - the way to see what a cabinet's turntable really
 * sends (a wrapping position, or a speed that returns to centre) without
 * standing at the cabinet. */
static int tt_trace(void)
{
    static int on = -1;
    if (on < 0)
        on = getenv("EZ2_TRACE_TT") != 0;
    return on;
}

/* Which two channels a turntable raises. */
static void tt_channels(int tt, int *up, int *dn)
{
    if (tt == EZ_TT_P2) {
        *up = EZ_IN_P2_SCRATCH_UP;
        *dn = EZ_IN_P2_SCRATCH_DOWN;
    } else {
        *up = EZ_IN_SCRATCH_UP;
        *dn = EZ_IN_SCRATCH_DOWN;
    }
}

int ezBindAnalog(int tt, const char *spec)
{
    ez2_bindspec b;

    if (tt < 0 || tt >= EZ_TT_COUNT)
        return 0;
    if (!spec || !spec[0]) {
        memset(&g_tt[tt], 0, sizeof(g_tt[tt]));
        g_tt[tt].pos = 128;
        return 1;
    }
    if (!ez2_bindspec_parse(spec, &b) || !ez2_bindspec_is_analog(&b))
        return 0;
    memset(&g_tt[tt], 0, sizeof(g_tt[tt]));
    g_tt[tt].spec  = b;
    g_tt[tt].bound = 1;
    g_tt[tt].pos   = 128;
    return 1;
}

int ezAnalogVirtual(int tt)
{
    if (tt < 0 || tt >= EZ_TT_COUNT)
        return 0;
    return g_tt[tt].bound && g_tt[tt].spec.kind == EZ2_BIND_VTT;
}

int ezAnalogBound(int tt)
{
    if (tt < 0 || tt >= EZ_TT_COUNT)
        return 0;
    return g_tt[tt].bound;
}

int ezAnalogPos(int tt)
{
    if (tt < 0 || tt >= EZ_TT_COUNT)
        return 128;
    return g_tt[tt].pos & 0xff;
}

int ezAnalogDelta(int tt)
{
    int d;

    if (tt < 0 || tt >= EZ_TT_COUNT)
        return 0;
    d = g_tt[tt].delta;
    g_tt[tt].delta = 0;
    return d;
}

/* Move a turntable by `units` and let the digital pair follow. */
static void tt_move(int tt, int units, unsigned int now)
{
    turntable *t = &g_tt[tt];
    int up, dn;

    if (!units)
        return;
    t->pos    = (t->pos + units) & 0xff;
    t->delta += units;
    t->accum += units;

    tt_channels(tt, &up, &dn);
    while (t->accum >= TT_STEP_UNITS) {
        t->accum -= TT_STEP_UNITS;
        t->up_until = now + TT_HOLD_MS;
    }
    while (t->accum <= -TT_STEP_UNITS) {
        t->accum += TT_STEP_UNITS;
        t->down_until = now + TT_HOLD_MS;
    }
    /* A reversal drops the other direction at once rather than letting the two
     * overlap for the rest of the hold - on a wheel they are one control. */
    if (units > 0 && t->down_down) {
        t->down_until = 0;
        t->down_down  = 0;
        ez2_input_channel(dn, 0, now);
    }
    if (units < 0 && t->up_down) {
        t->up_until = 0;
        t->up_down  = 0;
        ez2_input_channel(up, 0, now);
    }
    if (t->up_until > (int)now && !t->up_down) {
        t->up_down = 1;
        ez2_input_channel(up, 1, now);
        if (tt_trace()) ezLogf("tt%d %u: UP down (units %+d pos %d)\n", tt, now, units, t->pos);
    }
    if (t->down_until > (int)now && !t->down_down) {
        t->down_down = 1;
        ez2_input_channel(dn, 1, now);
        if (tt_trace()) ezLogf("tt%d %u: DOWN down (units %+d pos %d)\n", tt, now, units, t->pos);
    }
}

/* The hold expiring is not an event anything sends, so it is checked once a
 * frame. Called from ez2_pad_frame. */
/* THE SCRIPTED TURNTABLE (ezoracle.c): the screen oracle moves a side by
 * whole units a frame, as an encoder would. A side nothing is bound to is
 * bound to the script - as an axis, so the menus' accumulator (which skips
 * the virtual wheel) sees it. */
void ez2_pad_script_move(int tt, int units, unsigned int now)
{
    if (tt < 0 || tt >= EZ_TT_COUNT)
        return;
    if (!g_tt[tt].bound || g_tt[tt].spec.kind == EZ2_BIND_VTT) {
        memset(&g_tt[tt], 0, sizeof g_tt[tt]);
        g_tt[tt].bound = 1;
        g_tt[tt].pos = 128;
        g_tt[tt].spec.kind = EZ2_BIND_AXIS;
    }
    tt_move(tt, units, now);
}

static void tt_expire(int tt, unsigned int now)
{
    turntable *t = &g_tt[tt];
    int up, dn;

    tt_channels(tt, &up, &dn);
    if (t->up_down && t->up_until <= (int)now) {
        t->up_down = 0;
        ez2_input_channel(up, 0, now);
        if (tt_trace()) ezLogf("tt%d %u: UP up\n", tt, now);
    }
    if (t->down_down && t->down_until <= (int)now) {
        t->down_down = 0;
        ez2_input_channel(dn, 0, now);
        if (tt_trace()) ezLogf("tt%d %u: DOWN up\n", tt, now);
    }
}

/* A VELOCITY axis: the reading is a speed about centre, so the wheel moves
 * by it every frame and stops when it returns to rest. Full deflection is
 * eight units a frame - about two turns a second at 60 Hz - and a dead
 * band of 1/32 of the range swallows a resting axis's noise. The fraction
 * is kept between frames so a slow spin still turns. */
static void tt_from_velocity(int tt, unsigned int now)
{
    turntable *t = &g_tt[tt];
    int raw = t->raw, units;

    if (!t->have_raw)
        return;
    if (t->spec.reverse)
        raw = -raw;
    if (raw > -1024 && raw < 1024)
        raw = 0;
    t->vel_frac += raw * 8;                 /* in 1/32768 units */
    units = t->vel_frac / 32768;
    t->vel_frac -= units * 32768;
    if (units)
        tt_move(tt, units, now);
}

/* An axis reading turned into encoder units. The full -32768..32767 swing is
 * one turn, so 256 units across it. A turntable controller reports a WRAPPING
 * position, which is why the difference is taken modulo the range rather than
 * clamped: crossing the wrap point is a small movement, not a jump across the
 * whole wheel. */
static void tt_from_axis(int tt, int raw, unsigned int now)
{
    turntable *t = &g_tt[tt];
    int units, d;

    if (tt_trace()) ezLogf("tt%d %u: axis %d\n", tt, now, raw);
    if (t->spec.velocity) {
        /* the latest reading only; ez2_pad_frame moves by it */
        t->raw = raw;
        t->have_raw = 1;
        return;
    }
    if (t->spec.reverse)
        raw = -raw;
    if (!t->have_raw) {
        t->raw      = raw;
        t->have_raw = 1;
        return;
    }
    d = raw - t->raw;
    if (d > 32768)
        d -= 65536;
    if (d < -32768)
        d += 65536;
    t->raw = raw;

    units = d * 256 / 65536;
    if (units == 0 && d != 0) {
        /* Keep the remainder rather than dropping it: a slow turn is many
         * sub-unit steps and rounding each to zero would stop the wheel. */
        t->raw -= d;
        return;
    }
    tt_move(tt, units, now);
}

/* ---- the SDL events ----------------------------------------------------- */

static pad *pad_by_id(SDL_JoystickID id)
{
    int i;

    for (i = 0; i < g_pad_count; i++) {
        if (g_pad[i].id == id)
            return &g_pad[i];
    }
    return 0;
}

/* The binding page's capture: the last CONTROL moved on any device, in the
 * spec grammar, so "press the button you want" hears a pad button exactly as
 * it hears a key. */
static char g_capture[64];
static int  g_capture_armed;
static int  g_capture_axes;      /* an axis counts as a control (turntables) */

void ez2_pad_capture_arm(int want_axes)
{
    g_capture[0]    = 0;
    g_capture_armed = 1;
    g_capture_axes  = want_axes;
}

int ez2_pad_capture(char *out, int n)
{
    if (!g_capture_armed || !g_capture[0] || !out || n <= 0)
        return 0;
    SDL_strlcpy(out, g_capture, (size_t)n);
    g_capture[0]    = 0;
    g_capture_armed = 0;
    return 1;
}

static void capture(const char *fmt, ...)
{
    va_list ap;

    if (!g_capture_armed || g_capture[0])
        return;
    va_start(ap, fmt);
    SDL_vsnprintf(g_capture, sizeof(g_capture), fmt, ap);
    va_end(ap);
}

void ez2_pad_event(const SDL_Event *e)
{
    unsigned int now;
    pad *p;

    if (!e)
        return;
    now = (unsigned int)(e->common.timestamp / 1000000u);

    switch (e->type) {
    case SDL_EVENT_JOYSTICK_ADDED:
    case SDL_EVENT_JOYSTICK_REMOVED:
        /* Hot-plug. Re-enumerating renumbers the `#n` suffixes, which is the
         * price of naming devices by make rather than by a path - and it is
         * the right price: a path is not stable across a reboot either, and it
         * cannot be typed into a config file. */
        ezPadRescan();
        ez2_input_rebind_devices();
        return;

    case SDL_EVENT_JOYSTICK_BUTTON_DOWN:
    case SDL_EVENT_JOYSTICK_BUTTON_UP: {
        int down = (e->type == SDL_EVENT_JOYSTICK_BUTTON_DOWN);

        p = pad_by_id(e->jbutton.which);
        if (!p || e->jbutton.button >= MAX_BUTTONS)
            return;
        p->btn[e->jbutton.button] = (unsigned char)down;
        if (down)
            capture("%s/b%d", p->key, (int)e->jbutton.button);
        ez2_input_device_changed(now);
        return;
    }

    case SDL_EVENT_JOYSTICK_HAT_MOTION:
        p = pad_by_id(e->jhat.which);
        if (!p || e->jhat.hat >= MAX_HATS)
            return;
        p->hat[e->jhat.hat] = e->jhat.value;
        if (e->jhat.value != SDL_HAT_CENTERED) {
            int d;

            for (d = 0; d < EZ2_HAT_COUNT; d++) {
                if (hat_mask(d) == e->jhat.value) {
                    capture("%s/h%d.%s", p->key, (int)e->jhat.hat,
                            ez2_hat_name(d));
                    break;
                }
            }
        }
        ez2_input_device_changed(now);
        return;

    case SDL_EVENT_JOYSTICK_AXIS_MOTION: {
        int tt;

        p = pad_by_id(e->jaxis.which);
        if (!p || e->jaxis.axis >= MAX_AXES)
            return;
        p->axis[e->jaxis.axis] = e->jaxis.value;
        if (g_capture_axes)
            capture("%s/a%d", p->key, (int)e->jaxis.axis);
        for (tt = 0; tt < EZ_TT_COUNT; tt++) {
            if (g_tt[tt].bound && g_tt[tt].spec.kind == EZ2_BIND_AXIS &&
                strcmp(g_tt[tt].spec.device, p->key) == 0 &&
                g_tt[tt].spec.index == e->jaxis.axis)
                tt_from_axis(tt, e->jaxis.value, now);
        }
        return;
    }

    case SDL_EVENT_MOUSE_MOTION: {
        int tt;

        for (tt = 0; tt < EZ_TT_COUNT; tt++) {
            const ez2_bindspec *b = &g_tt[tt].spec;
            float rel;

            if (!g_tt[tt].bound || b->kind != EZ2_BIND_MOUSE)
                continue;
            rel = (b->index == 1) ? e->motion.yrel : e->motion.xrel;
            /* Sensitivity 1..20 around 2EZConfig's default of 5: a pixel is
             * one encoder unit at 5, and scales linearly either side. */
            tt_move(tt, (int)(rel * (float)b->amount / 5.0f), now);
        }
        return;
    }

    default:
        return;
    }
}

/* The virtual turntable, and the hold timers. Once a frame from the backend's
 * pump, after the events have been drained. */
void ez2_pad_frame(unsigned int now)
{
    int tt;

    for (tt = 0; tt < EZ_TT_COUNT; tt++) {
        turntable *t = &g_tt[tt];

        if (t->bound && t->spec.kind == EZ2_BIND_VTT) {
            /* THE VIRTUAL TURNTABLE. 2EZConfig drives its `vttPos` from two
             * bound buttons at `vttStep` a tick; here the two buttons are the
             * scratch CHANNELS themselves, whatever they happen to be bound
             * to, so a keyboard player gets a moving encoder without binding
             * anything twice. It moves the position only - it must not
             * synthesise the digital pair, which is where it came from. */
            int up, dn, units = 0;

            tt_channels(tt, &up, &dn);
            if (ezInputDown(up))
                units += t->spec.amount;
            if (ezInputDown(dn))
                units -= t->spec.amount;
            if (units) {
                t->pos    = (t->pos + units) & 0xff;
                t->delta += units;
            }
        } else {
            if (t->bound && t->spec.kind == EZ2_BIND_AXIS && t->spec.velocity)
                tt_from_velocity(tt, now);
            tt_expire(tt, now);
        }
    }
}
