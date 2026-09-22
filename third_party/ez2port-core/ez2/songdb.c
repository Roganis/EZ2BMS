/* `song.bin` — the per-mode song table. See songdb.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "songdb.h"
#include "util.h"
#include "usersongs.h"
#include "mode.h"
#include "keytable.h"
#include "vfs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const char *ez2_songdb_strerror(int err)
{
    switch (err) {
    case EZ2_SONGDB_OK:        return "ok";
    case EZ2_SONGDB_ERR_ARG:   return "bad argument";
    case EZ2_SONGDB_ERR_OPEN:  return "cannot open the file";
    case EZ2_SONGDB_ERR_MAGIC: return "decrypted, but the magic is not EZSL - "
                                      "wrong executable, or not a song.bin";
    case EZ2_SONGDB_ERR_SHORT: return "the header points past the end of the file";
    case EZ2_SONGDB_ERR_MEM:   return "out of memory";
    case EZ2_SONGDB_ERR_EXE:   return "cannot read the cipher tables from the "
                                      "executable";
    default:                   return "unknown error";
    }
}

void ez2_songdb_decrypt(unsigned char *buf, size_t n,
                        const unsigned char *tables)
{
    const unsigned char *t1 = tables;        /* 0x4ae9dc */
    const unsigned char *t2 = tables + 32;   /* 0x4ae9fc */
    unsigned char konst = 0;
    size_t i;
    int k;

    if (buf == 0 || tables == 0)
        return;

    /* `tbl1[k] ^ tbl2[k]` summed over the 32 rounds does not depend on the
     * byte, so it folds to one constant. The `tbl1[i % div]` term does not. */
    for (k = 0; k < 32; k++)
        konst = (unsigned char)(konst ^ t1[k] ^ t2[k]);

    for (i = 0; i < n; i++) {
        unsigned char c = (unsigned char)(t2[(i + 1) & 31] ^ buf[i] ^
                                          (unsigned char)(i & 0xff));

        for (k = 0; k < 32; k++) {
            /* k == 0 divides by TWELVE, not by zero - `test edi,edi; jne;
             * mov edi,0xc` at 0x469d06. */
            unsigned div = (unsigned)(k ? k : 12);
            c = (unsigned char)(c ^ t1[i % div]);
        }
        buf[i] = (unsigned char)(c ^ konst);
    }
}

/* The record's floats are at ODD offsets, so they are assembled byte-wise
 * rather than by overlaying a packed struct - which is what keeps this
 * portable to a machine that traps unaligned loads (PORTING.md 4c). */
static float rdf32(const unsigned char *p)
{
    unsigned char b[4];
    float v;

    b[0] = p[0]; b[1] = p[1]; b[2] = p[2]; b[3] = p[3];
    memcpy(&v, b, 4);
    return v;
}

static void copy_field(char *dst, const unsigned char *src, size_t n)
{
    size_t i;

    for (i = 0; i < n && src[i]; i++)
        dst[i] = (char)src[i];
    dst[i] = 0;
}

int ez2_songdb_parse(const unsigned char *data, size_t n, ez2_songdb *out)
{
    unsigned count;
    unsigned long off;
    unsigned i;

    if (data == 0 || out == 0)
        return EZ2_SONGDB_ERR_ARG;

    memset(out, 0, sizeof *out);
    if (n < 0x10)
        return EZ2_SONGDB_ERR_SHORT;
    if (memcmp(data, "EZSL", 4) != 0)
        return EZ2_SONGDB_ERR_MAGIC;

    /* +6 is the count `loadBinFile` reads into the table's own +0x9278 slot,
     * and +8 is where the records start. */
    count = ez2_rd16(data + 6);
    off   = ez2_rd32(data + 8);

    if (off > n || (n - off) / EZ2_SONGDB_RECORD < count)
        return EZ2_SONGDB_ERR_SHORT;

    if (count == 0)
        return EZ2_SONGDB_OK;

    out->entries = (ez2_song_entry *)calloc(count, sizeof *out->entries);
    if (out->entries == 0)
        return EZ2_SONGDB_ERR_MEM;
    out->count = (int)count;

    for (i = 0; i < count; i++) {
        const unsigned char *r = data + off + (size_t)i * EZ2_SONGDB_RECORD;
        ez2_song_entry *e = &out->entries[i];
        int s;

        copy_field(e->key,  r,        EZ2_SONGDB_KEY);
        copy_field(e->name, r + 0x10, EZ2_SONGDB_NAME);
        e->kind = r[0x30];

        for (s = 0; s < EZ2_SONGDB_STEPS; s++) {
            const unsigned char *g = r + 0x32 + s * 9;   /* stride NINE */
            e->steps[s].level = g[0];
            e->steps[s].a = rdf32(g + 1);
            e->steps[s].b = rdf32(g + 5);
        }
    }

    /* The 47 category groups behind the +0x0c offset (@0x469c30's second
     * walk): u16 count, then count 16-byte keys, sequentially. Tolerant
     * where the game is not - a header too short or an offset off the end
     * leaves every group empty rather than failing the whole parse, since
     * the entries are already good. */
    if (n >= 0x10) {
        unsigned long p = ez2_rd32(data + 0xc);
        int g;

        for (g = 0; g < EZ2_SONGDB_CATEGORIES; g++) {
            unsigned cnt;
            unsigned k;

            if (p + 2 > n)
                break;
            cnt = ez2_rd16(data + p);
            p += 2;
            if (cnt > (n - p) / EZ2_SONGDB_KEY)
                break;
            if (cnt > 0) {
                out->groups[g].keys = (char (*)[EZ2_SONGDB_KEY + 1])
                    calloc(cnt, EZ2_SONGDB_KEY + 1);
                if (out->groups[g].keys == 0)
                    break;
                for (k = 0; k < cnt; k++)
                    copy_field(out->groups[g].keys[k],
                               data + p + (size_t)k * EZ2_SONGDB_KEY,
                               EZ2_SONGDB_KEY);
                out->groups[g].count = (int)cnt;
            }
            p += (unsigned long)cnt * EZ2_SONGDB_KEY;
        }
    }
    return EZ2_SONGDB_OK;
}


int ez2_songdb_category_view(const ez2_songdb *db, int cat,
                             int *view, int max)
{
    int found = 0;
    int i, j;

    if (db == 0 || view == 0 || cat < 0 || cat >= EZ2_SONGDB_GROUPS)
        return 0;
    for (i = 0; i < db->groups[cat].count && found < max; i++) {
        for (j = 0; j < db->count; j++) {
            if (ez2_ci_equal(db->groups[cat].keys[i], db->entries[j].key)) {
                /* m435070 keeps the rows whose first level float is
                 * non-zero; the level byte is the same fact here. */
                if (db->entries[j].steps[0].level > 0)
                    view[found++] = j;
                break;
            }
        }
    }
    return found;
}

int ez2_songdb_load(const char *path, const char *exe_path, ez2_songdb *out)
{
    unsigned char tables[EZ2_SONGDB_TABLE_SIZE];
    unsigned char *buf;
    FILE *f;
    long sz;
    int rc;

    if (path == 0 || exe_path == 0 || out == 0)
        return EZ2_SONGDB_ERR_ARG;

    if (ez2_exe_read(exe_path, EZ2_SONGDB_TABLE_VA, tables,
                     EZ2_SONGDB_TABLE_SIZE) != EZ2_KT_OK)
        return EZ2_SONGDB_ERR_EXE;

    f = fopen(path, "rb");
    if (f == 0)
        return EZ2_SONGDB_ERR_OPEN;
    if (fseek(f, 0, SEEK_END) != 0 || (sz = ftell(f)) < 0 ||
        fseek(f, 0, SEEK_SET) != 0) { fclose(f); return EZ2_SONGDB_ERR_OPEN; }
    buf = (unsigned char *)malloc((size_t)sz + 1);
    if (buf == 0) { fclose(f); return EZ2_SONGDB_ERR_MEM; }
    if (fread(buf, 1, (size_t)sz, f) != (size_t)sz) {
        free(buf); fclose(f); return EZ2_SONGDB_ERR_OPEN;
    }
    fclose(f);

    ez2_songdb_decrypt(buf, (size_t)sz, tables);
    rc = ez2_songdb_parse(buf, (size_t)sz, out);
    free(buf);
    return rc;
}

void ez2_songdb_free(ez2_songdb *db)
{
    int g;

    if (db == 0)
        return;
    free(db->entries);
    db->entries = 0;
    db->count = 0;
    for (g = 0; g < EZ2_SONGDB_GROUPS; g++) {
        free(db->groups[g].keys);
        db->groups[g].keys = 0;
        db->groups[g].count = 0;
    }
}

int ez2_songdb_song_dir(const char *root, const ez2_song_entry *e,
                        char *out, size_t n)
{
    char sound[2048];
    char stem[EZ2_SONGDB_NAME + 1];
    char *dash;

    if (root == 0 || e == 0 || out == 0)
        return 0;
    if (!ez2_vfs_child(root, "sound", sound, sizeof sound))
        return 0;

    /* 0. A user-song package (usersongs.h) keeps the whole song in one folder. */
    if (e->key[0] && ez2_usersongs_dir(e->key, out, n))
        return 1;

    /* 1. The key, which is the folder for all twelve keys-mode tables. */
    if (e->key[0] && ez2_vfs_child(sound, e->key, out, n))
        return 1;

    /* 2. The name, for a table that keys by something else. */
    if (e->name[0] && ez2_vfs_child(sound, e->name, out, n))
        return 1;

    /* 3. The name with its trailing `-suffix` removed. CV2Mix keys by NUMBER
     * and names by `<song>-<stage>` - "92" / "11ambit-5o1" against a folder
     * called `11ambit`. This step is EMPIRICAL: it resolves all 99 of CV2Mix's
     * entries and is needed by no other table, but it was found by sweeping
     * the library rather than read out of the binary, so a table that ever
     * disagreed would be the rule's problem and not the data's. */
    if (e->name[0]) {
        snprintf(stem, sizeof stem, "%s", e->name);
        dash = strrchr(stem, '-');
        if (dash) {
            *dash = 0;
            if (stem[0] && ez2_vfs_child(sound, stem, out, n))
                return 1;
        }
    }

    out[0] = 0;
    return 0;
}

int ez2_songdb_open_for_mode(const char *root, const char *mode_name,
                             const char *exe_path, ez2_songdb *out)
{
    char sys[2048], dir[2048], path[2048];

    if (root == 0 || mode_name == 0 || exe_path == 0 || out == 0)
        return EZ2_SONGDB_ERR_ARG;
    if (!ez2_vfs_child(root, "system", sys, sizeof sys))
        return EZ2_SONGDB_ERR_OPEN;
    /* Same two places the .gds lives, for the same reason. */
    if (!ez2_vfs_child(sys, mode_name, dir, sizeof dir)) {
        char cv2[2048];
        if (!ez2_vfs_child(sys, "CV2Mix", cv2, sizeof cv2) ||
            !ez2_vfs_child(cv2, mode_name, dir, sizeof dir))
            return EZ2_SONGDB_ERR_OPEN;
    }
    if (!ez2_vfs_child(dir, "song.bin", path, sizeof path))
        return EZ2_SONGDB_ERR_OPEN;
    {
        int rc = ez2_songdb_load(path, exe_path, out);

        /* The user-song packages join the table AFTER song.bin, so a
         * package never shadows a shipped key and the shipped order is
         * untouched (usersongs.h). */
        if (rc == EZ2_SONGDB_OK)
            ez2_usersongs_merge(out, mode_name);
        return rc;
    }
}

const char *ez2_songdb_tier_name(int tier)
{
    static const char *const n[EZ2_SONGDB_STEPS] = { "nm", "hd", "shd", "ex" };
    return (tier >= 0 && tier < EZ2_SONGDB_STEPS) ? n[tier] : "?";
}

int ez2_songdb_tier_from_name(const char *s)
{
    int t;

    if (s == 0)
        return -1;
    for (t = 0; t < EZ2_SONGDB_STEPS; t++)
        if (strcmp(s, ez2_songdb_tier_name(t)) == 0)
            return t;
    return -1;
}

/* The tier suffixes, in the order the four steps appear. This IS the order
 * ez2_tier declares them in (mode.h), and the order the filenames use. */
static const char *const kTierSuffix[EZ2_SONGDB_STEPS] = { "", "-hd", "-shd", "-ex" };

int ez2_songdb_charts(const char *root, const ez2_song_entry *e,
                      const char *mode_name, int players,
                      ez2_song_chart *out, int max)
{
    char dir[2048], name[512], path[2048];
    int t, n = 0;

    if (root == 0 || e == 0 || mode_name == 0 || out == 0)
        return 0;
    if (!ez2_songdb_song_dir(root, e, dir, sizeof dir))
        return 0;
    if (players <= 0)
        players = 1;

    /* A MODE'S CHART FILES MAY SPELL IT DIFFERENTLY FROM ITS TABLE. EZ2CATCH's
     * are `catch1p-...`, and a caller naturally hands us the table's name -
     * which is what made every EZ2CATCH song report "no chart on disk". */
    {
        ez2_mode m = ez2_mode_from_name(mode_name);
        if (m != EZ2_MODE_UNKNOWN)
            mode_name = ez2_mode_file_name(m);
    }

    for (t = 0; t < EZ2_SONGDB_STEPS && n < max; t++) {
        if (e->steps[t].level <= 0)
            continue;              /* the mode does not offer this tier */

        snprintf(name, sizeof name, "%s%dp-%s%s.ez",
                 mode_name, players, e->key, kTierSuffix[t]);
        if (!ez2_vfs_child(dir, name, path, sizeof path))
            continue;              /* the table says yes but the disk does not */

        /* A path longer than the slot is dropped rather than truncated - a
         * truncated path is a file that silently is not the one asked for. */
        if (strlen(path) >= sizeof out[n].path)
            continue;
        out[n].tier  = t;
        out[n].level = e->steps[t].level;
        memcpy(out[n].path, path, strlen(path) + 1);
        n++;
    }

    /* THE CV2 SHAPE. That table names by `<song>-<variant>` and its charts are
     * `<mode><N>p-<name>.ez` - one per entry, the variant standing where a
     * tier suffix would be. Resolving all 99 of them this way is what
     * establishes the rule; the tier walk above finds none of them, so this
     * only runs where the first shape came up empty. */
    if (n == 0 && e->name[0] && max > 0) {
        snprintf(name, sizeof name, "%s%dp-%s.ez", mode_name, players, e->name);
        if (ez2_vfs_child(dir, name, path, sizeof path) &&
            strlen(path) < sizeof out[0].path) {
            out[0].tier  = 0;
            out[0].level = e->steps[0].level;
            memcpy(out[0].path, path, strlen(path) + 1);
            n = 1;
        }
    }
    return n;
}

const ez2_song_entry *ez2_songdb_find(const ez2_songdb *db, const char *key)
{
    int i;

    if (db == 0 || key == 0)
        return 0;
    /* A linear walk, because that is what find @0x469ed0 does - and with 436
     * records at most there is nothing to gain by being cleverer. */
    for (i = 0; i < db->count; i++)
        if (ez2_ci_equal(db->entries[i].key, key))
            return &db->entries[i];
    return 0;
}

/* The CV2 table, held across calls. Opening it means a file read, a decrypt
 * and a parse; a sweep asks this question once per chart and the answer never
 * changes for a given (root, exe). Same reasoning as the key-table cache in
 * file.c, and the same escape hatch. */
static ez2_songdb g_cv2;
static int        g_cv2_ready;
static char       g_cv2_root[2048];
static char       g_cv2_exe[2048];

void ez2_songdb_forget_cache(void)
{
    if (g_cv2_ready)
        ez2_songdb_free(&g_cv2);
    g_cv2_ready = 0;
    g_cv2_root[0] = 0;
    g_cv2_exe[0] = 0;
}

const char *ez2_songdb_cv2_submode(const char *root, const char *exe_path,
                                   const char *stem)
{
    int i;

    if (root == 0 || exe_path == 0 || stem == 0)
        return 0;

    if (!g_cv2_ready ||
        strcmp(g_cv2_root, root) != 0 || strcmp(g_cv2_exe, exe_path) != 0) {
        if (strlen(root) + 1 > sizeof g_cv2_root ||
            strlen(exe_path) + 1 > sizeof g_cv2_exe)
            return 0;
        ez2_songdb_forget_cache();
        if (ez2_songdb_open_for_mode(root, "CV2Mix", exe_path, &g_cv2) !=
            EZ2_SONGDB_OK)
            return 0;
        strcpy(g_cv2_root, root);
        strcpy(g_cv2_exe, exe_path);
        g_cv2_ready = 1;
    }

    /* The CV2 table's `name` field is the chart (`11ambit-5o1`); its `key` is
     * a number. So this matches on the name, unlike every other mode. */
    for (i = 0; i < g_cv2.count; i++)
        if (ez2_ci_equal(g_cv2.entries[i].name, stem))
            return ez2_cv2_submode(g_cv2.entries[i].kind);
    return 0;
}
