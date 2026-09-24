/* EZ2AC file cipher - portable reimplementation.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE ORIGINAL DOES  (DecryptFile @0x00410a40, decoded in ../wip/crypt.cpp)
 *
 * The original works in a single 0x4009c-byte stack frame holding three
 * contiguous buffers - header[128], data[131072], out[131068] - and walks
 * pointers straight across the boundaries between them, which is why its
 * pointer arithmetic reads as nonsense in isolation:
 *
 *     char *p = header + size + 0x7f;      // == &data[size - 1]
 *
 * Stripped of that, it is three passes:
 *
 *   1. reverse the whole file       data -> out
 *   2. copy it back                 out  -> data   (a hand-written dword memcpy)
 *   3. for each block, reverse the block again while subtracting the key
 *
 * Pass 3 walks the file in blocks whose length alternates 8, 16, 8, 16, ...
 * with a short block at EOF, and the key index is a single counter that runs
 * DOWN through each block and wraps at 512:
 *
 *     be = roll + n - 1;                   // roll = bytes consumed so far, mod 512
 *     out[pos + j] = W[pos + n - 1 - j] - T[be--];
 *
 * Two reversals of the same region cancel, so the block loop reads the source
 * file forward within a block - but the BLOCKS are still numbered from the end
 * of the file. That is why pass 1 exists at all and why this reimplementation
 * indexes `in[n - pos - len + u]` instead of keeping a reversed copy: the
 * reversal is an index transform, not data movement.
 *
 * The 8/16 alternation and the fact that `pos` advances by `len` (via the
 * original's odd `if (8 < n) pos = (pos - 8) + n; pos += 8;`) mean every byte
 * is covered exactly once.
 *
 * VERIFIED against the real game: "Final EX"'s EZ2AC.ini (945 bytes) decrypts
 * to 945 bytes of readable INI whose keys are exactly the keys the decomp's
 * MATCHED settings readers ask for (Evolution0..21, TotalCoin, UseIOCard, ...
 * see ../../src/moderunner.cpp).
 * ---------------------------------------------------------------------------
 */
#include "crypt.h"

/* Length of the block starting at `pos`, and the updated alternation flag.
 *
 * The original's control flow, verbatim from wip/crypt.cpp:
 *
 *     if (pos + 8 > size)   n = size - pos;          // short tail, flag frozen
 *     else if (flag == 0)   n = 8,  flag = 1;
 *     else               {  n = 16; if (pos + 16 > size) n = size - pos;
 *                           flag = 0; }
 *
 * Note the tail case does NOT touch the flag - it is the last block either way.
 */
static size_t ez2_block_len(size_t pos, size_t n, int *flag)
{
    size_t len;

    if (pos + 8 > n)
        return n - pos;

    if (*flag == 0) {
        len = 8;
    } else {
        len = (pos + 16 > n) ? n - pos : 16;
    }
    *flag ^= 1;
    return len;
}

void ez2_decrypt(const unsigned char *in, size_t n,
                 unsigned char *out, const ez2_keytable *key)
{
    size_t pos = 0;
    unsigned int roll = 0;   /* bytes consumed so far, mod 512 */
    int flag = 0;

    while (pos < n) {
        size_t len = ez2_block_len(pos, n, &flag);
        size_t src = n - pos - len;   /* the reversal, folded into the index */
        size_t u;

        for (u = 0; u < len; u++) {
            unsigned int be = (unsigned int)(roll + len - 1 - u) & 0x1ff;
            out[pos + u] = (unsigned char)(in[src + u] - key->t[be]);
        }

        roll = (unsigned int)(roll + len) & 0x1ff;
        pos += len;
    }
}

void ez2_encrypt(const unsigned char *in, size_t n,
                 unsigned char *out, const ez2_keytable *key)
{
    size_t pos = 0;
    unsigned int roll = 0;
    int flag = 0;

    while (pos < n) {
        size_t len = ez2_block_len(pos, n, &flag);
        size_t dst = n - pos - len;
        size_t u;

        for (u = 0; u < len; u++) {
            unsigned int be = (unsigned int)(roll + len - 1 - u) & 0x1ff;
            out[dst + u] = (unsigned char)(in[pos + u] + key->t[be]);
        }

        roll = (unsigned int)(roll + len) & 0x1ff;
        pos += len;
    }
}
