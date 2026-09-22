/* The PORT's own settings - the ones the cabinet never had.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- why this is not the game's EZ2AC.ini --------------------------------
 *
 * The obvious home for a widescreen switch was the operator's own
 * `EZ2AC.ini`, which really does carry a `Wide` key - the original reads it
 * four times and never uses the value (../WIDESCREEN.md part 1). That file is
 * the wrong place for it anyway:
 *
 *   - it is the GAME's file, encrypted with the game's own table, and a port
 *     setting written into it is a port setting written into someone's
 *     install. Editing it means a decrypt/edit/re-encrypt round trip, and a
 *     mistake there costs the operator their coin counters;
 *   - it is per-INSTALL, and these are per-MACHINE preferences - which
 *     display you are on, which audio path your box wants;
 *   - and the port already has a config directory of its own, with the key
 *     map in it (`keys.ini`, ez2/keyconf.h). Two files, one place.
 *
 * So: `$XDG_CONFIG_HOME/ez2port/settings.ini`, or
 * `~/.config/ez2port/settings.ini`. Plain text, never encrypted, and the game
 * tree is not touched.
 *
 * ---- the format ----------------------------------------------------------
 *
 *     [Port]
 *     Wide      = 1            ; 0 = 640x480, 1 = 854x480 16:9, 2 = big 4:3
 *     Volume    = 80           ; master gain, percent; 100 = unity
 *     Fullscreen = on          ; off | on
 *     Vsync     = on           ; off | on: the swap waits for the refresh
 *     Debounce  = 8            ; ms of switch chatter ignored after an edge; 0 = off
 *     BGA       = cover        ; cover | native | backdrop
 *     UI        = bg           ; bg | center | cover
 *     Audio     = exclusive    ; shared | exclusive
 *     AudioDevice = hw:0,0     ; which card exclusive takes; empty = hw:0,0
 *     Language  = en           ; text/strings.<lang>.ini for the native text; empty = originals
 *
 * `AudioDevice` is an ALSA device name. Empty means `hw:0,0`, which is card
 * ZERO - whatever the kernel enumerated first, and on most machines not the
 * output anybody meant. `ez2play --audio-devices` prints what is actually
 * here, and the TEST MENU's PORT SETTINGS page offers the same list on its
 * AUDIO DEVICE row (`AUTO` there is this key being empty).
 *
 * INI with a `;` comment, because the key map is and a person editing one
 * should not meet two syntaxes. An unknown key is ignored rather than
 * refused: a file written by a newer build must still load in an older one.
 * Every value has a default, so a missing file is not an error - it is the
 * defaults, which are what the port did before any of this existed.
 *
 * Nothing here reaches the platform layer. The caller applies these; this
 * decides nothing and draws nothing, so it lives in ez2core and is testable
 * with no window.
 */
#ifndef EZ2_PORTCFG_H
#define EZ2_PORTCFG_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* The audio path. The cabinet had one sound card and no question to answer;
 * a PC has a mixer in the way, and taking the device outright is worth
 * ~2.9 ms of output latency (../LATENCY.md). It is a real trade - exclusive
 * means nothing else on the machine can make a sound - so it is a setting,
 * not a default.
 *
 * THREE VALUES, AND THE THIRD IS WINDOWS-ONLY. `asio` drives an ASIO driver
 * directly, which is what the people who run these cabinets already use
 * (2EZConfig ships an ASIO output for exactly that reason). It needs a driver
 * installed - a real interface's own, or a wrapper like ASIO4ALL - so it
 * cannot be a default, and on Linux it does not exist at all: an `Audio =
 * asio` there falls back to shared and says so.
 *
 * The order is not arbitrary. It is least-invasive first, so a bigger number
 * always means "takes more of the machine", and a build that does not know
 * the value it reads can safely clamp downward. */
enum {
    EZ2_AUDIO_SHARED = 0,
    EZ2_AUDIO_EXCLUSIVE,
    EZ2_AUDIO_ASIO,
    EZ2_AUDIO_COUNT
};

#define EZ2_PORTCFG_DEV 64

typedef struct ez2_portcfg {
    int  wide;              /* 0 | 1 | 2, as ez2/layout.h reads it */
    int  fullscreen;        /* 0 = a window, 1 = the whole display */
    int  bga_mode;          /* EZ2_BGA_*  */
    int  ui_mode;           /* EZ2_UI_*   */
    int  audio;             /* EZ2_AUDIO_* */
    /* What it names depends on `audio`: an ALSA device for exclusive on Linux
     * ("hw:1,0"), a WASAPI endpoint index or name substring on Windows ("1",
     * "Analog"), an ASIO driver index or name substring for asio. Empty means
     * "let the backend choose", which every backend can. */
    char audio_device[EZ2_PORTCFG_DEV];
    /* `Language = en`: which text/strings.<lang>.ini overrides the native
     * text's strings (ez2/textspec.h). Empty = the originals. */
    char language[16];
    /* `Volume = 80`: the mixer's master gain, 0..100 percent, applied to the
     * sum of every voice before the output stage. The original hands each
     * DirectSound buffer its own level and lets the card sum them; a dense
     * chart's sum runs past full scale, and the port's mixer clamps there.
     * This is the operator's knob to back the whole mix off. 100 = unity. */
    int  volume;
    /* `Vsync = on`: the swap waits for the screen's refresh, so the CRT
     * sees one whole frame per refresh - 60 clean frames on a 60 Hz
     * cabinet - instead of 230 torn ones (the cabinet trace, 2026-09-05).
     * Off shows the machine's own rate. */
    int  vsync;
    /* `Debounce = 8`: milliseconds after an edge during which a second edge
     * on the same input is chatter, not a press. A worn microswitch on the
     * cabinet doubled and tripled a hit (2026-09-05). 0 = off. */
    int  debounce;
} ez2_portcfg;

/* What the port does with no settings file at all: a 4:3 window, cover, bg,
 * shared audio - every one of them what it did before any of this existed. */
void ez2_portcfg_defaults(ez2_portcfg *c);

/* $XDG_CONFIG_HOME/ez2port/settings.ini, else ~/.config/ez2port/settings.ini.
 * Returns 0 when neither variable is set, leaving `out` untouched. */
int  ez2_portcfg_path(char *out, size_t n);

/* Reads what is there over `c` - so seed it with the defaults first, and a
 * file naming only one key changes only that one. Returns 1 when the file was
 * read, 0 when it was not there (which is not an error). */
int  ez2_portcfg_load(const char *path, ez2_portcfg *c);

/* Writes the whole set, with the comments above it. Returns 1 on success.
 * The directory has to exist; the caller makes it (it already does for the
 * key map). */
int  ez2_portcfg_save(const char *path, const ez2_portcfg *c);

/* The text a value round-trips as, for the writer and for the test menu's
 * choice lists. Never null. */
const char *ez2_portcfg_onoff_name(int on);
const char *ez2_portcfg_bga_name(int bga_mode);
const char *ez2_portcfg_ui_name(int ui_mode);
const char *ez2_portcfg_audio_name(int audio);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_PORTCFG_H */
