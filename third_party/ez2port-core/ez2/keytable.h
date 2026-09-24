/* EZ2AC cipher key tables - loaded at runtime, never embedded.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THE TABLES ARE NOT IN THIS REPOSITORY AND MUST NEVER BE.
 * They are 512 bytes of the original executable's .rdata. CLAUDE.md's handling
 * rules allow us to name their ADDRESSES (analysis) but not to carry their
 * BYTES (distribution of the copyrighted binary). So this module extracts them
 * from a copy of the game executable the user already owns, at run time.
 *
 * The addresses, from ../../wip/crypt.cpp, ../../wip/crypt2.cpp and
 * ../../wip/slurpdecrypt.cpp:
 *
 *     .ez   charts    0x004a74b0
 *     .ezi  indices   0x004a7cb0
 *     .ini  settings  0x004a8568   (also the profile slurps' table)
 *
 * Each is a 2048-byte region holding the 512 live entries at a stride of 4 -
 * the decompiled code indexes it as `keyTable[be * 4]`, so entry i is at
 * region[i * 4] and the three bytes between entries are unused.
 */
#ifndef EZ2_KEYTABLE_H
#define EZ2_KEYTABLE_H

#include "crypt.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum ez2_keykind {
    EZ2_KEY_EZ = 0,    /* .ez  - charts */
    EZ2_KEY_EZI,       /* .ezi - chart indices */
    EZ2_KEY_INI,       /* .ini - settings, and the .int profile slurps */
    EZ2_KEY_COUNT
} ez2_keykind;

/* Pick the table from a filename's extension. Returns EZ2_KEY_COUNT if the
 * extension is not one of the three encrypted kinds. */
ez2_keykind ez2_keykind_for_path(const char *path);

const char *ez2_keykind_name(ez2_keykind kind);

/* Extract a table from an unpacked EZ2AC executable.
 *
 * `exe_path` must be an UNPACKED PE (EZ2AC_Unpacked.exe). The packed EZ2AC.exe
 * will not work: its .rdata is compressed inside the Themida stub, so the
 * addresses below resolve to packer data. The integrity check will catch it.
 *
 * Returns 0 on success, or a negative ez2_keytable_err. */
int ez2_keytable_from_exe(const char *exe_path, ez2_keykind kind,
                          ez2_keytable *out);

/* Read `n` bytes from an unpacked executable at virtual address `va`, through
 * the PE section table. Exposed because the key tables are not the only thing
 * that has to come out of the user's own executable rather than out of this
 * repository - `ez2/songdb.c` needs the song table's cipher tables the same
 * way. Returns 0 on success or a negative ez2_keytable_err. */
int ez2_exe_read(const char *exe_path, unsigned long va, void *buf,
                 unsigned long n);

/* Load a table that was already extracted, as 512 raw bytes. Handy for a
 * gitignored local cache so tools do not need the executable every run. */
int ez2_keytable_from_file(const char *path, ez2_keytable *out);
int ez2_keytable_write(const char *path, const ez2_keytable *table);

/* True if `table` is the expected table for `kind`.
 *
 * Checked against a 64-bit FNV-1a of the 512 live bytes. A one-way digest of
 * the table is not the table, so committing it distributes nothing - and it
 * turns "you pointed me at the packed exe" from silent garbage output into a
 * clear error. (2EZConfig V2 does the same thing with game_md5.h.) */
int ez2_keytable_verify(const ez2_keytable *table, ez2_keykind kind);

enum ez2_keytable_err {
    EZ2_KT_OK          =  0,
    EZ2_KT_ERR_OPEN    = -1,  /* cannot open the file */
    EZ2_KT_ERR_READ    = -2,  /* truncated, or not 512 bytes */
    EZ2_KT_ERR_FORMAT  = -3,  /* not a PE32 image */
    EZ2_KT_ERR_ADDRESS = -4,  /* address not inside any section's file data */
    EZ2_KT_ERR_VERIFY  = -5,  /* extracted, but not the expected table */
    EZ2_KT_ERR_KIND    = -6   /* no such table kind */
};

const char *ez2_keytable_strerror(int err);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_KEYTABLE_H */
