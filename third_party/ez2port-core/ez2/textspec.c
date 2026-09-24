/* Native text for the game's plain-text bitmaps - see textspec.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "textspec.h"
#include "util.h"
#include "ttf.h"
#include "file.h"
#include "vfs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <ctype.h>

#define MAX_RUNS  16
#define MAX_CLEAN 16
#define KEY_N     64
#define PATH_N    256

enum { FACE_BOLD, FACE_LIGHT, FACE_CJK, FACE_CJKBOLD, FACE_N };

typedef struct {
    char     key[KEY_N];
    char    *lit;                       /* a quoted literal instead of a key; malloc'd */
    int      x, baseline;
    float    cap;
    int      face;
    unsigned rgb;
    int      align;                     /* ttf.h: 0 right, 1 centre, 2 left */
    int      max_width;
    int      oblique;                   /* face+oblique: sheared 12 degrees about the baseline */
    int      has_glow;                  /* rrggbb/gggggg: a halo of the second colour round the ink */
    unsigned glow;
} Run;

typedef struct {
    char path[PATH_N];                  /* normalised: slashes, lowercase, .abm */
    int  w, h;
    int  nrun;
    Run  run[MAX_RUNS];
    int  mask_of;                       /* a mask twin: the plate's index; else -1 */
    int  over_base;                     /* `base = pack`: the lines go OVER the art */
    int  clean_pack;                    /* `base = pack+clean`: the pack's copy still holds the words - clean it too */
    int  nclean;                        /* `clean = x0,y0,x1,y1`: the words' boxes in the source */
    int  clean[MAX_CLEAN][4];
} Entry;

typedef struct {
    char  key[KEY_N];
    char *text;
} Str;

static Entry *g_entries;
static int    g_n, g_cap;
static Str   *g_strings;
static int    g_ns, g_scap;
static char   g_face[FACE_N][1024];
static int    g_face_state[FACE_N];    /* 0 untried, 1 found, -1 none */
static char   g_dir[1024];
/* `@cjk = jp|kr|sc|tc|hk` in a strings file: which forms of the shared
 * ideographs a language wants. Noto Sans CJK keeps them as faces 0..4 of
 * one collection; other CJK fonts have one set and ignore this. */
static int    g_cjk_face = -1;

/* ---- small helpers -------------------------------------------------------- */

static void normalise(const char *in, char *out, size_t n)
{
    size_t i = 0, len;

    if (in[0] == '.' && (in[1] == '/' || in[1] == '\\'))
        in += 2;
    while (*in && i + 1 < n) {
        char c = *in++;
        if (c == '\\') c = '/';
        out[i++] = (char)tolower((unsigned char)c);
    }
    out[i] = 0;
    len = strlen(out);
    if (len > 4 && strcmp(out + len - 4, ".bmp") == 0)
        memcpy(out + len - 4, ".abm", 4);
}

/* A `;` starts a comment unless it is inside double quotes - a literal
 * that IS the semicolon, the name entry's 45th glyph - or inside the value
 * of a strings line, where a translator may want one. */
static void strip_comment(char *s)
{
    int quoted = 0;
    for (; *s; s++) {
        if (*s == '"') quoted = !quoted;
        else if (*s == ';' && !quoted) { *s = 0; return; }
    }
}

static Entry *find_entry(const char *rel)
{
    char key[PATH_N];
    int i;

    normalise(rel, key, sizeof key);
    for (i = 0; i < g_n; i++)
        if (strcmp(g_entries[i].path, key) == 0)
            return &g_entries[i];
    return 0;
}

static Entry *add_entry(const char *path)
{
    Entry *e;

    if (g_n == g_cap) {
        int nc = g_cap ? g_cap * 2 : 64;
        Entry *ne = (Entry *)realloc(g_entries, (size_t)nc * sizeof *ne);
        if (!ne) return 0;
        g_entries = ne; g_cap = nc;
    }
    e = &g_entries[g_n++];
    memset(e, 0, sizeof *e);
    normalise(path, e->path, sizeof e->path);
    e->mask_of = -1;
    return e;
}

static void set_string(const char *key, const char *text)
{
    int i;
    char *copy = (char *)malloc(strlen(text) + 1);

    if (!copy) return;
    strcpy(copy, text);
    for (i = 0; i < g_ns; i++)
        if (strcmp(g_strings[i].key, key) == 0) {
            free(g_strings[i].text);
            g_strings[i].text = copy;
            return;
        }
    if (g_ns == g_scap) {
        int nc = g_scap ? g_scap * 2 : 128;
        Str *ns = (Str *)realloc(g_strings, (size_t)nc * sizeof *ns);
        if (!ns) { free(copy); return; }
        g_strings = ns; g_scap = nc;
    }
    snprintf(g_strings[g_ns].key, KEY_N, "%s", key);
    g_strings[g_ns].text = copy;
    g_ns++;
}

const char *ez2_textspec_string(const char *key)
{
    int i;
    if (!key) return 0;
    for (i = 0; i < g_ns; i++)
        if (strcmp(g_strings[i].key, key) == 0)
            return g_strings[i].text;
    return 0;
}

/* ---- parsing -------------------------------------------------------------- */

static int face_by_name(const char *s)
{
    if (strcmp(s, "bold") == 0)    return FACE_BOLD;
    if (strcmp(s, "light") == 0)   return FACE_LIGHT;
    if (strcmp(s, "cjk") == 0)     return FACE_CJK;
    if (strcmp(s, "cjkbold") == 0) return FACE_CJKBOLD;
    return -1;
}

/* `key | x,baseline,cap | face | rrggbb | align | max width` */
static int parse_line(Entry *e, char *val)
{
    char *part[6];
    int np = 0, face;
    Run *r;
    char *p = val;

    while (np < 6 && p) {
        char *bar = strchr(p, '|');
        if (bar) *bar++ = 0;
        part[np++] = ez2_trim(p);
        p = bar;
    }
    if (np < 5 || e->nrun == MAX_RUNS)
        return 0;
    r = &e->run[e->nrun];
    memset(r, 0, sizeof *r);
    /* A LITERAL, "in quotes", carries its own words and needs no strings
     * entry: the song title plates are 493 names that no translation
     * touches (text/manifest.songs.ini, TEXT.md section 7). The quotes are
     * the outermost pair, so a title may hold quotes of its own. */
    if (part[0][0] == '"') {
        char *end = strrchr(part[0] + 1, '"');
        size_t len = end ? (size_t)(end - (part[0] + 1)) : strlen(part[0] + 1);

        r->lit = (char *)malloc(len + 1);
        if (!r->lit)
            return 0;
        memcpy(r->lit, part[0] + 1, len);
        r->lit[len] = 0;
    } else {
        snprintf(r->key, KEY_N, "%s", part[0]);
    }
    if (sscanf(part[1], "%d,%d,%f", &r->x, &r->baseline, &r->cap) != 3)
        return 0;
    /* `bold+oblique`: the face sheared about its baseline, for the display
     * type the game set in an italic the machine has no font for (the mode
     * select's SELECT A MODE). */
    {
        char *plus = strchr(part[2], '+');
        if (plus) {
            *plus++ = 0;
            if (strcmp(ez2_trim(plus), "oblique") != 0)
                return 0;
            r->oblique = 1;
        }
    }
    face = face_by_name(ez2_trim(part[2]));
    if (face < 0)
        return 0;
    r->face = face;
    /* `rrggbb`, or `rrggbb/gggggg`: the ink and a halo round it in the
     * second colour, two pixels wide at the tile's scale - the song title
     * plates' version tint (white letters in an orange or cyan glow;
     * TEXT.md section 7). A mask twin ignores the halo. */
    r->rgb = (unsigned)strtoul(part[3], 0, 16);
    {
        const char *slash = strchr(part[3], '/');
        if (slash && slash[1]) {
            r->has_glow = 1;
            r->glow = (unsigned)strtoul(slash + 1, 0, 16);
        }
    }
    if (strcmp(part[4], "right") == 0)       r->align = 0;
    else if (strcmp(part[4], "center") == 0 ||
             strcmp(part[4], "centre") == 0) r->align = 1;
    else if (strcmp(part[4], "left") == 0)   r->align = 2;
    else return 0;
    r->max_width = np > 5 ? atoi(part[5]) : 0;
    e->nrun++;
    return 1;
}

static void resolve_font_path(const char *val, char *out, size_t n)
{
    if (val[0] == '/' || (isalpha((unsigned char)val[0]) && val[1] == ':'))
        snprintf(out, n, "%s", val);
    else
        snprintf(out, n, "%s/%s", g_dir, val);
}

static int read_manifest(const char *path)
{
    size_t n;
    unsigned char *bytes = ez2_file_read(path, &n);
    char *text, *line, *next;
    Entry *cur = 0;
    int in_fonts = 0, i;
    /* mask twins are named by their plate; bound them after the walk */
    struct { char plate[PATH_N]; char mask[PATH_N]; } *masks = 0;
    int nm = 0, mcap = 0;

    if (!bytes)
        return 0;
    text = (char *)malloc(n + 1);
    if (!text) { free(bytes); return 0; }
    memcpy(text, bytes, n);
    text[n] = 0;
    free(bytes);
    if (n >= 3 && (unsigned char)text[0] == 0xef)
        memmove(text, text + 3, n - 2);                 /* a UTF-8 BOM */

    for (line = text; line; line = next) {
        char *s, *eq;
        next = strchr(line, '\n');
        if (next) *next++ = 0;
        strip_comment(line);
        s = ez2_trim(line);
        if (!*s)
            continue;
        if (*s == '[') {
            char *close = strchr(s, ']');
            if (!close) continue;
            *close = 0;
            s = ez2_trim(s + 1);
            if (strcmp(s, "fonts") == 0) { in_fonts = 1; cur = 0; continue; }
            in_fonts = 0;
            cur = add_entry(s);
            continue;
        }
        eq = strchr(s, '=');
        if (!eq) continue;
        *eq = 0;
        {
            char *key = ez2_trim(s), *val = ez2_trim(eq + 1);
            if (in_fonts) {
                int f = face_by_name(key);
                if (f >= 0) {
                    resolve_font_path(val, g_face[f], sizeof g_face[f]);
                    g_face_state[f] = 1;
                }
                continue;
            }
            if (!cur) continue;
            if (strcmp(key, "size") == 0) {
                sscanf(val, "%d,%d", &cur->w, &cur->h);
            } else if (strcmp(key, "line") == 0) {
                parse_line(cur, val);
            } else if (strcmp(key, "base") == 0) {
                /* `base = pack`: the plate is ART WITH WORDS ON IT. The art
                 * comes from the HD pack (tools/textlift.py cleaned the
                 * words out of the source before the upscale) and the lines
                 * render over it at the pack's own scale; the loader asks
                 * ez2_textspec_over_base and composites. Without a pack
                 * copy the game's file is the base.
                 * `base = pack+clean`: the pack's copy was upscaled from the
                 * game's file WITH its words (the whole tree, not a lifted
                 * source), so the loader fills the `clean` boxes in that
                 * copy too, at its scale. For a plate measured by hand,
                 * without the lift tools' cleaned source. */
                cur->over_base = 1;
                cur->clean_pack = strstr(val, "clean") != 0;
            } else if (strcmp(key, "clean") == 0) {
                /* `clean = x0,y0,x1,y1`: a box the game's words sit in,
                 * in the tile's pixels, inclusive. Without a pack copy the
                 * loader takes the game's own file as the base and fills
                 * these boxes across from their edges first (a lerp per
                 * row), so the words are not drawn twice. The pack route
                 * had the same boxes cleaned by tools before the upscale. */
                int *c = cur->clean[cur->nclean];
                if (cur->nclean < MAX_CLEAN &&
                    sscanf(val, "%d,%d,%d,%d", &c[0], &c[1], &c[2], &c[3]) == 4)
                    cur->nclean++;
            } else if (strcmp(key, "mask") == 0) {
                if (nm == mcap) {
                    int nc = mcap ? mcap * 2 : 16;
                    void *p = realloc(masks, (size_t)nc * sizeof *masks);
                    if (!p) continue;
                    masks = p; mcap = nc;
                }
                snprintf(masks[nm].plate, PATH_N, "%s", cur->path);
                normalise(val, masks[nm].mask, PATH_N);
                nm++;
            }
        }
    }
    free(text);

    for (i = 0; i < nm; i++) {
        Entry *plate = find_entry(masks[i].plate), *m;
        int pi;
        if (!plate) continue;
        pi = (int)(plate - g_entries);
        m = find_entry(masks[i].mask);
        if (!m) {
            m = add_entry(masks[i].mask);
            if (!m) continue;
            plate = &g_entries[pi];                     /* realloc may have moved it */
        }
        m->w = plate->w; m->h = plate->h;
        m->mask_of = pi;
    }
    free(masks);

    /* an entry without size or lines cannot render; drop it quietly */
    for (i = 0; i < g_n; ) {
        Entry *e = &g_entries[i];
        int usable = e->w > 0 && e->h > 0 && (e->nrun > 0 || e->mask_of >= 0);
        if (usable) { i++; continue; }
        {
            int r;
            for (r = 0; r < e->nrun; r++)
                free(e->run[r].lit);
        }
        memmove(e, e + 1, (size_t)(g_n - i - 1) * sizeof *e);
        g_n--;
        /* mask indices above i shift down */
        {
            int k;
            for (k = 0; k < g_n; k++)
                if (g_entries[k].mask_of > i) g_entries[k].mask_of--;
                else if (g_entries[k].mask_of == i) g_entries[k].mask_of = -1;
        }
    }
    return g_n;
}

static int read_strings(const char *path)
{
    size_t n;
    unsigned char *bytes = ez2_file_read(path, &n);
    char *text, *line, *next;
    int count = 0;

    if (!bytes)
        return 0;
    text = (char *)malloc(n + 1);
    if (!text) { free(bytes); return 0; }
    memcpy(text, bytes, n);
    text[n] = 0;
    free(bytes);
    if (n >= 3 && (unsigned char)text[0] == 0xef)
        memmove(text, text + 3, n - 2);
    for (line = text; line; line = next) {
        char *s, *eq;
        next = strchr(line, '\n');
        if (next) *next++ = 0;
        s = ez2_trim(line);
        if (!*s || *s == ';' || *s == '#' || *s == '[')
            continue;
        eq = strchr(s, '=');
        if (!eq) continue;
        *eq = 0;
        if (*s == '@') {
            char *k = ez2_trim(s + 1), *v = ez2_trim(eq + 1);
            if (strcmp(k, "cjk") == 0) {
                static const char *const names[] = { "jp", "kr", "sc", "tc", "hk" };
                int q;
                for (q = 0; q < 5; q++)
                    if (strcmp(v, names[q]) == 0)
                        g_cjk_face = q;
            }
            continue;
        }
        set_string(ez2_trim(s), ez2_trim(eq + 1));
        count++;
    }
    free(text);
    return count;
}

static int cmp_str(const void *a, const void *b)
{
    return strcmp((const char *)a, (const char *)b);
}

int ez2_textspec_languages(const char *dir, char *out, size_t stride, int max)
{
    char *paths;
    int n, i, count = 0;

    if (!dir || !out || max <= 0 || stride < 2)
        return 0;
    paths = (char *)malloc((size_t)max * 4 * 1024);
    if (!paths)
        return 0;
    n = ez2_vfs_children_ext(dir, ".ini", paths, 1024, max * 4);
    for (i = 0; i < n && count < max; i++) {
        const char *name = strrchr(paths + (size_t)i * 1024, '/');
        const char *bs = strrchr(paths + (size_t)i * 1024, '\\');
        size_t len;
        char *code;

        if (bs && (!name || bs > name)) name = bs;
        name = name ? name + 1 : paths + (size_t)i * 1024;
        if (strncmp(name, "strings.", 8) != 0)
            continue;
        name += 8;
        len = strlen(name);
        if (len <= 4 || strcmp(name + len - 4, ".ini") != 0)
            continue;
        len -= 4;                                   /* "strings.ini" itself has none */
        if (len == 0 || len >= stride)
            continue;
        code = out + (size_t)count * stride;
        memcpy(code, name, len);
        code[len] = 0;
        count++;
    }
    free(paths);
    qsort(out, (size_t)count, stride, cmp_str);
    return count;
}

void ez2_textspec_unload(void)
{
    int i, r;
    for (i = 0; i < g_n; i++)
        for (r = 0; r < g_entries[i].nrun; r++)
            free(g_entries[i].run[r].lit);
    free(g_entries); g_entries = 0; g_n = g_cap = 0;
    for (i = 0; i < g_ns; i++) free(g_strings[i].text);
    free(g_strings); g_strings = 0; g_ns = g_scap = 0;
    memset(g_face_state, 0, sizeof g_face_state);
    g_dir[0] = 0;
    g_cjk_face = -1;
}

static const char *face_path(int face);

int ez2_textspec_load(const char *dir, const char *lang)
{
    char path[1400];

    ez2_textspec_unload();
    if (!dir || !dir[0])
        return 0;
    snprintf(g_dir, sizeof g_dir, "%s", dir);
    snprintf(path, sizeof path, "%s/manifest.ini", dir);
    if (!read_manifest(path))
        return 0;
    /* The song title plates, generated (tools/songtext.py) and kept apart
     * so the hand-written manifest stays readable. Optional. */
    snprintf(path, sizeof path, "%s/manifest.songs.ini", dir);
    read_manifest(path);
    /* And the lifted plates - art the words were taken out of, the words
     * rendered back over it (tools/textlift.py, TEXT.md section 9). */
    snprintf(path, sizeof path, "%s/manifest.lift.ini", dir);
    read_manifest(path);
    snprintf(path, sizeof path, "%s/strings.ini", dir);
    read_strings(path);
    if (lang && lang[0]) {
        snprintf(path, sizeof path, "%s/strings.%s.ini", dir, lang);
        read_strings(path);
    }
    /* Resolve - and so read - every face now, at load: the CJK collection
     * is 20 MB and its first read used to land on the first Korean title a
     * screen drew (ttf.h, ez2_ttf_warm). */
    {
        int f;

        for (f = 0; f < FACE_N; f++)
            (void)face_path(f);
    }
    return g_n;
}

int ez2_textspec_count(void)
{
    return g_n;
}

int ez2_textspec_has(const char *rel)
{
    return rel && g_n && find_entry(rel) != 0;
}

int ez2_textspec_clean_pack(const char *rel)
{
    Entry *e = rel && g_n ? find_entry(rel) : 0;

    if (!e)
        return 0;
    if (e->mask_of >= 0)
        return g_entries[e->mask_of].clean_pack;
    return e->clean_pack;
}

int ez2_textspec_over_base(const char *rel)
{
    Entry *e = rel && g_n ? find_entry(rel) : 0;

    if (!e)
        return 0;
    /* a mask twin of a lifted plate is lifted too: the words' silhouette
     * goes over the pack's copy of the mask, whose own words were cleaned
     * out with the plate's (the song select's category hint keeps its
     * button icons in both) */
    if (e->mask_of >= 0)
        return g_entries[e->mask_of].over_base;
    return e->over_base;
}

int ez2_textspec_clean(const char *rel, unsigned char *rgba, int w, int h, int lw, int lh)
{
    Entry *e = rel && g_n ? find_entry(rel) : 0;
    int i, y;

    if (!e || !rgba || w <= 0 || h <= 0 || lw <= 0 || lh <= 0)
        return 0;
    if (e->mask_of >= 0)
        e = &g_entries[e->mask_of];         /* a twin shares its plate's boxes */
    for (i = 0; i < e->nclean; i++) {
        int x0 = e->clean[i][0] * w / lw, y0 = e->clean[i][1] * h / lh;
        int x1 = (e->clean[i][2] + 1) * w / lw - 1, y1 = (e->clean[i][3] + 1) * h / lh - 1;
        if (x0 < 1) x0 = 1;
        if (y0 < 0) y0 = 0;
        if (x1 > w - 2) x1 = w - 2;
        if (y1 > h - 1) y1 = h - 1;
        if (x1 < x0 || y1 < y0)
            continue;
        for (y = y0; y <= y1; y++) {
            unsigned char *row = rgba + (size_t)y * (size_t)w * 4;
            unsigned char l[4], r[4];
            int n = x1 - x0 + 2, x, c;
            /* Each edge is the DARKEST of the three pixels just outside the
             * box: the words' own soft glow reaches a pixel or two past the
             * ink, and a neighbouring icon's glow a pixel or two towards it,
             * and either on the edge pixel alone would streak across the
             * whole row (the course notices, 2026-09-06). Glow only ever
             * brightens, so the darkest nearby sample is the panel. */
            for (c = 0; c < 4; c++) {
                int k;
                l[c] = row[(size_t)(x0 - 1) * 4 + c];
                r[c] = row[(size_t)(x1 + 1) * 4 + c];
                for (k = 2; k <= 3; k++) {
                    if (x0 - k >= 0 && row[(size_t)(x0 - k) * 4 + c] < l[c]) l[c] = row[(size_t)(x0 - k) * 4 + c];
                    if (x1 + k < w && row[(size_t)(x1 + k) * 4 + c] < r[c]) r[c] = row[(size_t)(x1 + k) * 4 + c];
                }
            }
            /* and an edge that abuts an icon outright (no dark pixel within
             * three) takes the other edge's value: a flat fill, not a ramp
             * up into the icon */
            {
                int lb = l[0] > l[1] ? l[0] : l[1], rb = r[0] > r[1] ? r[0] : r[1];
                if (l[2] > lb) lb = l[2];
                if (r[2] > rb) rb = r[2];
                if (2 * rb > 3 * lb + 20) memcpy(r, l, 4);
                else if (2 * lb > 3 * rb + 20) memcpy(l, r, 4);
            }
            for (x = x0; x <= x1; x++) {
                int t = x - x0 + 1;
                for (c = 0; c < 4; c++)
                    row[(size_t)x * 4 + c] = (unsigned char)((l[c] * (n - t) + r[c] * t) / n);
            }
        }
    }
    return e->nclean;
}

unsigned char *ez2_textspec_upscale(const unsigned char *rgba, int w, int h, int k)
{
    unsigned char *out;
    int x, y;

    if (!rgba || w <= 0 || h <= 0 || k < 1)
        return 0;
    out = (unsigned char *)malloc((size_t)w * (size_t)h * (size_t)k * (size_t)k * 4);
    if (!out)
        return 0;
    for (y = 0; y < h * k; y++)
        for (x = 0; x < w * k; x++)
            memcpy(out + ((size_t)y * (size_t)(w * k) + (size_t)x) * 4,
                   rgba + ((size_t)(y / k) * (size_t)w + (size_t)(x / k)) * 4, 4);
    return out;
}

unsigned char *ez2_textspec_render_over(const char *rel,
                                        const unsigned char *base, int bw, int bh,
                                        int lw, int lh)
{
    unsigned char *text, *out;
    int scale, tw, th, tlw, tlh;
    size_t k, px;

    if (!rel || !base || bw <= 0 || bh <= 0 || lw <= 0)
        return 0;
    scale = bw / lw;
    if (scale < 1) scale = 1;
    if (scale > 8) scale = 8;
    text = ez2_textspec_render(rel, scale, &tw, &th, &tlw, &tlh);
    if (!text)
        return 0;
    px = (size_t)bw * (size_t)bh;
    out = (unsigned char *)malloc(px * 4);
    if (!out) { free(text); return 0; }
    memcpy(out, base, px * 4);
    /* A MASK TWIN renders white with the words cut to black (keep = 255 -
     * coverage); over its base that is a darken, channel by channel.
     *
     * UNLESS THE TWIN IS DARK WHERE THE WORDS GO. The game's masks are
     * mostly white sheets with the words' shadow in black, and a darken
     * reproduces that. The V-ranking name panel's twin is the other kind:
     * a grey panel with the letters LIGHTER in it, a glow - and cutting
     * black words into that would draw a shadow the game never had, while
     * leaving the twin as the game made it drew the old letters under the
     * new ones (the doubled DJ NAME, 2026-09-05). Such a twin carries no
     * words: it is its cleaned base and the plate alone shows them. The
     * tell is the base's brightness inside the plate's clean boxes. */
    {
        Entry *e = find_entry(rel);
        if (e && e->mask_of >= 0) {
            const Entry *p = &g_entries[e->mask_of];
            unsigned long sum = 0, cnt = 0;
            int i;
            for (i = 0; i < p->nclean; i++) {
                int x0 = p->clean[i][0] * bw / lw, y0 = p->clean[i][1] * bh / lh;
                int x1 = (p->clean[i][2] + 1) * bw / lw - 1, y1 = (p->clean[i][3] + 1) * bh / lh - 1;
                int x, y;
                if (x0 < 0) x0 = 0;
                if (y0 < 0) y0 = 0;
                if (x1 > bw - 1) x1 = bw - 1;
                if (y1 > bh - 1) y1 = bh - 1;
                for (y = y0; y <= y1; y++)
                    for (x = x0; x <= x1; x++) {
                        const unsigned char *b = base + ((size_t)y * (size_t)bw + (size_t)x) * 4;
                        sum += (unsigned long)b[0] + b[1] + b[2];
                        cnt += 3;
                    }
            }
            if (cnt && sum / cnt < 128) {
                free(text);
                return out;
            }
            for (k = 0; k < px; k++) {
                int x = (int)(k % (size_t)bw), y = (int)(k / (size_t)bw);
                const unsigned char *t;
                unsigned char *o = out + k * 4;
                if (x >= tw || y >= th)
                    continue;
                t = text + ((size_t)y * (size_t)tw + (size_t)x) * 4;
                if (t[0] < o[0]) o[0] = t[0];
                if (t[1] < o[1]) o[1] = t[1];
                if (t[2] < o[2]) o[2] = t[2];
            }
            free(text);
            return out;
        }
    }
    /* the text's coverage is in its colour (a plate carries alpha 255 where
     * there is ink), so a source-over by the run's brightness: the ink's
     * colour at full coverage, the base where there is none */
    for (k = 0; k < px; k++) {
        int x = (int)(k % (size_t)bw), y = (int)(k / (size_t)bw);
        const unsigned char *t;
        unsigned cov;

        if (x >= tw || y >= th)
            continue;
        t = text + ((size_t)y * (size_t)tw + (size_t)x) * 4;
        if (t[3] == 0)
            continue;
        cov = t[0] > t[1] ? t[0] : t[1];
        if (t[2] > cov) cov = t[2];
        if (cov == 0)
            continue;
        {
            unsigned char *o = out + k * 4;
            /* the ink colour is the run's rgb scaled by coverage; recover
             * it by dividing out the coverage, then lerp */
            unsigned r = t[0] * 255 / cov, g = t[1] * 255 / cov, b = t[2] * 255 / cov;

            o[0] = (unsigned char)((r * cov + o[0] * (255 - cov)) / 255);
            o[1] = (unsigned char)((g * cov + o[1] * (255 - cov)) / 255);
            o[2] = (unsigned char)((b * cov + o[2] * (255 - cov)) / 255);
            if (o[3] < cov) o[3] = (unsigned char)cov;
        }
    }
    free(text);
    return out;
}

/* ---- rendering ------------------------------------------------------------ */

static const char *face_path(int face)
{
    if (face < 0 || face >= FACE_N)
        return 0;
    if (g_face_state[face] == 0) {
        int ok;
        switch (face) {
        case FACE_BOLD:    ok = ez2_ttf_find(g_face[face], sizeof g_face[face]); break;
        case FACE_LIGHT:   ok = ez2_ttf_find_light(g_face[face], sizeof g_face[face]); break;
        case FACE_CJK:     ok = ez2_ttf_find_cjk(g_face[face], sizeof g_face[face], 0); break;
        default:           ok = ez2_ttf_find_cjk(g_face[face], sizeof g_face[face], 1); break;
        }
        g_face_state[face] = ok ? 1 : -1;
        if (ok)
            ez2_ttf_warm(g_face[face]);
    }
    return g_face_state[face] > 0 ? g_face[face] : 0;
}

/* 1 if `text` holds a character the Latin faces do not have: CJK
 * ideographs, kana, hangul, the CJK punctuation and full-width forms. */
static int has_cjk(const char *text)
{
    const unsigned char *p = (const unsigned char *)text;
    while (*p) {
        unsigned cp = 0;
        if (*p < 0x80) { p++; continue; }
        if ((*p & 0xe0) == 0xc0 && p[1]) { cp = ((*p & 0x1f) << 6) | (p[1] & 0x3f); p += 2; }
        else if ((*p & 0xf0) == 0xe0 && p[1] && p[2]) {
            cp = ((*p & 0x0f) << 12) | ((p[1] & 0x3f) << 6) | (p[2] & 0x3f); p += 3;
        } else if ((*p & 0xf8) == 0xf0 && p[1] && p[2] && p[3]) {
            cp = ((*p & 0x07) << 18) | ((p[1] & 0x3f) << 12) | ((p[2] & 0x3f) << 6) | (p[3] & 0x3f); p += 4;
        } else { p++; continue; }
        if ((cp >= 0x1100 && cp < 0x1200) || (cp >= 0x2e80 && cp < 0xa000) ||
            (cp >= 0xac00 && cp < 0xd7b0) || (cp >= 0xf900 && cp < 0xfb00) ||
            (cp >= 0xff00 && cp < 0xfff0) || cp >= 0x20000)
            return 1;
    }
    return 0;
}

/* The face for a run, as a path the renderer takes: a Latin face is swapped
 * for the CJK one when the words need it (a translation into Chinese or
 * Japanese of a plate the manifest set in Roboto), and a Noto CJK
 * collection gets the language's forms appended as `#N`. */
static const char *run_face(const Run *r, const char *text, char *buf, size_t n)
{
    int face = r->face;
    const char *path;

    if ((face == FACE_BOLD || face == FACE_LIGHT) && has_cjk(text))
        face = face == FACE_BOLD ? FACE_CJKBOLD : FACE_CJK;
    path = face_path(face);
    if (!path)
        return 0;
    if ((face == FACE_CJK || face == FACE_CJKBOLD) && g_cjk_face >= 0 &&
        strstr(path, "NotoSansCJK") && strlen(path) > 4 &&
        strcmp(path + strlen(path) - 4, ".ttc") == 0 && !strchr(path, '#')) {
        snprintf(buf, n, "%s#%d", path, g_cjk_face);
        return buf;
    }
    return path;
}

/* Can every run of `plate` be set in a face that has its script? The CJK
 * finder (ttf.h) falls back to the Latin faces when the machine has no CJK
 * font, and those draw hangul as boxes - so a plate with a Korean run and
 * no real CJK face is NOT rendered: the loader falls through to the game's
 * own bitmap, which was fine all along. 26 of the song titles are Korean. */
static int plate_has_faces(const Entry *plate)
{
    int i;

    for (i = 0; i < plate->nrun; i++) {
        const Run *r = &plate->run[i];
        const char *text = r->lit ? r->lit : ez2_textspec_string(r->key);
        const char *path, *latin;

        if (!text || !has_cjk(text))
            continue;
        path = face_path(r->face == FACE_LIGHT || r->face == FACE_CJK ? FACE_CJK
                                                                       : FACE_CJKBOLD);
        if (!path)
            return 0;
        latin = face_path(FACE_BOLD);
        if (latin && strcmp(path, latin) == 0)
            return 0;
        latin = face_path(FACE_LIGHT);
        if (latin && strcmp(path, latin) == 0)
            return 0;
    }
    return 1;
}

/* An oblique: every row of the coverage slides right by a fifth of its
 * height above the baseline (tan 12 degrees is 0.21), the fraction split
 * between two columns so the edges stay smooth. The rgb buffer is grey
 * three times over; the first channel is the one read back. */
static void shear_rows(unsigned char *rgb, int W, int H, int baseline)
{
    unsigned char *row = (unsigned char *)malloc((size_t)W);
    int y;

    if (!row)
        return;
    for (y = 0; y < H; y++) {
        float shift = (float)(baseline - y) * 0.21f;
        int   whole = (int)floorf(shift);
        float frac  = shift - (float)whole;
        unsigned char *src = rgb + (size_t)y * (size_t)W * 3;
        int x;

        for (x = 0; x < W; x++)
            row[x] = src[x * 3];
        for (x = 0; x < W; x++) {
            int   a = x - whole, b = a - 1;
            float v = 0.0f;
            if (a >= 0 && a < W) v += row[a] * (1.0f - frac);
            if (b >= 0 && b < W) v += row[b] * frac;
            src[x * 3] = src[x * 3 + 1] = src[x * 3 + 2] = (unsigned char)(v + 0.5f);
        }
    }
    free(row);
}

/* The halo: the run's coverage (channel 0 of `gray`, W x H) box-blurred
 * twice at `radius`, then tripled and clamped so it is solid against the
 * letters' edge and fades over the radius - the shape of the game's own
 * plates, whose glow is solid for two pixels round nine-pixel capitals
 * and fades over one more.
 * `out` is W x H bytes. */
static void halo_from(const unsigned char *gray, unsigned char *out, int W, int H, int radius)
{
    size_t px = (size_t)W * (size_t)H, k;
    unsigned *a = (unsigned *)malloc(px * sizeof *a), *b = (unsigned *)malloc(px * sizeof *b);
    int pass, x, y;

    if (!a || !b) { free(a); free(b); memset(out, 0, px); return; }
    for (k = 0; k < px; k++) a[k] = gray[k * 3] * 256;
    for (pass = 0; pass < 2; pass++) {
        /* rows */
        for (y = 0; y < H; y++) {
            unsigned *row = a + (size_t)y * W, *dst = b + (size_t)y * W;
            unsigned long sum = 0;
            int n = 2 * radius + 1;
            for (x = -radius; x <= radius; x++) sum += row[x < 0 ? 0 : x >= W ? W - 1 : x];
            for (x = 0; x < W; x++) {
                dst[x] = (unsigned)(sum / n);
                sum += row[x + radius + 1 >= W ? W - 1 : x + radius + 1];
                sum -= row[x - radius < 0 ? 0 : x - radius];
            }
        }
        /* columns */
        for (x = 0; x < W; x++) {
            unsigned long sum = 0;
            int n = 2 * radius + 1;
            for (y = -radius; y <= radius; y++) sum += b[(size_t)(y < 0 ? 0 : y >= H ? H - 1 : y) * W + x];
            for (y = 0; y < H; y++) {
                a[(size_t)y * W + x] = (unsigned)(sum / n);
                sum += b[(size_t)(y + radius + 1 >= H ? H - 1 : y + radius + 1) * W + x];
                sum -= b[(size_t)(y - radius < 0 ? 0 : y - radius) * W + x];
            }
        }
    }
    for (k = 0; k < px; k++) {
        unsigned v = a[k] / 85;                     /* /256 for the scale, x3 for the gain */
        out[k] = (unsigned char)(v > 255 ? 255 : v);
    }
    free(a); free(b);
}

unsigned char *ez2_textspec_render(const char *rel, int scale,
                                   int *w, int *h, int *lw, int *lh)
{
    Entry *e, *plate;
    unsigned char *gray, *rgba;
    int W, H, i, mask;
    size_t px;

    if (!rel || !g_n)
        return 0;
    e = find_entry(rel);
    if (!e)
        return 0;
    if (!plate_has_faces(e->mask_of >= 0 ? &g_entries[e->mask_of] : e))
        return 0;
    if (scale < 1) scale = 1;
    if (scale > 8) scale = 8;
    mask = e->mask_of >= 0;
    plate = mask ? &g_entries[e->mask_of] : e;
    W = e->w * scale; H = e->h * scale;
    px = (size_t)W * (size_t)H;
    gray = (unsigned char *)calloc(px * 3, 1);
    rgba = (unsigned char *)malloc(px * 4);
    if (!gray || !rgba) { free(gray); free(rgba); return 0; }

    /* every run into its own coverage, then composed by colour: a mask
     * ignores colour, a plate multiplies it in */
    {
        size_t k;
        for (k = 0; k < px; k++) {
            rgba[k * 4 + 0] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = mask ? 255 : 0;
            rgba[k * 4 + 3] = mask ? 255 : 0;
        }
    }
    for (i = 0; i < plate->nrun; i++) {
        const Run *r = &plate->run[i];
        const char *text = r->lit ? r->lit : ez2_textspec_string(r->key);
        char fbuf[1100];
        const char *font = text ? run_face(r, text, fbuf, sizeof fbuf) : 0;
        size_t k;

        if (!text || !font)
            continue;
        memset(gray, 0, px * 3);
        if (!ez2_ttf_render_box(font, text, gray, W, H, r->x * scale, r->baseline * scale,
                                r->cap * (float)scale, r->align, r->max_width * scale))
            continue;
        if (r->oblique)
            shear_rows(gray, W, H, r->baseline * scale);
        if (r->has_glow && !mask) {
            unsigned char *halo = (unsigned char *)malloc(px);
            if (halo) {
                halo_from(gray, halo, W, H, 3 * scale);
                for (k = 0; k < px; k++) {
                    unsigned v = halo[k];
                    unsigned char *o = rgba + k * 4;
                    unsigned cr, cg, cb;
                    if (!v) continue;
                    cr = ((r->glow >> 16) & 0xff) * v / 255;
                    cg = ((r->glow >> 8) & 0xff) * v / 255;
                    cb = (r->glow & 0xff) * v / 255;
                    if (cr > o[0]) o[0] = (unsigned char)cr;
                    if (cg > o[1]) o[1] = (unsigned char)cg;
                    if (cb > o[2]) o[2] = (unsigned char)cb;
                    o[3] = 255;
                }
                free(halo);
            }
        }
        for (k = 0; k < px; k++) {
            unsigned v = gray[k * 3];
            unsigned char *o = rgba + k * 4;
            if (!v) continue;
            if (mask) {
                unsigned keep = 255 - v;
                if (keep < o[0]) o[0] = o[1] = o[2] = (unsigned char)keep;
            } else {
                unsigned cr = ((r->rgb >> 16) & 0xff) * v / 255;
                unsigned cg = ((r->rgb >> 8) & 0xff) * v / 255;
                unsigned cb = (r->rgb & 0xff) * v / 255;
                if (cr > o[0]) o[0] = (unsigned char)cr;
                if (cg > o[1]) o[1] = (unsigned char)cg;
                if (cb > o[2]) o[2] = (unsigned char)cb;
                o[3] = 255;
            }
        }
    }
    free(gray);
    if (w) *w = W;
    if (h) *h = H;
    if (lw) *lw = e->w;
    if (lh) *lh = e->h;
    return rgba;
}
