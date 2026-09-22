/* The OPERATOR's own EZ2AC.ini - the cabinet's settings, not a song's.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * A flat `"Key" = value` file beside the executable, encrypted with the same
 * table as the per-chart ones, holding window size, volume, coin counters,
 * the unlock flags - and the switches the game asks about at run time through
 * `g_iniProfile->getInt`.
 *
 * ITS OWN TU, not part of songini.c, because reading it needs the whole
 * decrypt stack (file.c, keytable.c, crypt.c) and `port/oracle/run.sh` links
 * songini.c on its own for the gauge and judge rules. Adding a dependency
 * there broke the oracle's link, which is how this file came to exist.
 *
 * The one the play screen needs is **UseBackground**. The main game's
 * background loader `EZ2DJMainGameDirector::m420a60` @0x420a60 opens with
 *
 *     g_iniProfile->getInt("UseBackground", &use);
 *     if (use == 0) goto done;
 *
 * and then loads the song's scene unconditionally - so the BGA is ON unless
 * the operator turned it off. It is not a per-run choice and there is no
 * in-game toggle for it. The shipped "Final EX" ini says 1.
 */
#ifndef EZ2_OPINI_H
#define EZ2_OPINI_H

#ifdef __cplusplus
extern "C" {
#endif

/* One integer key. Returns the value, or `fallback` when the file, the key
 * or the number is missing. `root` is the game directory and `exe` the
 * unpacked executable the cipher table comes from. */
int ez2_operator_ini_int(const char *root, const char *exe, const char *key,
                         int fallback);

/* THE SAME PARSER AGAINST ANY PROFILE. `KEngineApp::loadProfiles` @0x401240
 * builds three of these and loads them all the same way - the app's own
 * EZ2AC.ini, `system\\common\\patch.ini`, and
 * `system\\title\\common\\version.ini`, whose "GameVersion" key
 * (`../src/settings.cpp:123`) is what the title screen's version plate
 * spells out. Pass an already-resolved path; a missing file or key gives
 * `fallback`, which is what the original does too - a version.ini that
 * fails to load leaves the number at zero. */
int ez2_ini_int_at(const char *ini_path, const char *exe, const char *key,
                   int fallback);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_OPINI_H */
