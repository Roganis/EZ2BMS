/* Which physical keys drive which input channel.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Entirely self-contained: the parser never mentions SDL, which is the reason
 * it lives in ez2core rather than in the backend.
 */
#include "../ez2/keyconf.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int failures;

static void check(int cond, const char *what)
{
    printf("%s %s\n", cond ? "ok:  " : "FAIL:", what);
    if (!cond)
        failures++;
}

static int parse(const char *text, ez2_keyconf *kc, int *bad)
{
    ez2_keyconf_defaults(kc);
    return ez2_keyconf_parse(text, strlen(text), kc, bad);
}

static void test_defaults(void)
{
    ez2_keyconf kc;

    ez2_keyconf_defaults(&kc);
    check(kc.count[EZ2_KEY_CH_KEY1] == 1 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "Z") == 0 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY5][0], "C") == 0 &&
          strcmp(kc.names[EZ2_KEY_CH_SCRATCH_UP][0], "Left Ctrl") == 0 &&
          strcmp(kc.names[EZ2_KEY_CH_EFFECT1][0], "F") == 0 &&
          strcmp(kc.names[EZ2_KEY_CH_P2_KEY3][0], ",") == 0 &&
          strcmp(kc.names[EZ2_KEY_CH_P2_START][0], "\\") == 0,
          "the defaults are the two-hand keyboard layout");
    check(strcmp(kc.names[EZ2_KEY_CH_PEDAL][0], "Space") == 0,
          "including the pedal on space");
    check(EZ2_KEY_CHANNELS == 29,
          "twenty-nine channels, mirroring platform.h's EZ_IN_COUNT - the "
          "effector row and player 2's bank appended 2026-08-30, the "
          "cabinet's TEST and SERVICE buttons 2026-08-31, the coin input "
          "2026-09-03");
    check(strcmp(kc.names[EZ2_KEY_CH_COIN][0], "F3") == 0,
          "the coin input on F3, the original's own coin key");
    check(strcmp(kc.names[EZ2_KEY_CH_TEST][0], "F1") == 0 &&
          strcmp(kc.names[EZ2_KEY_CH_SERVICE][0], "F2") == 0,
          "and the operator pair defaults clear of every play key");
    check(ez2_keyconf_channel_from_name("Test") == EZ2_KEY_CH_TEST &&
          ez2_keyconf_channel_from_name("service") == EZ2_KEY_CH_SERVICE,
          "both are nameable in a keys.ini like any other channel");
}

static void test_names(void)
{
    check(ez2_keyconf_channel_from_name("Scratch1") == EZ2_KEY_CH_SCRATCH_UP,
          "a channel resolves from its config-file name");
    check(ez2_keyconf_channel_from_name("sCrAtCh2") == EZ2_KEY_CH_SCRATCH_DOWN,
          "and does so ignoring case");
    check(ez2_keyconf_channel_from_name("Turntable") == -1,
          "a name that is not a channel resolves to nothing");
    check(strcmp(ez2_keyconf_channel_name(EZ2_KEY_CH_START), "Start") == 0,
          "and the mapping goes back the other way");
    check(ez2_keyconf_channel_name(EZ2_KEY_CHANNELS) == 0,
          "an out-of-range channel has no name rather than a wild pointer");
}

static void test_parse(void)
{
    ez2_keyconf kc;
    int bad = -1;

    /* A key that is NOT in the default layout, so "it was set" and "it was
       already that" cannot be confused. */
    check(parse("[Keys]\nKey1 = P\n", &kc, &bad) == 1,
          "one assignment sets one channel");
    check(strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "P") == 0, "to the named key");
    check(strcmp(kc.names[EZ2_KEY_CH_KEY2][0], "S") == 0,
          "and leaves every other channel on its default");
    check(bad == 0, "with nothing reported as unparseable");

    parse("Scratch1 = A, Q ,  Left Shift\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_SCRATCH_UP] == 3 &&
          strcmp(kc.names[EZ2_KEY_CH_SCRATCH_UP][2], "Left Shift") == 0,
          "a comma list gives alternates, and a name may contain a space");

    /* Replace, not append - or a file could only ever grow the map. */
    parse("Key1 = Z\nKey1 = X\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_KEY1] == 1 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "X") == 0,
          "naming a channel twice REPLACES it, it does not accumulate");

    parse("Key1 =\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_KEY1] == 0,
          "an empty value unbinds the channel, which is a thing to want");

    parse("Pedal = A, B, C, D, E, F\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_PEDAL] == EZ2_KEY_ALTS,
          "more alternates than there is room for are cut, not overflowed");
}

static void test_syntax(void)
{
    ez2_keyconf kc;
    int bad = -1;

    check(parse("; a comment\n[Keys]\n\n   \nKey1 = Z ; trailing\n", &kc, &bad)
          == 1 && bad == 0,
          "comments, blank lines and a section head are all skipped");
    check(strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "Z") == 0,
          "and a trailing comment does not become part of the key name");

    check(parse("Key1 = Z\n# hash comments too\n", &kc, &bad) == 1 && bad == 0,
          "both comment characters work - the game's .ini uses one, the rest "
          "of the world the other");

    parse("Key1 = Z\nTurntable = A\n", &kc, &bad);
    check(bad == 3 - 1, "an unknown channel reports ITS line number");

    parse("Key1 = Z\nnonsense\n", &kc, &bad);
    check(bad == 2, "and so does a line with no '='");

    /* `;` IS SDL'S NAME FOR THE SEMICOLON KEY as well as a comment character,
     * and Key7's default binding is exactly that - so the obvious config line
     * must not silently unbind it. Quoting is the answer, and the unquoted
     * form is documented to be a comment rather than quietly guessed at. */
    parse("Key7 = \";\"\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_KEY7] == 1 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY7][0], ";") == 0,
          "a QUOTED semicolon binds the semicolon key");

    parse("Key7 = \";\", \"#\"\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_KEY7] == 2 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY7][1], "#") == 0,
          "and both comment characters survive quoting, as alternates");

    parse("Key7 = ;\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_KEY7] == 0,
          "while an UNQUOTED one is a comment, so the channel unbinds");

    parse("Key1 = Z ; a note\n", &kc, &bad);
    check(kc.count[EZ2_KEY_CH_KEY1] == 1 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "Z") == 0,
          "a trailing comment outside quotes is still a comment");

    /* A file with no trailing newline is a file. */
    check(parse("Key1 = Z", &kc, &bad) == 1 &&
          strcmp(kc.names[EZ2_KEY_CH_KEY1][0], "Z") == 0,
          "a last line with no newline still parses");
}

/* WRITING IT BACK. The rebind page has to persist what it captured, so the
   format needs an inverse - and the only interesting property is that it
   round-trips through the parser, INCLUDING the names that need quoting. */
static void test_format(void)
{
    ez2_keyconf a, b;
    char buf[8192];
    int need, bad = 0, i, ch, same = 1;

    ez2_keyconf_defaults(&a);
    /* The three characters the parser reads specially, all as key names:
       `;` is SDL's own name for the semicolon key - the case that made
       quoting necessary in the first place - and `,` is the separator. */
    ez2_keyconf_defaults(&b);
    a.count[EZ2_KEY_CH_KEY7] = 3;
    snprintf(a.names[EZ2_KEY_CH_KEY7][0], EZ2_KEY_NAME, "%s", ";");
    snprintf(a.names[EZ2_KEY_CH_KEY7][1], EZ2_KEY_NAME, "%s", "#");
    snprintf(a.names[EZ2_KEY_CH_KEY7][2], EZ2_KEY_NAME, "%s", ",");
    a.count[EZ2_KEY_CH_PEDAL] = 0;            /* an UNBOUND channel */

    need = ez2_keyconf_format(&a, buf, sizeof buf);
    check(need > 0 && need <= (int)sizeof buf, "the map formats into a buffer");
    check(ez2_keyconf_format(&a, 0, 0) == need,
          "and asking with no buffer gives the same size");

    check(ez2_keyconf_parse(buf, strlen(buf), &b, &bad) > 0 && bad == 0,
          "what it wrote parses back with nothing unreadable");

    for (ch = 0; ch < EZ2_KEY_CHANNELS; ch++) {
        if (a.count[ch] != b.count[ch]) { same = 0; break; }
        for (i = 0; i < a.count[ch]; i++)
            if (strcmp(a.names[ch][i], b.names[ch][i]) != 0) { same = 0; break; }
        if (!same) break;
    }
    check(same, "and every channel comes back byte for byte - the separator "
                "and both comment characters included");
    check(b.count[EZ2_KEY_CH_PEDAL] == 0,
          "an unbound channel stays unbound rather than reverting");
}

int main(void)
{
    test_defaults();
    test_names();
    test_parse();
    test_syntax();
    test_format();

    printf("%s\n", failures ? "FAILED" : "PASSED");
    return failures ? 1 : 0;
}
