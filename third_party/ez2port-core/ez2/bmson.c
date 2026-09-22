/* bmson import - see bmson.h. tools/bmson2ez.py is the reference; every
 * rule here is that file's, restated in C, and the layouts mirror the
 * readers in this directory (chart.c, ezi.c, ssf.c, songini.c, abm.c).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "bmson.h"
#include "util.h"
#include "json.h"
#include "gds.h"
#include "vfs.h"
#include "file.h"
#include "abm.h"
#include "font.h"
#include "ttf.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <math.h>
#include <ctype.h>

#define TICKS_PER_QUARTER 48
#define EZFF_VERSION      8
#define TRACK_COUNT       64
#define HOLD_BIAS         6
#define RATE              44100
#define CHANNELS          2
#define PREVIEW_SECONDS   20.0
#define PREVIEW_FADE      1.0
#define PREROLL_MIN       20.0
#define KEYSOUND_ORIGINAL 0x800

/* ---- logging --------------------------------------------------------------- */

typedef struct {
    ez2_bmson_log fn;
    void *user;
} Log;

static void say(Log *l, const char *fmt, ...)
{
    char line[1024];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(line, sizeof line, fmt, ap);
    va_end(ap);
    if (l->fn)
        l->fn(line, l->user);
}

/* ---- small helpers --------------------------------------------------------- */

static int ci_find(const char *hay, const char *needle)
{
    size_t n = strlen(needle), i;
    for (i = 0; hay[i]; i++) {
        size_t k;
        for (k = 0; k < n && hay[i + k] && tolower((unsigned char)hay[i + k]) ==
                                            tolower((unsigned char)needle[k]); k++)
            ;
        if (k == n)
            return 1;
    }
    return 0;
}

static const char *base_name(const char *path)
{
    const char *s = strrchr(path, '/'), *b = strrchr(path, '\\');
    if (b && (!s || b > s)) s = b;
    return s ? s + 1 : path;
}

static void wr16(unsigned char *p, unsigned v) { p[0] = (unsigned char)v; p[1] = (unsigned char)(v >> 8); }
static void wr32(unsigned char *p, unsigned v)
{
    p[0] = (unsigned char)v; p[1] = (unsigned char)(v >> 8);
    p[2] = (unsigned char)(v >> 16); p[3] = (unsigned char)(v >> 24);
}
static void wrf(unsigned char *p, float f) { memcpy(p, &f, 4); }

/* ---- modes: rizu ChartDecoder.lua's rules ---------------------------------- */

typedef struct { const char *hint, *mode, *folder; } Mode;
static const Mode kModes[] = {
    { "ez2-5k-only",    "5KeyMix",    "5keymix" },
    { "ez2-5k-scratch", "ScratchMix", "scratchmix" },
    { "ez2-ruby",       "RubyMix",    "rubymix" },
    { "ez2-5k",         "StreetMix",  "streetmix" },
    { "ez2-7k",         "7StreetMix", "7streetmix" },
    { "ez2-10k",        "ClubMix",    "clubmix" },
    { "ez2-14k",        "SpaceMix",   "spacemix" },
};

static const Mode *mode_by_hint(const char *hint)
{
    size_t i;
    for (i = 0; i < sizeof kModes / sizeof kModes[0]; i++)
        if (ez2_ci_equal(kModes[i].hint, hint))
            return &kModes[i];
    return 0;
}

static const Mode *detect_mode(const ez2_json *info, const char *path, const char **how)
{
    static const struct { const char *kw, *hint; } kw[] = {
        { "7street", "ez2-7k" }, { "7radio", "ez2-7k" }, { "space", "ez2-14k" },
        { "club", "ez2-10k" }, { "10radio", "ez2-10k" }, { "ruby", "ez2-ruby" },
        { "5radio", "ez2-5k" }, { "street", "ez2-5k" }, { "scratch", "ez2-5k-scratch" },
        { "5key", "ez2-5k-only" },
    };
    char name[512];
    const char *hint = ez2_json_str(info, "mode_hint", "");
    size_t i;

    snprintf(name, sizeof name, "%s %s", ez2_json_str(info, "chart_name", ""), base_name(path));
    for (i = 0; i < sizeof kw / sizeof kw[0]; i++)
        if (ci_find(name, kw[i].kw)) { *how = "chart_name"; return mode_by_hint(kw[i].hint); }
    if (mode_by_hint(hint)) { *how = "mode_hint"; return mode_by_hint(hint); }
    if (ez2_ci_equal(hint, "beat-5k") || ez2_ci_equal(hint, "beat-5k-fp")) { *how = "mode_hint(legacy)"; return mode_by_hint("ez2-5k"); }
    if (ez2_ci_equal(hint, "beat-7k"))  { *how = "mode_hint(legacy)"; return mode_by_hint("ez2-7k"); }
    if (ez2_ci_equal(hint, "beat-10k") || ez2_ci_equal(hint, "beat-10k-fp")) { *how = "mode_hint(legacy)"; return mode_by_hint("ez2-10k"); }
    if (ez2_ci_equal(hint, "beat-14k")) { *how = "mode_hint(legacy)"; return mode_by_hint("ez2-14k"); }
    return 0;
}

/* NM / HD / SHD / EX from the file name or chart_name: 0..3 */
static int detect_tier(const ez2_json *info, const char *path)
{
    char text[512];
    const char *t;
    size_t i;

    snprintf(text, sizeof text, "%s %s", base_name(path), ez2_json_str(info, "chart_name", ""));
    for (i = 0; text[i]; i++)
        text[i] = (char)tolower((unsigned char)text[i]);
    /* a token is the tag bounded by non-letters */
    for (t = text; *t; t++) {
        int before = (t == text) || !isalpha((unsigned char)t[-1]);
        if (!before)
            continue;
        if (strncmp(t, "shd", 3) == 0 && !isalpha((unsigned char)t[3])) return 2;
        if (strncmp(t, "s.hd", 4) == 0 && !isalpha((unsigned char)t[4])) return 2;
    }
    for (t = text; *t; t++) {
        int before = (t == text) || !isalpha((unsigned char)t[-1]);
        if (!before)
            continue;
        if (strncmp(t, "hd", 2) == 0 && !isalpha((unsigned char)t[2])) return 1;
    }
    for (t = text; *t; t++) {
        int before = (t == text) || !isalpha((unsigned char)t[-1]);
        if (before && strncmp(t, "ex", 2) == 0 && !isalpha((unsigned char)t[2])) return 3;
    }
    return 0;
}

/* bmson x -> gds input slot. Canonical (rizu ez2LaneMaps) unless the hint is
 * the legacy beat-* numbering. Returns -1 for a lane the mode lacks. */
static int slot_for_x(int x, const char *mode_hint, const Mode *m)
{
    int legacy = strncmp(mode_hint, "beat-", 5) == 0;
    int fp = legacy && (strstr(mode_hint, "-fp") != 0);

    if (!legacy) {
        switch (x) {
        case 1: return 15; case 2: return 23; case 10: return 17; case 20: return 25;
        case 11: case 12: case 13: case 14: case 15: return x - 1;
        case 21: case 22: case 23: case 24: case 25: return x - 3;
        case 31: case 32: case 33: case 34: return x - 25;
        default: return -1;
        }
    }
    /* legacy: 1-5 keys; the rest per mode (rizu laneMaps) */
    if (x >= 1 && x <= 5) return 9 + x;
    if (fp) {
        if (x == 6) return 17;
        if (x == 8) return 15;
        if (ez2_ci_equal(m->hint, "ez2-10k")) {
            if (x >= 9 && x <= 13) return 9 + x;       /* 2P keys 18..22 */
            if (x == 14) return 17;
            if (x == 16) return 23;
        }
        return -1;
    }
    if (ez2_ci_equal(m->hint, "ez2-7k")) {
        if (x == 6 || x == 7) return x;
        if (x == 8) return 15;
        if (x == 9) return 17;
        return -1;
    }
    if (ez2_ci_equal(m->hint, "ez2-10k")) {
        if (x == 7) return 17;
        if (x == 8) return 15;
        if (x >= 11 && x <= 15) return 7 + x;         /* 18..22 */
        if (x == 16) return 23;
        return -1;
    }
    if (ez2_ci_equal(m->hint, "ez2-14k")) {
        if (x == 6 || x == 7) return x;
        if (x == 8) return 15;
        if (x >= 9 && x <= 10) return x - 1;          /* keys 8, 9 -> slots 8, 9 */
        if (x >= 11 && x <= 15) return 7 + x;         /* keys 10-14 -> 18..22 */
        if (x == 16) return 23;
        return -1;
    }
    /* 5k, ruby, 5k-only, scratch */
    if (x == 7) return 17;
    if (x == 8) return 15;
    return -1;
}

/* ---- timing ---------------------------------------------------------------- */

typedef struct { long y, dur; } Stop;

typedef struct {
    double res;
    Stop  *stops;
    int    nstops;
    double worst_err;
} Timeline;

static int cmp_stop(const void *a, const void *b)
{
    long x = ((const Stop *)a)->y, y = ((const Stop *)b)->y;
    return x < y ? -1 : (x > y);
}

static long tl_shift(const Timeline *t, long y)
{
    long d = 0;
    int i;
    for (i = 0; i < t->nstops && t->stops[i].y < y; i++)
        d += t->stops[i].dur;
    return y + d;
}

static unsigned tl_tick(Timeline *t, long y)
{
    double exact = tl_shift(t, y) * TICKS_PER_QUARTER / t->res;
    long tick = (long)floor(exact + 0.5);
    double err = fabs(exact - tick);
    if (err > t->worst_err)
        t->worst_err = err;
    return tick < 0 ? 0u : (unsigned)tick;
}

static unsigned tl_ticks(const Timeline *t, long pulses)
{
    double exact = pulses * TICKS_PER_QUARTER / t->res;
    long v = (long)floor(exact + 0.5);
    return v < 0 ? 0u : (unsigned)v;
}

typedef struct { unsigned tick; double bpm; } TempoPt;
typedef struct { TempoPt *pts; int n; } Tempo;

static int cmp_tempo(const void *a, const void *b)
{
    unsigned x = ((const TempoPt *)a)->tick, y = ((const TempoPt *)b)->tick;
    return x < y ? -1 : (x > y);
}

static double tempo_seconds(const Tempo *t, unsigned tick)
{
    double sec = 0.0;
    int i;
    for (i = 0; i < t->n; i++) {
        unsigned nxt = (i + 1 < t->n) ? t->pts[i + 1].tick : 0;
        if (i + 1 >= t->n || tick < nxt)
            return sec + (tick > t->pts[i].tick ? tick - t->pts[i].tick : 0) * 60.0 /
                             (t->pts[i].bpm * TICKS_PER_QUARTER);
        sec += (nxt - t->pts[i].tick) * 60.0 / (t->pts[i].bpm * TICKS_PER_QUARTER);
    }
    return sec;
}

/* ---- samples --------------------------------------------------------------- */

/* A minimal PCM .wav reader for the no-codec case: 8/16-bit, any channels
 * and rate, converted to stereo s16 at 44.1 kHz by nearest-frame resampling. */
static int read_wav_pcm(const char *path, short **pcm, size_t *frames)
{
    unsigned char *d;
    size_t n, o = 12;
    unsigned fmt_ch = 0, fmt_rate = 0, fmt_bits = 0;
    const unsigned char *data = 0;
    size_t data_n = 0;

    d = ez2_file_read(path, &n);
    if (!d)
        return 0;
    if (n < 12 || memcmp(d, "RIFF", 4) || memcmp(d + 8, "WAVE", 4)) { free(d); return 0; }
    while (o + 8 <= n) {
        unsigned len = d[o + 4] | (d[o + 5] << 8) | (d[o + 6] << 16) | ((unsigned)d[o + 7] << 24);
        if (memcmp(d + o, "fmt ", 4) == 0 && len >= 16) {
            unsigned tag = d[o + 8] | (d[o + 9] << 8);
            fmt_ch = d[o + 10] | (d[o + 11] << 8);
            fmt_rate = d[o + 12] | (d[o + 13] << 8) | (d[o + 14] << 16) | ((unsigned)d[o + 15] << 24);
            fmt_bits = d[o + 22] | (d[o + 23] << 8);
            if (tag != 1 || (fmt_bits != 8 && fmt_bits != 16)) { free(d); return 0; }
        } else if (memcmp(d + o, "data", 4) == 0) {
            data = d + o + 8;
            data_n = (o + 8 + len <= n) ? len : n - (o + 8);
        }
        o += 8 + len + (len & 1);
    }
    if (!data || !fmt_ch || !fmt_rate) { free(d); return 0; }
    {
        size_t bps = fmt_bits / 8, in_frames = data_n / (bps * fmt_ch);
        size_t out_frames = (size_t)((double)in_frames * RATE / fmt_rate), i;
        short *out = (short *)malloc((out_frames + 1) * CHANNELS * sizeof *out);
        if (!out) { free(d); return 0; }
        for (i = 0; i < out_frames; i++) {
            size_t src = (size_t)((double)i * fmt_rate / RATE);
            int c;
            if (src >= in_frames) src = in_frames - 1;
            for (c = 0; c < CHANNELS; c++) {
                unsigned sc = (unsigned)c < fmt_ch ? (unsigned)c : 0;
                const unsigned char *p = data + (src * fmt_ch + sc) * bps;
                out[i * CHANNELS + c] = fmt_bits == 8 ? (short)((p[0] - 128) << 8)
                                                      : (short)(p[0] | (p[1] << 8));
            }
        }
        free(d);
        *pcm = out;
        *frames = out_frames;
        return 1;
    }
}

static int decode_sample(const ez2_bmson_decoders *dec, const char *folder,
                         const char *name, short **pcm, size_t *frames)
{
    static const char *const exts[] = { ".ogg", ".wav", ".flac", ".mp3", ".oga" };
    char path[2048], stem[512];
    size_t i;
    const char *dot;

    *pcm = 0; *frames = 0;
    if (!name || !name[0])
        return 0;
    if (!ez2_vfs_child(folder, name, path, sizeof path)) {
        /* the name's extension may be a lie (.wav for an .ogg) */
        snprintf(stem, sizeof stem, "%s", name);
        dot = strrchr(stem, '.');
        if (dot) stem[dot - stem] = 0;
        for (i = 0; i < sizeof exts / sizeof exts[0]; i++) {
            char trial[600];
            snprintf(trial, sizeof trial, "%s%s", stem, exts[i]);
            if (ez2_vfs_child(folder, trial, path, sizeof path))
                break;
        }
        if (i == sizeof exts / sizeof exts[0])
            return 0;
    }
    if (dec && dec->audio && dec->audio(path, pcm, frames))
        return 1;
    return read_wav_pcm(path, pcm, frames);
}

static int write_ssf(const char *path, const short *pcm, size_t frames)
{
    unsigned char hdr[18];
    FILE *f = fopen(path, "wb");
    size_t bytes = frames * CHANNELS * 2;

    if (!f)
        return 0;
    wr16(hdr, CHANNELS); wr32(hdr + 2, RATE); wr32(hdr + 6, RATE * CHANNELS * 2);
    wr16(hdr + 10, CHANNELS * 2); wr16(hdr + 12, 16); wr32(hdr + 14, (unsigned)bytes);
    fwrite(hdr, 1, 18, f);
    if (bytes)
        fwrite(pcm, 1, bytes, f);
    return fclose(f) == 0;
}

/* ---- the keysound table and the records ----------------------------------- */

typedef struct {
    char name[260];        /* the .ezi's spelling, "<base>.wav" */
    char src[260];         /* the bmson channel's file */
    long start_ms, end_ms; /* -1 = plays out */
    int  written;
} Keysound;

typedef struct {
    Keysound *k;
    int n, cap;
} Keysounds;

static int keysound_index(Keysounds *ks, const char *src, double start_s, double end_s)
{
    long sm = (long)floor(start_s * 1000.0 + 0.5);
    long em = end_s < 0 ? -1 : (long)floor(end_s * 1000.0 + 0.5);
    char stem[64], base[260];
    int i;
    size_t j, w = 0;

    for (i = 0; i < ks->n; i++)
        if (ks->k[i].start_ms == sm && ks->k[i].end_ms == em && strcmp(ks->k[i].src, src) == 0)
            return i + 1;
    /* the file's stem, made safe, 40 chars at most (bmson2ez.py) */
    for (j = 0; src[j] && w < 40; j++) {
        char c = src[j];
        if (c == '.' && strrchr(src, '.') == src + j)
            break;
        stem[w++] = (isalnum((unsigned char)c) || c == '_' || c == '-') ? c : '_';
    }
    stem[w] = 0;
    if (!src[0])
        snprintf(base, sizeof base, "silence");
    else if (sm == 0 && em < 0)
        snprintf(base, sizeof base, "%s", stem);
    else if (em < 0)
        snprintf(base, sizeof base, "%s_%ld_end", stem, sm);
    else
        snprintf(base, sizeof base, "%s_%ld_%ld", stem, sm, em);
    /* UNIQUE WITHOUT REGARD TO CASE. The package lands on the cabinet's
     * Windows disk, where `LH_1.ssf` and `lh_1.ssf` are one file - and
     * Cat's rule ships both `LH_1.wav` and `lh.1.wav`, 36 such pairs, the
     * dot made an underscore by the rule above. Linux kept them apart and
     * the cabinet overwrote one with the other: "some samples aren't on the
     * right notes" (the owner, 2026-09-05). A stem that another source
     * already owns, case aside, takes a ~2, ~3... */
    {
        int suffix = 1, again = 1;
        char want[260];

        snprintf(want, sizeof want, "%s", base);
        while (again) {
            again = 0;
            for (i = 0; i < ks->n; i++) {
                char other[260];
                size_t ol;

                snprintf(other, sizeof other, "%s", ks->k[i].name);
                ol = strlen(other);
                if (ol > 4) other[ol - 4] = 0;              /* drop .wav */
                if (ez2_ci_equal(other, want)) {
                    suffix++;
                    snprintf(want, sizeof want, "%s~%d", base, suffix);
                    again = 1;
                    break;
                }
            }
        }
        snprintf(base, sizeof base, "%s", want);
    }
    if (ks->n == ks->cap) {
        int ncap = ks->cap ? ks->cap * 2 : 256;
        Keysound *nk = (Keysound *)realloc(ks->k, (size_t)ncap * sizeof *nk);
        if (!nk)
            return 0;
        ks->k = nk;
        ks->cap = ncap;
    }
    memset(&ks->k[ks->n], 0, sizeof ks->k[ks->n]);
    snprintf(ks->k[ks->n].name, sizeof ks->k[ks->n].name, "%s.wav", base);
    snprintf(ks->k[ks->n].src, sizeof ks->k[ks->n].src, "%s", src);
    ks->k[ks->n].start_ms = sm;
    ks->k[ks->n].end_ms = em;
    ks->n++;
    return ks->n;
}

typedef struct {
    unsigned char *recs;   /* 13 bytes each */
    int n, cap;
} Track;

static int track_add(Track *t, const unsigned char *rec)
{
    if (t->n == t->cap) {
        int ncap = t->cap ? t->cap * 2 : 64;
        unsigned char *nr = (unsigned char *)realloc(t->recs, (size_t)ncap * 13);
        if (!nr)
            return 0;
        t->recs = nr;
        t->cap = ncap;
    }
    memcpy(t->recs + (size_t)t->n * 13, rec, 13);
    t->n++;
    return 1;
}

static int cmp_rec(const void *a, const void *b)
{
    unsigned x, y;
    memcpy(&x, a, 4); memcpy(&y, b, 4);
    return x < y ? -1 : (x > y);
}

static void note_record(unsigned char *r, unsigned tick, int key, unsigned hold)
{
    memset(r, 0, 13);
    wr32(r, tick); r[4] = 1; wr16(r + 5, (unsigned)key);
    r[7] = 127; r[8] = 64; r[9] = 0;
    wr16(r + 10, hold > 0 ? hold + HOLD_BIAS : 0);
}

static void bpm_record(unsigned char *r, unsigned tick, double bpm)
{
    memset(r, 0, 13);
    wr32(r, tick); r[4] = 3; wrf(r + 5, (float)bpm);
}

static void name_field(unsigned char *dst, const char *s)
{
    size_t n = strlen(s);
    if (n > 63) n = 63;
    memset(dst, 0, 64);
    memcpy(dst, s, n);
}

static int write_ezff(const char *path, const char *title, double bpm, Track *tracks, unsigned total)
{
    unsigned char hdr[0x96], th[0x4e];
    FILE *f = fopen(path, "wb");
    int t;

    if (!f)
        return 0;
    memset(hdr, 0, sizeof hdr);
    memcpy(hdr, "EZFF", 4); hdr[5] = EZFF_VERSION;
    name_field(hdr + 0x06, title); name_field(hdr + 0x46, "");
    wr16(hdr + 0x86, 4 * TICKS_PER_QUARTER); wrf(hdr + 0x88, (float)bpm);
    wr16(hdr + 0x8c, TRACK_COUNT); wr32(hdr + 0x8e, total); wrf(hdr + 0x92, (float)bpm);
    fwrite(hdr, 1, sizeof hdr, f);
    for (t = 0; t < TRACK_COUNT; t++) {
        char tn[32];
        unsigned last = 0;
        if (tracks[t].n)
            qsort(tracks[t].recs, (size_t)tracks[t].n, 13, cmp_rec);
        if (tracks[t].n)
            memcpy(&last, tracks[t].recs + (size_t)(tracks[t].n - 1) * 13, 4);
        memset(th, 0, sizeof th);
        memcpy(th, "EZTR", 4);
        snprintf(tn, sizeof tn, "track%02d", t);
        name_field(th + 0x06, tn);
        wr32(th + 0x46, last); wr32(th + 0x4a, (unsigned)tracks[t].n * 13);
        fwrite(th, 1, sizeof th, f);
        if (tracks[t].n)
            fwrite(tracks[t].recs, 13, (size_t)tracks[t].n, f);
    }
    return fclose(f) == 0;
}

/* ---- events: every note of every channel, in seconds (the preview plan) --- */

typedef struct { double t, start, end; int channel; } Event;   /* end < 0: plays out */

/* ---- one chart ------------------------------------------------------------- */

typedef struct {
    const Mode *mode;
    int tier, level;
    char stem[128];
    ez2_json *doc;
    Timeline tl;
    Tempo tempo;
    double init_bpm;
} Chart;

static const char *tier_suffix(int t)
{
    static const char *const s[4] = { "", "-hd", "-shd", "-ex" };
    return s[t & 3];
}
static const char *tier_name(int t)
{
    static const char *const s[4] = { "NM", "HD", "SHD", "EX" };
    return s[t & 3];
}

static int build_timing(Chart *c)
{
    const ez2_json *info = ez2_json_get(c->doc, "info");
    const ez2_json *stops = ez2_json_get(c->doc, "stop_events");
    const ez2_json *bpms = ez2_json_get(c->doc, "bpm_events");
    const ez2_json *e;
    int i;

    memset(&c->tl, 0, sizeof c->tl);
    memset(&c->tempo, 0, sizeof c->tempo);
    c->tl.res = ez2_json_num(info, "resolution", 240);
    if (c->tl.res <= 0) c->tl.res = 240;
    if (stops && stops->count) {
        c->tl.stops = (Stop *)calloc((size_t)stops->count, sizeof *c->tl.stops);
        if (!c->tl.stops) return 0;
        for (e = stops->first; e; e = e->next) {
            c->tl.stops[c->tl.nstops].y = (long)ez2_json_num(e, "y", 0);
            c->tl.stops[c->tl.nstops].dur = (long)ez2_json_num(e, "duration", 0);
            c->tl.nstops++;
        }
        qsort(c->tl.stops, (size_t)c->tl.nstops, sizeof *c->tl.stops, cmp_stop);
    }
    c->init_bpm = ez2_json_num(info, "init_bpm", 120);
    if (c->init_bpm <= 0) c->init_bpm = 120;
    c->tempo.pts = (TempoPt *)calloc((size_t)(bpms ? bpms->count : 0) + 1, sizeof *c->tempo.pts);
    if (!c->tempo.pts) return 0;
    c->tempo.pts[0].tick = 0; c->tempo.pts[0].bpm = c->init_bpm; c->tempo.n = 1;
    if (bpms)
        for (e = bpms->first; e; e = e->next) {
            double b = ez2_json_num(e, "bpm", 0);
            if (b > 0) {
                c->tempo.pts[c->tempo.n].tick = tl_tick(&c->tl, (long)ez2_json_num(e, "y", 0));
                c->tempo.pts[c->tempo.n].bpm = b;
                c->tempo.n++;
            }
        }
    qsort(c->tempo.pts + 1, (size_t)(c->tempo.n - 1), sizeof *c->tempo.pts, cmp_tempo);
    for (i = 1; i < c->tempo.n; i++)      /* two at one tick: the later wins */
        if (c->tempo.pts[i].tick == c->tempo.pts[i - 1].tick)
            c->tempo.pts[i - 1].bpm = c->tempo.pts[i].bpm;
    return 1;
}

static int cmp_note_y(const void *a, const void *b)
{
    double x = ez2_json_num(*(const ez2_json *const *)a, "y", 0);
    double y = ez2_json_num(*(const ez2_json *const *)b, "y", 0);
    return x < y ? -1 : (x > y);
}

/* Every channel's notes with their slice boundaries, in seconds: the rule
 * bmson2ez.py's channel_events() states. `for_records` also emits the chart's
 * records and fills the keysound table. */
static int walk_channels(Chart *c, const char *mode_hint, const int *slot_to_track,
                         Keysounds *ks, Track *tracks, int *auto_tracks, int n_auto,
                         int *dropped_up, int *unmapped, int *notes, int *holds,
                         int *autos, int *slices, Event **events_out, int *nevents_out)
{
    const ez2_json *chans = ez2_json_get(c->doc, "sound_channels");
    const ez2_json *ch;
    Event *events = 0;
    int nevents = 0, cap = 0, chan_idx = 0;
    /* THE AUTO TRACK IS THE FIRST ONE FREE AT THAT TICK (bmson2ez.py's
     * rule), not a round-robin over all of them: a backing that fits on
     * track 20 stays there, and the low tracks the shipped charts leave
     * empty are touched only when twenty-odd samples fire at once. One
     * bit per (track, tick), grown as the chart runs on. */
    unsigned char *busy[TRACK_COUNT];
    size_t busy_n[TRACK_COUNT];
    int bi;

    for (bi = 0; bi < TRACK_COUNT; bi++) { busy[bi] = 0; busy_n[bi] = 0; }

    for (ch = chans ? chans->first : 0; ch; ch = ch->next, chan_idx++) {
        const ez2_json *notes_arr = ez2_json_get(ch, "notes");
        const char *name = ez2_json_str(ch, "name", "");
        const ez2_json **list;
        double *times;
        double last_fresh = -1.0;
        int n = 0, i;
        const ez2_json *e;

        if (!notes_arr || !notes_arr->count)
            continue;
        list = (const ez2_json **)malloc((size_t)notes_arr->count * sizeof *list);
        times = (double *)malloc((size_t)notes_arr->count * sizeof *times);
        if (!list || !times) { free(list); free(times); free(events); goto fail; }
        for (e = notes_arr->first; e; e = e->next) {
            if (ez2_json_bool(e, "up", 0)) { (*dropped_up)++; continue; }
            list[n++] = e;
        }
        qsort(list, (size_t)n, sizeof *list, cmp_note_y);
        for (i = 0; i < n; i++)
            times[i] = tempo_seconds(&c->tempo, tl_tick(&c->tl, (long)ez2_json_num(list[i], "y", 0)));
        for (i = 0; i < n; i++) {
            double t = times[i], start, end = -1.0;
            int cont = ez2_json_bool(list[i], "c", 0);
            int nxt_cont = (i + 1 < n) && ez2_json_bool(list[i + 1], "c", 0);
            int x = (int)ez2_json_num(list[i], "x", 0);
            unsigned tick, hold;
            int key, slot, track;
            unsigned char rec[13];

            if (cont && last_fresh >= 0.0)
                start = t - last_fresh;
            else {
                start = 0.0;
                last_fresh = t;
            }
            if (i + 1 < n) {
                end = start + (times[i + 1] - t);
                if (end < start + 0.0005) end = start + 0.0005;
            }
            /* the event list carries the true cut (the preview mixes it) */
            if (nevents == cap) {
                int ncap = cap ? cap * 2 : 1024;
                Event *ne = (Event *)realloc(events, (size_t)ncap * sizeof *ne);
                if (!ne) { free(list); free(times); free(events); goto fail; }
                events = ne; cap = ncap;
            }
            events[nevents].t = t; events[nevents].start = start;
            events[nevents].end = end; events[nevents].channel = chan_idx;
            nevents++;
            if (!ks)
                continue;
            /* the slice a record plays: whole file for a fresh hit not
             * followed by a continuation, else [start, next) */
            if (start == 0.0 && !nxt_cont)
                key = keysound_index(ks, name, 0.0, -1.0);
            else {
                key = keysound_index(ks, name, start, end);
                (*slices)++;
            }
            if (key <= 0) { free(list); free(times); free(events); goto fail; }
            tick = tl_tick(&c->tl, (long)ez2_json_num(list[i], "y", 0));
            hold = tl_ticks(&c->tl, (long)ez2_json_num(list[i], "l", 0));
            slot = x == 0 ? -1 : slot_for_x(x, mode_hint, c->mode);
            track = (slot >= 0 && slot < 32) ? slot_to_track[slot] : -1;
            if (x != 0 && track < 0)
                (*unmapped)++;
            if (track < 0) {
                int a, pick = auto_tracks[0];
                size_t byte = tick >> 3;

                for (a = 0; a < n_auto; a++) {
                    int t = auto_tracks[a];
                    if (byte >= busy_n[t] || !(busy[t][byte] & (1u << (tick & 7)))) {
                        pick = t;
                        break;
                    }
                }
                if (byte >= busy_n[pick]) {
                    size_t nn = busy_n[pick] ? busy_n[pick] : 4096;
                    unsigned char *nb;
                    while (nn <= byte) nn *= 2;
                    nb = (unsigned char *)realloc(busy[pick], nn);
                    if (nb) {
                        memset(nb + busy_n[pick], 0, nn - busy_n[pick]);
                        busy[pick] = nb;
                        busy_n[pick] = nn;
                    }
                }
                if (byte < busy_n[pick])
                    busy[pick][byte] |= (unsigned char)(1u << (tick & 7));
                track = pick;
                (*autos)++;
                note_record(rec, tick, key, 0);
            } else {
                (*notes)++;
                if (hold) (*holds)++;
                note_record(rec, tick, key, hold);
            }
            if (!track_add(&tracks[track], rec)) { free(list); free(times); free(events); goto fail; }
        }
        free(list);
        free(times);
    }
    for (bi = 0; bi < TRACK_COUNT; bi++)
        free(busy[bi]);
    *events_out = events;
    *nevents_out = nevents;
    return 1;
fail:
    for (bi = 0; bi < TRACK_COUNT; bi++)
        free(busy[bi]);
    return 0;
}

/* ---- art ------------------------------------------------------------------- */

static void resize_rgba(const unsigned char *src, int sw, int sh,
                        unsigned char *dst, int dw, int dh)
{
    /* box-filtered downscale, bilinear-ish upscale: good enough for a plate */
    int x, y;
    for (y = 0; y < dh; y++) {
        int sy0 = (int)((long long)y * sh / dh), sy1 = (int)((long long)(y + 1) * sh / dh);
        if (sy1 <= sy0) sy1 = sy0 + 1;
        for (x = 0; x < dw; x++) {
            int sx0 = (int)((long long)x * sw / dw), sx1 = (int)((long long)(x + 1) * sw / dw);
            long r = 0, g = 0, b = 0, cnt = 0;
            int yy, xx;
            if (sx1 <= sx0) sx1 = sx0 + 1;
            for (yy = sy0; yy < sy1 && yy < sh; yy++)
                for (xx = sx0; xx < sx1 && xx < sw; xx++) {
                    const unsigned char *p = src + ((size_t)yy * sw + xx) * 4;
                    r += p[0]; g += p[1]; b += p[2]; cnt++;
                }
            if (!cnt) cnt = 1;
            dst[((size_t)y * dw + x) * 3 + 0] = (unsigned char)(r / cnt);
            dst[((size_t)y * dw + x) * 3 + 1] = (unsigned char)(g / cnt);
            dst[((size_t)y * dw + x) * 3 + 2] = (unsigned char)(b / cnt);
        }
    }
}

static int load_image(const ez2_bmson_decoders *dec, const char *folder, const char *name,
                      unsigned char **rgba, int *w, int *h)
{
    char path[2048];
    if (!dec || !dec->image || !name || !name[0])
        return 0;
    if (!ez2_vfs_child(folder, name, path, sizeof path))
        return 0;
    return dec->image(path, rgba, w, h);
}

/* the disc: a centre-cropped square, fit to 256, cut to the radius-125
 * circle on keyed black, the art's own black lifted off the key */
static void write_disc(const unsigned char *rgba, int w, int h, const char *path)
{
    int s = w < h ? w : h, ox = (w - s) / 2, oy = (h - s) / 2, x, y;
    unsigned char *sq = (unsigned char *)malloc((size_t)s * s * 4);
    unsigned char disc[256 * 256 * 3];

    if (!sq)
        return;
    for (y = 0; y < s; y++)
        memcpy(sq + (size_t)y * s * 4, rgba + ((size_t)(oy + y) * w + ox) * 4, (size_t)s * 4);
    resize_rgba(sq, s, s, disc, 256, 256);
    free(sq);
    for (y = 0; y < 256; y++)
        for (x = 0; x < 256; x++) {
            unsigned char *p = disc + ((size_t)y * 256 + x) * 3;
            double dx = x - 127.5, dy = y - 127.5;
            if (dx * dx + dy * dy > 125.0 * 125.0)
                p[0] = p[1] = p[2] = 0;
            else if (p[0] == 0 && p[1] == 0 && p[2] == 0)
                p[0] = p[1] = p[2] = 1;
        }
    ez2_abm_write(path, disc, 256, 256);
}

static void write_eyecatch(const unsigned char *rgba, int w, int h, const char *path)
{
    unsigned char *out = (unsigned char *)malloc(1024 * 512 * 3);
    if (!out)
        return;
    resize_rgba(rgba, w, h, out, 1024, 512);
    ez2_abm_write(path, out, 1024, 512);
    free(out);
}

/* the title plate, like the shipped ones (ttf.h): a bold sans, white,
 * ink ending at x=246, nine-pixel capitals on a baseline at row 23 (the
 * advance's side bearing puts the pen at 248).
 * With no TrueType face on the machine, the game's own bitmap font. */
static void write_plate(const char *game_root, const char *title, const char *path)
{
    static ez2_font font;
    static int font_state = 0;          /* 0 untried, 1 loaded, -1 failed */
    static char ttf[1024];
    static int ttf_state = 0;
    unsigned char plate[256 * 32 * 3];
    const char *s = title;
    ez2_glyph g;
    int pen = 4;

    memset(plate, 0, sizeof plate);
    if (ttf_state == 0)
        ttf_state = ez2_ttf_find(ttf, sizeof ttf) ? 1 : -1;
    if (ttf_state > 0 && ez2_ttf_render(ttf, title, plate, 256, 32, 248, 23, 9.0f)) {
        ez2_abm_write(path, plate, 256, 32);
        return;
    }
    if (font_state == 0)
        font_state = ez2_font_load(game_root, &font) ? 1 : -1;
    if (font_state > 0) {
        while (ez2_font_next(&font, &s, &g) && pen < 252) {
            int x, y;
            for (y = 0; y < g.h; y++)
                for (x = 0; x < g.w; x++)
                    if (ez2_font_pixel(&g, x, y) && pen + x < 256 && 8 + y < 32) {
                        unsigned char *p = plate + ((size_t)(8 + y) * 256 + pen + x) * 3;
                        p[0] = p[1] = p[2] = 255;
                    }
            pen += g.advance;
        }
    }
    ez2_abm_write(path, plate, 256, 32);
}

/* ---- the preview: rizu's keysound plan --------------------------------------- */

static int cmp_event(const void *a, const void *b)
{
    double x = ((const Event *)a)->t, y = ((const Event *)b)->t;
    return x < y ? -1 : (x > y);
}

static int write_preview(Chart *c, const ez2_bmson_decoders *dec, const char *folder,
                         Event *events, int nevents, const char *path, Log *log)
{
    const ez2_json *info = ez2_json_get(c->doc, "info");
    const ez2_json *chans = ez2_json_get(c->doc, "sound_channels");
    const char *pm = ez2_json_str(info, "preview_music", "");
    short *pcm;
    size_t frames;
    long *mix;
    size_t total = (size_t)(RATE * PREVIEW_SECONDS), fade = (size_t)(RATE * PREVIEW_FADE), i;
    double win_start, win_end, want;
    int placed = 0, prerolls = 0, e, nchan = chans ? chans->count : 0;
    const ez2_json **chan_nodes;
    int *latest;

    if (pm[0] && decode_sample(dec, folder, pm, &pcm, &frames)) {
        write_ssf(path, pcm, frames < (size_t)RATE * 30 ? frames : (size_t)RATE * 30);
        free(pcm);
        return 1;
    }
    if (!nevents)
        return 0;
    qsort(events, (size_t)nevents, sizeof *events, cmp_event);
    want = events[0].t + (events[nevents - 1].t - events[0].t) * 0.25;
    win_start = events[0].t;
    for (e = 0; e < nevents; e++)
        if (events[e].t >= want) { win_start = events[e].t; break; }
    win_end = win_start + PREVIEW_SECONDS;

    mix = (long *)calloc(total * CHANNELS, sizeof *mix);
    chan_nodes = (const ez2_json **)calloc((size_t)nchan + 1, sizeof *chan_nodes);
    latest = (int *)malloc((size_t)(nchan + 1) * sizeof *latest);
    if (!mix || !chan_nodes || !latest) { free(mix); free(chan_nodes); free(latest); return 0; }
    {
        const ez2_json *ch; int k = 0;
        for (ch = chans ? chans->first : 0; ch; ch = ch->next) chan_nodes[k++] = ch;
    }
    for (e = 0; e < nchan; e++) latest[e] = -1;

    /* per channel: decode once, place the window's notes, then the preroll */
    for (e = 0; e < nevents; e++)
        if (events[e].t < win_start && events[e].channel < nchan)
            latest[events[e].channel] = e;
    {
        int chn;
        for (chn = 0; chn < nchan; chn++) {
            const char *name = ez2_json_str(chan_nodes[chn], "name", "");
            int any = 0;
            for (e = 0; e < nevents && !any; e++)
                if (events[e].channel == chn && events[e].t >= win_start && events[e].t < win_end)
                    any = 1;
            if (!any && latest[chn] < 0)
                continue;
            if (!decode_sample(dec, folder, name, &pcm, &frames))
                continue;
            for (e = 0; e < nevents; e++) {
                const Event *ev = &events[e];
                double at, len_s = (double)frames / RATE;
                size_t a0, a1, o, n;
                int preroll = 0;
                if (ev->channel != chn)
                    continue;
                if (ev->t < win_start) {
                    double sound_end;
                    if (e != latest[chn] || len_s < PREROLL_MIN)
                        continue;
                    sound_end = ev->t + ((ev->end >= 0 ? ev->end : len_s) - ev->start);
                    if (sound_end <= win_start)
                        continue;
                    preroll = 1;
                } else if (ev->t >= win_end)
                    continue;
                at = ev->t - win_start;
                a0 = (size_t)(ev->start * RATE);
                a1 = ev->end < 0 ? frames : (size_t)(ev->end * RATE);
                if (a1 > frames) a1 = frames;
                if (a1 <= a0)
                    continue;
                if (at < 0) { a0 += (size_t)(-at * RATE); o = 0; } else o = (size_t)(at * RATE);
                if (a0 >= a1 || o >= total)
                    continue;
                n = a1 - a0;
                if (o + n > total) n = total - o;
                for (i = 0; i < n * CHANNELS; i++)
                    mix[o * CHANNELS + i] += pcm[a0 * CHANNELS + i];
                placed++;
                prerolls += preroll;
            }
            free(pcm);
        }
    }
    free(chan_nodes);
    free(latest);
    if (!placed) { free(mix); return 0; }
    {
        long peak = 1;
        short *out = (short *)malloc(total * CHANNELS * sizeof *out);
        if (!out) { free(mix); return 0; }
        for (i = 0; i < fade * CHANNELS; i++)
            mix[i] = (long)(mix[i] * ((double)(i / CHANNELS) / fade));
        for (i = 0; i < fade * CHANNELS; i++) {
            size_t k = (total - fade) * CHANNELS + i;
            mix[k] = (long)(mix[k] * (1.0 - (double)(i / CHANNELS) / fade));
        }
        for (i = 0; i < total * CHANNELS; i++)
            if (labs(mix[i]) > peak) peak = labs(mix[i]);
        for (i = 0; i < total * CHANNELS; i++) {
            long v = peak > 32000 ? (long)(mix[i] * (32000.0 / peak)) : mix[i];
            out[i] = (short)v;
        }
        write_ssf(path, out, total);
        free(out);
    }
    free(mix);
    say(log, "  preview: %d s from %.1f s in, %d notes and %d background preroll(s)",
        (int)PREVIEW_SECONDS, win_start, placed - prerolls, prerolls);
    return 1;
}

/* ---- the whole import ------------------------------------------------------ */

int ez2_bmson_folder_has_charts(const char *folder)
{
    char one[2048];
    return folder && ez2_vfs_child_ext(folder, ".bmson", one, sizeof one);
}

static void derive_key(const char *folder, char *key, size_t n)
{
    char name[512];
    const char *b;
    size_t i, w = 0;

    snprintf(name, sizeof name, "%s", folder);
    while (strlen(name) > 1 && (name[strlen(name) - 1] == '/' || name[strlen(name) - 1] == '\\'))
        name[strlen(name) - 1] = 0;
    b = base_name(name);
    for (i = 0; b[i] && w < 15 && w + 1 < n; i++)
        if (isalnum((unsigned char)b[i]))
            key[w++] = (char)tolower((unsigned char)b[i]);
    key[w] = 0;
}

static int copy_file(const char *from, const char *to)
{
    FILE *a = fopen(from, "rb"), *b;
    char buf[1 << 16];
    size_t n;
    if (!a) return 0;
    b = fopen(to, "wb");
    if (!b) { fclose(a); return 0; }
    while ((n = fread(buf, 1, sizeof buf, a)) > 0)
        fwrite(buf, 1, n, b);
    fclose(a);
    return fclose(b) == 0;
}

int ez2_bmson_import(const char *folder, const char *game_root,
                     const char *out_root, const char *key_override,
                     const ez2_bmson_decoders *dec,
                     ez2_bmson_log logfn, void *user,
                     char *key_out, size_t key_n)
{
    enum { MAX_CHARTS = 16, PATHN = 2048 };
    Log log;
    char key[16], out_dir[PATHN], path[PATHN];
    char *files;
    int nfiles, fi, written = 0;
    Chart charts[MAX_CHARTS];
    int nch = 0;
    Event *preview_events = 0;
    int n_preview_events = 0;
    const ez2_json *first_info = 0;
    FILE *ini;

    log.fn = logfn; log.user = user;
    memset(charts, 0, sizeof charts);
    if (!folder || !game_root || !out_root)
        return 0;
    files = (char *)malloc((size_t)MAX_CHARTS * PATHN);
    if (!files)
        return 0;
    nfiles = ez2_vfs_children_ext(folder, ".bmson", files, PATHN, MAX_CHARTS);
    if (nfiles == 0) { say(&log, "%s: no .bmson", folder); free(files); return 0; }
    if (key_override && key_override[0])
        snprintf(key, sizeof key, "%.15s", key_override);
    else
        derive_key(folder, key, sizeof key);
    if (!key[0]) { say(&log, "%s: no usable song key", folder); free(files); return 0; }
    if (key_out)
        snprintf(key_out, key_n, "%s", key);
    snprintf(out_dir, sizeof out_dir, "%s/%s", out_root, key);
    snprintf(path, sizeof path, "%s/song.ini", out_dir);
    ez2_vfs_makedirs(path);
    say(&log, "%s -> %s", folder, out_dir);

    for (fi = 0; fi < nfiles && nch < MAX_CHARTS; fi++) {
        const char *file = files + (size_t)fi * PATHN;
        unsigned char *text;
        size_t n;
        const char *err = 0, *how = 0;
        Chart *c = &charts[nch];
        const ez2_json *info;
        ez2_gds gds;
        int slot_to_track[32], lane_tracks[EZ2_GDS_MAX_TRACKS], nlanes, s;
        int auto_tracks[TRACK_COUNT], n_auto = 0, t;
        Track tracks[TRACK_COUNT];
        Keysounds ks;
        Event *events = 0;
        int nevents = 0, dropped_up = 0, unmapped = 0, notes = 0, holds = 0, autos = 0, slices = 0;
        unsigned total = 0;
        int k, i;

        if (strncmp(base_name(file), "__", 2) == 0)
            continue;
        text = ez2_file_read(file, &n);
        if (!text) { say(&log, "  %s: cannot read", base_name(file)); continue; }
        c->doc = ez2_json_parse((const char *)text, n, &err);
        free(text);
        if (!c->doc) { say(&log, "  %s: %s", base_name(file), err ? err : "bad JSON"); continue; }
        info = ez2_json_get(c->doc, "info");
        c->mode = detect_mode(info, file, &how);
        if (!c->mode) {
            say(&log, "  %s: no EZ2 mode in chart_name or mode_hint (%s) - skipped",
                base_name(file), ez2_json_str(info, "mode_hint", "?"));
            ez2_json_free(c->doc); c->doc = 0;
            continue;
        }
        c->tier = detect_tier(info, file);
        c->level = (int)ez2_json_num(info, "level", 0);
        if (ez2_gds_load_for_mode(game_root, c->mode->mode, &gds) != 0) {
            say(&log, "  %s: no %s.gds under the game root", base_name(file), c->mode->folder);
            ez2_json_free(c->doc); c->doc = 0;
            continue;
        }
        say(&log, "  %s -> %s %s (%s)", base_name(file), c->mode->mode, tier_name(c->tier), how);
        for (s = 0; s < 32; s++) slot_to_track[s] = -1;
        nlanes = ez2_gds_lanes(&gds, 0, lane_tracks, EZ2_GDS_MAX_TRACKS);
        for (s = 0; s < 32; s++) {
            int lane = ez2_gds_lane_for_key(&gds, 0, s);
            if (lane >= 0 && lane < nlanes)
                slot_to_track[s] = lane_tracks[lane];
        }
        for (t = 20; t < TRACK_COUNT; t++) {
            int used = 0;
            for (s = 0; s < nlanes; s++) if (lane_tracks[s] == t) used = 1;
            if (!used) auto_tracks[n_auto++] = t;
        }
        for (t = 0; t < 20; t++) {
            int used = 0;
            for (s = 0; s < nlanes; s++) if (lane_tracks[s] == t) used = 1;
            if (!used) auto_tracks[n_auto++] = t;
        }
        if (!build_timing(c)) { ez2_json_free(c->doc); c->doc = 0; continue; }
        if (c->tl.nstops)
            say(&log, "  ! %d stop(s) converted to gaps: timing kept, the scroll does not freeze",
                c->tl.nstops);
        memset(tracks, 0, sizeof tracks);
        memset(&ks, 0, sizeof ks);
        if (!walk_channels(c, ez2_json_str(info, "mode_hint", ""), slot_to_track, &ks, tracks,
                           auto_tracks, n_auto, &dropped_up, &unmapped, &notes, &holds, &autos,
                           &slices, &events, &nevents)) {
            say(&log, "  %s: out of memory", base_name(file));
            goto next_chart;
        }
        for (i = 1; i < c->tempo.n; i++) {
            unsigned char rec[13];
            bpm_record(rec, c->tempo.pts[i].tick, c->tempo.pts[i].bpm);
            track_add(&tracks[0], rec);
        }
        for (t = 0; t < TRACK_COUNT; t++)
            for (k = 0; k < tracks[t].n; k++) {
                unsigned tick;
                memcpy(&tick, tracks[t].recs + (size_t)k * 13, 4);
                if (tick > total) total = tick;
            }
        snprintf(c->stem, sizeof c->stem, "%s1p-%s%s", c->mode->folder, key, tier_suffix(c->tier));
        snprintf(path, sizeof path, "%s/%s.ez", out_dir, c->stem);
        write_ezff(path, ez2_json_str(info, "title", key), c->init_bpm, tracks, total + TICKS_PER_QUARTER);
        snprintf(path, sizeof path, "%s/%s.ezi", out_dir, c->stem);
        {
            FILE *f = fopen(path, "wb");
            if (f) {
                for (k = 0; k < ks.n; k++)
                    fprintf(f, "%d 1 %s\n", k + 1, ks.k[k].name);
                fclose(f);
            }
        }
        snprintf(path, sizeof path, "%s/%s.ini", out_dir, c->stem);
        {
            FILE *f = fopen(path, "wb");
            double jr = ez2_json_num(info, "judge_rank", 100) / 100.0;
            static const int base[4] = { 9, 27, 53, 73 };
            static const char *const names[4] = { "Kool", "Cool", "Good", "Miss" };
            if (jr <= 0) jr = 1.0;
            if (f) {
                fprintf(f, "[General]\nLevel = %d\nMeasureScale = 1.6\n\n[JudgmentDelta]\n", c->level);
                for (k = 0; k < 4; k++) {
                    int v = (int)floor(base[k] * jr + 0.5);
                    fprintf(f, "%s = %d\n", names[k], v < 1 ? 1 : v);
                }
                fprintf(f, "\n[GaugeUpDownRate]\nCool = 0.2\nGood = 0.1\nMiss = -1.8\nFail = -4.8\n");
                fclose(f);
            }
        }
        /* the samples: one decode per source file, every slice of it written */
        {
            int wrote = 0, missing = 0;
            for (k = 0; k < ks.n; k++) {
                short *pcm = 0;
                size_t frames = 0;
                int j, have;
                if (ks.k[k].written)
                    continue;
                if (!ks.k[k].src[0]) {
                    short silent[CHANNELS * 64];
                    memset(silent, 0, sizeof silent);
                    snprintf(path, sizeof path, "%s/silence.ssf", out_dir);
                    write_ssf(path, silent, 64);
                    ks.k[k].written = 1;
                    continue;
                }
                have = decode_sample(dec, folder, ks.k[k].src, &pcm, &frames);
                if (!have)
                    missing++;
                for (j = k; j < ks.n; j++) {
                    char base[260];
                    size_t a0, a1;
                    if (ks.k[j].written || strcmp(ks.k[j].src, ks.k[k].src) != 0)
                        continue;
                    ks.k[j].written = 1;
                    if (!have)
                        continue;
                    snprintf(base, sizeof base, "%s", ks.k[j].name);
                    base[strlen(base) - 4] = 0;                    /* .wav -> .ssf */
                    snprintf(path, sizeof path, "%s/%s.ssf", out_dir, base);
                    a0 = (size_t)(ks.k[j].start_ms * RATE / 1000);
                    a1 = ks.k[j].end_ms < 0 ? frames : (size_t)(ks.k[j].end_ms * RATE / 1000);
                    if (a1 > frames) a1 = frames;
                    if (a0 > a1) a0 = a1;
                    write_ssf(path, pcm + a0 * CHANNELS, a1 - a0);
                    wrote++;
                }
                free(pcm);
            }
            say(&log, "    notes %d (holds %d), auto %d, keysound slots %d (%d slices), "
                      "%d .ssf, worst rounding %.3f tick",
                notes, holds, autos, ks.n, slices, wrote, c->tl.worst_err);
            if (missing)
                say(&log, "  ! %d sample file(s) missing or undecodable", missing);
            if (ks.n > KEYSOUND_ORIGINAL)
                say(&log, "  ! %d keysound slots: over the original's 0x800 (fine for the port)", ks.n);
            if (unmapped)
                say(&log, "  ! %d note(s) on lanes this mode does not have play as auto notes", unmapped);
            if (dropped_up)
                say(&log, "  ! %d release note(s) dropped: EZ2AC has none", dropped_up);
        }
        written++;
        if (!first_info) {
            first_info = info;
            preview_events = events;
            n_preview_events = nevents;
            events = 0;
        }
        nch++;
        goto cleanup;
next_chart:
        ez2_json_free(c->doc);
        c->doc = 0;
cleanup:
        for (t = 0; t < TRACK_COUNT; t++) free(tracks[t].recs);
        free(ks.k);
        free(events);
    }
    free(files);
    if (!written) {
        for (fi = 0; fi < nch; fi++) { ez2_json_free(charts[fi].doc); free(charts[fi].tl.stops); free(charts[fi].tempo.pts); }
        free(preview_events);
        return 0;
    }

    /* the song's assets, from the first chart's info */
    {
        Chart *c0 = &charts[0];
        const ez2_json *bga = ez2_json_get(c0->doc, "bga");
        unsigned char *rgba = 0;
        int w = 0, h = 0;
        char assets[4][64] = { "", "", "", "" };
        char bga_file[PATHN] = "";
        int bga_start_ms = 0;

        if (load_image(dec, folder, ez2_json_str(first_info, "eyecatch_image", ""), &rgba, &w, &h) ||
            load_image(dec, folder, ez2_json_str(first_info, "title_image", ""), &rgba, &w, &h) ||
            load_image(dec, folder, ez2_json_str(first_info, "back_image", ""), &rgba, &w, &h)) {
            snprintf(path, sizeof path, "%s/disc.abm", out_dir);
            write_disc(rgba, w, h, path);
            snprintf(assets[0], sizeof assets[0], "disc.abm");
            free(rgba);
            rgba = 0;
            if (load_image(dec, folder, ez2_json_str(first_info, "title_image", ""), &rgba, &w, &h) ||
                load_image(dec, folder, ez2_json_str(first_info, "back_image", ""), &rgba, &w, &h) ||
                load_image(dec, folder, ez2_json_str(first_info, "eyecatch_image", ""), &rgba, &w, &h)) {
                snprintf(path, sizeof path, "%s/eyecatch.abm", out_dir);
                write_eyecatch(rgba, w, h, path);
                snprintf(assets[2], sizeof assets[2], "eyecatch.abm");
                free(rgba);
            }
        } else if (dec && dec->image)
            say(&log, "  ! no jacket image found; the disc is blank");
        snprintf(path, sizeof path, "%s/songname.abm", out_dir);
        write_plate(game_root, ez2_json_str(first_info, "title", key), path);
        snprintf(assets[1], sizeof assets[1], "songname.abm");
        snprintf(path, sizeof path, "%s/preview.ssf", out_dir);
        if (write_preview(c0, dec, folder, preview_events, n_preview_events, path, &log))
            snprintf(assets[3], sizeof assets[3], "preview.ssf");

        /* the movie: the first bga event's file, copied beside the charts */
        if (bga) {
            const ez2_json *hdr = ez2_json_get(bga, "bga_header");
            const ez2_json *evs = ez2_json_get(bga, "bga_events");
            const ez2_json *e, *first = 0;
            const char *name = 0;
            double first_y = 0;
            for (e = evs ? evs->first : 0; e; e = e->next)
                if (!first || ez2_json_num(e, "y", 0) < first_y) { first = e; first_y = ez2_json_num(e, "y", 0); }
            if (hdr) {
                int want_id = first ? (int)ez2_json_num(first, "id", -1) : -1;
                for (e = hdr->first; e; e = e->next)
                    if (!name || (int)ez2_json_num(e, "id", -2) == want_id)
                        name = ez2_json_str(e, "name", 0);
            }
            if (name) {
                const char *ext = strrchr(name, '.');
                char src[PATHN];
                int movie = ext && (ez2_ci_equal(ext, ".mp4") || ez2_ci_equal(ext, ".webm") || ez2_ci_equal(ext, ".mkv") ||
                                    ez2_ci_equal(ext, ".avi") || ez2_ci_equal(ext, ".wmv") || ez2_ci_equal(ext, ".mpg") ||
                                    ez2_ci_equal(ext, ".mpeg") || ez2_ci_equal(ext, ".mov"));
                if (movie && ez2_vfs_child(folder, name, src, sizeof src)) {
                    snprintf(path, sizeof path, "%s/%s", out_dir, base_name(src));
                    if (copy_file(src, path)) {
                        snprintf(bga_file, sizeof bga_file, "%s", base_name(src));
                        bga_start_ms = first ? (int)floor(tempo_seconds(&c0->tempo, tl_tick(&c0->tl, (long)first_y)) * 1000 + 0.5) : 0;
                    }
                } else if (name[0])
                    say(&log, "  ! background %s is not a movie; no BGA written", name);
            }
        }

        snprintf(path, sizeof path, "%s/song.ini", out_dir);
        ini = fopen(path, "wb");
        if (ini) {
            const char *genre = ez2_json_str(first_info, "genre", "");
            char genre_buf[128];
            size_t gl = strlen(genre);
            int i;

            /* some authors quote the genre ("aww"); the ini wants it bare */
            if (gl >= 2 && genre[0] == '"' && genre[gl - 1] == '"') {
                snprintf(genre_buf, sizeof genre_buf, "%.*s", (int)(gl - 2), genre + 1);
                genre = genre_buf;
            }
            fprintf(ini, "[Song]\nKey = %s\nTitle = %s\nArtist = %s\nGenre = %s\nSource = %s\nConverter = ez2 bmson import 1\n\n",
                    key, ez2_json_str(first_info, "title", key), ez2_json_str(first_info, "artist", ""),
                    genre, base_name(folder));
            fprintf(ini, "[Charts]\n");
            for (i = 0; i < nch; i++)
                fprintf(ini, "%s.%s = %d ; %s.ez\n", charts[i].mode->mode, tier_name(charts[i].tier),
                        charts[i].level, charts[i].stem);
            fprintf(ini, "\n[Assets]\n");
            if (assets[0][0]) fprintf(ini, "Disc = %s\n", assets[0]);
            if (assets[1][0]) fprintf(ini, "Songname = %s\n", assets[1]);
            if (assets[2][0]) fprintf(ini, "Eyecatch = %s\n", assets[2]);
            if (assets[3][0]) fprintf(ini, "Preview = %s\n", assets[3]);
            if (bga_file[0])
                fprintf(ini, "\n[Bga]\nFile = %s\nStartMs = %d\n", bga_file, bga_start_ms);
            fclose(ini);
        }
    }
    say(&log, "  wrote %d chart(s), song.ini", written);
    for (fi = 0; fi < nch; fi++) {
        ez2_json_free(charts[fi].doc);
        free(charts[fi].tl.stops);
        free(charts[fi].tempo.pts);
    }
    free(preview_events);
    return written;
}
