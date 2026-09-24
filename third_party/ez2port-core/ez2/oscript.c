/* EZ2AC screen-oracle input script - see oscript.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Plain C89-ish and dependency-free on purpose: the injected 2EZ.dll builds
 * it with mingw and the port with whatever CMake finds, and the two must
 * agree to the frame. */
#include "oscript.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { ACT_BUTTON, ACT_COIN, ACT_TT, ACT_QUIT };

typedef struct action {
    unsigned screen;     /* index of the `screen` statement it belongs to */
    unsigned frame;      /* frame within that screen */
    unsigned seq;        /* program order, for a stable sort */
    int      kind;
    int      a, b;       /* button+down, or side+units */
} action;

struct osc {
    char   **screens;    /* the `screen` names, in order; screens[0] is the
                          * implicit one before any `screen` line */
    unsigned nscreens;
    action  *acts;
    unsigned nacts, cap;

    unsigned cur_screen;     /* which screen index the runner is on */
    unsigned frame;          /* frames delivered on it */
    unsigned next;           /* first undelivered action */
    int      done;
};

static const char *const kButtons[OSC_BTN_COUNT] = {
    "start1", "start2", "fx1", "fx2", "fx3", "fx4", "service", "test",
    "p1k1", "p1k2", "p1k3", "p1k4", "p1k5", "p1pedal",
    "p2k1", "p2k2", "p2k3", "p2k4", "p2k5", "p2pedal",
};

int osc_button_id(const char *name)
{
    int i;
    for (i = 0; i < OSC_BTN_COUNT; i++)
        if (strcmp(kButtons[i], name) == 0)
            return i;
    return -1;
}

const char *osc_button_name(int btn)
{
    return (btn >= 0 && btn < OSC_BTN_COUNT) ? kButtons[btn] : "?";
}

static int add_action(osc *s, unsigned screen, unsigned frame, int kind,
                      int a, int b)
{
    action *p;
    if (s->nacts == s->cap) {
        unsigned n = s->cap ? s->cap * 2 : 64;
        p = (action *)realloc(s->acts, n * sizeof *p);
        if (!p)
            return 0;
        s->acts = p;
        s->cap = n;
    }
    p = &s->acts[s->nacts];
    p->screen = screen;
    p->frame = frame;
    p->seq = s->nacts;
    p->kind = kind;
    p->a = a;
    p->b = b;
    s->nacts++;
    return 1;
}

static int add_screen(osc *s, const char *name)
{
    char **p = (char **)realloc(s->screens, (s->nscreens + 1) * sizeof *p);
    if (!p)
        return 0;
    s->screens = p;
    s->screens[s->nscreens] = name ? strdup(name) : 0;
    s->nscreens++;
    return 1;
}

static int cmp_action(const void *x, const void *y)
{
    const action *a = (const action *)x, *b = (const action *)y;
    if (a->screen != b->screen) return a->screen < b->screen ? -1 : 1;
    if (a->frame != b->frame)   return a->frame < b->frame ? -1 : 1;
    return a->seq < b->seq ? -1 : (a->seq > b->seq);
}

static void fail(char *err, size_t errn, int line, const char *msg)
{
    if (err && errn)
        snprintf(err, errn, "line %d: %s", line, msg);
}

osc *osc_parse(const char *text, const char *side, char *err, size_t errn)
{
    osc *s = (osc *)calloc(1, sizeof *s);
    unsigned screen = 0, cursor = 0, base = 0;
    int line = 0;
    const char *p = text;

    if (!s)
        return 0;
    if (!add_screen(s, 0)) { osc_free(s); return 0; }

    while (*p) {
        char buf[256], *w[4];
        int nw = 0;
        const char *e = strchr(p, '\n');
        size_t n = e ? (size_t)(e - p) : strlen(p);
        char *c;

        line++;
        if (n >= sizeof buf) { fail(err, errn, line, "line too long"); osc_free(s); return 0; }
        memcpy(buf, p, n);
        buf[n] = 0;
        p = e ? e + 1 : p + n;

        c = strchr(buf, '#');
        if (c) *c = 0;
        for (c = strtok(buf, " \t\r"); c && nw < 4; c = strtok(0, " \t\r"))
            w[nw++] = c;
        if (nw == 0)
            continue;

        if (strcmp(w[0], "screen") == 0) {
            if (nw != 2) { fail(err, errn, line, "screen NAME"); osc_free(s); return 0; }
            if (!add_screen(s, w[1])) { osc_free(s); return 0; }
            screen++;
            cursor = 0;
            base = 0;
        } else if (strcmp(w[0], "zero") == 0) {
            if (nw != 3) { fail(err, errn, line, "zero SIDE N"); osc_free(s); return 0; }
            if (side && strcmp(w[1], side) == 0)
                base = (unsigned)atoi(w[2]);
        } else if (strcmp(w[0], "at") == 0) {
            if (nw != 2) { fail(err, errn, line, "at N"); osc_free(s); return 0; }
            cursor = base + (unsigned)atoi(w[1]);
        } else if (strcmp(w[0], "wait") == 0) {
            if (nw != 2) { fail(err, errn, line, "wait N"); osc_free(s); return 0; }
            cursor += (unsigned)atoi(w[1]);
        } else if (strcmp(w[0], "press") == 0) {
            int btn, hold = 4;
            if (nw < 2 || nw > 3) { fail(err, errn, line, "press BTN [N]"); osc_free(s); return 0; }
            btn = osc_button_id(w[1]);
            if (btn < 0) { fail(err, errn, line, "unknown button"); osc_free(s); return 0; }
            if (nw == 3) hold = atoi(w[2]);
            if (hold < 1) hold = 1;
            if (!add_action(s, screen, cursor, ACT_BUTTON, btn, 1) ||
                !add_action(s, screen, cursor + (unsigned)hold, ACT_BUTTON, btn, 0)) {
                osc_free(s); return 0;
            }
        } else if (strcmp(w[0], "down") == 0 || strcmp(w[0], "up") == 0) {
            int btn;
            if (nw != 2) { fail(err, errn, line, "down|up BTN"); osc_free(s); return 0; }
            btn = osc_button_id(w[1]);
            if (btn < 0) { fail(err, errn, line, "unknown button"); osc_free(s); return 0; }
            if (!add_action(s, screen, cursor, ACT_BUTTON, btn, w[0][0] == 'd')) {
                osc_free(s); return 0;
            }
        } else if (strcmp(w[0], "coin") == 0) {
            if (!add_action(s, screen, cursor, ACT_COIN, 0, 0)) { osc_free(s); return 0; }
        } else if (strcmp(w[0], "tt") == 0) {
            int side, units, frames, i;
            if (nw != 4) { fail(err, errn, line, "tt p1|p2 UNITS FRAMES"); osc_free(s); return 0; }
            if (strcmp(w[1], "p1") == 0) side = OSC_TT_P1;
            else if (strcmp(w[1], "p2") == 0) side = OSC_TT_P2;
            else { fail(err, errn, line, "tt side is p1 or p2"); osc_free(s); return 0; }
            units = atoi(w[2]);
            frames = atoi(w[3]);
            for (i = 0; i < frames; i++)
                if (!add_action(s, screen, cursor + (unsigned)i, ACT_TT, side, units)) {
                    osc_free(s); return 0;
                }
        } else if (strcmp(w[0], "quit") == 0) {
            if (!add_action(s, screen, cursor, ACT_QUIT, 0, 0)) { osc_free(s); return 0; }
        } else {
            fail(err, errn, line, "unknown statement");
            osc_free(s);
            return 0;
        }
    }

    if (s->nacts)
        qsort(s->acts, s->nacts, sizeof *s->acts, cmp_action);
    return s;
}

osc *osc_load(const char *path, const char *side, char *err, size_t errn)
{
    FILE *f = fopen(path, "rb");
    long sz;
    char *text;
    osc *s;

    if (!f) {
        if (err && errn) snprintf(err, errn, "cannot open %s", path);
        return 0;
    }
    fseek(f, 0, SEEK_END);
    sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz < 0) { fclose(f); return 0; }
    text = (char *)malloc((size_t)sz + 1);
    if (!text) { fclose(f); return 0; }
    if (fread(text, 1, (size_t)sz, f) != (size_t)sz) {
        fclose(f); free(text);
        if (err && errn) snprintf(err, errn, "cannot read %s", path);
        return 0;
    }
    fclose(f);
    text[sz] = 0;
    s = osc_parse(text, side, err, errn);
    free(text);
    return s;
}

void osc_free(osc *s)
{
    unsigned i;
    if (!s)
        return;
    for (i = 0; i < s->nscreens; i++)
        free(s->screens[i]);
    free(s->screens);
    free(s->acts);
    free(s);
}

const char *osc_waiting_for(const osc *s)
{
    if (!s || s->done)
        return 0;
    if (s->next >= s->nacts)
        return 0;
    if (s->acts[s->next].screen > s->cur_screen)
        return s->screens[s->cur_screen + 1];
    return 0;
}

unsigned osc_frame_in_screen(const osc *s)
{
    return s ? s->frame : 0;
}

void osc_screen(osc *s, const char *name)
{
    if (!s || s->done || !name)
        return;
    if (s->cur_screen + 1 < s->nscreens &&
        strcmp(s->screens[s->cur_screen + 1], name) == 0) {
        s->cur_screen++;
        s->frame = 0;
        /* Anything still stamped for an earlier screen is overdue: it was
         * written for frames the runner never reached. Deliver it now
         * rather than silently never - osc_frame's "<= current" does. */
    }
}

static void deliver(osc *s, const action *a, const osc_callbacks *cb)
{
    switch (a->kind) {
    case ACT_BUTTON: if (cb->button) cb->button(cb->user, a->a, a->b); break;
    case ACT_COIN:   if (cb->coin) cb->coin(cb->user); break;
    case ACT_TT:     if (cb->turntable) cb->turntable(cb->user, a->a, a->b); break;
    case ACT_QUIT:
        s->done = 1;
        if (cb->quit) cb->quit(cb->user);
        break;
    }
}

void osc_frame(osc *s, const osc_callbacks *cb)
{
    if (!s || s->done || !cb)
        return;
    s->frame++;
    while (s->next < s->nacts && !s->done) {
        const action *a = &s->acts[s->next];
        if (a->screen > s->cur_screen)
            break;
        if (a->screen == s->cur_screen && a->frame > s->frame)
            break;
        s->next++;
        deliver(s, a, cb);
    }
    if (s->next >= s->nacts)
        s->done = 1;
}

int osc_done(const osc *s)
{
    return !s || s->done;
}
