/* EZ2AC `.ssf` keysound samples.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "ssf.h"
#include "util.h"

#include <stdio.h>
#include <string.h>

const char *ez2_ssf_strerror(int err)
{
    switch (err) {
    case EZ2_SSF_OK:         return "ok";
    case EZ2_SSF_ERR_SHORT:  return "shorter than the 18-byte header";
    case EZ2_SSF_ERR_FORMAT: return "header is not self-consistent";
    case EZ2_SSF_ERR_TRUNC:  return "declares more PCM than the file holds";
    case EZ2_SSF_ERR_IO:     return "I/O error";
    default:                 return "unknown error";
    }
}

int ez2_ssf_parse(const unsigned char *bytes, size_t n, ez2_ssf *out)
{
    memset(out, 0, sizeof *out);

    if (n < EZ2_SSF_HEADER)
        return EZ2_SSF_ERR_SHORT;

    out->channels    = (int)ez2_rd16(bytes + 0x00);
    out->sample_rate = (int)ez2_rd32(bytes + 0x02);
    out->byte_rate   = (int)ez2_rd32(bytes + 0x06);
    out->block_align = (int)ez2_rd16(bytes + 0x0a);
    out->bits        = (int)ez2_rd16(bytes + 0x0c);
    out->data_bytes  = (size_t)ez2_rd32(bytes + 0x0e);

    /* THERE IS NO MAGIC NUMBER, so the header has to validate itself. The two
     * redundant fields are what make that possible: a WAVEFORMATEX's block
     * align and byte rate are derivable from the other three, so requiring
     * them to agree is a real check rather than a range test. Nothing else in
     * the tree accidentally satisfies all of it.
     *
     * FOUR SHIPPED FILES FAIL IT - sound/7dolls/sl04.ssf, sl06.ssf and the
     * same two under 7dolls2: 3 channels, 24 bits, block align 6, a byte
     * rate that matches neither, and a payload that is plainly 16-bit PCM
     * (0xffff dither, 365 KB of signal, then 5 MB of zeros). No reading of
     * the header reconciles the fields, so there is no rate to play them at.
     * The original copies the header verbatim into a WAVEFORMATEX
     * (readSsfHeader @0x40cdf0) and lets DirectSound decide. The owner played
     * 7dolls on the cabinet (2026-09-03) and heard nothing wrong, which is
     * what a silently dropped keysound sounds like too; the port keeps
     * rejecting them rather than guess a pitch. */
    if (out->channels < 1 || out->channels > 8)
        return EZ2_SSF_ERR_FORMAT;
    if (out->bits != 8 && out->bits != 16 && out->bits != 24 && out->bits != 32)
        return EZ2_SSF_ERR_FORMAT;
    if (out->sample_rate < 1000 || out->sample_rate > 192000)
        return EZ2_SSF_ERR_FORMAT;
    if (out->block_align != out->channels * (out->bits / 8))
        return EZ2_SSF_ERR_FORMAT;
    if (out->byte_rate != out->sample_rate * out->block_align)
        return EZ2_SSF_ERR_FORMAT;

    if (out->data_bytes > n - EZ2_SSF_HEADER)
        return EZ2_SSF_ERR_TRUNC;

    out->data = bytes + EZ2_SSF_HEADER;
    return EZ2_SSF_OK;
}

size_t ez2_ssf_frames(const ez2_ssf *s)
{
    if (s->block_align <= 0)
        return 0;
    return s->data_bytes / (size_t)s->block_align;
}

double ez2_ssf_seconds(const ez2_ssf *s)
{
    if (s->sample_rate <= 0)
        return 0.0;
    return (double)ez2_ssf_frames(s) / (double)s->sample_rate;
}

/* ---- WAV output --------------------------------------------------------- */

static void put32(unsigned char *p, unsigned int v)
{
    p[0] = (unsigned char)v;         p[1] = (unsigned char)(v >> 8);
    p[2] = (unsigned char)(v >> 16); p[3] = (unsigned char)(v >> 24);
}

static void put16(unsigned char *p, unsigned int v)
{
    p[0] = (unsigned char)v;
    p[1] = (unsigned char)(v >> 8);
}

int ez2_ssf_write_wav(const ez2_ssf *s, const char *path)
{
    unsigned char hdr[44];
    FILE *f;
    int ok;

    if (s->data == 0)
        return 0;

    memcpy(hdr, "RIFF", 4);
    put32(hdr + 4, (unsigned int)(36 + s->data_bytes));
    memcpy(hdr + 8, "WAVEfmt ", 8);
    put32(hdr + 16, 16);                       /* fmt chunk size */
    put16(hdr + 20, 1);                        /* PCM */
    put16(hdr + 22, (unsigned int)s->channels);
    put32(hdr + 24, (unsigned int)s->sample_rate);
    put32(hdr + 28, (unsigned int)s->byte_rate);
    put16(hdr + 32, (unsigned int)s->block_align);
    put16(hdr + 34, (unsigned int)s->bits);
    memcpy(hdr + 36, "data", 4);
    put32(hdr + 40, (unsigned int)s->data_bytes);

    f = fopen(path, "wb");
    if (f == 0)
        return 0;
    ok = fwrite(hdr, 1, sizeof hdr, f) == sizeof hdr &&
         fwrite(s->data, 1, s->data_bytes, f) == s->data_bytes;
    if (fclose(f) != 0)
        ok = 0;
    return ok;
}

/* See the header for why the end test is on the SOURCE position. */
size_t ez2_ssf_src_frame(size_t out_frame, int sample_rate, int out_rate)
{
    if (sample_rate <= 0 || out_rate <= 0 || sample_rate == out_rate)
        return out_frame;
    return (size_t)((double)out_frame * (double)sample_rate / (double)out_rate);
}

int ez2_ssf_at_end(size_t out_frame, size_t frames,
                   int sample_rate, int out_rate)
{
    return ez2_ssf_src_frame(out_frame, sample_rate, out_rate) >= frames;
}
