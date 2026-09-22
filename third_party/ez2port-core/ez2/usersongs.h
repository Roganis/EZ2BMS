/* User songs - the route-3 packages `tools/bmson2ez.py` writes.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * A package is one folder under the user-songs root, named by the song KEY,
 * holding a plaintext `song.ini` and beside it everything a shipped song
 * spreads over `sound/<key>/`, `system/disc/`, `system/songname/`,
 * `system/preview/`, `system/eyecatch/` and `video/<key>/` (BMSON.md,
 * section 7). Nothing in the game tree is touched: the packages are merged
 * into the per-mode song table AFTER `song.bin` is read, and every resolver
 * that would look under the game root asks here first.
 *
 *     [Song]     Key, Title, Artist, Genre, Category (1..47, default 1)
 *     [Charts]   <Mode>.<Tier> = <level>      NM / HD / SHD / EX
 *     [Assets]   Disc, Songname, Eyecatch, Preview   (file names in the folder)
 *     [Bga]      File, StartMs
 *
 * The chart files are named exactly like shipped ones (`streetmix1p-<key>.ez`
 * and friends), so ez2_songdb_charts and ez2_stage_chart only need the
 * folder swapped; their bytes are PLAINTEXT, which ez2_file_read_decrypted
 * recognises by content. The keysound index may use every slot the record
 * width allows (ezi.h), not the original's 0x800.
 *
 * This is a pure lookup module with one piece of process state: the root.
 * It is set once from the command line (or the config directory's `songs/`),
 * and every function returns 0 / does nothing while it is unset. */
#ifndef EZ2_USERSONGS_H
#define EZ2_USERSONGS_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

struct ez2_songdb;

/* The packages' parent folder. NULL or "" turns the whole module off. */
void        ez2_usersongs_set_root(const char *dir);
const char *ez2_usersongs_root(void);

/* A bmson folder dropped into the root is converted on the spot: the merge
 * calls the importer for every subfolder that has .bmson files and no
 * song.ini (bmson.h does the work; the caller supplies it so this module
 * stays free of codec libraries). The importer writes `<root>/<key>/`,
 * copies the key to `key_out`, and returns the number of charts written. */
typedef int (*ez2_usersongs_importer)(const char *folder, const char *out_root,
                                      char *key_out, size_t key_n);
void ez2_usersongs_set_importer(ez2_usersongs_importer fn);

/* Called before each folder the importer is about to convert: its name, its
 * position (0-based) and how many folders this pass converts in all. A
 * player sees the conversion as a pause before the song select, so the
 * caller can draw a screen saying which song and how many are left. */
typedef void (*ez2_usersongs_progress)(const char *folder, int index, int total,
                                       void *user);
void ez2_usersongs_set_progress(ez2_usersongs_progress fn, void *user);

/* Run the importer over the root now (the merge does this too). Returns how
 * many folders were converted. */
int ez2_usersongs_import_pending(void);

/* The package folder for `key` (case-insensitive), 1 if it exists. */
int ez2_usersongs_dir(const char *key, char *out, size_t n);

/* Append every package that offers charts for `mode_name` to `db`: one entry
 * per song (key, title as the name, the four tier levels) and its key into
 * the song.ini's category group (1..48; 48, the port's own CUSTOM category
 * after the game's 47, when unsaid). Returns how many
 * were added. Idempotent for a table that already holds the key. */
int ez2_usersongs_merge(struct ez2_songdb *db, const char *mode_name);

/* The full path of a package asset - `kind` is the [Assets] key ("Disc",
 * "Songname", "Eyecatch", "Preview") - 1 if the song is a package and the
 * asset exists. */
int ez2_usersongs_asset(const char *key, const char *kind, char *out, size_t n);

/* The package's movie and its start offset in ms; 1 if there is one. */
int ez2_usersongs_bga(const char *key, char *out, size_t n, int *start_ms);

#ifdef __cplusplus
}
#endif

#endif
