/* User songs - see usersongs.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "usersongs.h"
#include "util.h"
#include "songdb.h"
#include "vfs.h"
#include "file.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char g_root[2048];
static ez2_usersongs_importer g_importer;

void ez2_usersongs_set_importer(ez2_usersongs_importer fn)
{
    g_importer = fn;
}

static ez2_usersongs_progress g_progress;
static void *g_progress_user;

void ez2_usersongs_set_progress(ez2_usersongs_progress fn, void *user)
{
    g_progress = fn;
    g_progress_user = user;
}

void ez2_usersongs_set_root(const char *dir)
{
    if (dir == 0 || dir[0] == 0)
        g_root[0] = 0;
    else
        snprintf(g_root, sizeof g_root, "%s", dir);
}

const char *ez2_usersongs_root(void)
{
    return g_root[0] ? g_root : 0;
}

int ez2_usersongs_dir(const char *key, char *out, size_t n)
{
    if (!g_root[0] || key == 0 || key[0] == 0 || out == 0)
        return 0;
    return ez2_vfs_child(g_root, key, out, n);
}

/* ---- song.ini ------------------------------------------------------------ */

typedef struct {
    char key[EZ2_SONGDB_KEY + 1];
    char title[EZ2_SONGDB_NAME + 1];
    int  category;                       /* 1..47 */
    /* [Charts] rows, as written: "<Mode>.<Tier> = <level>" */
    struct { char mode[24]; int tier; int level; } charts[32];
    int  nchart;
    char asset[4][256];                  /* Disc, Songname, Eyecatch, Preview */
    char bga[256];
    int  bga_start_ms;
} SongIni;

static const char *const kAssetKeys[4] = { "Disc", "Songname", "Eyecatch", "Preview" };

static int tier_index(const char *t)
{
    if (ez2_ci_equal(t, "NM"))  return 0;
    if (ez2_ci_equal(t, "HD"))  return 1;
    if (ez2_ci_equal(t, "SHD")) return 2;
    if (ez2_ci_equal(t, "EX"))  return 3;
    return -1;
}

static int read_song_ini(const char *dir, SongIni *si)
{
    char path[2048], section[32] = "";
    unsigned char *text;
    size_t n, pos = 0;

    memset(si, 0, sizeof *si);
    si->category = EZ2_SONGDB_GROUPS;          /* the port's CUSTOM category */
    if (!ez2_vfs_child(dir, "song.ini", path, sizeof path))
        return 0;
    text = ez2_file_read(path, &n);
    if (text == 0)
        return 0;
    while (pos < n) {
        char line[512], *p, *eq, *semi;
        size_t len = 0;

        while (pos < n && text[pos] != '\n') {
            if (len < sizeof line - 1)
                line[len++] = (char)text[pos];
            pos++;
        }
        pos++;
        line[len] = 0;
        p = ez2_trim(line);
        if (*p == 0 || *p == ';' || *p == '#')
            continue;
        if (*p == '[') {
            char *end = strchr(p, ']');
            if (end) {
                *end = 0;
                snprintf(section, sizeof section, "%s", p + 1);
            }
            continue;
        }
        eq = strchr(p, '=');
        if (eq == 0)
            continue;
        *eq = 0;
        {
            char *key = ez2_trim(p), *val = ez2_trim(eq + 1);

            /* a trailing "; comment" on a value */
            semi = strchr(val, ';');
            if (semi) {
                *semi = 0;
                val = ez2_trim(val);
            }
            if (ez2_ci_equal(section, "Song")) {
                if (ez2_ci_equal(key, "Key"))
                    snprintf(si->key, sizeof si->key, "%s", val);
                else if (ez2_ci_equal(key, "Title"))
                    snprintf(si->title, sizeof si->title, "%s", val);
                else if (ez2_ci_equal(key, "Category")) {
                    int c = atoi(val);
                    if (c >= 1 && c <= EZ2_SONGDB_GROUPS)
                        si->category = c;
                }
            } else if (ez2_ci_equal(section, "Charts")) {
                char *dot = strchr(key, '.');
                if (dot && si->nchart < (int)(sizeof si->charts / sizeof si->charts[0])) {
                    int t;
                    *dot = 0;
                    t = tier_index(dot + 1);
                    if (t >= 0) {
                        snprintf(si->charts[si->nchart].mode,
                                 sizeof si->charts[si->nchart].mode, "%s", key);
                        si->charts[si->nchart].tier = t;
                        si->charts[si->nchart].level = atoi(val);
                        si->nchart++;
                    }
                }
            } else if (ez2_ci_equal(section, "Assets")) {
                int a;
                for (a = 0; a < 4; a++)
                    if (ez2_ci_equal(key, kAssetKeys[a]))
                        snprintf(si->asset[a], sizeof si->asset[a], "%s", val);
            } else if (ez2_ci_equal(section, "Bga")) {
                if (ez2_ci_equal(key, "File"))
                    snprintf(si->bga, sizeof si->bga, "%s", val);
                else if (ez2_ci_equal(key, "StartMs"))
                    si->bga_start_ms = atoi(val);
            }
        }
    }
    free(text);
    return si->key[0] != 0;
}

/* ---- the merge ------------------------------------------------------------ */

static int add_to_group(ez2_songdb *db, int cat, const char *key)
{
    ez2_song_group *g = &db->groups[cat];
    char (*keys)[EZ2_SONGDB_KEY + 1];
    int i;

    for (i = 0; i < g->count; i++)
        if (ez2_ci_equal(g->keys[i], key))
            return 1;
    keys = (char (*)[EZ2_SONGDB_KEY + 1])
        realloc(g->keys, (size_t)(g->count + 1) * sizeof *keys);
    if (keys == 0)
        return 0;
    g->keys = keys;
    snprintf(g->keys[g->count], sizeof g->keys[g->count], "%s", key);
    g->count++;
    return 1;
}

static int already_imported(const char *folder_name);

/* The subfolders of the root the importer has yet to convert: a folder with
 * .bmson files, no song.ini, and (`skip_done`) no package named by its key.
 * Compacted into `names` in place; returns how many. */
static int pending_folders(char *names, size_t stride, int max, int skip_done)
{
    int count = ez2_vfs_subdirs(g_root, names, stride, max), k, n = 0;

    for (k = 0; k < count; k++) {
        const char *folder = names + (size_t)k * stride;
        char dir[2048], ini[2048], one[2048];

        if (!ez2_vfs_child(g_root, folder, dir, sizeof dir) ||
            ez2_vfs_child(dir, "song.ini", ini, sizeof ini) ||
            !ez2_vfs_child_ext(dir, ".bmson", one, sizeof one) ||
            (skip_done && already_imported(folder)))
            continue;
        if (n != k)
            memmove(names + (size_t)n * stride, folder, stride);
        n++;
    }
    return n;
}

int ez2_usersongs_import_pending(void)
{
    enum { MAX_PKG = 512, STRIDE = 128 };
    char *names;
    int count, k, done = 0;

    if (!g_root[0] || !g_importer)
        return 0;
    names = (char *)malloc((size_t)MAX_PKG * STRIDE);
    if (names == 0)
        return 0;
    count = pending_folders(names, STRIDE, MAX_PKG, 0);
    for (k = 0; k < count; k++) {
        const char *folder = names + (size_t)k * STRIDE;
        char dir[2048], key[16], pkg[2048];

        if (!ez2_vfs_child(g_root, folder, dir, sizeof dir))
            continue;
        if (g_progress)
            g_progress(folder, k, count, g_progress_user);
        /* converted on an earlier start? the package is named by the key */
        key[0] = 0;
        if (g_importer(dir, g_root, key, sizeof key) <= 0)
            continue;
        if (key[0] && ez2_vfs_child(g_root, key, pkg, sizeof pkg))
            done++;
    }
    free(names);
    return done;
}

/* Has `folder` (a bmson source) already been converted into `<root>/<key>/`?
 * The importer derives the key the same way, so the check is a name test. */
static int already_imported(const char *folder_name)
{
    char key[16], pkg[2048], ini[2048];
    size_t i, w = 0;

    for (i = 0; folder_name[i] && w < 15; i++) {
        unsigned char c = (unsigned char)folder_name[i];
        if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))
            key[w++] = (char)c;
        else if (c >= 'A' && c <= 'Z')
            key[w++] = (char)(c + 32);
    }
    key[w] = 0;
    return key[0] && ez2_vfs_child(g_root, key, pkg, sizeof pkg) &&
           ez2_vfs_child(pkg, "song.ini", ini, sizeof ini);
}

int ez2_usersongs_merge(ez2_songdb *db, const char *mode_name)
{
    enum { MAX_PKG = 512, STRIDE = 128 };
    char *names;
    int count, k, added = 0;

    if (!g_root[0] || db == 0 || mode_name == 0)
        return 0;
    /* bmson folders first, so their packages are in the list below */
    if (g_importer) {
        names = (char *)malloc((size_t)MAX_PKG * STRIDE);
        if (names) {
            count = pending_folders(names, STRIDE, MAX_PKG, 1);
            for (k = 0; k < count; k++) {
                const char *folder = names + (size_t)k * STRIDE;
                char dir[2048], key[16];

                if (!ez2_vfs_child(g_root, folder, dir, sizeof dir))
                    continue;
                if (g_progress)
                    g_progress(folder, k, count, g_progress_user);
                g_importer(dir, g_root, key, sizeof key);
            }
            free(names);
        }
    }
    names = (char *)malloc((size_t)MAX_PKG * STRIDE);
    if (names == 0)
        return 0;
    count = ez2_vfs_subdirs(g_root, names, STRIDE, MAX_PKG);
    for (k = 0; k < count; k++) {
        const char *folder = names + (size_t)k * STRIDE;
        char dir[2048];
        SongIni si;
        ez2_song_entry *e;
        int i, any = 0;

        if (!ez2_vfs_child(g_root, folder, dir, sizeof dir))
            continue;
        if (!read_song_ini(dir, &si))
            continue;
        for (i = 0; i < si.nchart; i++)
            if (ez2_ci_equal(si.charts[i].mode, mode_name))
                any = 1;
        if (!any)
            continue;
        if (ez2_songdb_find(db, si.key) != 0)
            continue;                        /* shipped or merged already */
        e = (ez2_song_entry *)realloc(db->entries,
                                      (size_t)(db->count + 1) * sizeof *e);
        if (e == 0)
            break;
        db->entries = e;
        e = &db->entries[db->count];
        memset(e, 0, sizeof *e);
        snprintf(e->key, sizeof e->key, "%s", si.key);
        snprintf(e->name, sizeof e->name, "%s", si.title);
        for (i = 0; i < si.nchart; i++)
            if (ez2_ci_equal(si.charts[i].mode, mode_name) &&
                si.charts[i].tier >= 0 && si.charts[i].tier < EZ2_SONGDB_STEPS)
                e->steps[si.charts[i].tier].level = si.charts[i].level;
        db->count++;
        add_to_group(db, si.category - 1, si.key);
        added++;
    }
    free(names);
    return added;
}

int ez2_usersongs_asset(const char *key, const char *kind, char *out, size_t n)
{
    char dir[2048];
    SongIni si;
    int a;

    if (!ez2_usersongs_dir(key, dir, sizeof dir) || kind == 0 || out == 0)
        return 0;
    if (!read_song_ini(dir, &si))
        return 0;
    for (a = 0; a < 4; a++)
        if (ez2_ci_equal(kind, kAssetKeys[a]) && si.asset[a][0])
            return ez2_vfs_child(dir, si.asset[a], out, n);
    return 0;
}

int ez2_usersongs_bga(const char *key, char *out, size_t n, int *start_ms)
{
    char dir[2048];
    SongIni si;

    if (!ez2_usersongs_dir(key, dir, sizeof dir) || out == 0)
        return 0;
    if (!read_song_ini(dir, &si) || si.bga[0] == 0)
        return 0;
    if (start_ms)
        *start_ms = si.bga_start_ms;
    return ez2_vfs_child(dir, si.bga, out, n);
}
