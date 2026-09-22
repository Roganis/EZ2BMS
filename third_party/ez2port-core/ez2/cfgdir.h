/* Where the port keeps its OWN settings.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THIS WAS FOUR COPIES OF THE SAME EIGHT LINES - ez2/portcfg.c, ez2/lampcfg.c,
 * tools/ez2play.c and tools/ez2input.c each built `$XDG_CONFIG_HOME/ez2port/x`
 * or `$HOME/.config/ez2port/x` for the one file it owns. Four copies is four
 * places to fix, and the Windows build made that concrete: neither variable is
 * set there, so all four returned 0 and `settings.ini`, `keys.ini` and
 * `lights.ini` silently never loaded and never saved.
 *
 * ---- the order, and why the drop-in folder is first ----------------------
 *
 *   1. whatever `ez2_cfgdir_set` was given - a `--config-dir`, or the data
 *      folder the executable was dropped into;
 *   2. `$XDG_CONFIG_HOME/ez2port`;
 *   3. `$HOME/.config/ez2port`;
 *   4. `%APPDATA%\ez2port`, which is the only one of the three a stock Windows
 *      has.
 *
 * The first is what makes a cabinet work, and the precedent is the game's own:
 * `EZ2AC.ini` lives IN the data folder, not in a per-user directory, because a
 * cabinet is one machine with one player and the folder is the unit people
 * copy. The port's settings are that file's analogue, so they go where it
 * goes - and a folder copied to a second cabinet arrives with its key
 * bindings, its lamp wiring and its screen mode intact.
 *
 * It only applies when the port actually IS running from a data folder
 * (`ezAssetRootHere`), so a developer working out of a build tree still gets
 * the per-user location and nothing about the Linux behaviour changes.
 *
 * NOT HANDLED, and stated rather than hidden: a data folder on read-only media
 * gives a path that cannot be written. The save fails and the tool says so,
 * which is the same thing that happens to any unwritable path; nothing here
 * silently falls back, because a setting that saved somewhere other than where
 * it was read from is worse than one that did not save.
 */
#ifndef EZ2_CFGDIR_H
#define EZ2_CFGDIR_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Use `dir` as the settings directory, ahead of everything else. Pass 0 or ""
 * to drop the override. The string is copied. */
void ez2_cfgdir_set(const char *dir);

/* The settings directory, or 0 if there is nowhere - which on a machine with
 * no HOME, no XDG_CONFIG_HOME, no APPDATA and no override is a real answer. */
const char *ez2_cfgdir(void);

/* `<the settings directory>/<leaf>`. Returns 1 on success, 0 if there is
 * nowhere to put it or the result would not fit. */
int ez2_cfgfile(const char *leaf, char *out, size_t n);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_CFGDIR_H */
