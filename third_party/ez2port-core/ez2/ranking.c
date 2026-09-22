/* `rank_<mode>_<chart>.bin` — a chart's local top five. See ranking.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "ranking.h"
#include "usersongs.h"
#include "vfs.h"

#include <stdio.h>
#include <string.h>

void ez2_ranking_defaults(ez2_ranking *out)
{
    int i;

    if (out == 0)
        return;
    for (i = 0; i < EZ2_RANK_SLOTS; i++) {
        memcpy(out->slots[i].name, EZ2_RANK_DEFAULT_NAME, EZ2_RANK_NAME);
        out->slots[i].name[EZ2_RANK_NAME] = 0;
        out->slots[i].score = 0;
    }
}

int ez2_ranking_parse(const unsigned char *data, size_t n, ez2_ranking *out)
{
    const unsigned char *sc;
    int i;

    if (data == 0 || out == 0)
        return EZ2_RANKING_ERR_ARG;
    if (n != EZ2_RANK_BYTES)
        return EZ2_RANKING_ERR_SIZE;

    /* Names first, all five, THEN the scores - two arrays, not five records.
     * That is how the missing-file branch fills them (two buffers, strides 8
     * and 4) and how every shipped file is laid out. */
    sc = data + EZ2_RANK_SLOTS * EZ2_RANK_NAME;
    for (i = 0; i < EZ2_RANK_SLOTS; i++) {
        memcpy(out->slots[i].name, data + i * EZ2_RANK_NAME, EZ2_RANK_NAME);
        out->slots[i].name[EZ2_RANK_NAME] = 0;
        out->slots[i].score = (int)((unsigned)sc[i * 4] |
                                    ((unsigned)sc[i * 4 + 1] << 8) |
                                    ((unsigned)sc[i * 4 + 2] << 16) |
                                    ((unsigned)sc[i * 4 + 3] << 24));
    }
    return EZ2_RANKING_OK;
}

void ez2_ranking_write(const ez2_ranking *r, unsigned char *buf)
{
    unsigned char *sc;
    int i;

    if (r == 0 || buf == 0)
        return;
    sc = buf + EZ2_RANK_SLOTS * EZ2_RANK_NAME;
    for (i = 0; i < EZ2_RANK_SLOTS; i++) {
        size_t len = strlen(r->slots[i].name);
        unsigned v = (unsigned)r->slots[i].score;

        if (len > EZ2_RANK_NAME)
            len = EZ2_RANK_NAME;
        /* SPACE padded, not zero padded - the binary's own spare default is
         * eight spaces (@0x49196c). */
        memset(buf + i * EZ2_RANK_NAME, ' ', EZ2_RANK_NAME);
        memcpy(buf + i * EZ2_RANK_NAME, r->slots[i].name, len);

        sc[i * 4]     = (unsigned char)(v & 0xff);
        sc[i * 4 + 1] = (unsigned char)((v >> 8) & 0xff);
        sc[i * 4 + 2] = (unsigned char)((v >> 16) & 0xff);
        sc[i * 4 + 3] = (unsigned char)((v >> 24) & 0xff);
    }
}

/* The secret-table flag - g_1b2eb70's stand-in (header comment). */
static int g_alt_tables;

void ez2_ranking_set_alt(int on) { g_alt_tables = on ? 1 : 0; }
int  ez2_ranking_get_alt(void)   { return g_alt_tables; }

int ez2_ranking_path(const char *root, const char *mode_name,
                     const char *song, int tier, char *out, size_t n)
{
    static const char *const suffix[4] = { ".bin", "-hd.bin", "-shd.bin",
                                           "-ex.bin" };
    char sound[2048], name[512];

    if (root == 0 || mode_name == 0 || song == 0 || out == 0)
        return 0;
    if (tier < 0 || tier > 3)
        tier = 0;

    snprintf(name, sizeof name, "%srank_%s_%s%s",
             g_alt_tables ? "e_" : "", mode_name, song, suffix[tier]);
    /* A user-song package (usersongs.h) keeps its tables beside its charts,
     * so nothing is written into the game tree for it. */
    if (ez2_usersongs_dir(song, sound, sizeof sound)) {
        if (ez2_vfs_child(sound, name, out, n))
            return 1;
        return (size_t)snprintf(out, n, "%s/%s", sound, name) < n;
    }

    if (!ez2_vfs_child(root, "sound", sound, sizeof sound))
        return 0;

    if (ez2_vfs_child(sound, name, out, n))
        return 1;

    /* No such file yet - which is the normal case for a chart nobody has
     * finished. The literal spelling is what the game would create. */
    return (size_t)snprintf(out, n, "%s/%s", sound, name) < n;
}

int ez2_ranking_load(const char *root, const char *mode_name,
                     const char *song, int tier, ez2_ranking *out)
{
    unsigned char raw[EZ2_RANK_BYTES];
    char path[2048];
    FILE *f;
    size_t got;

    if (out == 0)
        return EZ2_RANKING_ERR_ARG;
    ez2_ranking_defaults(out);
    if (root == 0 || mode_name == 0 || song == 0)
        return EZ2_RANKING_ERR_ARG;

    if (!ez2_ranking_path(root, mode_name, song, tier, path, sizeof path))
        return EZ2_RANKING_ABSENT;

    f = fopen(path, "rb");
    if (f == 0)
        return EZ2_RANKING_ABSENT;
    got = fread(raw, 1, sizeof raw, f);
    fclose(f);
    if (got != sizeof raw)
        return EZ2_RANKING_ERR_SIZE;

    return ez2_ranking_parse(raw, sizeof raw, out);
}

int ez2_ranking_place(const ez2_ranking *r, int score)
{
    int i;

    if (r == 0)
        return -1;
    for (i = 0; i < EZ2_RANK_SLOTS; i++)
        if (score > r->slots[i].score)
            return i;
    return -1;
}

void ez2_ranking_insert(ez2_ranking *r, int place, const char *name, int score)
{
    int i;

    if (r == 0 || name == 0 || place < 0 || place >= EZ2_RANK_SLOTS)
        return;
    for (i = EZ2_RANK_SLOTS - 1; i > place; i--)
        r->slots[i] = r->slots[i - 1];

    {
        size_t n = strlen(name);
        if (n > EZ2_RANK_NAME)
            n = EZ2_RANK_NAME;
        memset(r->slots[place].name, 0, sizeof r->slots[place].name);
        memcpy(r->slots[place].name, name, n);
    }
    r->slots[place].score = score;
}

void ez2_ranking_sort(ez2_ranking *r)
{
    int i, j;

    if (r == 0)
        return;
    /* The original's own shape: a selection sort that swaps only on a strict
     * `<`, so equal scores never trade places. @0x4507a8 / @0x466fe8. */
    for (i = 0; i < EZ2_RANK_SLOTS - 1; i++)
        for (j = i + 1; j < EZ2_RANK_SLOTS; j++)
            if (r->slots[i].score < r->slots[j].score) {
                ez2_rank_entry t = r->slots[i];
                r->slots[i] = r->slots[j];
                r->slots[j] = t;
            }
}

int ez2_ranking_save(const char *root, const char *mode_name,
                     const char *song, int tier, const ez2_ranking *r)
{
    unsigned char raw[EZ2_RANK_BYTES];
    char path[2048];
    FILE *f;
    size_t put;

    if (r == 0 || root == 0 || mode_name == 0 || song == 0)
        return EZ2_RANKING_ERR_ARG;
    if (!ez2_ranking_path(root, mode_name, song, tier, path, sizeof path))
        return EZ2_RANKING_ERR_ARG;

    ez2_ranking_write(r, raw);
    f = fopen(path, "wb");
    if (f == 0)
        return EZ2_RANKING_ERR_ARG;
    put = fwrite(raw, 1, sizeof raw, f);
    if (fclose(f) != 0 || put != sizeof raw)
        return EZ2_RANKING_ERR_SIZE;
    return EZ2_RANKING_OK;
}

int ez2_mode_ranking_load(const char *root, const char *mode_name,
                          const char *channel, int battle,
                          ez2_mode_ranking *out)
{
    unsigned char raw[EZ2_MODERANK_BYTES];
    char leaf[160], path[2048];
    FILE *f;
    size_t got;
    int k;

    if (out == 0)
        return EZ2_RANKING_ERR_ARG;

    /* The creator's defaults (@0x458143): every slot EZ2AC_FN, every score
     * zero. */
    for (k = 0; k < EZ2_MODERANK_NAMED; k++)
        snprintf(out->name[k], sizeof out->name[k], "%s",
                 EZ2_RANK_DEFAULT_NAME);
    memset(out->score, 0, sizeof out->score);
    if (root == 0 || mode_name == 0)
        return EZ2_RANKING_ERR_ARG;

    /* The four spellings the ctor builds (src/rankingctor.cpp): the channel
     * slots in before the battle suffix. */
    if (channel != 0)
        snprintf(leaf, sizeof leaf, "system\\ranking\\ranking_%s_%s%s.bin",
                 mode_name, channel, battle ? "_battle" : "");
    else
        snprintf(leaf, sizeof leaf, "system\\ranking\\ranking_%s%s.bin",
                 mode_name, battle ? "_battle" : "");
    if (!ez2_vfs_resolve(root, leaf, path, sizeof path))
        return EZ2_RANKING_ABSENT;
    f = fopen(path, "rb");
    if (f == 0)
        return EZ2_RANKING_ABSENT;
    got = fread(raw, 1, sizeof raw, f);
    fclose(f);
    if (got != sizeof raw)
        return EZ2_RANKING_ERR_SIZE;

    /* The layout the writer's stride bug produces (header comment): names
     * survive at 50-byte strides through the 792-byte region, scores are a
     * packed dword array at +792. */
    for (k = 0; k < EZ2_MODERANK_NAMED; k++) {
        memcpy(out->name[k], raw + (size_t)k * 50, EZ2_RANK_NAME);
        out->name[k][EZ2_RANK_NAME] = 0;
    }
    for (k = 0; k < EZ2_MODERANK_SLOTS; k++) {
        const unsigned char *p = raw + 792 + (size_t)k * 4;

        out->score[k] = (int)((unsigned)p[0] | ((unsigned)p[1] << 8) |
                              ((unsigned)p[2] << 16) | ((unsigned)p[3] << 24));
    }
    return 0;
}

int ez2_ranking_submit(const char *root, const char *mode_name,
                       const char *song, int tier,
                       const char *name, int score, ez2_ranking *out)
{
    ez2_ranking r;
    int place;

    if (name == 0)
        name = EZ2_RANK_DEFAULT_NAME;
    if (ez2_ranking_load(root, mode_name, song, tier, &r) < 0)
        return -1;

    /* Sort BEFORE placing, as @0x450690 does - a table that reached the disk
     * out of order would otherwise decide the placement. */
    ez2_ranking_sort(&r);

    place = ez2_ranking_place(&r, score);
    if (place >= 0) {
        ez2_ranking merged = r;

        ez2_ranking_insert(&merged, place, name, score);
        if (ez2_ranking_save(root, mode_name, song, tier, &merged) < 0)
            place = -1;         /* nothing reached the disk; `out` stays read */
        else
            r = merged;
    }
    if (out != 0)
        *out = r;
    return place;
}
