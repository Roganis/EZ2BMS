/* Case-insensitive path resolution. See vfs.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "vfs.h"
#include "util.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include <dirent.h>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>            /* _mkdir, which takes no mode */
#define EZ2_MKDIR(p) _mkdir(p)
#else
#define EZ2_MKDIR(p) mkdir(p, 0777)
#endif

static int ci_ends_with(const char *name, const char *ext)
{
    size_t n = strlen(name), e = strlen(ext);
    return n > e && ez2_ci_equal(name + n - e, ext);
}

static int join(char *out, size_t n, const char *dir, const char *leaf)
{
    int k = snprintf(out, n, "%s/%s", dir, leaf);
    return k > 0 && (size_t)k < n;
}

int ez2_vfs_child(const char *dir, const char *name, char *out, size_t n)
{
    DIR *d;
    struct dirent *e;
    struct stat st;
    int found = 0;

    if (dir == 0 || name == 0 || out == 0)
        return 0;

    /* An exact hit is authoritative and costs one stat, so try it before
     * reading the whole directory. */
    if (join(out, n, dir, name) && stat(out, &st) == 0)
        return 1;

    d = opendir(dir);
    if (d == 0)
        return 0;
    while ((e = readdir(d)) != 0) {
        if (e->d_name[0] == '.')
            continue;
        if (ez2_ci_equal(e->d_name, name)) {
            found = join(out, n, dir, e->d_name);
            break;
        }
    }
    closedir(d);
    if (!found)
        out[0] = 0;
    return found;
}

int ez2_vfs_child_ext(const char *dir, const char *ext, char *out, size_t n)
{
    DIR *d;
    struct dirent *e;
    int found = 0;

    if (dir == 0 || ext == 0 || out == 0)
        return 0;

    d = opendir(dir);
    if (d == 0)
        return 0;
    while ((e = readdir(d)) != 0) {
        if (e->d_name[0] == '.')
            continue;
        if (ci_ends_with(e->d_name, ext)) {
            found = join(out, n, dir, e->d_name);
            break;
        }
    }
    closedir(d);
    if (!found)
        out[0] = 0;
    return found;
}

int ez2_vfs_children_ext(const char *dir, const char *ext,
                         char *out, size_t stride, int max)
{
    DIR *d;
    struct dirent *e;
    int n = 0;

    if (dir == 0 || ext == 0 || out == 0 || stride == 0 || max <= 0)
        return 0;

    d = opendir(dir);
    if (d == 0)
        return 0;
    while ((e = readdir(d)) != 0 && n < max) {
        if (e->d_name[0] == '.')
            continue;
        if (ci_ends_with(e->d_name, ext) &&
            join(out + (size_t)n * stride, stride, dir, e->d_name))
            n++;
    }
    closedir(d);
    return n;
}

int ez2_vfs_path(char *out, size_t n, const char *dir, ...)
{
    char cur[2048];
    va_list ap;
    const char *comp;
    int ok = 1;

    if (out == 0 || dir == 0)
        return 0;
    if ((size_t)snprintf(cur, sizeof cur, "%s", dir) >= sizeof cur)
        return 0;

    va_start(ap, dir);
    while ((comp = va_arg(ap, const char *)) != 0) {
        char next[2048];
        if (!ez2_vfs_child(cur, comp, next, sizeof next)) { ok = 0; break; }
        memcpy(cur, next, sizeof cur);
    }
    va_end(ap);

    if (!ok)
        return 0;
    return (size_t)snprintf(out, n, "%s", cur) < n;
}

int ez2_vfs_resolve(const char *dir, const char *ref, char *out, size_t n)
{
    char cur[2048];
    const char *p = ref;

    if (dir == 0 || ref == 0 || out == 0)
        return 0;
    if ((size_t)snprintf(cur, sizeof cur, "%s", dir) >= sizeof cur)
        return 0;

    while (*p) {
        char comp[256], next[2048];
        size_t k = 0;

        while (*p == '/' || *p == '\\')
            p++;
        while (*p && *p != '/' && *p != '\\' && k + 1 < sizeof comp)
            comp[k++] = *p++;
        comp[k] = 0;
        if (k == 0)
            break;

        if (strcmp(comp, ".") == 0)
            continue;
        if (strcmp(comp, "..") == 0) {
            char *slash = strrchr(cur, '/');
            if (slash)
                *slash = 0;
            continue;
        }
        if (!ez2_vfs_child(cur, comp, next, sizeof next)) {
            /* Not there under any spelling. Hand back the literal so the
             * caller can report the name it actually wanted. */
            return (size_t)snprintf(out, n, "%s/%s", cur, comp) < n ? 0 : 0;
        }
        memcpy(cur, next, sizeof cur);
    }
    return (size_t)snprintf(out, n, "%s", cur) < n;
}

int ez2_vfs_sibling(const char *path, const char *ext, char *out, size_t n)
{
    char dir[2048], name[1024];
    const char *slash, *base, *dot;
    size_t dlen, stem, elen;

    if (!path || !ext || !out || n == 0)
        return 0;

    slash = strrchr(path, '/');
#ifdef _WIN32
    {
        const char *bs = strrchr(path, '\\');
        if (bs && (!slash || bs > slash))
            slash = bs;
    }
#endif
    base = slash ? slash + 1 : path;
    dlen = slash ? (size_t)(slash - path) : 1;
    if (dlen + 1 > sizeof dir)
        return 0;
    if (slash)
        memcpy(dir, path, dlen);
    else
        dir[0] = '.';
    dir[slash ? dlen : 1] = 0;

    dot  = strrchr(base, '.');
    stem = dot ? (size_t)(dot - base) : strlen(base);
    elen = strlen(ext);
    if (stem + 1 + elen + 1 > sizeof name)
        return 0;
    memcpy(name, base, stem);
    name[stem] = '.';
    memcpy(name + stem + 1, ext, elen + 1);

    return ez2_vfs_child(dir, name, out, n);
}

int ez2_vfs_makedirs(const char *file)
{
    char dir[1024];
    struct stat st;
    char *p;
    const char *slash;

    if (file == 0)
        return 0;

    /* The last separator either way: a Windows caller may hand over a path
     * that mixes them, and `..\other\foo` is a shape the .ezi already uses. */
    slash = strrchr(file, '/');
#ifdef _WIN32
    {
        const char *bs = strrchr(file, '\\');
        if (bs && (!slash || bs > slash))
            slash = bs;
    }
#endif
    if (slash == 0)
        return 1;                       /* a bare name: the cwd is the dir */
    if ((size_t)(slash - file) + 1 > sizeof dir)
        return 0;
    memcpy(dir, file, (size_t)(slash - file));
    dir[slash - file] = 0;

    /* Each parent in turn, then the whole thing. Starting at dir + 1 leaves a
     * leading '/' - and on Windows a leading drive letter - alone. */
    for (p = dir + 1; *p; p++) {
        if (*p == '/' || *p == '\\') {
            char sep = *p;
            *p = 0;
            EZ2_MKDIR(dir);
            *p = sep;
        }
    }
    EZ2_MKDIR(dir);

    return stat(dir, &st) == 0 && (st.st_mode & S_IFDIR) != 0;
}

#include <sys/stat.h>

int ez2_vfs_subdirs(const char *dir, char *out, size_t stride, int max)
{
    DIR *d;
    struct dirent *e;
    int n = 0;

    if (dir == 0 || out == 0 || stride == 0 || max <= 0)
        return 0;
    d = opendir(dir);
    if (d == 0)
        return 0;
    while ((e = readdir(d)) != 0 && n < max) {
        char full[2048];
        struct stat st;

        if (e->d_name[0] == '.')
            continue;
        snprintf(full, sizeof full, "%s/%s", dir, e->d_name);
        if (stat(full, &st) != 0 || !S_ISDIR(st.st_mode))
            continue;
        snprintf(out + (size_t)n * stride, stride, "%s", e->d_name);
        n++;
    }
    closedir(d);
    return n;
}
