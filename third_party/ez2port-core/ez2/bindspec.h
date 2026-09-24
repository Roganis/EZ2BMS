/* One binding, as text: a key, a pad button, a hat direction, an axis.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- what 2EZConfig binds, and what this has to cover --------------------
 *
 * 2EZConfig's binding store (`src/libs/bindings/bindings.h`) has three kinds,
 * and for the EZ2DJ/AC family - which is the one this port plays - they are:
 *
 *     ButtonBinding   a HID device + button index, OR a keyboard vkCode, OR a
 *                     hat-switch DIRECTION treated as a button
 *                     (ButtonAnalogType::HS_UP .. HS_UP_LEFT)
 *     AnalogBinding   a HID device + axis index, with a `reverse` flag; OR a
 *                     VIRTUAL turntable driven by two buttons at `vttStep`;
 *                     OR a mouse axis at `mouseSensitivity`
 *     LightBinding    a device + output index (ez2/lampcfg.h - already done)
 *
 * The port had only the middle of the first line: a keyboard scancode name,
 * one per alternate, in `keys.ini`. Everything else is what this file adds.
 *
 * (2EZConfig also binds EZ2Dancer's pads and Sabin Sound Star's buttons.
 * Those are different GAMES, not different hardware for this one; the port
 * reads EZ2AC's charts and has no lanes to give them, so they are out of
 * scope rather than missing.)
 *
 * ---- the grammar ---------------------------------------------------------
 *
 * A binding is ONE token, because `keys.ini` already separates a channel's
 * alternates with commas and the format should not grow a second separator:
 *
 *     S                       a key. Anything not matching a form below is a
 *                             key NAME, spelled as SDL spells it - so every
 *                             keys.ini written before this file still reads
 *                             exactly as it did.
 *     0810:e501/b3            button 3 on that device
 *     0810:e501/h0.up         hat 0 held up. The eight directions are
 *                             up upright right downright down downleft left
 *                             upleft - 2EZConfig's HS_* set, same order
 *     0810:e501/a2            axis 2            } analog sources: a turntable,
 *     0810:e501/a2:rev        axis 2, reversed  } not a button
 *     0810:e501/a0:vel        a VELOCITY axis: speed about centre, not position;
 *     0810:e501/a0:rev,vel    both
 *     mouse/x  mouse/y        a mouse axis
 *     mouse/x:8              ...at sensitivity 8 (1..20, default 5)
 *     vtt                     the VIRTUAL turntable - the channel's own two
 *                             scratch keys, stepped
 *     vtt:4                  ...at 4 units a frame (1..20, default 3)
 *
 * The device key is `vid:pid`, with `#n` for the n-th board of that make -
 * THE SAME KEY `lights.ini` USES (ez2/lampcfg.h explains why it is that and
 * not a Windows device path). One vocabulary for both halves of the machine.
 *
 * ---- why the parser is here and not in the backend -----------------------
 *
 * For the same reason `ez2/keyconf.c` is: a binding is text, and text is
 * testable with no window, no SDL and nothing plugged in. This file never
 * mentions a scancode NUMBER or an SDL type - a key binding carries the name
 * and the backend resolves it, exactly as it always did.
 */
#ifndef EZ2_BINDSPEC_H
#define EZ2_BINDSPEC_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_BIND_DEV  32     /* "0810:e501#2" and room to spare */
#define EZ2_BIND_KEYN 32     /* an SDL scancode name */

enum {
    EZ2_BIND_NONE = 0,
    EZ2_BIND_KEY,        /* a keyboard key, by SDL's name for it */
    EZ2_BIND_BUTTON,     /* a device button */
    EZ2_BIND_HAT,        /* a hat direction, held as a button */
    EZ2_BIND_AXIS,       /* a device axis - an ANALOG source */
    EZ2_BIND_MOUSE,      /* a mouse axis - an ANALOG source */
    EZ2_BIND_VTT         /* the virtual turntable - an ANALOG source */
};

/* The eight hat directions, in 2EZConfig's own order (HS_UP first, clockwise). */
enum {
    EZ2_HAT_UP = 0, EZ2_HAT_UPRIGHT, EZ2_HAT_RIGHT, EZ2_HAT_DOWNRIGHT,
    EZ2_HAT_DOWN, EZ2_HAT_DOWNLEFT, EZ2_HAT_LEFT, EZ2_HAT_UPLEFT,
    EZ2_HAT_COUNT
};

typedef struct ez2_bindspec {
    int  kind;
    char device[EZ2_BIND_DEV];   /* "" for KEY, MOUSE and VTT */
    char key[EZ2_BIND_KEYN];     /* KEY only - the scancode NAME */
    int  index;                  /* button / hat / axis number; MOUSE: 0=X 1=Y */
    int  dir;                    /* HAT only: EZ2_HAT_* */
    int  reverse;                /* AXIS only */
    int  velocity;               /* AXIS only: the axis reports SPIN SPEED, centred at rest,
                                  * not a wrapping position - moved by its value each frame */
    int  amount;                 /* MOUSE sensitivity, or VTT step */
} ez2_bindspec;

/* Read one token. Never fails on a key name - anything unrecognised IS a key
 * name, which is what keeps every existing keys.ini valid - but a token that
 * clearly means a device and is malformed (`0810:e501/b`, `.../h0.sideways`)
 * returns 0 and leaves `out` EZ2_BIND_NONE, so a typo is reported rather than
 * silently bound to a key nobody has. Returns 1 when something was read. */
int ez2_bindspec_parse(const char *text, ez2_bindspec *out);

/* The inverse, for whatever writes the file back. Returns the number of bytes
 * it needed including the terminator; `out` may be null to ask. */
int ez2_bindspec_format(const ez2_bindspec *b, char *out, size_t n);

/* 1 when this kind drives a turntable rather than a channel. The two sets do
 * not overlap: an axis cannot be a button here, and a button cannot be a
 * turntable except through EZ2_BIND_VTT, which is what VTT is FOR. */
int ez2_bindspec_is_analog(const ez2_bindspec *b);

/* "up", "downleft", ... and back. Null / -1 when there is no such direction. */
const char *ez2_hat_name(int dir);
int         ez2_hat_from_name(const char *name);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_BINDSPEC_H */
