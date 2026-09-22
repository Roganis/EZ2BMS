/* EZ2AC `.ssf` keysound samples.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * An `.ssf` is raw PCM behind an 18-byte header that is exactly the tail of a
 * WAVEFORMATEX plus a size - no RIFF chunks, no magic:
 *
 *     0x00 u16 channels        0x02 u32 sample rate
 *     0x06 u32 byte rate       0x0a u16 block align
 *     0x0c u16 bits per sample 0x0e u32 data bytes
 *     0x12 PCM
 *
 * Confirmed on the real files: sound/6dancewith/24_chorus4-7.ssf is 148,242
 * bytes and declares 148,224 of data - 18 + 148,224 exactly.
 *
 * It has NO magic number, which is why ez2_ssf_parse validates by internal
 * consistency instead (see the .c). `.ezw` is the same header in the older
 * era; both are plaintext, unlike the charts.
 *
 * PROVENANCE: the header layout is RE knowledge from ../../../EZ2REWRITE
 * (reverse-engineering/file-formats.md, `.ezw`/`.ssf`). See ../ATTRIBUTION.md.
 */
#ifndef EZ2_SSF_H
#define EZ2_SSF_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_SSF_HEADER 18

typedef struct ez2_ssf {
    int channels;
    int sample_rate;
    int byte_rate;
    int block_align;
    int bits;
    size_t data_bytes;
    /* Points INTO the caller's buffer - not owned, not copied. The game ships
     * 179,542 of these and some are 16 MB, so a parser that duplicated the
     * PCM would be the wrong shape. */
    const unsigned char *data;
} ez2_ssf;

int ez2_ssf_parse(const unsigned char *bytes, size_t n, ez2_ssf *out);

size_t ez2_ssf_frames(const ez2_ssf *s);
double ez2_ssf_seconds(const ez2_ssf *s);

/* ---- playing one at the device's rate ----------------------------------- */
/*
 * About 8% of the library is not 44.1 kHz - almost all of that 22.05 kHz, and
 * in some songs (m-police: 57 of 118 samples) it is nearly half. Playing one
 * means stepping through the source at a different rate from the output, and
 * there are exactly two things to get right:
 *
 *   - WHICH source frame an output frame reads from, and
 *   - WHEN THE SAMPLE HAS RUN OUT, which is a fact about the SOURCE position
 *     and not about the output one. A 22.05 kHz sample needs two output
 *     frames per source frame, so a mixer that stops once the output cursor
 *     reaches the source's frame count cuts it at exactly half its length.
 *
 * That second one was wrong in the live mixer and right in the offline one
 * for as long as both existed, which is the argument for the rule living in
 * one place with a test on it rather than being written out twice.
 *
 * Nearest-neighbour, which is what both mixers have always done: good enough
 * to play, and a real resampler belongs in the mixer when one is wanted.
 */
size_t ez2_ssf_src_frame(size_t out_frame, int sample_rate, int out_rate);

/* 1 when `out_frame` is past the end of a `frames`-long sample. */
int    ez2_ssf_at_end(size_t out_frame, size_t frames,
                      int sample_rate, int out_rate);

/* Wrap the PCM in a standard 44-byte RIFF/WAVE header and write it out. */
int ez2_ssf_write_wav(const ez2_ssf *s, const char *path);

enum ez2_ssf_err {
    EZ2_SSF_OK        =  0,
    EZ2_SSF_ERR_SHORT = -1,   /* smaller than the header */
    EZ2_SSF_ERR_FORMAT= -2,   /* the header is not self-consistent */
    EZ2_SSF_ERR_TRUNC = -3,   /* declares more PCM than the file holds */
    EZ2_SSF_ERR_IO    = -4
};

const char *ez2_ssf_strerror(int err);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SSF_H */
