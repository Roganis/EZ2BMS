/* `stage.ini` - the Radio modes' course lists. See stageini.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "stageini.h"
#include "util.h"
#include "usersongs.h"

#include "crypt.h"
#include "keytable.h"
#include "mode.h"
#include "vfs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const char *ez2_stageini_strerror(int err)
{
    switch (err) {
    case EZ2_STAGEINI_OK:       return "ok";
    case EZ2_STAGEINI_ABSENT:   return "this mode has no course list";
    case EZ2_STAGEINI_ERR_ARG:  return "bad argument";
    case EZ2_STAGEINI_ERR_READ: return "could not read or decrypt it";
    case EZ2_STAGEINI_ERR_MEM:  return "out of memory";
    case EZ2_STAGEINI_ERR_EMPTY: return "no channel list in it";
    default:                    return "unknown error";
    }
}

/* Does `name` end with `suffix`, ignoring case? Returns the length before it. */
static int ends_with_ci(const char *name, const char *suffix, size_t *stem)
{
    size_t n = strlen(name), sfx = strlen(suffix);

    if (n <= sfx)
        return 0;
    if (!ez2_ci_equal(name + n - sfx, suffix))
        return 0;
    *stem = n - sfx;
    return 1;
}

/* One `"key"="value"` line. Returns 1 and fills both, or 0. */
static int split_line(const char *line, char *key, size_t keyn,
                      char *val, size_t valn)
{
    const char *k0, *k1, *v0, *v1;

    k0 = strchr(line, '"');
    if (k0 == 0)
        return 0;
    k1 = strchr(k0 + 1, '"');
    if (k1 == 0)
        return 0;
    v0 = strchr(k1 + 1, '"');
    if (v0 == 0)
        return 0;
    v1 = strchr(v0 + 1, '"');
    if (v1 == 0)
        return 0;

    if ((size_t)(k1 - k0) >= keyn || (size_t)(v1 - v0) >= valn)
        return 0;
    memcpy(key, k0 + 1, (size_t)(k1 - k0 - 1));
    key[k1 - k0 - 1] = 0;
    memcpy(val, v0 + 1, (size_t)(v1 - v0 - 1));
    val[v1 - v0 - 1] = 0;
    return 1;
}

static ez2_course *find_mut(ez2_stageini *s, const char *key)
{
    int i;

    for (i = 0; i < s->count; i++)
        if (ez2_ci_equal(s->courses[i].key, key))
            return &s->courses[i];
    return 0;
}

const ez2_course *ez2_stageini_find(const ez2_stageini *s, const char *key)
{
    int i;

    if (s == 0 || key == 0)
        return 0;
    for (i = 0; i < s->count; i++)
        if (ez2_ci_equal(s->courses[i].key, key))
            return &s->courses[i];
    return 0;
}

/* Count the `;`-separated fields in a value. */
static int count_semi(const char *v)
{
    int n = 0;

    while (*v) {
        size_t len = 0;

        while (*v == ' ' || *v == '\t')
            v++;
        while (v[len] && v[len] != ';')
            len++;
        {
            size_t t = len;
            while (t && (v[t-1]==' '||v[t-1]=='\t'||v[t-1]=='\r')) t--;
            if (t) n++;
        }
        v += len;
        if (*v == ';')
            v++;
    }
    return n;
}

/* `a;b;c` into `out`, up to `max`. Returns how many. */
static int split_semi(const char *v, char out[][EZ2_STAGE_NAME], int max)
{
    int n = 0;

    while (*v && n < max) {
        size_t len = 0;

        while (*v == ' ' || *v == '\t')
            v++;
        while (v[len] && v[len] != ';')
            len++;
        {   /* trailing whitespace and the CR of a DOS line are not part of it */
            size_t t = len;
            while (t && (v[t - 1] == ' ' || v[t - 1] == '\t' ||
                         v[t - 1] == '\r'))
                t--;
            if (t) {
                if (t >= EZ2_STAGE_NAME)
                    t = EZ2_STAGE_NAME - 1;
                memcpy(out[n], v, t);
                out[n][t] = 0;
                n++;
            }
        }
        v += len;
        if (*v == ';')
            v++;
    }
    return n;
}

int ez2_stageini_parse(const char *text, size_t n, ez2_stageini *out)
{
    char courses[512][EZ2_STAGE_NAME];
    char line[4096], key[EZ2_STAGE_NAME], val[4096];
    size_t i = 0;
    int ncourse = 0, c;

    if (text == 0 || out == 0)
        return EZ2_STAGEINI_ERR_ARG;
    memset(out, 0, sizeof *out);

    /* PASS ONE: the channel list, which is the menu order and the only thing
     * that says which keys are courses rather than metadata. */
    while (i < n) {
        size_t len = 0;

        while (i < n && text[i] != '\n' && len + 1 < sizeof line)
            line[len++] = text[i++];
        while (i < n && text[i] != '\n')
            i++;
        if (i < n)
            i++;
        line[len] = 0;

        if (!split_line(line, key, sizeof key, val, sizeof val))
            continue;
        if (ez2_ci_equal(key, "channel_normal")) {
            ncourse = split_semi(val, courses, 512);
            break;
        }
    }
    if (ncourse == 0)
        return EZ2_STAGEINI_ERR_EMPTY;

    out->courses = (ez2_course *)calloc((size_t)ncourse, sizeof *out->courses);
    if (out->courses == 0)
        return EZ2_STAGEINI_ERR_MEM;
    out->count = ncourse;
    for (c = 0; c < ncourse; c++) {
        /* memcpy rather than snprintf: split_semi already bounded these to
         * EZ2_STAGE_NAME, and the compiler cannot see that. */
        size_t kl = strlen(courses[c]);
        if (kl >= EZ2_STAGE_NAME)
            kl = EZ2_STAGE_NAME - 1;
        memcpy(out->courses[c].key, courses[c], kl);
        out->courses[c].key[kl] = 0;
    }

    /* PASS TWO: each course's stages and level. A key that is not a listed
     * course is ignored rather than guessed at - the file carries other
     * channels - `channel_secret1..3` (songselectctor.cpp:606-643), not
     * `channel_hard` - that nothing here reads yet. */
    i = 0;
    while (i < n) {
        size_t len = 0, stem;

        while (i < n && text[i] != '\n' && len + 1 < sizeof line)
            line[len++] = text[i++];
        while (i < n && text[i] != '\n')
            i++;
        if (i < n)
            i++;
        line[len] = 0;

        if (!split_line(line, key, sizeof key, val, sizeof val))
            continue;

        if (ends_with_ci(key, "_Level", &stem)) {
            char base[EZ2_STAGE_NAME];
            ez2_course *co;

            if (stem >= sizeof base)
                continue;
            memcpy(base, key, stem);
            base[stem] = 0;
            co = find_mut(out, base);
            if (co)
                co->level = atoi(val);
            continue;
        }

        {
            ez2_course *co = find_mut(out, key);

            if (co && co->stage_count == 0 && co->stage == 0) {
                /* Sized from the value, so a 90-entry pool arrives whole. */
                int want = count_semi(val);

                if (want > 0) {
                    co->stage = (char (*)[EZ2_STAGE_NAME])
                                malloc((size_t)want * EZ2_STAGE_NAME);
                    if (co->stage == 0) {
                        ez2_stageini_free(out);
                        return EZ2_STAGEINI_ERR_MEM;
                    }
                    co->stage_count = split_semi(val, co->stage, want);
                }
            }
        }
    }
    return EZ2_STAGEINI_OK;
}

void ez2_stageini_free(ez2_stageini *s)
{
    int i;

    if (s == 0)
        return;
    for (i = 0; s->courses && i < s->count; i++)
        free(s->courses[i].stage);
    free(s->courses);
    s->courses = 0;
    s->count = 0;
}

int ez2_stageini_load(const char *root, const char *mode_name,
                      const char *exe_path, ez2_stageini *out)
{
    char sys[2048], dir[2048], path[2048];
    ez2_keytable key;
    unsigned char *raw, *plain;
    FILE *f;
    long sz;
    int rc;

    if (root == 0 || mode_name == 0 || exe_path == 0 || out == 0)
        return EZ2_STAGEINI_ERR_ARG;
    memset(out, 0, sizeof *out);

    if (!ez2_vfs_child(root, "system", sys, sizeof sys))
        return EZ2_STAGEINI_ABSENT;
    if (!ez2_vfs_child(sys, mode_name, dir, sizeof dir)) {
        /* the same two-names problem the .gds lookup has */
        const char *canon = ez2_mode_name(ez2_mode_from_name(mode_name));
        if (canon == 0 || !ez2_vfs_child(sys, canon, dir, sizeof dir))
            return EZ2_STAGEINI_ABSENT;
    }
    /* `Stage.ini` under 14radiomix, `stage.ini` under the other three. */
    if (!ez2_vfs_child(dir, "stage.ini", path, sizeof path))
        return EZ2_STAGEINI_ABSENT;

    f = fopen(path, "rb");
    if (f == 0)
        return EZ2_STAGEINI_ABSENT;
    if (fseek(f, 0, SEEK_END) != 0 || (sz = ftell(f)) <= 0 ||
        fseek(f, 0, SEEK_SET) != 0) { fclose(f); return EZ2_STAGEINI_ERR_READ; }
    raw = (unsigned char *)malloc((size_t)sz);
    plain = (unsigned char *)malloc((size_t)sz + 1);
    if (raw == 0 || plain == 0) {
        free(raw); free(plain); fclose(f);
        return EZ2_STAGEINI_ERR_MEM;
    }
    if (fread(raw, 1, (size_t)sz, f) != (size_t)sz) {
        free(raw); free(plain); fclose(f);
        return EZ2_STAGEINI_ERR_READ;
    }
    fclose(f);

    if (ez2_keytable_from_exe(exe_path, EZ2_KEY_INI, &key) != EZ2_KT_OK) {
        free(raw); free(plain);
        return EZ2_STAGEINI_ERR_READ;
    }
    ez2_decrypt(raw, (size_t)sz, plain, &key);
    plain[sz] = 0;
    free(raw);

    rc = ez2_stageini_parse((const char *)plain, (size_t)sz, out);
    free(plain);
    return rc;
}

/* THE WHEEL'S ORDER. See the header. Splits `ALLSONG`'s ';' list, in file
 * order, into `out`. Returns how many were written, or a negative
 * ez2_stageini_err. Shares the loader's decrypt, so it takes the same
 * arguments. */
int ez2_stageini_allsong(const char *root, const char *mode_name,
                         const char *exe_path,
                         char (*out)[EZ2_STAGEINI_KEY], int max)
{
    char sys[2048], dir[2048], path[2048];
    ez2_keytable key;
    unsigned char *raw, *plain;
    FILE *f;
    long sz;
    int n = 0;
    const char *p, *eq, *eol;

    if (root == 0 || mode_name == 0 || exe_path == 0 || out == 0 || max <= 0)
        return EZ2_STAGEINI_ERR_ARG;

    if (!ez2_vfs_child(root, "system", sys, sizeof sys))
        return EZ2_STAGEINI_ABSENT;
    if (!ez2_vfs_child(sys, mode_name, dir, sizeof dir)) {
        const char *canon = ez2_mode_name(ez2_mode_from_name(mode_name));
        if (canon == 0 || !ez2_vfs_child(sys, canon, dir, sizeof dir))
            return EZ2_STAGEINI_ABSENT;
    }
    if (!ez2_vfs_child(dir, "stage.ini", path, sizeof path))
        return EZ2_STAGEINI_ABSENT;

    f = fopen(path, "rb");
    if (f == 0)
        return EZ2_STAGEINI_ABSENT;
    if (fseek(f, 0, SEEK_END) != 0 || (sz = ftell(f)) <= 0 ||
        fseek(f, 0, SEEK_SET) != 0) { fclose(f); return EZ2_STAGEINI_ERR_READ; }
    raw = (unsigned char *)malloc((size_t)sz);
    plain = (unsigned char *)malloc((size_t)sz + 1);
    if (raw == 0 || plain == 0) {
        free(raw); free(plain); fclose(f);
        return EZ2_STAGEINI_ERR_MEM;
    }
    if (fread(raw, 1, (size_t)sz, f) != (size_t)sz) {
        free(raw); free(plain); fclose(f);
        return EZ2_STAGEINI_ERR_READ;
    }
    fclose(f);
    if (ez2_keytable_from_exe(exe_path, EZ2_KEY_INI, &key) != EZ2_KT_OK) {
        free(raw); free(plain);
        return EZ2_STAGEINI_ERR_READ;
    }
    ez2_decrypt(raw, (size_t)sz, plain, &key);
    plain[sz] = 0;
    free(raw);

    p = strstr((const char *)plain, "ALLSONG");
    if (p == 0) { free(plain); return 0; }
    eq = strchr(p, '=');
    if (eq == 0) { free(plain); return 0; }
    eol = strchr(eq, '\n');

    /* `"ALLSONG" = "a;b;c"` - split on ';' and strip the quotes and spaces
     * the file puts around the value, the same way the operator ini reader
     * does for its own keys. */
    {
        const char *q = eq + 1;
        const char *end = eol ? eol : q + strlen(q);

        while (q < end && n < max) {
            const char *t;
            size_t len;

            while (q < end && (*q == ' ' || *q == '"' || *q == ';' ||
                               *q == '\t' || *q == '\r'))
                q++;
            t = q;
            while (q < end && *q != ';' && *q != '"' && *q != '\r')
                q++;
            len = (size_t)(q - t);
            while (len > 0 && (t[len - 1] == ' ' || t[len - 1] == '\t'))
                len--;
            if (len > 0 && len < EZ2_STAGEINI_KEY) {
                memcpy(out[n], t, len);
                out[n][len] = 0;
                n++;
            }
        }
    }
    free(plain);
    return n;
}

int ez2_stage_chart(const char *root, const char *mode_name,
                    const char *stage, int players, char *out, size_t n)
{
    char sound[2048], dir[2048], name[256], folder[EZ2_STAGE_NAME];
    const char *dash;
    ez2_mode m;

    if (root == 0 || mode_name == 0 || stage == 0 || out == 0)
        return 0;
    if (players <= 0)
        players = 1;

    /* THE SONG FOLDER IS THE STAGE NAME MINUS ITS COURSE TAG: `5lom-dd` is the
     * song `5lom` played in course `dd`. The chart inside keeps the whole
     * name, tag included. */
    snprintf(folder, sizeof folder, "%s", stage);
    dash = strrchr(folder, '-');
    if (dash)
        folder[dash - folder] = 0;

    /* A user-song package holds its charts in its own folder (usersongs.h). */
    if (!ez2_usersongs_dir(folder, dir, sizeof dir)) {
        if (!ez2_vfs_child(root, "sound", sound, sizeof sound))
            return 0;
        if (!ez2_vfs_child(sound, folder, dir, sizeof dir))
            return 0;
    }

    m = ez2_mode_from_name(mode_name);
    if (m != EZ2_MODE_UNKNOWN)
        mode_name = ez2_mode_file_name(m);

    snprintf(name, sizeof name, "%s%dp-%s.ez", mode_name, players, stage);
    return ez2_vfs_child(dir, name, out, n);
}
