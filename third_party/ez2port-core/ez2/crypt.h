/* EZ2AC file cipher - portable reimplementation.
 *
 * Derived from the decomp's decoded (but un-matched) DecryptFile @0x00410a40,
 * ../wip/crypt.cpp, and its two siblings DecryptFile2 @0x00410c90
 * (../wip/crypt2.cpp) and the profile slurps @0x004135f0 / @0x004133d0
 * (../wip/slurpdecrypt.cpp). All three are the SAME cipher with a different
 * key table; only the table address and the output extension differ.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#ifndef EZ2_CRYPT_H
#define EZ2_CRYPT_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* The cipher's live table is 512 bytes. In the original executable each entry
 * is stored at a stride of 4 (a 2048-byte region), because the decompiled code
 * indexes it as `keyTable[be * 4]`. See ez2/keytable.h. */
#define EZ2_KEYTABLE_SIZE 512

typedef struct ez2_keytable {
    unsigned char t[EZ2_KEYTABLE_SIZE];
} ez2_keytable;

/* Decrypt `n` bytes of `in` into `out`.
 *
 * `in` and `out` must not overlap. Output length == input length; the cipher
 * neither pads nor truncates, and carries no header, so the caller must know
 * which table a file wants (by extension - see ez2_keykind).
 */
void ez2_decrypt(const unsigned char *in, size_t n,
                 unsigned char *out, const ez2_keytable *key);

/* The exact inverse of ez2_decrypt. The original executable contains no
 * encryptor - the game only ever decrypts - so this is derived, not decoded.
 * It exists for round-trip tests and for writing settings back out. */
void ez2_encrypt(const unsigned char *in, size_t n,
                 unsigned char *out, const ez2_keytable *key);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_CRYPT_H */
