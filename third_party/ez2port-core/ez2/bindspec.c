/* One binding, as text. See bindspec.h for the grammar and where it came from.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "bindspec.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *const g_hat[EZ2_HAT_COUNT] = {
    "up", "upright", "right", "downright",
    "down", "downleft", "left", "upleft"
};

const char *ez2_hat_name(int dir)
{
    if (dir < 0 || dir >= EZ2_HAT_COUNT)
        return 0;
    return g_hat[dir];
}

static int ieq(const char *a, const char *b)
{
    while (*a && *b) {
        int x = (*a >= 'A' && *a <= 'Z') ? *a + 32 : *a;
        int y = (*b >= 'A' && *b <= 'Z') ? *b + 32 : *b;

        if (x != y)
            return 0;
        a++;
        b++;
    }
    return *a == 0 && *b == 0;
}

int ez2_hat_from_name(const char *name)
{
    int i;

    if (!name)
        return -1;
    for (i = 0; i < EZ2_HAT_COUNT; i++) {
        if (ieq(g_hat[i], name))
            return i;
    }
    return -1;
}

int ez2_bindspec_is_analog(const ez2_bindspec *b)
{
    if (!b)
        return 0;
    return b->kind == EZ2_BIND_AXIS || b->kind == EZ2_BIND_MOUSE ||
           b->kind == EZ2_BIND_VTT;
}

/* A whole non-negative number and nothing else. Returns -1 on anything less,
 * which is what turns `/b` and `/b3x` into a reported typo rather than a
 * button 0 nobody asked for. */
static int whole(const char *s)
{
    char *end = 0;
    long v;

    if (!s || !s[0])
        return -1;
    v = strtol(s, &end, 10);
    if (!end || *end || v < 0 || v > 0xffff)
        return -1;
    return (int)v;
}

/* `a`..`end` compared against `lit`, ignoring case - so the prefix can be
 * tested before the buffer is cut at the slash. */
static int ieq_upto(const char *a, const char *end, const char *lit)
{
    size_t n = (size_t)(end - a);

    if (strlen(lit) != n)
        return 0;
    while (n--) {
        int x = (*a >= 'A' && *a <= 'Z') ? *a + 32 : *a;
        int y = (*lit >= 'A' && *lit <= 'Z') ? *lit + 32 : *lit;

        if (x != y)
            return 0;
        a++;
        lit++;
    }
    return 1;
}

static int is_hex(int c)
{
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
           (c >= 'A' && c <= 'F');
}

/* The `vid:pid[#n]` a device key has to look like. Checked rather than
 * assumed: a device part that is not one is a token this file should decline,
 * not a device that will never be found. */
static int device_key_ok(const char *s)
{
    int i, n = 0;

    if (!s)
        return 0;
    for (i = 0; i < 4; i++)
        if (!is_hex(s[i]))
            return 0;
    if (s[4] != ':')
        return 0;
    for (i = 5; i < 9; i++)
        if (!is_hex(s[i]))
            return 0;
    if (s[9] == 0)
        return 1;
    if (s[9] != '#')
        return 0;
    for (i = 10; s[i]; i++) {
        if (s[i] < '0' || s[i] > '9')
            return 0;
        n++;
    }
    return n > 0;
}

/* device_key_ok over a prefix, again without cutting the buffer. */
static int device_key_upto(const char *a, const char *end)
{
    char tmp[EZ2_BIND_DEV];
    size_t n = (size_t)(end - a);

    if (n == 0 || n + 1 > sizeof(tmp))
        return 0;
    memcpy(tmp, a, n);
    tmp[n] = 0;
    return device_key_ok(tmp);
}

static int parse_inner(const char *text, ez2_bindspec *out)
{
    char buf[128];
    char *slash, *opt;
    const char *tail;

    if (!out)
        return 0;
    memset(out, 0, sizeof(*out));
    out->kind  = EZ2_BIND_NONE;
    out->index = -1;
    out->dir   = -1;
    if (!text || !text[0])
        return 0;

    /* Leading and trailing blanks are the caller's business elsewhere, but a
     * token arriving with them should still work. */
    while (*text == ' ' || *text == '\t')
        text++;
    snprintf(buf, sizeof(buf), "%s", text);
    {
        size_t n = strlen(buf);

        while (n > 0 && (buf[n - 1] == ' ' || buf[n - 1] == '\t'))
            buf[--n] = 0;
    }
    if (!buf[0])
        return 0;

    /* THE VIRTUAL TURNTABLE has no device and no slash - `vtt` or `vtt:4`. */
    if (strncmp(buf, "vtt", 3) == 0 && (buf[3] == 0 || buf[3] == ':')) {
        out->kind   = EZ2_BIND_VTT;
        out->amount = 3;                    /* 2EZConfig's own vttStep default */
        if (buf[3] == ':') {
            int v = whole(buf + 4);

            if (v < 1 || v > 20)
                return 0;
            out->amount = v;
        }
        return 1;
    }

    /* A TOKEN IS A DEVICE SPEC ONLY IF THE PART BEFORE THE SLASH IS ONE.
     *
     * `/` is a key - SDL's name for the slash key, and player two's sixth key
     * in the port's own default map. Treating every slash as the device
     * separator unbound it, which is exactly the kind of quiet regression a
     * default map is there to catch. So the device half is checked FIRST, and
     * a token whose prefix is neither `vid:pid[#n]` nor `mouse` is a key name
     * whatever else is in it. Nothing SDL calls a key looks like `0810:e501`,
     * so the two sets cannot collide. */
    slash = strchr(buf, '/');
    if (!slash || !(ieq_upto(buf, slash, "mouse") || device_key_upto(buf, slash))) {
        out->kind = EZ2_BIND_KEY;
        snprintf(out->key, sizeof(out->key), "%s", buf);
        return 1;
    }
    *slash = 0;
    tail   = slash + 1;
    if (!tail[0])
        return 0;

    /* An option is `:something` after the control. The device part's own colon
     * is safely before the slash. */
    {
        char *t = (char *)tail;

        opt = strchr(t, ':');
        if (opt)
            *opt++ = 0;
    }

    /* THE MOUSE, which has no vid:pid. */
    if (ieq(buf, "mouse")) {
        if (ieq(tail, "x"))
            out->index = 0;
        else if (ieq(tail, "y"))
            out->index = 1;
        else
            return 0;
        out->kind   = EZ2_BIND_MOUSE;
        out->amount = 5;              /* 2EZConfig's mouseSensitivity default */
        if (opt) {
            int v = whole(opt);

            if (v < 1 || v > 20)
                return 0;
            out->amount = v;
        }
        return 1;
    }

    if (!device_key_ok(buf))
        return 0;
    snprintf(out->device, sizeof(out->device), "%s", buf);

    if (tail[0] == 'b' || tail[0] == 'B') {
        int v = whole(tail + 1);

        if (v < 0 || opt)
            return 0;
        out->kind  = EZ2_BIND_BUTTON;
        out->index = v;
        return 1;
    }
    if (tail[0] == 'a' || tail[0] == 'A') {
        int v = whole(tail + 1);

        if (v < 0)
            return 0;
        out->kind    = EZ2_BIND_AXIS;
        out->index   = v;
        out->reverse = 0;
        out->velocity = 0;
        if (opt) {
            /* `rev`, `vel`, or both with a comma between: a controller whose
             * axis is a spin SPEED about centre (an arcade I/O adapter, the
             * cabinet's own board through one) rather than a wrapping
             * position, which differenced reads every slowdown as a reversal */
            char tmp[32], *q, *nx;
            if (strlen(opt) >= sizeof tmp)
                return 0;
            strcpy(tmp, opt);
            for (q = tmp; q && *q; q = nx) {
                nx = strchr(q, ',');
                if (nx) *nx++ = 0;
                if (ieq(q, "rev"))      out->reverse = 1;
                else if (ieq(q, "vel")) out->velocity = 1;
                else return 0;
            }
        }
        return 1;
    }
    if (tail[0] == 'h' || tail[0] == 'H') {
        /* `h<N>.<dir>` - the dot separates the hat from its direction, and
         * both halves are required. A hat with no direction is not a button. */
        char *dot = strchr((char *)tail, '.');
        int v, d;

        if (!dot || opt)
            return 0;
        *dot = 0;
        v = whole(tail + 1);
        d = ez2_hat_from_name(dot + 1);
        if (v < 0 || d < 0)
            return 0;
        out->kind  = EZ2_BIND_HAT;
        out->index = v;
        out->dir   = d;
        return 1;
    }
    return 0;
}

/* A FAILED PARSE LEAVES NOTHING BEHIND. The inner function fills `out` as it
 * goes and bails from several places; a caller that checks the return value
 * would be fine either way, but one that looks at `kind` after a false - which
 * is the natural thing to do - would find `vtt:99` left as a valid VTT with
 * its default step, and bind it. So the failure path clears the whole thing
 * and there is exactly one place that decides. */
int ez2_bindspec_parse(const char *text, ez2_bindspec *out)
{
    if (!out)
        return 0;
    if (parse_inner(text, out))
        return 1;
    memset(out, 0, sizeof(*out));
    out->kind  = EZ2_BIND_NONE;
    out->index = -1;
    out->dir   = -1;
    return 0;
}

int ez2_bindspec_format(const ez2_bindspec *b, char *out, size_t n)
{
    char buf[128];

    if (out && n)
        out[0] = 0;             /* nothing to say is an EMPTY string, not the
                                   caller's previous contents */
    if (!b)
        return 0;
    buf[0] = 0;
    switch (b->kind) {
    case EZ2_BIND_KEY:
        snprintf(buf, sizeof(buf), "%s", b->key);
        break;
    case EZ2_BIND_BUTTON:
        snprintf(buf, sizeof(buf), "%s/b%d", b->device, b->index);
        break;
    case EZ2_BIND_HAT:
        snprintf(buf, sizeof(buf), "%s/h%d.%s", b->device, b->index,
                 ez2_hat_name(b->dir) ? ez2_hat_name(b->dir) : "up");
        break;
    case EZ2_BIND_AXIS:
        if (b->reverse && b->velocity)
            snprintf(buf, sizeof(buf), "%s/a%d:rev,vel", b->device, b->index);
        else if (b->velocity)
            snprintf(buf, sizeof(buf), "%s/a%d:vel", b->device, b->index);
        else if (b->reverse)
            snprintf(buf, sizeof(buf), "%s/a%d:rev", b->device, b->index);
        else
            snprintf(buf, sizeof(buf), "%s/a%d", b->device, b->index);
        break;
    case EZ2_BIND_MOUSE:
        /* The default is written out only when it is NOT the default, so a
         * file a person has not customised stays as short as it reads. */
        if (b->amount != 5)
            snprintf(buf, sizeof(buf), "mouse/%c:%d",
                     b->index == 1 ? 'y' : 'x', b->amount);
        else
            snprintf(buf, sizeof(buf), "mouse/%c", b->index == 1 ? 'y' : 'x');
        break;
    case EZ2_BIND_VTT:
        if (b->amount != 3)
            snprintf(buf, sizeof(buf), "vtt:%d", b->amount);
        else
            snprintf(buf, sizeof(buf), "vtt");
        break;
    default:
        return 0;
    }
    if (out && n)
        snprintf(out, n, "%s", buf);
    return (int)strlen(buf) + 1;
}
