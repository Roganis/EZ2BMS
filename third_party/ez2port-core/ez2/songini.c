/* EZ2AC per-chart `.ini`.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "songini.h"
#include "util.h"

#include <stdlib.h>
#include <string.h>

void ez2_song_ini_defaults(ez2_song_ini *out)
{
    memset(out, 0, sizeof *out);
    out->level         = 99;      /* what the loader uses for a missing file */
    out->measure_scale = 1.0f;
    out->kool_ticks = 6;          /* ticks of 1/192 beat, not milliseconds */
    out->cool_ticks = 24;
    out->good_ticks = 36;
    out->miss_ticks = 72;
    out->gauge_cool = 0.2f;
    out->gauge_good = 0.1f;
    out->gauge_kool = 0.2f;       /* the parser mirrors COOL into KOOL */
    out->gauge_miss = -1.8f;
    out->gauge_fail = -4.8f;
}

/* Strip the quotes EZ2AC.ini puts around names. The per-chart files do not use
 * them, but the same reader should not care. */
static void unquote(char *s)
{
    size_t n = strlen(s);
    if (n >= 2 && s[0] == '"' && s[n - 1] == '"') {
        memmove(s, s + 1, n - 2);
        s[n - 2] = 0;
    }
}

int ez2_song_ini_parse(const char *text, size_t n, ez2_song_ini *out)
{
    char line[512];
    char section[64];
    size_t pos = 0;

    if (text == 0 || out == 0)
        return EZ2_SONG_INI_ERR_ARG;

    ez2_song_ini_defaults(out);
    section[0] = 0;

    while (pos < n) {
        size_t len = 0;
        char *eq, *key, *val;

        while (pos < n && text[pos] != '\n') {
            if (len + 1 < sizeof line)
                line[len++] = text[pos];
            pos++;
        }
        pos++;                      /* step over the newline */
        line[len] = 0;
        ez2_trim(line);

        if (line[0] == 0 || line[0] == ';')
            continue;

        if (line[0] == '[') {
            char *close = strchr(line, ']');
            if (close) {
                *close = 0;
                strncpy(section, line + 1, sizeof section - 1);
                section[sizeof section - 1] = 0;
                ez2_trim(section);
                if (ez2_ci_equal(section, "General"))        out->had_general = 1;
                else if (ez2_ci_equal(section, "JudgmentDelta")) out->had_judgment = 1;
                else if (ez2_ci_equal(section, "GaugeUpDownRate")) out->had_gauge = 1;
            }
            continue;
        }

        eq = strchr(line, '=');
        if (!eq)
            continue;
        *eq = 0;
        key = line;
        val = eq + 1;
        ez2_trim(key);
        ez2_trim(val);
        unquote(key);
        unquote(val);

        if (ez2_ci_equal(section, "General")) {
            if (ez2_ci_equal(key, "Level"))
                out->level = (int)strtol(val, 0, 10);
            else if (ez2_ci_equal(key, "MeasureScale"))
                out->measure_scale = (float)atof(val);
        } else if (ez2_ci_equal(section, "JudgmentDelta")) {
            int ticks = (int)strtol(val, 0, 10);
            if (ez2_ci_equal(key, "Kool"))      out->kool_ticks = ticks;
            else if (ez2_ci_equal(key, "Cool")) out->cool_ticks = ticks;
            else if (ez2_ci_equal(key, "Good")) out->good_ticks = ticks;
            else if (ez2_ci_equal(key, "Miss")) out->miss_ticks = ticks;
        } else if (ez2_ci_equal(section, "GaugeUpDownRate")) {
            float v = (float)atof(val);
            if (ez2_ci_equal(key, "Cool")) {
                out->gauge_cool = v;
                /* @0x4206e0 mirrors COOL into the KOOL slot at +0x31c: there
                 * is no separate Kool key, and KOOL's gauge rate IS COOL's. */
                out->gauge_kool = v;
            } else if (ez2_ci_equal(key, "Good")) {
                out->gauge_good = v;
            } else if (ez2_ci_equal(key, "Miss")) {
                out->gauge_miss = v;
            } else if (ez2_ci_equal(key, "Fail")) {
                out->gauge_fail = v;
            }
        }
    }
    return EZ2_SONG_INI_OK;
}

void ez2_song_ini_apply_mode_bonus(ez2_song_ini *ini, int mode)
{
    /* SpaceMix (5) and 14RadioMix (9) - the 14-key modes (@0x4206e0). */
    if (mode == 5 || mode == 9) {
        ini->gauge_cool += 0.05f;
        ini->gauge_kool += 0.05f;   /* KOOL tracks COOL: +0x31c is copied
                                       AFTER the bonus */
        ini->gauge_good += 0.02f;
    }

    /* EZ2CATCH (10): a GOOD earns no gauge at all. CatchMainGameDirector's
     * own reader stores 0.0f over the field right after reading it
     * (@0x46c2b0, ../../src/gaugerates.cpp), whatever the file says. */
    if (mode == 10)
        ini->gauge_good = 0.0f;
}

void ez2_song_ini_apply_hard_gauge(ez2_song_ini *ini)
{
    /* All three readers double from copies saved BEFORE the mode bonus; the
     * bonus never touches MISS or FAIL, so a plain in-place doubling is the
     * same arithmetic (@0x4206e0 / @0x45d960 / @0x46c2b0). */
    ini->gauge_miss *= 2.0f;
    ini->gauge_fail *= 2.0f;
}

float ez2_song_ini_apply_measure_scale(ez2_song_ini *ini, int mode)
{
    /* EZ2DJMainGameDirector::m420640 @0x420640, kept ladder for ladder: the
     * field survives only in modes 6/7/8/9/12, the published global takes the
     * file's value only in 6..9 - so mode 12 keeps its field but still
     * publishes 1.6. */
    float published = 1.6f;

    if (mode != 6 && mode != 7 && mode != 8 &&
        mode != 9 && mode != 12)
        ini->measure_scale = 1.6f;

    if (mode == 6 || mode == 7 || mode == 8 || mode == 9)
        published = ini->measure_scale;

    return published;
}

void ez2_song_ini_apply_judge_widening(ez2_song_ini *ini, int alternate_mode)
{
    /* @0x430793: the four director fields +0x2f8..+0x304 are pushed widened by
     * +3, or by +1 when the global at 0x1b2eb6c is non-zero. */
    int w = alternate_mode ? 1 : 3;

    ini->kool_ticks += w;
    ini->cool_ticks += w;
    ini->good_ticks += w;
    ini->miss_ticks += w;
}
