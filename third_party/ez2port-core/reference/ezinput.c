/* Input channels, shared by every backend.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../../LICENSE.
 *
 * Two views of the same controls, because the engine and the judge need
 * different things:
 *
 *   ezInputDown   - a LEVEL, polled. What the original's Obj40C180 gives the
 *                   rest of the engine, and enough for menus and holds.
 *   ezInputEvents - timestamped press/release EVENTS. What judgement needs,
 *                   because a level polled once a frame cannot resolve a 6 ms
 *                   window at 16.7 ms of granularity. See platform.h.
 *
 * THIS IS BACKEND-INDEPENDENT AND LIVES HERE FOR THAT REASON. Nothing in it is
 * about a renderer: both backends sit on SDL3, and a scancode is a scancode.
 *
 * ---- a binding is no longer just a key ----------------------------------
 *
 * It was: four SDL scancodes per channel and nothing else, which is the one
 * thing that stopped a person playing on their own hardware. A binding is now
 * any of ez2/bindspec.h's kinds - a key, a pad button, a hat direction - and
 * the alternates per channel are what let a channel be raised by a key AND a
 * pad button at once, which is what a cabinet with a keyboard plugged in for
 * the operator actually looks like.
 *
 * THE LEVEL IS AN `OR` AND IT IS RECOMPUTED, NOT TOGGLED. The old code set the
 * channel's level straight from the key event that matched it, which is
 * correct for exactly one binding: with two, releasing either one released the
 * channel while the other was still held. Now every edge recomputes the
 * channel from all of its bindings and emits an event only when the OR
 * actually changed. That also makes the pad and the keyboard compose for free.
 */
#include "../platform.h"
#include "ezinput.h"
#include "../../ez2/bindspec.h"

#include <SDL3/SDL.h>

#include <string.h>

#define EVENT_QUEUE 64
#define MAX_ALTS    4

/* The default map. The cabinet's five keys sit under the left hand, the
 * scratch is a two-direction control (up/down), and the pedal is the space
 * bar. Nothing here claims to be the arcade layout - it is a keyboard, and
 * ezBindControls replaces any of it (see ez2/keyconf.h for the file that
 * does).
 *
 * ALTERNATES ARE PER CHANNEL, not per key: several physical controls may raise
 * one channel. That is not the same thing as the turntable's two directions,
 * which are two CHANNELS the mode's .gds happens to route to one lane. */
typedef struct binding {
    int          kind;                 /* EZ2_BIND_KEY / BUTTON / HAT */
    SDL_Scancode sc;                   /* KEY */
    char         device[EZ2_BIND_DEV]; /* BUTTON / HAT */
    int          index;
    int          dir;
    int          pad;                  /* resolved device, -1 = not present */
} binding;

static binding g_bind[EZ_IN_COUNT][MAX_ALTS];
static int     g_nbind[EZ_IN_COUNT];
static int     g_ready;

static const SDL_Scancode g_default[EZ_IN_COUNT] = {
    SDL_SCANCODE_S,          /* KEY1 */
    SDL_SCANCODE_D,          /* KEY2 */
    SDL_SCANCODE_F,          /* KEY3 */
    SDL_SCANCODE_J,          /* KEY4 */
    SDL_SCANCODE_K,          /* KEY5 */
    SDL_SCANCODE_L,          /* KEY6 - 7-key layouts */
    SDL_SCANCODE_SEMICOLON,  /* KEY7 */
    SDL_SCANCODE_A,          /* SCRATCH_UP */
    SDL_SCANCODE_Q,          /* SCRATCH_DOWN */
    SDL_SCANCODE_SPACE,      /* PEDAL */
    SDL_SCANCODE_RETURN      /* START */
    /* The rest default to nothing and are set by ez2/keyconf.c's own
     * defaults, which every caller applies. The initialiser used to be
     * short of EZ_IN_COUNT and silently lost the effector row and the whole
     * of player two; being explicitly short and filled programmatically is
     * what stops that recurring. */
};

static void bind_defaults(void)
{
    int i;

    if (g_ready)
        return;
    g_ready = 1;
    for (i = 0; i < EZ_IN_COUNT; i++) {
        int j;

        for (j = 0; j < MAX_ALTS; j++)
            g_bind[i][j].pad = -1;
        if (i < (int)(sizeof(g_default) / sizeof(g_default[0])) &&
            g_default[i] != SDL_SCANCODE_UNKNOWN) {
            g_bind[i][0].kind = EZ2_BIND_KEY;
            g_bind[i][0].sc   = g_default[i];
            g_nbind[i]        = 1;
        }
    }
}

/* ---- binding ------------------------------------------------------------ */

int ezControlNameValid(const char *name)
{
    ez2_bindspec b;

    if (!name || !name[0])
        return 0;
    if (!ez2_bindspec_parse(name, &b))
        return 0;
    if (b.kind == EZ2_BIND_KEY)
        return SDL_GetScancodeFromName(b.key) != SDL_SCANCODE_UNKNOWN;
    /* A pad binding is valid whether or not the device is plugged in RIGHT
     * NOW. Refusing it would delete a player's binding every time they
     * launched with the controller unplugged, which is the worst possible
     * moment to be strict. */
    return b.kind == EZ2_BIND_BUTTON || b.kind == EZ2_BIND_HAT;
}

int ezBindControls(int channel, const char *const *names, int count)
{
    int i, n = 0;

    bind_defaults();
    if (channel < 0 || channel >= EZ_IN_COUNT)
        return 0;
    if (count > MAX_ALTS)
        count = MAX_ALTS;

    memset(g_bind[channel], 0, sizeof(g_bind[channel]));
    for (i = 0; i < MAX_ALTS; i++)
        g_bind[channel][i].pad = -1;

    for (i = 0; i < count; i++) {
        ez2_bindspec b;
        binding *slot;

        if (!names || !names[i] || !ez2_bindspec_parse(names[i], &b))
            continue;
        slot = &g_bind[channel][n];
        if (b.kind == EZ2_BIND_KEY) {
            SDL_Scancode sc = SDL_GetScancodeFromName(b.key);

            if (sc == SDL_SCANCODE_UNKNOWN)
                continue;
            slot->kind = EZ2_BIND_KEY;
            slot->sc   = sc;
        } else if (b.kind == EZ2_BIND_BUTTON || b.kind == EZ2_BIND_HAT) {
            slot->kind  = b.kind;
            slot->index = b.index;
            slot->dir   = b.dir;
            SDL_strlcpy(slot->device, b.device, sizeof(slot->device));
            slot->pad = ez2_pad_index_for(slot->device);
        } else {
            continue;              /* an ANALOG spec is not a channel binding */
        }
        n++;
    }
    g_nbind[channel] = n;
    return n;
}

void ez2_input_rebind_devices(void)
{
    int ch, a;

    for (ch = 0; ch < EZ_IN_COUNT; ch++) {
        for (a = 0; a < g_nbind[ch]; a++) {
            binding *b = &g_bind[ch][a];

            if (b->kind == EZ2_BIND_BUTTON || b->kind == EZ2_BIND_HAT)
                b->pad = ez2_pad_index_for(b->device);
        }
    }
}

/* ---- state -------------------------------------------------------------- */

static unsigned char g_key[SDL_SCANCODE_COUNT];
static int           g_down[EZ_IN_COUNT];
static int           g_forced[EZ_IN_COUNT];   /* raised by ez2_input_channel */
static EzInputEvent  g_queue[EVENT_QUEUE];
static int           g_queue_head, g_queue_count;

/* THE SEAT. A credit opened from 2P's START alone is a one-player game on
 * the 2P side: the field on the right, 2P's keys, 2P's turntable, and
 * every menu answering to that panel. Rather than teach every screen a
 * side, the two banks are SWAPPED here, at the seam, for the whole credit:
 * the game sees 1P's channels, the player is sitting at 2P's. The state
 * underneath stays physical; only what leaves this module is renamed. */
static int g_seat;

static int seat_map(int ch)
{
    if (!g_seat)
        return ch;
    if (ch >= EZ_IN_KEY1 && ch <= EZ_IN_START)
        return ch - EZ_IN_KEY1 + EZ_IN_P2_KEY1;
    if (ch >= EZ_IN_P2_KEY1 && ch <= EZ_IN_P2_START)
        return ch - EZ_IN_P2_KEY1 + EZ_IN_KEY1;
    return ch;
}

void ezInputSeat(int side)
{
    g_seat = side ? 1 : 0;
}

/* THE DEBOUNCE. A worn microswitch chatters for a few milliseconds on the
 * way down and on the way up, and each chatter is a press: a double or a
 * triple on one hit (the cabinet, 2026-09-05). An edge is taken at once,
 * so it costs no latency; a second edge on the same channel within the
 * window is ignored, and the level is re-read every frame, so a real
 * change inside the window still lands as soon as it ends. 0 turns it off. */
static unsigned int g_debounce_ms = 8;
static unsigned int g_last_edge[EZ_IN_COUNT];

void ezInputDebounce(int ms)
{
    g_debounce_ms = ms < 0 ? 0 : (unsigned int)ms;
}

static void emit(int ch, int down, unsigned int time_ms)
{
    ch = seat_map(ch);
    if (g_queue_count >= EVENT_QUEUE)
        return;
    {
        int slot = (g_queue_head + g_queue_count) % EVENT_QUEUE;

        g_queue[slot].channel = ch;
        g_queue[slot].down    = down;
        g_queue[slot].time_ms = time_ms;
        g_queue_count++;
    }
}

/* A channel is down when ANY of its bindings is - see the header note. */
static int level(int ch)
{
    int a;

    if (g_forced[ch])
        return 1;
    for (a = 0; a < g_nbind[ch]; a++) {
        const binding *b = &g_bind[ch][a];

        switch (b->kind) {
        case EZ2_BIND_KEY:
            if (b->sc < SDL_SCANCODE_COUNT && g_key[b->sc])
                return 1;
            break;
        case EZ2_BIND_BUTTON:
            if (ez2_pad_button(b->pad, b->index))
                return 1;
            break;
        case EZ2_BIND_HAT:
            if (ez2_pad_hat_dir(b->pad, b->index, b->dir))
                return 1;
            break;
        default:
            break;
        }
    }
    return 0;
}

static void resolve(int ch, unsigned int time_ms)
{
    int now = level(ch);

    if (now == g_down[ch])
        return;
    if (g_debounce_ms && g_last_edge[ch] &&
        time_ms - g_last_edge[ch] < g_debounce_ms)
        return;                         /* chatter: the level is read again next frame */
    g_last_edge[ch] = time_ms ? time_ms : 1;
    g_down[ch] = now;
    emit(ch, now, time_ms);
}

static void resolve_all(unsigned int time_ms)
{
    int ch;

    for (ch = 0; ch < EZ_IN_COUNT; ch++)
        resolve(ch, time_ms);
}

/* ---- capture ------------------------------------------------------------ */

/* THE RAW CONTROL, for a binding page: the last thing pressed, whatever it is
 * bound to or not. ezInputEvents cannot answer this - it reports CHANNELS, so
 * a control bound to nothing produces no event at all, and "press what you
 * want" has to hear exactly those. */
static SDL_Scancode g_capture = SDL_SCANCODE_UNKNOWN;
static int          g_capture_armed;

void ezInputCaptureArm(int want_axes)
{
    g_capture_armed = 1;
    g_capture       = SDL_SCANCODE_UNKNOWN;
    ez2_pad_capture_arm(want_axes);
}

int ezInputCapture(char *out, int n)
{
    const char *name;

    if (!out || n <= 0)
        return 0;
    /* The device half first: a person binding a pad has usually got a key
     * bound to the same channel already, and the thing they just moved is the
     * thing they mean. */
    if (ez2_pad_capture(out, n)) {
        g_capture_armed = 0;
        g_capture       = SDL_SCANCODE_UNKNOWN;
        return 1;
    }
    if (!g_capture_armed || g_capture == SDL_SCANCODE_UNKNOWN)
        return 0;
    name = SDL_GetScancodeName(g_capture);
    g_capture       = SDL_SCANCODE_UNKNOWN;
    g_capture_armed = 0;
    if (!name || !name[0])
        return 0;
    SDL_strlcpy(out, name, (size_t)n);
    return 1;
}

/* ---- the ways state arrives --------------------------------------------- */

void ez2_input_key(SDL_Scancode sc, int down, unsigned int time_ms)
{
    bind_defaults();
    if (sc >= SDL_SCANCODE_COUNT)
        return;
    if (down && g_capture_armed && g_capture == SDL_SCANCODE_UNKNOWN)
        g_capture = sc;
    if (g_key[sc] == (unsigned char)(down != 0))
        return;                        /* a key repeat is not a new press */
    g_key[sc] = (unsigned char)(down != 0);
    resolve_all(time_ms);
}

void ez2_input_device_changed(unsigned int time_ms)
{
    bind_defaults();
    resolve_all(time_ms);
}

void ez2_input_channel(int channel, int down, unsigned int time_ms)
{
    bind_defaults();
    if (channel < 0 || channel >= EZ_IN_COUNT)
        return;
    g_forced[channel] = (down != 0);
    /* NO DEBOUNCE ON A FORCED EDGE. A scripted press is exact by
     * definition, and the oracle's script can deliver a press's down and
     * up on the SAME frame (a press at a screen's first frame): the up was
     * taken for chatter, START stayed down, and the next START never made
     * an edge - the name entry's confirm at frame 540 of ranking5k was
     * lost that way (2026-09-08). */
    {
        int now = level(channel);

        if (now != g_down[channel]) {
            g_last_edge[channel] = time_ms ? time_ms : 1;
            g_down[channel] = now;
            emit(channel, now, time_ms);
        }
    }
}

/* ---- the seam ----------------------------------------------------------- */

void ezInputPoll(void)
{
    /* The events arrive through the platform pump, so there is nothing to do
     * here. Kept because the engine's shape expects a poll. */
}

int ezInputDown(int channel)
{
    bind_defaults();
    if (channel < 0 || channel >= EZ_IN_COUNT)
        return 0;
    return g_down[seat_map(channel)];
}

int ezInputEvents(EzInputEvent *out, int max)
{
    int n = 0;

    while (n < max && g_queue_count > 0) {
        out[n++] = g_queue[g_queue_head];
        g_queue_head = (g_queue_head + 1) % EVENT_QUEUE;
        g_queue_count--;
    }
    return n;
}
