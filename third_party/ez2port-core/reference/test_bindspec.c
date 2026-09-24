/* The binding grammar: a key, a pad button, a hat direction, a turntable.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Entirely self-contained - a binding is text, so none of this needs SDL, a
 * window, or anything plugged in. That is the same reason ez2/keyconf.c's
 * parser lives in ez2core.
 */
#include "../ez2/bindspec.h"
#include "../ez2/keyconf.h"

#include <stdio.h>
#include <string.h>

static int failures;

static void check(int cond, const char *what)
{
    printf("%s %s\n", cond ? "ok:  " : "FAIL:", what);
    if (!cond)
        failures++;
}

static int parse(const char *s, ez2_bindspec *b)
{
    return ez2_bindspec_parse(s, b);
}

/* ---- keys still work, which is the compatibility promise ---------------- */

static void test_keys(void)
{
    ez2_bindspec b;

    check(parse("S", &b) && b.kind == EZ2_BIND_KEY && strcmp(b.key, "S") == 0,
          "a bare name is a key");
    check(parse("Left Ctrl", &b) && b.kind == EZ2_BIND_KEY &&
          strcmp(b.key, "Left Ctrl") == 0,
          "and so is one with a space in it");

    /* THE ONE THAT BIT. `/` is SDL's name for the slash key AND player two's
     * sixth key in the port's own default map; reading every slash as the
     * device separator unbound it silently. */
    check(parse("/", &b) && b.kind == EZ2_BIND_KEY && strcmp(b.key, "/") == 0,
          "`/` is the slash KEY, not an empty device - the default map's "
          "P2Key6 depends on it");
    check(parse("\\", &b) && b.kind == EZ2_BIND_KEY,
          "and the other punctuation keys are untouched");
    check(parse(";", &b) && b.kind == EZ2_BIND_KEY, "including the semicolon");

    /* Every key in the shipped default map has to survive the parser. */
    {
        ez2_keyconf kc;
        int ch, all = 1;

        ez2_keyconf_defaults(&kc);
        for (ch = 0; ch < EZ2_KEY_CHANNELS; ch++) {
            int a;

            for (a = 0; a < kc.count[ch]; a++) {
                if (!parse(kc.names[ch][a], &b) || b.kind != EZ2_BIND_KEY)
                    all = 0;
            }
        }
        check(all, "and EVERY binding in the shipped default map still reads "
                   "as a key");
    }
}

/* ---- what 2EZConfig can bind that the port could not -------------------- */

static void test_devices(void)
{
    ez2_bindspec b;

    check(parse("0810:e501/b3", &b) && b.kind == EZ2_BIND_BUTTON &&
          strcmp(b.device, "0810:e501") == 0 && b.index == 3,
          "a pad button - 2EZConfig's ButtonBinding.buttonIdx");
    check(parse("0810:e501#2/b12", &b) && b.kind == EZ2_BIND_BUTTON &&
          strcmp(b.device, "0810:e501#2") == 0 && b.index == 12,
          "and `#n` picks the n-th board of that make - the same device key "
          "lights.ini uses");

    check(parse("0810:e501/h0.up", &b) && b.kind == EZ2_BIND_HAT &&
          b.index == 0 && b.dir == EZ2_HAT_UP,
          "a hat DIRECTION held as a button - ButtonAnalogType::HS_UP");
    check(parse("0810:e501/h1.downleft", &b) && b.dir == EZ2_HAT_DOWNLEFT,
          "and the diagonals are their own directions, as HS_* has them");

    check(parse("0810:e501/a2", &b) && b.kind == EZ2_BIND_AXIS &&
          b.index == 2 && !b.reverse,
          "an axis - AnalogBinding.axisIdx");
    check(parse("0810:e501/a2:rev", &b) && b.reverse,
          "with AnalogBinding's `reverse`");

    check(parse("mouse/x", &b) && b.kind == EZ2_BIND_MOUSE && b.index == 0 &&
          b.amount == 5,
          "the mouse as a turntable, at 2EZConfig's own default sensitivity");
    check(parse("mouse/y:8", &b) && b.index == 1 && b.amount == 8,
          "and the sensitivity is settable, as mouseSensitivity is");

    check(parse("vtt", &b) && b.kind == EZ2_BIND_VTT && b.amount == 3,
          "the VIRTUAL turntable, at 2EZConfig's own vttStep default");
    check(parse("vtt:4", &b) && b.amount == 4, "with its step settable");
}

static void test_analog_split(void)
{
    ez2_bindspec b;

    parse("0810:e501/a0", &b);
    check(ez2_bindspec_is_analog(&b), "an axis drives a turntable");
    parse("mouse/x", &b);
    check(ez2_bindspec_is_analog(&b), "so does the mouse");
    parse("vtt", &b);
    check(ez2_bindspec_is_analog(&b), "and so does the virtual one");
    parse("0810:e501/b3", &b);
    check(!ez2_bindspec_is_analog(&b),
          "a button does NOT - a wheel bound to a button could not turn, and "
          "the binding page refuses it for that reason");
    parse("S", &b);
    check(!ez2_bindspec_is_analog(&b), "nor does a key");
}

/* ---- a typo is reported, not silently bound ---------------------------- */

static void test_typos(void)
{
    ez2_bindspec b;
    static const char *const bad[] = {
        "0810:e501/b",           /* no number */
        "0810:e501/b3x",         /* trailing junk */
        "0810:e501/h0",          /* a hat with no direction is not a button */
        "0810:e501/h0.sideways",
        "0810:e501/z1",          /* no such control letter */
        "0810:e501/a1:flip",     /* the only axis option is :rev */
        "mouse/z",
        "vtt:99"                 /* out of the 1..20 range */
    };
    unsigned i;
    int all = 1;

    for (i = 0; i < sizeof(bad) / sizeof(bad[0]); i++) {
        if (parse(bad[i], &b) || b.kind != EZ2_BIND_NONE)
            all = 0;
    }
    check(all, "a malformed DEVICE spec is refused, and leaves nothing "
               "behind - `vtt:99` must not land as a default-step vtt");

    /* But a token that is not device-shaped at all is a key name, whatever is
     * in it - that is what keeps an unknown SDL spelling a backend problem
     * rather than a parse error. */
    check(parse("081:e501/b1", &b) && b.kind == EZ2_BIND_KEY,
          "a prefix that is not vid:pid is a key NAME, not a broken device");
}

static void test_roundtrip(void)
{
    static const char *const specs[] = {
        "S", "Left Ctrl", "/", "0810:e501/b3", "0810:e501#2/b12",
        "0810:e501/h0.up", "0810:e501/h1.downleft", "0810:e501/a2",
        "0810:e501/a2:rev", "mouse/x", "mouse/y:8", "vtt", "vtt:4"
    };
    unsigned i;
    int all = 1;

    for (i = 0; i < sizeof(specs) / sizeof(specs[0]); i++) {
        ez2_bindspec b;
        char back[64];

        if (!parse(specs[i], &b))
            { all = 0; continue; }
        ez2_bindspec_format(&b, back, sizeof back);
        if (strcmp(back, specs[i]) != 0) {
            printf("     %s -> %s\n", specs[i], back);
            all = 0;
        }
    }
    check(all, "every spelling round-trips through format byte for byte");

    {
        ez2_bindspec b;
        char back[64];

        memset(&b, 0, sizeof b);
        b.kind = EZ2_BIND_NONE;
        snprintf(back, sizeof back, "leftovers");
        ez2_bindspec_format(&b, back, sizeof back);
        check(back[0] == 0,
              "and formatting nothing writes an EMPTY string, not whatever "
              "the caller had in the buffer");
    }
}

/* ---- the file the bindings live in -------------------------------------- */

static void test_keyconf_analog(void)
{
    ez2_keyconf kc;
    int bad = 0, n;
    static const char ini[] =
        "[Keys]\n"
        "Key1 = S, 0810:e501/b3\n"
        "[Analog]\n"
        "Turntable = 0810:e501/a0:rev\n"
        "P2 Turntable = vtt:4\n";

    ez2_keyconf_defaults(&kc);
    check(kc.analog[0][0] == 0 && kc.analog[1][0] == 0,
          "no turntable is bound by default - a keyboard player scratches on "
          "the two digital channels and needs no encoder");

    n = ez2_keyconf_parse(ini, sizeof(ini) - 1, &kc, &bad);
    check(n == 3 && bad == 0, "keys and analogs parse from one file");
    check(kc.count[EZ2_KEY_CH_KEY1] == 2 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY1][1], "0810:e501/b3") == 0,
          "a channel takes a key AND a pad button as alternates - which is "
          "what makes both reach it");
    check(strcmp(kc.analog[0], "0810:e501/a0:rev") == 0,
          "the turntable takes its axis");
    check(strcmp(kc.analog[1], "vtt:4") == 0,
          "and 2EZConfig's spelling `P2 Turntable` is accepted as an alias, "
          "so a name copied from lights.ini or from 2EZConfig still lands");

    /* `#` is a device key's, not only a comment's. */
    ez2_keyconf_defaults(&kc);
    ez2_keyconf_parse("Key1 = 0810:e501#2/b3\n", 22, &kc, &bad);
    check(strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "0810:e501#2/b3") == 0,
          "an UNQUOTED `#` inside a device key is part of it - taking it as a "
          "comment would bind the FIRST board instead, silently");
    ez2_keyconf_defaults(&kc);
    ez2_keyconf_parse("Key1 = Z\n# still a comment\n", 26, &kc, &bad);
    check(strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "Z") == 0,
          "while a `#` starting a line is still a comment");
}

static void test_keyconf_roundtrip(void)
{
    ez2_keyconf a, b;
    char buf[8192];
    int need, bad = 0;

    ez2_keyconf_defaults(&a);
    snprintf(a.names[EZ2_KEY_CH_KEY1][0], EZ2_KEY_NAME, "%s", "0810:e501/b3");
    a.count[EZ2_KEY_CH_KEY1] = 1;
    snprintf(a.analog[0], EZ2_KEY_NAME, "%s", "0810:e501/a0:rev");
    snprintf(a.analog[1], EZ2_KEY_NAME, "%s", "vtt:4");

    need = ez2_keyconf_format(&a, buf, sizeof buf);
    check(need > 0 && need < (int)sizeof buf, "the map formats into a buffer");

    ez2_keyconf_defaults(&b);
    ez2_keyconf_parse(buf, strlen(buf), &b, &bad);
    check(bad == 0, "and reads back with no line it cannot understand");
    check(strcmp(b.names[EZ2_KEY_CH_KEY1][0], "0810:e501/b3") == 0 &&
          strcmp(b.analog[0], "0810:e501/a0:rev") == 0 &&
          strcmp(b.analog[1], "vtt:4") == 0,
          "with the pad button and both turntables intact");
    check(memcmp(&a, &b, sizeof a) == 0,
          "and the whole map round-trips exactly");
}

int main(void)
{
    test_keys();
    test_devices();
    test_analog_split();
    test_typos();
    test_roundtrip();
    test_keyconf_analog();
    test_keyconf_roundtrip();

    printf(failures ? "\nFAILED (%d)\n" : "\nPASSED\n", failures);
    return failures ? 1 : 0;
}
