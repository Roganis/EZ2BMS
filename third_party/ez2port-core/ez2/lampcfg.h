/* Which output on which device drives which lamp.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- the same binding 2EZConfig saves ------------------------------------
 *
 * 2EZConfig's light binding is a triple - a device, an output index on it, and
 * the light it drives:
 *
 *     struct LightBinding : BindingBase {   // src/libs/bindings/bindings.h
 *         std::string devicePath;
 *         int outputIdx = -1;
 *     };
 *     bindings.mgr->setLight(lb.devicePath, lb.outputIdx, s_lightState[i]);
 *
 * This is that, in the port's own INI, with two deliberate differences and no
 * others:
 *
 *   - the LIGHT NAMES ARE 2EZConfig's, exactly ("P1 Turntable", "Neons",
 *     "Effector 1"), so a person who has already worked out their board's
 *     wiring in 2EZConfig can copy the numbers across without re-deriving
 *     anything, and so both projects mean the same thing by the same word;
 *   - the DEVICE KEY is `VID:PID` rather than a Windows device path. A path
 *     like `\\?\HID#VID_0810&PID_E501#9&2fc2c90&0&0000#{...}` is meaningless
 *     here, is not stable across a reboot on Linux either, and cannot be typed.
 *     `0810:e501` can be, it is what `lsusb` prints, and `ez2lights --list`
 *     prints it beside every board it finds. A `#n` suffix picks the n-th of
 *     several identical boards, in enumeration order.
 *
 * The OUTPUT INDEX is unchanged and means what it means there: the flat index
 * over the device's HID output controls, buttons first and ranged values
 * after (see ez2/hidout.h, which reproduces that ordering from the report
 * descriptor). A binding written by 2EZConfig for a given board carries over.
 *
 * ---- the file ------------------------------------------------------------
 *
 *     $XDG_CONFIG_HOME/ez2port/lights.ini, else ~/.config/ez2port/lights.ini
 *
 *     [Lights]
 *     ; <light name> = <vid:pid>[#n], <output index>
 *     P1 1         = 0810:e501, 0
 *     P1 2         = 0810:e501, 1
 *     P1 Turntable = 0810:e501, 5
 *     Neons        = 0810:e501, 16
 *
 * Plain text and never encrypted, beside `keys.ini` and `settings.ini` - the
 * same directory and the same syntax, which is the whole argument for INI here
 * (ez2/keyconf.h makes it at length).
 *
 * `;` starts a comment and `#` does not - which is where this differs from
 * keys.ini, and it is not a whim: `#` is part of the device key, so taking it
 * as a comment would turn `0810:e501#1, 16` into a binding on the FIRST board
 * of that make. A binding that parses cleanly and drives the wrong lamp is the
 * one failure this format exists to avoid.
 *
 * An unknown light name is reported, not guessed at - a typo that silently
 * binds nothing is the failure mode a person cannot debug from the outside.
 * A file that names no lights is not an error: it is a machine with no lamps
 * on it, which is most of them, and the port runs the model anyway so the
 * cabinet seam and any debug overlay still see the right bits.
 */
#ifndef EZ2_LAMPCFG_H
#define EZ2_LAMPCFG_H

#include <stddef.h>

#include "lamps.h"

#ifdef __cplusplus
extern "C" {
#endif

/* "0810:e501#2" and a terminator, with room to spare. */
#define EZ2_LAMPCFG_DEV 32

typedef struct ez2_lampbind {
    char device[EZ2_LAMPCFG_DEV];   /* "" when the lamp is not bound */
    int  output;                    /* -1 when the lamp is not bound */
} ez2_lampbind;

typedef struct ez2_lampcfg {
    /* Indexed by CHANNEL, the game's own numbering - so the eleven channels
     * with no name simply never get a binding. */
    ez2_lampbind light[EZ2_LAMP_CHANNELS];
} ez2_lampcfg;

/* Nothing bound. There is no useful default here and inventing one would be
 * worse than none: an output index guessed wrong drives an unknown lamp on
 * someone's cabinet. */
void ez2_lampcfg_defaults(ez2_lampcfg *c);

/* $XDG_CONFIG_HOME/ez2port/lights.ini, else ~/.config/ez2port/lights.ini.
 * Returns 0 when neither variable is set, leaving `out` untouched. */
int  ez2_lampcfg_path(char *out, size_t n);

/* Apply an INI over `c` - so seed it with the defaults first and a file naming
 * one lamp changes one lamp. Returns the number of lamps it bound, or a
 * negative ez2_lampcfg_err.
 *
 * `bad_line`, when not null, receives the 1-based number of the first line
 * that named nothing recognisable, or 0 if every line was understood. */
int  ez2_lampcfg_parse(const char *text, size_t n, ez2_lampcfg *c,
                       int *bad_line);

/* The same from a file. Missing is EZ2_LAMPCFG_ABSENT, which is not an error -
 * it is a machine with no lamps. */
int  ez2_lampcfg_load(const char *path, ez2_lampcfg *c, int *bad_line);

/* The inverse, for whatever binds interactively. `ez2_lampcfg_format` writes
 * at most `n` bytes including the terminator and returns how many it would
 * have needed, so a caller can size a buffer the usual way. */
int  ez2_lampcfg_format(const ez2_lampcfg *c, char *out, size_t n);
int  ez2_lampcfg_save(const char *path, const ez2_lampcfg *c);

/* Bind or unbind one channel. `device` null or empty, or `output` negative,
 * unbinds. Returns 1 when the channel existed. */
int  ez2_lampcfg_bind(ez2_lampcfg *c, int channel,
                      const char *device, int output);

/* How many lamps are bound - what a caller reports at startup, and what tells
 * it whether to open any device at all. */
int  ez2_lampcfg_count(const ez2_lampcfg *c);

enum ez2_lampcfg_err {
    EZ2_LAMPCFG_ABSENT   = -1,
    EZ2_LAMPCFG_ERR_ARG  = -2,
    EZ2_LAMPCFG_ERR_READ = -3
};

#ifdef __cplusplus
}
#endif

#endif /* EZ2_LAMPCFG_H */
