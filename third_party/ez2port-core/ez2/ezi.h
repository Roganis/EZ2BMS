/* EZ2AC `.ezi` keysound index.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * A `.ezi` maps a chart's note key indices to sample files. It is plain text
 * once decrypted (EZ2_KEY_EZI), one entry per line:
 *
 *     <note> <mode> <filename> [<second filename>]
 *
 * This follows EziLoader::loadEZI @0x411090 - MATCHED, ../../src/loadezi.cpp -
 * rather than the prior RE, because the mode column turns out to matter and
 * the original's parse has two behaviours worth copying exactly. See ezi.c.
 *
 * The filenames end in ".wav" but the files on disk are ".ssf", the same kind
 * of extension redirect as .bmp -> .abm. ez2_ezi_resolve does the swap.
 */
#ifndef EZ2_EZI_H
#define EZ2_EZI_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* The engine's table is 0x800 entries: loadEZI rejects a note number outside
 * [0, 0x800) as an error rather than clamping it. */
#define EZ2_EZI_SLOTS_ORIGINAL 0x800
/* The port's own table is as wide as the chart record's key index (a u16 in
 * the version-8 record, chart.c), so a user-song package (usersongs.h) with
 * more keysound slices than the original's 0x800 still loads. */
#define EZ2_EZI_SLOTS 0x10000
#define EZ2_EZI_NAME  260

typedef struct ez2_ezi_entry {
    int  note;                    /* the chart's key index */
    int  mode;
    char name[EZ2_EZI_NAME];
    /* Mode 2 lines carry a SECOND filename. The original reads it and throws
     * it away, so nothing downstream may depend on it - but it is kept here
     * because discarding data at the parser is harder to undo than ignoring
     * it at the call site. */
    char name2[EZ2_EZI_NAME];
    int  has_name2;
} ez2_ezi_entry;

typedef struct ez2_ezi {
    int             count;
    ez2_ezi_entry  *entries;
} ez2_ezi;

int  ez2_ezi_parse(const char *text, size_t n, ez2_ezi *out);
void ez2_ezi_free(ez2_ezi *e);

/* The entry for a chart's key index, or NULL. */
const ez2_ezi_entry *ez2_ezi_lookup(const ez2_ezi *e, int note);

/* Rewrite a ".wav" name as the ".ssf" that is actually on disk. Copies `name`
 * unchanged if it has no extension to swap. Returns 0 if `out` is too small.
 *
 * THE RESULT MAY BE A RELATIVE PATH, NOT A BARE FILENAME. 4,703 references in
 * the game name a sample in another song's folder with a Windows relative path
 * ("..\..\sound\stay\p_MR.wav"). A loader that treats the result as a
 * filename in the .ezi's own directory will fail on all of them. Resolve it
 * against the .ezi's directory, honouring ".." and both separators - which is
 * what ezPathResolve in the platform layer already does. */
int ez2_ezi_resolve(const char *name, char *out, size_t out_size);

enum ez2_ezi_err {
    EZ2_EZI_OK        =  0,
    EZ2_EZI_ERR_NOTE  = -1,   /* a note number outside [0, 0x800) */
    EZ2_EZI_ERR_EMPTY = -2,   /* no entries at all */
    EZ2_EZI_ERR_MEM   = -3
};

const char *ez2_ezi_strerror(int err);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_EZI_H */
