/* Case-insensitive path resolution against the game's data tree.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THE GAME'S OWN PATHS DO NOT MATCH ITS FILES' SPELLING, and it never had to
 * care because Windows does not. Three examples, all real:
 *
 *     the .gds        `System\streetmix\streetmix.gds`  vs  `STREETMix.gds`
 *     a song folder   song.bin's key `dirtyd`           vs  `sound/DirtyD/`
 *     a chart         `5keymix1p-...`                   vs  `5Keymix1p-...`
 *
 * On a case-sensitive filesystem every one of those is a missing file. Sweeping
 * the shipped library made the scale plain: of 436 song-table keys, 340 match a
 * folder exactly and ALL 436 match one case-insensitively.
 *
 * So this is not a convenience - a port that resolves paths literally cannot
 * open most of the game. It lives in the core rather than in `platform/`
 * because `ez2judge` and the asset tools build with no SDL at all, and because
 * which file a name means is data-tree knowledge, not a rendering concern.
 *
 * IT RUNS ON WINDOWS TOO, rather than short-circuiting to the literal path.
 * The short-circuit was there on the reasoning that a Windows filesystem
 * already matches case - true, but `ez2_vfs_child` then returned success for a
 * child that is not there at all, which is the opposite of what this header
 * promises, and `ez2_vfs_child_ext` could not answer "the one `.gds` in this
 * folder" without a directory read. mingw supplies `dirent.h` and it works, so
 * one resolver serves both platforms and the tests cover both.
 */
#ifndef EZ2_VFS_H
#define EZ2_VFS_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Find the child of `dir` whose name equals `name` ignoring case, and write
 * the full path to `out`. Returns 1 on success, 0 if there is no such child.
 *
 * An exact match wins if one exists, so a tree that really does contain both
 * `Foo` and `foo` resolves the way the caller asked. */
int ez2_vfs_child(const char *dir, const char *name, char *out, size_t n);

/* The first child of `dir` whose name ends with `ext` (compared ignoring
 * case, e.g. ".gds"). Returns 1 on success. Directories with more than one
 * match resolve to an unspecified one of them - every use so far is a
 * directory that holds exactly one. */
int ez2_vfs_child_ext(const char *dir, const char *ext, char *out, size_t n);

/* EVERY child of `dir` whose name ends with `ext`, not just the first. Writes
 * up to `max` full paths into `out` (each `stride` bytes) and returns how many
 * it wrote.
 *
 * `ez2_vfs_child_ext` answers "the one `.gds` in this folder", which is the
 * right question there. This one exists for the case where the answer has to
 * be TRIED rather than read: a drop-in folder may hold several `.exe` files
 * and only one of them is an unpacked EZ2AC, so the caller works down the list
 * until the key tables come out. */
int ez2_vfs_children_ext(const char *dir, const char *ext,
                         char *out, size_t stride, int max);

/* Every SUBDIRECTORY of `dir` (names only, not paths), up to `max`, each
 * `stride` bytes; returns how many. Dot-entries are skipped. This is what
 * the user-songs root is walked with (usersongs.c). */
int ez2_vfs_subdirs(const char *dir, char *out, size_t stride, int max);

/* `dir/a/b/...` resolved one component at a time, each ignoring case. Pass the
 * components as a null-terminated argument list. Returns 1 on success. */
int ez2_vfs_path(char *out, size_t n, const char *dir, ...);

/* A RELATIVE REFERENCE resolved against `dir`, one component at a time and
 * each ignoring case. Backslashes count as separators, `.` is skipped and
 * `..` pops - which a `.ezi` needs, because it may name another song's folder
 * (`..\other\foo.ssf`).
 *
 * This exists because both `ez2play` and `ez2render` built these paths
 * literally and had already drifted - one folded `..` and the other did not -
 * and neither resolved case, so a `.ezi` naming `IP_17.ssf` against a file
 * called `ip_17.ssf` silently lost the sample. Returns 1 on success. */
int ez2_vfs_resolve(const char *dir, const char *ref, char *out, size_t n);

/* A file's SIBLING with a different extension, resolved case-insensitively:
 * `.../foo.ez` + "ezi" -> the real `.../foo.EZI` if that is how it is spelled.
 * Returns 1 on success, 0 if no such sibling exists under any spelling.
 *
 * THE EXTENSION'S CASE VARIES IN THE SHIPPED DATA TOO, not just the stem. Two
 * of the library's 12,360 keysound indexes are `.EZI` and `.ezI`, and building
 * the name with string surgery - which every caller did - made both charts
 * report "cannot read the keysound index" and play in silence. Two files out
 * of twelve thousand is exactly the kind of thing only a sweep finds. */
int ez2_vfs_sibling(const char *path, const char *ext, char *out, size_t n);

/* `mkdir -p` on the directory holding `file`, so a first save works with no
 * setup. Returns 1 if that directory exists afterwards.
 *
 * Here rather than in each tool because there were three byte-identical
 * copies - ez2play, ez2input and ez2lights each wrote the settings file it
 * owns - and all three called POSIX `mkdir(path, mode)`, which mingw does not
 * have. Three copies is three places to fix; this is one. */
int ez2_vfs_makedirs(const char *file);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_VFS_H */
