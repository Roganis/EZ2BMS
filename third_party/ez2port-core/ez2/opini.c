/* The operator's EZ2AC.ini. See opini.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "opini.h"

#include "file.h"
#include "keytable.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int ez2_operator_ini_int(const char *root, const char *exe, const char *key,
                         int fallback)
{
    char path[2048];

    if (!root)
        return fallback;
    snprintf(path, sizeof path, "%s/EZ2AC.ini", root);
    return ez2_ini_int_at(path, exe, key, fallback);
}

int ez2_ini_int_at(const char *ini_path, const char *exe, const char *key,
                   int fallback)
{
    unsigned char *text;
    size_t n = 0, klen;
    const char *p;
    int out = fallback;

    if (!ini_path || !exe || !key || !key[0])
        return fallback;
    klen = strlen(key);
    text = ez2_file_read_decrypted(ini_path, exe, EZ2_KEY_INI, &n);
    if (!text)
        return fallback;

    /* `"Key" = value`, one per line, no sections. The quotes are the file's
     * own - ez2_song_ini strips the same ones off its names. */
    for (p = (const char *)text; *p; ) {
        const char *eol = strchr(p, '\n');
        size_t len = eol ? (size_t)(eol - p) : strlen(p);

        while (len && (p[0] == ' ' || p[0] == '\t')) { p++; len--; }
        if (len > klen + 2 && p[0] == '"' &&
            strncmp(p + 1, key, klen) == 0 && p[1 + klen] == '"') {
            const char *v = strchr(p + 1 + klen, '=');

            if (v)
                out = atoi(v + 1);
            break;
        }
        if (!eol)
            break;
        p = eol + 1;
    }
    free(text);
    return out;
}
