/* The port's own settings file. See portcfg.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "portcfg.h"
#include "util.h"

#include "cfgdir.h"
#include "layout.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void ez2_portcfg_defaults(ez2_portcfg *c)
{
    if (!c)
        return;
    c->wide     = 0;                 /* 640x480 - what the port did before */
    c->volume   = 100;               /* unity - what the mixer did before */
    c->vsync    = 1;
    c->debounce = 8;
    c->fullscreen = 0;               /* a window; the port has never grabbed
                                        the display without being asked */
    c->bga_mode = EZ2_BGA_COVER;
    c->ui_mode  = EZ2_UI_BG;
    c->audio    = EZ2_AUDIO_SHARED;  /* never take the card without being asked */
    c->audio_device[0] = 0;
    c->language[0] = 0;
}

int ez2_portcfg_path(char *out, size_t n)
{
    return ez2_cfgfile("settings.ini", out, n);
}

const char *ez2_portcfg_onoff_name(int on)
{
    return on ? "on" : "off";
}

const char *ez2_portcfg_bga_name(int m)
{
    return m == EZ2_BGA_NATIVE   ? "native"
         : m == EZ2_BGA_BACKDROP ? "backdrop"
                                 : "cover";
}

const char *ez2_portcfg_ui_name(int m)
{
    return m == EZ2_UI_CENTER ? "center"
         : m == EZ2_UI_COVER  ? "cover"
                              : "bg";
}

const char *ez2_portcfg_audio_name(int m)
{
    return m == EZ2_AUDIO_ASIO      ? "asio"
         : m == EZ2_AUDIO_EXCLUSIVE ? "exclusive"
                                    : "shared";
}

/* ---- reading ------------------------------------------------------------ */

static int match(const char *key, const char *want)
{
    size_t i;

    for (i = 0; key[i] && want[i]; i++) {
        int a = key[i], b = want[i];
        if (a >= 'A' && a <= 'Z') a += 32;
        if (b >= 'A' && b <= 'Z') b += 32;
        if (a != b)
            return 0;
    }
    return key[i] == 0 && want[i] == 0;
}

/* A value that names one of a list, case-insensitively; -1 when it names
 * none of them, which leaves the field as it was. */
static int pick(const char *v, const char *const *names, int count)
{
    int i;

    for (i = 0; i < count; i++)
        if (match(v, names[i]))
            return i;
    return -1;
}

int ez2_portcfg_load(const char *path, ez2_portcfg *c)
{
    static const char *const kOnOff[] = { "off", "on" };
    static const char *const kBga[]   = { "cover", "native", "backdrop" };
    static const char *const kUi[]    = { "bg", "center", "cover" };
    static const char *const kAudio[] = { "shared", "exclusive", "asio" };
    char line[256];
    FILE *f;

    if (!path || !c)
        return 0;
    f = fopen(path, "rb");
    if (!f)
        return 0;

    while (fgets(line, sizeof line, f)) {
        char *eq, *key, *val;
        int v;

        /* A comment runs to the end of the line, and a section header is
         * ignored - there is only one section and naming it is courtesy. */
        eq = strchr(line, ';');
        if (eq)
            *eq = 0;
        ez2_trim(line);
        if (line[0] == 0 || line[0] == '[' || line[0] == '#')
            continue;
        eq = strchr(line, '=');
        if (!eq)
            continue;
        *eq = 0;
        key = line;
        val = eq + 1;
        ez2_trim(key);
        ez2_trim(val);

        if (match(key, "Wide")) {
            v = atoi(val);
            if (v >= 0 && v <= 2)
                c->wide = v;
        } else if (match(key, "Fullscreen")) {
            /* Words, like every other value here - but a person writing 1 or
             * 0 by hand means the obvious thing and is not made to look it
             * up. Anything else is ignored, as everywhere else. */
            v = pick(val, kOnOff, 2);
            if (v < 0 && (val[0] == '0' || val[0] == '1') && val[1] == 0)
                v = val[0] - '0';
            if (v >= 0)
                c->fullscreen = v;
        } else if (match(key, "BGA")) {
            v = pick(val, kBga, 3);
            if (v >= 0)
                c->bga_mode = v;
        } else if (match(key, "UI")) {
            v = pick(val, kUi, 3);
            if (v >= 0)
                c->ui_mode = v;
        } else if (match(key, "Audio")) {
            v = pick(val, kAudio, EZ2_AUDIO_COUNT);
            if (v >= 0)
                c->audio = v;
        } else if (match(key, "AudioDevice")) {
            snprintf(c->audio_device, sizeof c->audio_device, "%s", val);
        } else if (match(key, "Language")) {
            snprintf(c->language, sizeof c->language, "%s", val);
        } else if (match(key, "Volume")) {
            v = atoi(val);
            if (v >= 0 && v <= 100)
                c->volume = v;
        } else if (match(key, "Debounce")) {
            v = atoi(val);
            if (v >= 0 && v <= 100)
                c->debounce = v;
        } else if (match(key, "Vsync")) {
            v = pick(val, kOnOff, 2);
            if (v < 0 && (val[0] == '0' || val[0] == '1') && val[1] == 0)
                v = val[0] - '0';
            if (v >= 0)
                c->vsync = v;
        }
        /* anything else: a key from a newer build, left alone */
    }
    fclose(f);
    return 1;
}

int ez2_portcfg_save(const char *path, const ez2_portcfg *c)
{
    FILE *f;

    if (!path || !c)
        return 0;
    f = fopen(path, "wb");
    if (!f)
        return 0;

    fprintf(f,
        "; EZ2PORT settings - the port's own, not the game's.\n"
        "; Written by the TEST MENU's PORT SETTINGS page; safe to edit by hand.\n"
        "; The game's tree is never touched by any of this.\n"
        "\n"
        "[Port]\n"
        "; 0 = 640x480 (4:3), 1 = 854x480 (16:9, panels anchored to the\n"
        ";     edges, background fills the width), 2 = 4:3 in a big window\n"
        "Wide        = %d\n"
        "; off = a window the size Wide asks for, on = the whole display\n"
        "Fullscreen  = %s\n"
        "; what the PLAY screen's background does with the extra width:\n"
        ";   cover    fill it, cropping 60 rows top and bottom\n"
        ";   native   640x480 in the middle, black behind the panels\n"
        ";   backdrop the gutters filled, the middle untouched\n"
        "BGA         = %s\n"
        "; and what every OTHER screen does:\n"
        ";   bg       scale the backdrop only - the UI keeps its size (default)\n"
        ";   center   scale nothing; the 640 design, pillarboxed\n"
        ";   cover    scale the whole screen, which crops its headers\n"
        "UI          = %s\n"
        "; shared    the system mixer, like any other application\n"
        "; exclusive take the device outright - about 2.9 ms less output\n"
        ";           latency, and nothing else on the machine can make a sound\n"
        "; asio      an ASIO driver, Windows only. Needs one installed; falls\n"
        ";           back to shared if there is none\n"
        "Audio       = %s\n"
        "; which device, and what it looks like depends on Audio above:\n"
        ";   exclusive  Linux   an ALSA name - hw:1,0. Empty tries hw:0,0\n"
        ";   exclusive  Windows an endpoint number or part of its name\n"
        ";   asio               a driver number or part of its name\n"
        "; empty always means \"let the backend choose\"\n"
        "AudioDevice = %s\n"
        "; the native text's strings (text/strings.<lang>.ini beside the\n"
        "; executable; see TEXT.md). Empty = the game's own words\n"
        "Language    = %s\n"
        "; the mixer's master gain, 0..100 percent. Every voice is summed\n"
        "; and the sum runs past full scale on a dense chart, where the\n"
        "; port rounds the peak off; this backs the whole mix down first\n"
        "Volume      = %d\n"
        "; the swap waits for the screen's refresh: one whole frame per\n"
        "; refresh on the cabinet's 60 Hz screen, no tearing\n"
        "Vsync       = %s\n"
        "; milliseconds after a press or release during which a second edge\n"
        "; on the same input is a worn switch's chatter, not a hit; 0 = off\n"
        "Debounce    = %d\n",
        c->wide,
        ez2_portcfg_onoff_name(c->fullscreen),
        ez2_portcfg_bga_name(c->bga_mode),
        ez2_portcfg_ui_name(c->ui_mode),
        ez2_portcfg_audio_name(c->audio),
        c->audio_device,
        c->language,
        c->volume,
        ez2_portcfg_onoff_name(c->vsync),
        c->debounce);

    return fclose(f) == 0;
}
