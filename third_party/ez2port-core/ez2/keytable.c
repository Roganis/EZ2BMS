/* EZ2AC cipher key tables - loaded at runtime, never embedded.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "keytable.h"
#include "util.h"

#include <stdio.h>
#include <string.h>

/* Virtual addresses of the three 2048-byte key regions, image base 0x00400000.
 * Sources: ../../wip/crypt.cpp, ../../wip/crypt2.cpp, ../../wip/slurpdecrypt.cpp. */
static const unsigned long kTableVA[EZ2_KEY_COUNT] = {
    0x004a74b0UL,   /* EZ2_KEY_EZ  */
    0x004a7cb0UL,   /* EZ2_KEY_EZI */
    0x004a8568UL    /* EZ2_KEY_INI */
};

/* 64-bit FNV-1a of the 512 extracted bytes. See keytable.h for why a digest is
 * safe to commit where the table is not. */
static const unsigned long long kTableHash[EZ2_KEY_COUNT] = {
    0x1c6c5de0f271f9f6ULL,
    0xfe3022e6e9e0f9a8ULL,
    0xb098013e0d4e4923ULL
};

static const char *const kTableName[EZ2_KEY_COUNT] = { "ez", "ezi", "ini" };

#define EZ2_KEY_REGION 2048   /* 512 entries at a stride of 4 */

static unsigned long long fnv1a64(const unsigned char *p, size_t n)
{
    unsigned long long h = 0xcbf29ce484222325ULL;
    size_t i;
    for (i = 0; i < n; i++) {
        h ^= p[i];
        h *= 0x100000001b3ULL;
    }
    return h;
}

const char *ez2_keykind_name(ez2_keykind kind)
{
    if ((unsigned)kind >= EZ2_KEY_COUNT)
        return "?";
    return kTableName[kind];
}

/* ASCII case-insensitive compare. Not strcasecmp: that is POSIX, and these are
 * the game's own fixed extensions, so a locale-aware fold would be wrong even
 * where it exists. */

ez2_keykind ez2_keykind_for_path(const char *path)
{
    const char *dot = 0;
    const char *p;

    for (p = path; *p; p++) {
        if (*p == '.')
            dot = p;
        else if (*p == '/' || *p == '\\')
            dot = 0;
    }
    if (dot == 0)
        return EZ2_KEY_COUNT;

    if (ez2_ci_equal(dot, ".ez"))
        return EZ2_KEY_EZ;
    if (ez2_ci_equal(dot, ".ezi"))
        return EZ2_KEY_EZI;
    if (ez2_ci_equal(dot, ".ini"))
        return EZ2_KEY_INI;
    return EZ2_KEY_COUNT;
}

const char *ez2_keytable_strerror(int err)
{
    switch (err) {
    case EZ2_KT_OK:          return "ok";
    case EZ2_KT_ERR_OPEN:    return "cannot open file";
    case EZ2_KT_ERR_READ:    return "short read";
    case EZ2_KT_ERR_FORMAT:  return "not a 32-bit PE image";
    case EZ2_KT_ERR_ADDRESS: return "key table address is not in any section"
                                    " (is this the PACKED EZ2AC.exe?)";
    case EZ2_KT_ERR_VERIFY:  return "extracted data is not the expected key"
                                    " table (wrong or modified executable)";
    case EZ2_KT_ERR_KIND:    return "no such key table";
    default:                 return "unknown error";
    }
}

int ez2_keytable_verify(const ez2_keytable *table, ez2_keykind kind)
{
    if ((unsigned)kind >= EZ2_KEY_COUNT)
        return 0;
    return fnv1a64(table->t, EZ2_KEYTABLE_SIZE) == kTableHash[kind];
}

/* Map a virtual address to a file offset through the PE section table.
 *
 * For our packer-dumped target this is the identity minus the image base
 * (every section has RawAddress == VirtualAddress), which is why CLAUDE.md can
 * state "file off = VA - 0x400000". Doing it properly costs thirty lines and
 * does not assume that. Returns 0 on failure. */
static long pe_va_to_offset(FILE *f, unsigned long va, unsigned long need)
{
    unsigned char hdr[4096];
    size_t got;
    unsigned long pe, base, secoff;
    unsigned nsec, optsize, i;

    if (fseek(f, 0, SEEK_SET) != 0)
        return 0;
    got = fread(hdr, 1, sizeof hdr, f);
    if (got < 0x40 || hdr[0] != 'M' || hdr[1] != 'Z')
        return 0;

    pe = ez2_rd32(hdr + 0x3c);
    if (pe + 24 + 96 > got)
        return 0;
    if (memcmp(hdr + pe, "PE\0\0", 4) != 0)
        return 0;
    if (ez2_rd16(hdr + pe + 24) != 0x10b)     /* PE32 only; the game is 32-bit */
        return 0;

    nsec    = ez2_rd16(hdr + pe + 6);
    optsize = ez2_rd16(hdr + pe + 20);
    base    = ez2_rd32(hdr + pe + 24 + 28);
    secoff  = pe + 24 + optsize;

    if (va < base)
        return 0;
    va -= base;                            /* now an RVA */

    if (secoff + (unsigned long)nsec * 40 > got)
        return 0;

    for (i = 0; i < nsec; i++) {
        const unsigned char *s = hdr + secoff + i * 40;
        unsigned long vaddr = ez2_rd32(s + 12);
        unsigned long rsize = ez2_rd32(s + 16);
        unsigned long raddr = ez2_rd32(s + 20);

        if (va >= vaddr && va - vaddr < rsize) {
            unsigned long d = va - vaddr;
            /* the whole region has to be backed by file data, not just its
             * first byte - a truncated tail would read as zeros */
            if (rsize - d < need)
                return 0;
            return (long)(raddr + d);
        }
    }
    return 0;
}

int ez2_exe_read(const char *exe_path, unsigned long va, void *buf,
                 unsigned long n)
{
    FILE *f = fopen(exe_path, "rb");
    long off;

    if (f == 0)
        return EZ2_KT_ERR_OPEN;
    off = pe_va_to_offset(f, va, n);
    if (off == 0) {
        fclose(f);
        return EZ2_KT_ERR_ADDRESS;
    }
    if (fseek(f, off, SEEK_SET) != 0 || fread(buf, 1, n, f) != n) {
        fclose(f);
        return EZ2_KT_ERR_READ;
    }
    fclose(f);
    return EZ2_KT_OK;
}

int ez2_keytable_from_exe(const char *exe_path, ez2_keykind kind,
                          ez2_keytable *out)
{
    FILE *f;
    unsigned char region[EZ2_KEY_REGION];
    long off;
    int i;

    if ((unsigned)kind >= EZ2_KEY_COUNT)
        return EZ2_KT_ERR_KIND;

    f = fopen(exe_path, "rb");
    if (f == 0)
        return EZ2_KT_ERR_OPEN;

    off = pe_va_to_offset(f, kTableVA[kind], EZ2_KEY_REGION);
    if (off == 0) {
        fclose(f);
        /* Distinguish "not a PE at all" from "PE, but nothing lives there". */
        return EZ2_KT_ERR_ADDRESS;
    }

    if (fseek(f, off, SEEK_SET) != 0 ||
        fread(region, 1, EZ2_KEY_REGION, f) != EZ2_KEY_REGION) {
        fclose(f);
        return EZ2_KT_ERR_READ;
    }
    fclose(f);

    for (i = 0; i < EZ2_KEYTABLE_SIZE; i++)
        out->t[i] = region[i * 4];

    if (!ez2_keytable_verify(out, kind))
        return EZ2_KT_ERR_VERIFY;
    return EZ2_KT_OK;
}

int ez2_keytable_from_file(const char *path, ez2_keytable *out)
{
    FILE *f = fopen(path, "rb");
    size_t got;

    if (f == 0)
        return EZ2_KT_ERR_OPEN;
    got = fread(out->t, 1, EZ2_KEYTABLE_SIZE, f);
    fclose(f);
    return (got == EZ2_KEYTABLE_SIZE) ? EZ2_KT_OK : EZ2_KT_ERR_READ;
}

int ez2_keytable_write(const char *path, const ez2_keytable *table)
{
    FILE *f = fopen(path, "wb");
    size_t put;

    if (f == 0)
        return EZ2_KT_ERR_OPEN;
    put = fwrite(table->t, 1, EZ2_KEYTABLE_SIZE, f);
    if (fclose(f) != 0 || put != EZ2_KEYTABLE_SIZE)
        return EZ2_KT_ERR_READ;
    return EZ2_KT_OK;
}
