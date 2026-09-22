/* Whole-file reads, with the key tables cached.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Almost everything the game loads is "read the file, decrypt it, hand the
 * plaintext to a parser". That was written out SEVEN times in this tree - a
 * `slurp` in each of five tools, one in the scene loader - plus THREE copies of
 * the decrypting wrapper, and by the time anyone counted they had drifted:
 *
 *   - two of the seven never wrote the terminating NUL they had allocated room
 *     for, and one of those did not allocate the room either. Both feed binary
 *     parsers that carry an explicit length, so nothing was reading past the
 *     end today - but the buffers differed in whether it was SAFE to, which is
 *     the state a text-shaped caller walks into later.
 *   - all three decrypting copies differed. Two re-derived the key table from
 *     the executable ON EVERY FILE, parsing a 2 MB PE per chart; the third
 *     cached it. A sweep over the library therefore did that work a hundred
 *     thousand times for no reason.
 *
 * Three sweeps of this port each found a bug, and the cause was the same every
 * time: two or three copies of one piece of logic that had drifted apart. This
 * module exists so this particular piece cannot do it again.
 */
#ifndef EZ2_FILE_H
#define EZ2_FILE_H

#include <stddef.h>

#include "keytable.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Read `path` whole. Returns a malloc'd buffer the caller frees, or null; `*n`
 * receives the file's length.
 *
 * The buffer always has ONE BYTE MORE than `*n` and that byte is NUL, so a
 * caller may treat the contents as text without copying. A zero-length file
 * reads as a valid one-byte buffer rather than as a failure. */
unsigned char *ez2_file_read(const char *path, size_t *n);

/* The same, then decrypted with the table `kind` names. `exe_path` is the
 * user's own unpacked executable, which is where the tables live.
 *
 * The table is derived once per kind and cached, so passing the same exe for
 * every file in a sweep costs one parse rather than one per file. Passing a
 * DIFFERENT exe re-derives it. Returns null if the file cannot be read or the
 * table cannot be had. */
unsigned char *ez2_file_read_decrypted(const char *path, const char *exe_path,
                                       ez2_keykind kind, size_t *n);

/* Drop the cached tables. Only needed if the executable changes underneath a
 * long-running process; `ez2_file_read_decrypted` already re-derives when it is
 * handed a different path. */
void ez2_file_forget_keys(void);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_FILE_H */
