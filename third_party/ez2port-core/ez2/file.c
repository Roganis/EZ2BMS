/* Whole-file reads, with the key tables cached. See file.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "file.h"

#include "crypt.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

unsigned char *ez2_file_read(const char *path, size_t *n)
{
    FILE *f;
    unsigned char *b;
    long sz;

    if (!path || !n)
        return 0;
    if (!(f = fopen(path, "rb")))
        return 0;
    if (fseek(f, 0, SEEK_END) != 0 || (sz = ftell(f)) < 0 ||
        fseek(f, 0, SEEK_SET) != 0) {
        fclose(f);
        return 0;
    }
    /* One past the length, always, and always terminated - see the header. */
    if (!(b = (unsigned char *)malloc((size_t)sz + 1))) {
        fclose(f);
        return 0;
    }
    if (fread(b, 1, (size_t)sz, f) != (size_t)sz) {
        free(b);
        fclose(f);
        return 0;
    }
    b[sz] = 0;
    fclose(f);
    *n = (size_t)sz;
    return b;
}

/* One table per kind, plus the exe they came from. Deriving a table means
 * parsing the whole executable, so a sweep that reads ten thousand charts must
 * not do it ten thousand times. */
static ez2_keytable g_key[EZ2_KEY_COUNT];
static int          g_have[EZ2_KEY_COUNT];
static char         g_exe[2048];

void ez2_file_forget_keys(void)
{
    memset(g_have, 0, sizeof g_have);
    g_exe[0] = 0;
}

static int key_for(const char *exe, ez2_keykind kind, ez2_keytable *out)
{
    if (kind < 0 || kind >= EZ2_KEY_COUNT)
        return 0;
    if (strcmp(g_exe, exe) != 0) {
        if (strlen(exe) + 1 > sizeof g_exe)
            return 0;
        ez2_file_forget_keys();
        strcpy(g_exe, exe);
    }
    if (!g_have[kind]) {
        if (ez2_keytable_from_exe(exe, kind, &g_key[kind]) != EZ2_KT_OK)
            return 0;
        g_have[kind] = 1;
    }
    *out = g_key[kind];
    return 1;
}

static int looks_plain(ez2_keykind kind, const unsigned char *raw, size_t n)
{
    size_t i, lim = n < 512 ? n : 512;

    if (kind == EZ2_KEY_EZ)
        return n >= 4 && memcmp(raw, "EZFF", 4) == 0;
    if (n == 0)
        return 0;
    for (i = 0; i < lim; i++) {
        unsigned char c = raw[i];
        if (c == 0x7f || (c < 0x20 && c != '\t' && c != '\n' && c != '\r'))
            return 0;
    }
    return 1;
}

unsigned char *ez2_file_read_decrypted(const char *path, const char *exe_path,
                                       ez2_keykind kind, size_t *n)
{
    ez2_keytable key;
    unsigned char *raw, *plain;

    if (!path || !n)
        return 0;
    if (!(raw = ez2_file_read(path, n)))
        return 0;
    /* PLAINTEXT IS RECOGNISED BY CONTENT, so a user-song package (usersongs.h,
     * written by tools/bmson2ez.py) needs no cipher and no executable: a
     * chart that already begins "EZFF", or an index / ini whose first bytes
     * are all printable text. A ciphered file is XOR noise and fails both
     * tests on its first byte or two; a shipped file never passes them. */
    if (looks_plain(kind, raw, *n)) {
        plain = (unsigned char *)realloc(raw, *n + 1);
        if (!plain) {
            free(raw);
            return 0;
        }
        plain[*n] = 0;
        return plain;
    }
    if (!exe_path || !key_for(exe_path, kind, &key)) {
        free(raw);
        return 0;
    }
    if (!(plain = (unsigned char *)malloc(*n + 1))) {
        free(raw);
        return 0;
    }
    ez2_decrypt(raw, *n, plain, &key);
    plain[*n] = 0;
    free(raw);
    return plain;
}
