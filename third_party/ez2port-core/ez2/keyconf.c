/* Which physical keys drive which input channel. See keyconf.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "keyconf.h"
#include "util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Spelled as a config file spells them, and matched ignoring case. The order
 * IS the channel order - keyconf.h's enum indexes this. */
static const char *const kChannelNames[EZ2_KEY_CHANNELS] = {
    "Key1", "Key2", "Key3", "Key4", "Key5", "Key6", "Key7",
    "Scratch1", "Scratch2", "Pedal", "Start",
    "Effect1", "Effect2", "Effect3", "Effect4",
    "P2Key1", "P2Key2", "P2Key3", "P2Key4", "P2Key5", "P2Key6", "P2Key7",
    "P2Scratch1", "P2Scratch2", "P2Pedal", "P2Start",
    "Test", "Service", "Coin"
};

/* SDL scancode names, AS SDL SPELLS THEM - which is not always the obvious
 * word: the semicolon key is ";" and "Semicolon" resolves to nothing. This
 * file only carries the strings; the backend resolves them. */
/* THE DEFAULT LAYOUT, chosen by the project owner 2026-08-30 and shaped like
 * the keyboard layouts these games are usually played on rather than like the
 * cabinet: each player's five buttons alternate between two rows, the
 * turntable sits under the little finger on two modifiers, and the effector
 * row takes the home keys between the two hands.
 *
 *     P1   B1..B5   Z S X D C      bottom Z X C, top S D
 *          scratch  Left Ctrl / Left Shift
 *          start    Return         pedal  Space
 *     FX   1..4     F G H J
 *     P2   B1..B5   M K , L .      the mirror: bottom M , . top K L
 *          scratch  Right Ctrl / Right Shift
 *          start    \              pedal  Right Alt
 *
 * B6/B7 and P2's pedal were NOT specified and are picked here to continue
 * each cluster without colliding: P1 runs on along the bottom row to V and B,
 * P2 to / and ;, and P2's pedal moves off Right Shift because the scratch now
 * has it. They are the ones to change first if a 7-key mode feels wrong.
 *
 * `,` and `;` are separator and comment in a keys.ini and must be QUOTED
 * there; here they are C strings and need nothing. */
static const char *const kDefaults[EZ2_KEY_CHANNELS] = {
    "Z", "S", "X", "D", "C", "V", "B",
    "Left Ctrl", "Left Shift", "Space", "Return",
    "F", "G", "H", "J",
    "M", "K", ",", "L", ".", "/", ";",
    "Right Ctrl", "Right Shift", "Right Alt", "\\",
    /* The operator pair, on the function keys so they sit clear of every
     * play key and of the option row - and the coin input on F3, which is
     * the key bindButtons @0x418c90 gives it on the cabinet's own keyboard. */
    "F1", "F2", "F3"
};

/* The two turntables. keys.ini's own convention is one word ("P2Scratch1"),
 * so that is what gets WRITTEN; 2EZConfig's and lights.ini's spaced spelling
 * is accepted on the way in so a device key copied from either still lands. */
static const char *const kAnalogNames[EZ2_KEY_ANALOGS] = {
    "Turntable", "P2Turntable"
};
static const char *const kAnalogAlias[EZ2_KEY_ANALOGS] = {
    "P1 Turntable", "P2 Turntable"
};

const char *ez2_keyconf_channel_name(int channel)
{
    if (channel < 0 || channel >= EZ2_KEY_CHANNELS)
        return 0;
    return kChannelNames[channel];
}

int ez2_keyconf_channel_from_name(const char *name)
{
    int i;

    if (name == 0)
        return -1;
    for (i = 0; i < EZ2_KEY_CHANNELS; i++)
        if (ez2_ci_equal(name, kChannelNames[i]))
            return i;
    return -1;
}

void ez2_keyconf_defaults(ez2_keyconf *out)
{
    int i;

    if (out == 0)
        return;
    memset(out, 0, sizeof *out);
    for (i = 0; i < EZ2_KEY_CHANNELS; i++) {
        strncpy(out->names[i][0], kDefaults[i], EZ2_KEY_NAME - 1);
        out->count[i] = 1;
    }
}

/* Whitespace only. Comments are NOT handled here - see below. */
static char *clean(char *s)
{
    char *end;

    while (*s == ' ' || *s == '\t')
        s++;
    end = s + strlen(s);
    while (end > s && (end[-1] == ' ' || end[-1] == '\t' ||
                       end[-1] == '\r' || end[-1] == '\n'))
        *--end = 0;
    return s;
}

/* SPLITTING A VALUE IS QUOTE-AWARE, AND IT HAS TO BE: `;` and `#` start a
 * comment, and `;` is also SDL's NAME FOR THE SEMICOLON KEY. Without quoting,
 * `Key7 = ;` - the obvious way to write the default binding - silently unbinds
 * the channel instead. So a name may be quoted, and inside quotes nothing is
 * a comment and nothing is a separator:
 *
 *     Key7 = ";"           the semicolon key
 *     Key7 = ";", "#"      two of them
 *     Key1 = Z ; a note    a trailing comment, since the ; is outside quotes
 *
 * Writes up to `max` names into `out` and returns how many. */
static int split_value(char *val, char out[][EZ2_KEY_NAME], int max)
{
    int n = 0;

    while (n < max) {
        char name[EZ2_KEY_NAME];
        size_t len = 0;
        int quoted = 0, comma = 0, comment = 0;

        while (*val == ' ' || *val == '\t')
            val++;

        while (*val) {
            if (*val == '"') {
                quoted = !quoted;
                val++;
                continue;
            }
            if (!quoted) {
                if (*val == ';')               { comment = 1; break; }
                /* `#` STARTS A COMMENT ONLY AT THE START OF A NAME. It is
                 * also part of a device key - `0810:e501#2` is the second
                 * board of that make (ez2/bindspec.h) - and taking it as a
                 * comment mid-token would silently bind the channel to the
                 * FIRST board instead. A binding that reads fine and drives
                 * the wrong device is the failure this format exists to
                 * avoid, and it is the same rule lights.ini settled on for
                 * the same reason. Quoting still works and is what the
                 * writer emits. */
                if (*val == '#' && len == 0)   { comment = 1; break; }
                if (*val == ',')               { val++; comma = 1; break; }
            }
            if (len + 1 < sizeof name)
                name[len++] = *val;
            val++;
        }
        while (len && (name[len - 1] == ' ' || name[len - 1] == '\t'))
            len--;
        name[len] = 0;

        if (len) {
            /* THE WHOLE SLOT, not just the string. Two maps built the same way
             * have to compare equal - a caller checking whether what it holds
             * still matches the file should not be defeated by whatever was on
             * the stack behind a short name. */
            memset(out[n], 0, EZ2_KEY_NAME);
            memcpy(out[n], name, len);
            n++;
        }
        if (comment || (!comma && *val == 0))
            break;
    }
    return n;
}

const char *ez2_keyconf_analog_name(int which)
{
    if (which < 0 || which >= EZ2_KEY_ANALOGS)
        return 0;
    return kAnalogNames[which];
}

int ez2_keyconf_analog_from_name(const char *name)
{
    int i;

    if (name == 0)
        return -1;
    for (i = 0; i < EZ2_KEY_ANALOGS; i++) {
        if (ez2_ci_equal(kAnalogNames[i], name) || ez2_ci_equal(kAnalogAlias[i], name))
            return i;
    }
    return -1;
}

int ez2_keyconf_parse(const char *text, size_t n, ez2_keyconf *out,
                      int *bad_line)
{
    char line[512];
    size_t i = 0;
    int lineno = 0, set = 0;
    /* Which section the lines belong to. The file had one and the parser
     * simply skipped every `[...]`; now `[Analog]` means something, so the
     * head has to be READ rather than ignored. Anything unrecognised is
     * treated as [Keys], which is what keeps a file written before this
     * existed - and one with no section head at all - reading as it did. */
    int in_analog = 0;

    if (bad_line)
        *bad_line = 0;
    if (text == 0 || out == 0)
        return EZ2_KEYCONF_ERR_ARG;

    while (i < n) {
        size_t len = 0;
        char *p, *eq, *key;
        int channel;

        while (i < n && text[i] != '\n' && len + 1 < sizeof line)
            line[len++] = text[i++];
        while (i < n && text[i] != '\n')
            i++;                          /* an over-long line is truncated */
        if (i < n)
            i++;
        line[len] = 0;
        lineno++;

        p = clean(line);
        /* blank or a whole-line comment */
        if (*p == 0 || *p == ';' || *p == '#')
            continue;
        if (*p == '[') {
            in_analog = (strstr(p, "nalog") != 0 || strstr(p, "NALOG") != 0);
            continue;
        }

        eq = strchr(p, '=');
        if (eq == 0) {
            if (bad_line && *bad_line == 0)
                *bad_line = lineno;
            continue;
        }
        *eq = 0;
        key = clean(p);

        if (in_analog) {
            /* A turntable takes ONE binding, not a list: it is one physical
             * control, and "the axis or the mouse, whichever moved" is not a
             * thing a wheel can be. So the value is split the same way and
             * only the first name is kept. */
            int which = ez2_keyconf_analog_from_name(key);
            char got[EZ2_KEY_ALTS][EZ2_KEY_NAME];
            int k;

            memset(got, 0, sizeof got);

            if (which < 0) {
                if (bad_line && *bad_line == 0)
                    *bad_line = lineno;
                continue;
            }
            memset(out->analog[which], 0, EZ2_KEY_NAME);
            k = split_value(clean(eq + 1), got, EZ2_KEY_ALTS);
            if (k > 0)
                memcpy(out->analog[which], got[0], EZ2_KEY_NAME);
            set++;
            continue;
        }

        channel = ez2_keyconf_channel_from_name(key);
        if (channel < 0) {
            if (bad_line && *bad_line == 0)
                *bad_line = lineno;
            continue;
        }

        /* A named channel is REPLACED, not added to - otherwise a file could
         * only ever grow the map and never narrow it. An empty value is a
         * legitimate "nothing drives this". */
        out->count[channel] = split_value(clean(eq + 1), out->names[channel],
                                          EZ2_KEY_ALTS);
        set++;
    }
    return set;
}

int ez2_keyconf_load(const char *path, ez2_keyconf *out, int *bad_line)
{
    FILE *f;
    char *buf;
    long sz;
    int rc;

    if (bad_line)
        *bad_line = 0;
    if (path == 0 || out == 0)
        return EZ2_KEYCONF_ERR_ARG;

    f = fopen(path, "rb");
    if (f == 0)
        return EZ2_KEYCONF_ABSENT;
    if (fseek(f, 0, SEEK_END) != 0 || (sz = ftell(f)) < 0 ||
        fseek(f, 0, SEEK_SET) != 0) { fclose(f); return EZ2_KEYCONF_ERR_READ; }
    buf = (char *)malloc((size_t)sz + 1);
    if (buf == 0) { fclose(f); return EZ2_KEYCONF_ERR_READ; }
    if (fread(buf, 1, (size_t)sz, f) != (size_t)sz) {
        free(buf); fclose(f); return EZ2_KEYCONF_ERR_READ;
    }
    buf[sz] = 0;
    fclose(f);

    rc = ez2_keyconf_parse(buf, (size_t)sz, out, bad_line);
    free(buf);
    return rc;
}

/* ---- writing it back ---------------------------------------------------- */

/* A value needs quoting exactly where the parser would misread it: the two
 * comment characters and the separator. */
static int needs_quotes(const char *v)
{
    for (; *v; v++)
        if (*v == ';' || *v == '#' || *v == ',' || *v == '"')
            return 1;
    return 0;
}

int ez2_keyconf_format(const ez2_keyconf *kc, char *out, size_t n)
{
    /* A tiny appender so the "how much would it need" answer is exact even
     * when the buffer is short - the caller sizes from the return value. */
    size_t used = 0;
    int ch;

#define PUT(str)                                                        \
    do {                                                                \
        const char *p_ = (str);                                         \
        while (*p_) {                                                   \
            if (out && used + 1 < n)                                    \
                out[used] = *p_;                                        \
            used++;                                                     \
            p_++;                                                       \
        }                                                               \
    } while (0)

    if (!kc)
        return 0;

    PUT("; EZ2PORT key map - written by the test menu's rebind page.\n");
    PUT("; The channel names and the quoting rules are ez2/keyconf.h's.\n");
    PUT("[Keys]\n");

    for (ch = 0; ch < EZ2_KEY_CHANNELS; ch++) {
        int a;

        PUT(ez2_keyconf_channel_name(ch));
        PUT(" = ");
        for (a = 0; a < kc->count[ch]; a++) {
            const char *v = kc->names[ch][a];

            if (a)
                PUT(", ");
            if (needs_quotes(v)) {
                PUT("\"");
                PUT(v);
                PUT("\"");
            } else {
                PUT(v);
            }
        }
        PUT("\n");
    }

    /* The turntables, always written - a commented-out row says the setting
     * exists, which an absent one does not, and "how do I bind my turntable"
     * should be answerable by opening the file. */
    PUT("\n; A turntable is an axis (0810:e501/a0, :rev to flip), the mouse\n");
    PUT("; (mouse/x:8), or `vtt` - the two scratch keys driving a virtual one.\n");
    PUT("[Analog]\n");
    for (ch = 0; ch < EZ2_KEY_ANALOGS; ch++) {
        if (kc->analog[ch][0]) {
            PUT(ez2_keyconf_analog_name(ch));
            PUT(" = ");
            PUT(kc->analog[ch]);
        } else {
            PUT(";");
            PUT(ez2_keyconf_analog_name(ch));
            PUT(" =");
        }
        PUT("\n");
    }
#undef PUT

    if (out && n > 0)
        out[used < n ? used : n - 1] = 0;
    return (int)used + 1;          /* including the terminator */
}

int ez2_keyconf_save(const char *path, const ez2_keyconf *kc)
{
    char *buf;
    int need;
    FILE *f;
    size_t wrote;

    if (!path || !kc)
        return EZ2_KEYCONF_ERR_ARG;
    need = ez2_keyconf_format(kc, 0, 0);
    if (need <= 0)
        return EZ2_KEYCONF_ERR_ARG;
    buf = (char *)malloc((size_t)need);
    if (!buf)
        return EZ2_KEYCONF_ERR_READ;
    ez2_keyconf_format(kc, buf, (size_t)need);

    f = fopen(path, "wb");
    if (!f) { free(buf); return EZ2_KEYCONF_ERR_READ; }
    wrote = fwrite(buf, 1, strlen(buf), f);
    fclose(f);
    free(buf);
    return wrote ? 0 : EZ2_KEYCONF_ERR_READ;
}
