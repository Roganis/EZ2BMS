/* bmson import - the route-3 converter, inside the port.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * A bmson song folder in, a user-song package out (usersongs.h, BMSON.md
 * section 7): plaintext EZFF charts named like the game's own, the keysound
 * index, the per-chart ini with the judge windows and gauge deltas, every
 * keysound as .ssf with bmson's continuation slices cut, the disc / plate /
 * eyecatch as Final EX .abm, a preview built on rizu's keysound-preview plan,
 * and the movie. This is tools/bmson2ez.py in C, so a folder dropped into
 * the songs directory converts itself on the next start; the Python tool
 * stays as the reference and the offline path.
 *
 * Decoding the samples and the art needs a codec library; the caller hands
 * in what it has (media/audio.h, media/image.h when ffmpeg is linked). With
 * no decoders, PCM .wav samples still convert through the reader here and
 * the art is skipped. */
#ifndef EZ2_BMSON_H
#define EZ2_BMSON_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ez2_bmson_decoders {
    /* to interleaved stereo s16 at 44100 Hz, malloc'd; 1 on success */
    int (*audio)(const char *path, short **pcm, size_t *frames);
    /* to top-down RGBA, malloc'd; 1 on success */
    int (*image)(const char *path, unsigned char **rgba, int *w, int *h);
} ez2_bmson_decoders;

typedef void (*ez2_bmson_log)(const char *line, void *user);

/* Convert `folder` into `<out_root>/<key>/`. The key is the folder name
 * reduced to lowercase ASCII letters and digits (15 at most) unless
 * `key_override` says otherwise; it is copied to `key_out`. `game_root` is
 * the game tree, for the mode's `.gds` and the title font. Returns the number
 * of charts written; 0 means nothing was converted (the log says why). */
int ez2_bmson_import(const char *folder, const char *game_root,
                     const char *out_root, const char *key_override,
                     const ez2_bmson_decoders *dec,
                     ez2_bmson_log log, void *user,
                     char *key_out, size_t key_n);

/* 1 if `folder` holds at least one .bmson file. */
int ez2_bmson_folder_has_charts(const char *folder);

#ifdef __cplusplus
}
#endif

#endif
