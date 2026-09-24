/* Which physical keys drive which input channel.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The backend's map was a `const` table of eleven scancodes, which is fine for
 * bring-up and is the one thing that stops a person playing on their own
 * hardware. This is the file that replaces it.
 *
 * ---- what this is NOT ----------------------------------------------------
 *
 * It is not the GAME's key map, and the distinction matters. The game's map is
 * DATA already: each mode's `.gds` gives every track a `Key=` pair, and
 * `loadSlotSection` @0x420f60 reads them in order (see `gds.h` and
 * `docs/gds-slots.md`). A StreetMix track list reads
 *
 *     Track1 = { Key=15,16   SongTrack=10 }      the turntable
 *     Track2 = { Key=10,-1   SongTrack=3  }      a key
 *
 * so the turntable really is TWO inputs onto ONE lane, by the game's own
 * descriptor, and every other track is one input plus a `-1` sentinel. A port
 * that "fixed" the scratch by splitting it would be diverging from the data.
 *
 * What is missing is the layer BELOW that: which key on *your* keyboard raises
 * the seam's `EZ_IN_*` channel that the `.gds` then routes. On the cabinet that
 * layer is the I/O board and there is nothing to configure; on a keyboard it is
 * a preference, and it belongs to the port.
 *
 * ---- the format ----------------------------------------------------------
 *
 * INI, because the game's own settings are (`EZ2AC.ini`), and a player editing
 * one file should not meet two syntaxes:
 *
 *     [Keys]
 *     Key1     = S
 *     Key2     = D
 *     Scratch1 = A, Q          ; alternates, up to EZ2_KEY_ALTS of them
 *     Pedal    = Space
 *
 * ---- and a binding is no longer only a key -------------------------------
 *
 * A name may be any of ez2/bindspec.h's kinds, which is what gives the port
 * the binding scope 2EZConfig has: a key, a pad BUTTON, or a hat DIRECTION.
 * The alternates are what make a channel reachable from two places at once.
 *
 *     Key1     = S, 0810:e501/b3        the key OR the panel button
 *     Start    = Return, 0810:e501/h0.up
 *
 * The two TURNTABLES are not channels - they are analog, and they get their
 * own section. A turntable may be a real axis, the mouse, or the VIRTUAL one
 * driven by the channel's own two scratch keys (2EZConfig's `vtt`):
 *
 *     [Analog]
 *     Turntable   = 0810:e501/a0        ; or /a0:rev to flip it
 *     Turntable   = 0810:e501/a0:vel    ; a VELOCITY axis: the value is the spin
 *                                       ; speed about centre and returns to it at
 *                                       ; rest (an arcade I/O adapter), not a
 *                                       ; wrapping position; :rev,vel for both
 *     P2Turntable = vtt:4               ; the two P2 scratch keys, 4 a frame
 *
 * `P1 Turntable` and `P2 Turntable` - 2EZConfig's and lights.ini's spelling -
 * are accepted as aliases, so a person copying a device key across from
 * either is not punished for using the words those files use.
 *
 * Names are SDL scancode names, resolved by the backend - this file never
 * mentions SDL, so the parser is testable with no window and no library. An
 * unknown channel or an unparseable line is reported, not guessed at, and so
 * is an unknown key NAME.
 *
 * They are spelled the way `SDL_GetScancodeName` spells them, which is not
 * always the obvious word: the semicolon key is `;`, not `Semicolon`. The
 * default map got that wrong on its first build and the diagnostic is what
 * caught it, which is the argument for having one.
 *
 * The channel indices below MIRROR `platform.h`'s `EZ_IN_*` enum. They are
 * repeated rather than included because `ez2core` must not depend on the
 * platform seam; the one file that sees both checks them against each other at
 * compile time.
 */
#ifndef EZ2_KEYCONF_H
#define EZ2_KEYCONF_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    EZ2_KEY_CH_KEY1 = 0, EZ2_KEY_CH_KEY2, EZ2_KEY_CH_KEY3,
    EZ2_KEY_CH_KEY4, EZ2_KEY_CH_KEY5, EZ2_KEY_CH_KEY6, EZ2_KEY_CH_KEY7,
    EZ2_KEY_CH_SCRATCH_UP, EZ2_KEY_CH_SCRATCH_DOWN,
    EZ2_KEY_CH_PEDAL,
    EZ2_KEY_CH_START,
    /* The cabinet's effector row - appended so saved keys.ini files keep
     * their channel meanings. Defaults 1/2/3/4. */
    EZ2_KEY_CH_EFFECT1, EZ2_KEY_CH_EFFECT2,
    EZ2_KEY_CH_EFFECT3, EZ2_KEY_CH_EFFECT4,
    /* Player 2's bank - see platform.h; defaults C V B N M / G H, the
     * arrows for the scratch, right shift for the pedal. */
    EZ2_KEY_CH_P2_KEY1, EZ2_KEY_CH_P2_KEY2, EZ2_KEY_CH_P2_KEY3,
    EZ2_KEY_CH_P2_KEY4, EZ2_KEY_CH_P2_KEY5, EZ2_KEY_CH_P2_KEY6,
    EZ2_KEY_CH_P2_KEY7,
    EZ2_KEY_CH_P2_SCRATCH_UP, EZ2_KEY_CH_P2_SCRATCH_DOWN,
    EZ2_KEY_CH_P2_PEDAL, EZ2_KEY_CH_P2_START,
    /* The cabinet's two OPERATOR buttons - input 1 TEST and input 2 SERVICE.
     * The test menu's pages read them directly (every page's update2 guards
     * on `getState(1) != 2`, and TestVideo @0x4771a0 steps on `getState(2)`),
     * so they belong to the game rather than to the port, and having them
     * means the menu steals no play key. */
    EZ2_KEY_CH_TEST, EZ2_KEY_CH_SERVICE,
    /* The coin input, cabinet slot 3 - the original's own F3. */
    EZ2_KEY_CH_COIN,
    EZ2_KEY_CHANNELS
};

#define EZ2_KEY_ALTS 4          /* alternates per channel */
/* A device binding is longer than a key name: `0810:e501#2/h0.downright` is
 * 24 characters. 48 leaves room and still keeps the struct small. */
#define EZ2_KEY_NAME 48

/* The two turntables, in ezAnalogPos's order (EZ_TT_P1, EZ_TT_P2). */
#define EZ2_KEY_ANALOGS 2

typedef struct ez2_keyconf {
    char names[EZ2_KEY_CHANNELS][EZ2_KEY_ALTS][EZ2_KEY_NAME];
    int  count[EZ2_KEY_CHANNELS];
    /* "" when that turntable is not bound, which is the default: a keyboard
     * player scratches on the two digital channels and needs no encoder. */
    char analog[EZ2_KEY_ANALOGS][EZ2_KEY_NAME];
} ez2_keyconf;

/* The layout the backend used to hardcode: five keys under the hands, the
 * turntable on A/Q, the pedal on space. It claims to be a keyboard, not the
 * arcade cabinet. */
void ez2_keyconf_defaults(ez2_keyconf *out);

/* Apply an INI over `out`, which the caller has usually filled with the
 * defaults - so a file naming one channel changes one channel. Returns the
 * number of channels it set, or a negative ez2_keyconf_err.
 *
 * `bad_line`, when not null, receives the 1-based line number of the first
 * line that named nothing recognisable; 0 if every line was understood. A
 * typo in a config is worth a message, not a silent default. */
int ez2_keyconf_parse(const char *text, size_t n, ez2_keyconf *out,
                      int *bad_line);

/* The same from a file. Missing is EZ2_KEYCONF_ABSENT, not an error. */
int ez2_keyconf_load(const char *path, ez2_keyconf *out, int *bad_line);

/* ---- writing it back ----------------------------------------------------
 *
 * The test menu's rebind page has to persist what it captured, so the format
 * needs an inverse. It is the parser's own, quoted where the parser needs it:
 * a name containing `;`, `#` or `,` is written in double quotes, because the
 * first two start a comment and the third separates alternates - and `;` is
 * SDL's own name for the semicolon key, which is the case that forced quoting
 * to exist at all.
 *
 * ez2_keyconf_format writes at most `n` bytes including the terminator and
 * returns how many it would have needed, so a caller can size a buffer the
 * usual way. ez2_keyconf_save writes that to `path`, creating it. */
int ez2_keyconf_format(const ez2_keyconf *kc, char *out, size_t n);
int ez2_keyconf_save(const char *path, const ez2_keyconf *kc);

/* `EZ2_KEY_CH_SCRATCH_UP` <-> "Scratch1". Null / -1 when there is no such
 * channel. The names are what a config file spells. */
const char *ez2_keyconf_channel_name(int channel);
int         ez2_keyconf_channel_from_name(const char *name);

/* The same for the two turntables: 0 <-> "Turntable", 1 <-> "P2Turntable".
 * `ez2_keyconf_analog_from_name` also takes 2EZConfig's spelling ("P1
 * Turntable"), for the reason the header gives. */
const char *ez2_keyconf_analog_name(int which);
int         ez2_keyconf_analog_from_name(const char *name);

enum ez2_keyconf_err {
    EZ2_KEYCONF_ABSENT   =  -1,   /* no such file */
    EZ2_KEYCONF_ERR_ARG  =  -2,
    EZ2_KEYCONF_ERR_READ =  -3
};

#ifdef __cplusplus
}
#endif

#endif /* EZ2_KEYCONF_H */
