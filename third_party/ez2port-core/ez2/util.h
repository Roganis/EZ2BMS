/* The three-line helpers every reader in ez2/ used to carry its own copy of.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Before 2026-09-06 ci_equal was defined in nine files, rd32 in eight, trim
 * in seven and rd16 in four, each a little different: one trim stripped a
 * trailing newline and the next did not, one returned the advanced pointer
 * and the next moved the text down in place. None of the differences was
 * load-bearing - every caller wanted the same thing - so this is the one
 * definition of each, chosen to be the union of what the copies did. */
#ifndef EZ2_UTIL_H
#define EZ2_UTIL_H

#include <string.h>

/* Little-endian 16- and 32-bit reads from an unaligned byte pointer, which
 * is how every game file lays out its numbers. */
static inline unsigned ez2_rd16(const unsigned char *p)
{
    return (unsigned)p[0] | ((unsigned)p[1] << 8);
}

static inline unsigned ez2_rd32(const unsigned char *p)
{
    return (unsigned)p[0] | ((unsigned)p[1] << 8) |
           ((unsigned)p[2] << 16) | ((unsigned)p[3] << 24);
}

/* ASCII case-insensitive string equality. Only A-Z fold: the game's own
 * keys, section names and file names are ASCII, and a locale-aware fold
 * would make a Turkish machine disagree with a Korean one. */
static inline int ez2_ci_equal(const char *a, const char *b)
{
    for (; *a && *b; a++, b++) {
        int x = (unsigned char)*a, y = (unsigned char)*b;
        if (x >= 'A' && x <= 'Z') x += 32;
        if (y >= 'A' && y <= 'Z') y += 32;
        if (x != y)
            return 0;
    }
    return *a == 0 && *b == 0;
}

/* Strip blanks, tabs and line ends from both ends of s, IN PLACE, and return
 * s - so `v = ez2_trim(v);` and a bare `ez2_trim(v);` both work. */
static inline char *ez2_trim(char *s)
{
    char *p = s;
    size_t n;

    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n')
        p++;
    if (p != s)
        memmove(s, p, strlen(p) + 1);
    n = strlen(s);
    while (n && (s[n - 1] == ' ' || s[n - 1] == '\t' ||
                 s[n - 1] == '\r' || s[n - 1] == '\n'))
        s[--n] = 0;
    return s;
}

#endif /* EZ2_UTIL_H */
