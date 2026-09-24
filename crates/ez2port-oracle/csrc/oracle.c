/* ez2port-oracle - EZ2PORT's own code, answering questions as JSON.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of EZ2BMS. Links third_party/ez2port-core (EZ2PORT's ez2core, vendored
 * unmodified); see that directory's PROVENANCE.md.
 *
 * WHY THIS EXISTS. EZ2BMS re-implements the formats and rules it needs in
 * TypeScript and Rust. "Re-implements" is a claim; this program turns it into
 * a test: every file EZ2BMS writes is read back here by the engine's own
 * parser, and every judgement the editor's Play mode makes can be replayed
 * through the engine's own scoring. It is built for tests only and never
 * ships.
 *
 * Every command prints ONE JSON document on stdout and exits 0, or prints a
 * reason on stderr and exits 2. Commands:
 *
 *   chart FILE                parse a PLAINTEXT .ez: header, tracks, records,
 *                             tempo points and each record's time in ms
 *   ezi FILE                  parse a plaintext .ezi
 *   songini FILE [MODE]       parse a plaintext chart .ini; with MODE (a port
 *                             mode name, e.g. StreetMix) also the values after
 *                             the mode bonus, measure scale and +3 widening
 *   ssf FILE                  header, frame count, FNV-1a-64 of the PCM
 *   abm FILE                  dimensions, variant, FNV-1a-64 of the RGBA
 *   abm-write RGB W H OUT     encode raw top-down RGB bytes with ez2_abm_write
 *   gds FILE                  the slots and lanes of a .gds
 *   pvi FILE                  the tracks, target bar and note art of a .pvi
 *   crypt enc|dec TABLE IN OUT  run the cipher with a 512-byte table file
 *   chart-id PATH             the mode/tier/song the port reads from a name
 *   mixparam                  stdin lines "level M A B V" / "pan P Q"
 *   score                     stdin: a script of score primitives (below)
 *   judge-sim EZ INI MODE OFFSET_MS JITTER_MS SEED
 *                             tools/ez2judge.c's synthetic player, without
 *                             the executable: plaintext files only
 *   bmson-import FOLDER GAME_ROOT OUT_ROOT [KEY]
 *                             run the port's own bmson importer (WAV-only:
 *                             no ffmpeg decoders), print its log lines
 *   keyconf [bare]            stdin: a keys.ini. Parsed over the defaults (as
 *                             ez2play and ez2input load it) or, with `bare`,
 *                             over nothing; every channel's alternates, the
 *                             turntables, and ez2_keyconf_format's text
 *   bindspec                  stdin: one binding token per line; each parsed
 *                             and formatted back
 *   portcfg FILE              a settings.ini read over the defaults: whether
 *                             it was read, and the input Debounce
 *   scroll                    stdin: a script of ez2/scroll.c calls (below);
 *                             one JSON array of what each line returned
 */
#include "ez2/abm.h"
#include "ez2/bmson.h"
#include "ez2/chart.h"
#include "ez2/crypt.h"
#include "ez2/ezi.h"
#include "ez2/bindspec.h"
#include "ez2/keyconf.h"
#include "ez2/file.h"
#include "ez2/gds.h"
#include "ez2/mixparam.h"
#include "ez2/mode.h"
#include "ez2/portcfg.h"
#include "ez2/pvi.h"
#include "ez2/ranking.h"
#include "ez2/score.h"
#include "ez2/scroll.h"
#include "ez2/selectwheel.h"
#include "ez2/songdb.h"
#include "ez2/songini.h"
#include "ez2/ssf.h"
#include "ez2/textspec.h"
#include "ez2/ttf.h"
#include "ez2/usersongs.h"
#include "ez2/util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ---- output helpers ------------------------------------------------------ */

static void jstr(const char *s)
{
    putchar('"');
    for (; s && *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\')
            printf("\\%c", c);
        else if (c < 0x20)
            printf("\\u%04x", c);
        else
            putchar(c);
    }
    putchar('"');
}

/* Floats print as the shortest text that reads back to the same float, so a
 * test can compare an f32 BPM exactly. %.9g is enough for any float. */
static void jfloat(float f) { printf("%.9g", (double)f); }
static void jdouble(double d) { printf("%.17g", d); }

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

static int fail(const char *what, const char *detail)
{
    fprintf(stderr, "ez2port-oracle: %s%s%s\n", what, detail ? ": " : "",
            detail ? detail : "");
    return 2;
}

static unsigned char *slurp(const char *path, size_t *n)
{
    return ez2_file_read(path, n);
}

static const char *jname(ez2_judgement j)
{
    switch (j) {
    case EZ2_J_NONE: return "NONE";
    case EZ2_J_KOOL: return "KOOL";
    case EZ2_J_COOL: return "COOL";
    case EZ2_J_GOOD: return "GOOD";
    case EZ2_J_FAIL: return "FAIL";
    case EZ2_J_MISS: return "MISS";
    }
    return "?";
}

static ez2_judgement jparse(const char *s)
{
    if (!strcmp(s, "KOOL")) return EZ2_J_KOOL;
    if (!strcmp(s, "COOL")) return EZ2_J_COOL;
    if (!strcmp(s, "GOOD")) return EZ2_J_GOOD;
    if (!strcmp(s, "FAIL")) return EZ2_J_FAIL;
    if (!strcmp(s, "MISS")) return EZ2_J_MISS;
    return EZ2_J_NONE;
}

/* ---- chart --------------------------------------------------------------- */

static int cmd_chart(const char *path)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    ez2_chart c;
    ez2_tempo tempo;
    int rc, t, j;

    if (!bytes)
        return fail("cannot read", path);
    rc = ez2_chart_parse(bytes, n, &c);
    if (rc != EZ2_CHART_OK) {
        free(bytes);
        return fail("chart", ez2_chart_strerror(rc));
    }
    ez2_tempo_build(&c, &tempo);

    printf("{\"version\":%d,\"name\":", c.version);
    jstr(c.name);
    printf(",\"name2\":");
    jstr(c.name2);
    printf(",\"ticks_per_measure\":%u,\"bpm\":", c.ticks_per_measure);
    jfloat(c.bpm);
    printf(",\"bpm2\":");
    jfloat(c.bpm2);
    printf(",\"total_ticks\":%u,\"track_count\":%d,\"record_size\":%d,\"tempo\":[",
           c.total_ticks, c.track_count, ez2_chart_record_size(c.version));
    for (j = 0; j < tempo.count; j++) {
        printf("%s{\"tick\":%u,\"bpm\":", j ? "," : "", tempo.points[j].tick);
        jfloat(tempo.points[j].bpm);
        putchar('}');
    }
    printf("],\"tracks\":[");
    for (t = 0; t < c.track_count; t++) {
        const ez2_track *tr = &c.tracks[t];
        printf("%s{\"name\":", t ? "," : "");
        jstr(tr->name);
        printf(",\"ticks\":%u,\"records\":[", tr->ticks);
        for (j = 0; j < tr->note_count; j++) {
            const ez2_note *e = &tr->notes[j];
            printf("%s{\"tick\":%u,\"type\":%u,\"ms\":", j ? "," : "", e->tick,
                   e->type);
            jdouble(ez2_tempo_ms(&tempo, e->tick, c.ticks_per_measure));
            switch (e->type) {
            case EZ2_NOTE_NOTE:
                printf(",\"key\":%u,\"vel\":%u,\"pan\":%u,\"kind\":%u,"
                       "\"length\":%u,\"hold_ticks\":%u",
                       e->key_index, e->velocity, e->pan, e->unknown, e->length,
                       ez2_note_hold_ticks(e));
                break;
            case EZ2_NOTE_BPM:
                printf(",\"bpm\":");
                jfloat(e->bpm);
                break;
            case EZ2_NOTE_VOLUME:
            case EZ2_NOTE_BEATS:
                printf(",\"value\":%u", e->value);
                break;
            default:
                if (e->type >= EZ2_NOTE_T6)
                    printf(",\"raw\":[%u,%u]", e->raw[0], e->raw[1]);
                break;
            }
            putchar('}');
        }
        printf("]}");
    }
    printf("]}\n");
    ez2_tempo_free(&tempo);
    ez2_chart_free(&c);
    free(bytes);
    return 0;
}

/* ---- ezi, songini, ssf ----------------------------------------------------- */

static int cmd_ezi(const char *path)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    ez2_ezi e;
    int rc, i;

    if (!bytes)
        return fail("cannot read", path);
    rc = ez2_ezi_parse((const char *)bytes, n, &e);
    free(bytes);
    if (rc != EZ2_EZI_OK)
        return fail("ezi", ez2_ezi_strerror(rc));
    printf("{\"entries\":[");
    for (i = 0; i < e.count; i++) {
        printf("%s{\"note\":%d,\"mode\":%d,\"name\":", i ? "," : "",
               e.entries[i].note, e.entries[i].mode);
        jstr(e.entries[i].name);
        if (e.entries[i].has_name2) {
            printf(",\"name2\":");
            jstr(e.entries[i].name2);
        }
        putchar('}');
    }
    printf("]}\n");
    ez2_ezi_free(&e);
    return 0;
}

static void print_ini(const ez2_song_ini *s)
{
    printf("{\"level\":%d,\"measure_scale\":", s->level);
    jfloat(s->measure_scale);
    printf(",\"kool\":%d,\"cool\":%d,\"good\":%d,\"miss\":%d", s->kool_ticks,
           s->cool_ticks, s->good_ticks, s->miss_ticks);
    printf(",\"gauge_kool\":");
    jfloat(s->gauge_kool);
    printf(",\"gauge_cool\":");
    jfloat(s->gauge_cool);
    printf(",\"gauge_good\":");
    jfloat(s->gauge_good);
    printf(",\"gauge_miss\":");
    jfloat(s->gauge_miss);
    printf(",\"gauge_fail\":");
    jfloat(s->gauge_fail);
    printf(",\"had_general\":%d,\"had_judgment\":%d,\"had_gauge\":%d}",
           s->had_general, s->had_judgment, s->had_gauge);
}

static int cmd_songini(const char *path, const char *mode)
{
    size_t n = 0;
    unsigned char *bytes = path[0] ? slurp(path, &n) : 0;
    ez2_song_ini ini;

    if (bytes)
        ez2_song_ini_parse((const char *)bytes, n, &ini);
    else
        ez2_song_ini_defaults(&ini);
    free(bytes);
    printf("{\"found\":%s,\"raw\":", bytes ? "true" : "false");
    print_ini(&ini);
    if (mode) {
        ez2_mode m = ez2_mode_from_name(mode);
        float scale;
        ez2_song_ini_apply_mode_bonus(&ini, m);
        scale = ez2_song_ini_apply_measure_scale(&ini, m);
        ez2_song_ini_apply_judge_widening(&ini, 0);
        printf(",\"mode\":%d,\"measure_scale_applied\":", (int)m);
        jfloat(scale);
        printf(",\"effective\":");
        print_ini(&ini);
    }
    printf("}\n");
    return 0;
}

static int cmd_ssf(const char *path)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    ez2_ssf s;
    int rc;

    if (!bytes)
        return fail("cannot read", path);
    rc = ez2_ssf_parse(bytes, n, &s);
    if (rc != EZ2_SSF_OK) {
        free(bytes);
        return fail("ssf", ez2_ssf_strerror(rc));
    }
    printf("{\"channels\":%d,\"sample_rate\":%d,\"byte_rate\":%d,"
           "\"block_align\":%d,\"bits\":%d,\"data_bytes\":%lu,\"frames\":%lu,"
           "\"pcm_fnv1a64\":\"%016llx\"}\n",
           s.channels, s.sample_rate, s.byte_rate, s.block_align, s.bits,
           (unsigned long)s.data_bytes, (unsigned long)ez2_ssf_frames(&s),
           fnv1a64(s.data, s.data_bytes));
    free(bytes);
    return 0;
}

/* ---- abm ----------------------------------------------------------------- */

static int cmd_abm(const char *path)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    ez2_image img;
    int rc;

    if (!bytes)
        return fail("cannot read", path);
    memset(&img, 0, sizeof img);
    rc = ez2_abm_decode(bytes, n, &img);
    free(bytes);
    if (rc != EZ2_ABM_OK)
        return fail("abm", ez2_abm_strerror(rc));
    printf("{\"width\":%d,\"height\":%d,\"bpp\":%d,\"version\":%d,"
           "\"version_name\":",
           img.width, img.height, img.bpp, img.version);
    jstr(ez2_abm_version_name(img.version));
    printf(",\"has_alpha\":%d,\"rgba_fnv1a64\":\"%016llx\"}\n", img.has_alpha,
           fnv1a64(img.rgba, (size_t)img.width * (size_t)img.height * 4u));
    ez2_image_free(&img);
    return 0;
}

static int cmd_abm_write(const char *rgb_path, int w, int h, const char *out)
{
    size_t n;
    unsigned char *rgb = slurp(rgb_path, &n);
    int rc;

    if (!rgb)
        return fail("cannot read", rgb_path);
    if (w <= 0 || h <= 0 || n < (size_t)w * (size_t)h * 3u) {
        free(rgb);
        return fail("abm-write", "RGB buffer smaller than W*H*3");
    }
    rc = ez2_abm_write(out, rgb, w, h);   /* 1 = written (not an EZ2_ABM_* code) */
    free(rgb);
    if (rc != 1)
        return fail("abm-write", "cannot write");
    printf("{\"ok\":true}\n");
    return 0;
}

/* ---- gds, pvi ------------------------------------------------------------- */

static int cmd_gds(const char *path)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    ez2_gds g;
    int rc, s, i;

    if (!bytes)
        return fail("cannot read", path);
    rc = ez2_gds_parse((const char *)bytes, n, &g);
    free(bytes);
    if (rc != EZ2_GDS_OK)
        return fail("gds", "parse failed");
    printf("{\"slot_count\":%d,\"slots_seen\":%d,\"slots\":[", g.slot_count,
           g.slots_seen);
    for (s = 0; s < g.slots_seen && s < EZ2_GDS_MAX_SLOTS; s++) {
        printf("%s{\"declared\":%d,\"lanes\":[", s ? "," : "",
               g.slots[s].declared);
        for (i = 0; i < g.slots[s].count; i++)
            printf("%s{\"key\":%d,\"key2\":%d,\"track\":%d}", i ? "," : "",
                   g.slots[s].lanes[i].key, g.slots[s].lanes[i].key2,
                   g.slots[s].lanes[i].track);
        printf("]}");
    }
    printf("]}\n");
    return 0;
}

static void print_color(const char *k, ez2_pvi_color c)
{
    printf(",\"%s\":[%d,%d,%d,%d]", k, c.r, c.g, c.b, c.a);
}

static int cmd_pvi(const char *path)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    static ez2_pvi p;   /* ~40 KB: keep it off the stack */
    int rc, i, k;

    if (!bytes)
        return fail("cannot read", path);
    rc = ez2_pvi_parse((const char *)bytes, n, &p);   /* 1 = parsed */
    free(bytes);
    if (rc != 1)
        return fail("pvi", "not a .pvi (no [General] section)");
    printf("{\"track_count\":%d,\"tracks\":[", p.track_count);
    for (i = 0; i < EZ2_PVI_TRACKS; i++) {
        const ez2_pvi_track *t = &p.tracks[i];
        printf("%s{\"present\":%d,\"enable\":%d,\"x\":%d,\"y\":%d,\"w\":%d,"
               "\"h\":%d",
               i ? "," : "", t->present, t->enable, t->x, t->y, t->w, t->h);
        print_color("bk1", t->bk1);
        print_color("bk2", t->bk2);
        printf(",\"left_line_w\":%d,\"right_line_w\":%d", t->left_line_w,
               t->right_line_w);
        print_color("left_line", t->left_line);
        print_color("right_line", t->right_line);
        printf(",\"press_x\":%d,\"press_y\":%d,\"press_tex\":", t->press_x,
               t->press_y);
        jstr(t->press_tex);
        printf(",\"bar_tex\":");
        jstr(t->bar_tex);
        printf(",\"bar_max_h\":%d,\"bar_grow\":%d,\"bar_shrink\":%d",
               t->bar_max_h, t->bar_grow, t->bar_shrink);
        printf(",\"note_tex\":[");
        for (k = 0; k < t->note_style_count && k < EZ2_PVI_NOTE_STYLES; k++) {
            if (k)
                putchar(',');
            jstr(t->note_tex[k]);
        }
        printf("]}");
    }
    printf("],\"target\":{\"present\":%d,\"enable\":%d,\"bars\":[",
           p.target.present, p.target.enable);
    for (i = 0; i < p.target.count && i < EZ2_PVI_TARGET_BARS; i++) {
        printf("%s{\"x\":%d,\"y\":%d,\"w\":%d,\"h\":%d,\"tex\":", i ? "," : "",
               p.target.bars[i].x, p.target.bars[i].y, p.target.bars[i].w,
               p.target.bars[i].h);
        jstr(p.target.bars[i].tex);
        putchar('}');
    }
    printf("]},\"measure\":{\"present\":%d,\"enable\":%d,\"w\":%d,\"h\":%d},"
           "\"unknown_sections\":%d}\n",
           p.measure.present, p.measure.enable, p.measure.w, p.measure.h,
           p.unknown_sections);
    return 0;
}

/* ---- crypt --------------------------------------------------------------- */

static int cmd_crypt(const char *dir, const char *table_path, const char *in,
                     const char *out)
{
    size_t tn, n;
    unsigned char *table = slurp(table_path, &tn);
    unsigned char *data, *res;
    ez2_keytable key;
    FILE *f;

    if (!table || tn != EZ2_KEYTABLE_SIZE) {
        free(table);
        return fail("crypt", "the table file must be exactly 512 bytes");
    }
    memcpy(key.t, table, EZ2_KEYTABLE_SIZE);
    free(table);
    data = slurp(in, &n);
    if (!data)
        return fail("cannot read", in);
    res = (unsigned char *)malloc(n ? n : 1);
    if (!strcmp(dir, "enc"))
        ez2_encrypt(data, n, res, &key);
    else
        ez2_decrypt(data, n, res, &key);
    f = fopen(out, "wb");
    if (!f || fwrite(res, 1, n, f) != n) {
        free(data);
        free(res);
        if (f)
            fclose(f);
        return fail("cannot write", out);
    }
    fclose(f);
    printf("{\"bytes\":%lu}\n", (unsigned long)n);
    free(data);
    free(res);
    return 0;
}

/* ---- chart-id ------------------------------------------------------------ */

static int cmd_chart_id(const char *path)
{
    ez2_chart_id id;
    int rc = ez2_chart_id_parse(path, &id);

    printf("{\"ok\":%s,\"mode\":%d,\"mode_name\":", rc ? "true" : "false",
           (int)id.mode);
    jstr(id.mode_name);
    printf(",\"players\":%d,\"tier\":%d,\"song\":", id.players, (int)id.tier);
    jstr(id.song);
    printf(",\"stem\":");
    jstr(id.stem);
    printf(",\"suffix\":");
    jstr(id.suffix);
    printf("}\n");
    return 0;
}

/* ---- mixparam: one answer per stdin line ---------------------------------- */

static int cmd_mixparam(void)
{
    char line[256];
    int first = 1;

    printf("[");
    while (fgets(line, sizeof line, stdin)) {
        int a, b, c, d;
        if (sscanf(line, "level %d %d %d %d", &a, &b, &c, &d) == 4)
            printf("%s%d", first ? "" : ",", ez2_ds_level(a, b, c, d));
        else if (sscanf(line, "pan %d %d", &a, &b) == 2)
            printf("%s%d", first ? "" : ",", ez2_ds_pan(a, b));
        else
            continue;
        first = 0;
    }
    printf("]\n");
    return 0;
}

/* ---- score: a script of primitives on stdin --------------------------------
 *
 * One command per line; each prints one JSON value into an array. The script
 * drives ez2/score.c exactly as a play loop would, so the TypeScript port can
 * be compared call for call.
 *
 *   ini K C G M GK GC GG GM GF   set the (already widened) windows and rates
 *   model keys|catch|cv2|alt     choose the score model (resets the score)
 *   reset                        ez2_score_init(100, 100)
 *   judge DT_TICKS               -> judgement name
 *   judge_ms DT_MS BPM           -> judgement name
 *   apply J                      ez2_score_apply, -> state
 *   press LANE J RAW START KIND  ez2_score_hold_press (192 ticks/measure), -> state
 *   held LANE 0|1                ez2_score_hold_set_held, -> state
 *   advance NOW_TICK             ez2_score_hold_advance, -> state
 *   step KIND RAW                ez2_hold_step
 *   inst KIND RAW FLAGS          ez2_hold_instalments
 *   counted KIND RAW FLAGS       ez2_note_counted
 *   rate NOTES / grade NOTES / max NOTES   -> number
 *   state                        -> state
 */
static ez2_song_ini g_ini;
static ez2_score g_sc;

static void print_state(void)
{
    int i;
    printf("{\"counts\":[");
    for (i = 0; i < 6; i++)
        printf("%s%ld", i ? "," : "", g_sc.counts[i]);
    printf("],\"notes\":%ld,\"combo\":%ld,\"max_combo\":%ld,\"score\":%ld,"
           "\"gauge\":",
           g_sc.notes, g_sc.combo, g_sc.max_combo, g_sc.score);
    jfloat(g_sc.gauge);
    printf(",\"failed\":%d,\"pending\":%ld,\"hold_paid\":%ld}", g_sc.failed,
           ez2_score_hold_pending(&g_sc), g_sc.hold_paid);
}

static int cmd_score(void)
{
    char line[512], a[32];
    int first = 1;

    ez2_song_ini_defaults(&g_ini);
    ez2_song_ini_apply_judge_widening(&g_ini, 0);
    ez2_score_init(&g_sc, EZ2_GAUGE_MAX, EZ2_GAUGE_MAX);
    printf("[");
    while (fgets(line, sizeof line, stdin)) {
        char cmd[32];
        double x, y;
        int i1, i2, i3, i4;
        unsigned u;
        long notes;

        if (sscanf(line, "%31s", cmd) != 1)
            continue;
#define SEP() do { if (!first) putchar(','); first = 0; } while (0)
        if (!strcmp(cmd, "ini")) {
            int k, c, g, m;
            float gk, gc, gg, gm, gf;
            if (sscanf(line, "ini %d %d %d %d %f %f %f %f %f", &k, &c, &g, &m,
                       &gk, &gc, &gg, &gm, &gf) == 9) {
                g_ini.kool_ticks = k;
                g_ini.cool_ticks = c;
                g_ini.good_ticks = g;
                g_ini.miss_ticks = m;
                g_ini.gauge_kool = gk;
                g_ini.gauge_cool = gc;
                g_ini.gauge_good = gg;
                g_ini.gauge_miss = gm;
                g_ini.gauge_fail = gf;
            }
            SEP();
            printf("null");
        } else if (!strcmp(cmd, "model") && sscanf(line, "model %31s", a) == 1) {
            ez2_score_init(&g_sc, EZ2_GAUGE_MAX, EZ2_GAUGE_MAX);
            ez2_score_set_model(&g_sc, !strcmp(a, "catch") ? EZ2_SCORE_CATCH
                                     : !strcmp(a, "cv2")   ? EZ2_SCORE_CV2
                                     : !strcmp(a, "alt")   ? EZ2_SCORE_KEYS_ALT
                                                           : EZ2_SCORE_KEYS);
            SEP();
            printf("null");
        } else if (!strcmp(cmd, "reset")) {
            ez2_score_init(&g_sc, EZ2_GAUGE_MAX, EZ2_GAUGE_MAX);
            SEP();
            printf("null");
        } else if (!strcmp(cmd, "judge") && sscanf(line, "judge %lf", &x) == 1) {
            SEP();
            printf("\"%s\"", jname(ez2_judge(x, &g_ini)));
        } else if (!strcmp(cmd, "judge_ms") &&
                   sscanf(line, "judge_ms %lf %lf", &x, &y) == 2) {
            SEP();
            printf("\"%s\"", jname(ez2_judge_ms(x, y, &g_ini)));
        } else if (!strcmp(cmd, "apply") && sscanf(line, "apply %31s", a) == 1) {
            ez2_score_apply(&g_sc, jparse(a), &g_ini);
            SEP();
            print_state();
        } else if (!strcmp(cmd, "press") &&
                   sscanf(line, "press %d %31s %d %d %d", &i1, a, &i2, &i3, &i4) == 5) {
            ez2_score_hold_press(&g_sc, i1, jparse(a), (unsigned)i2, (unsigned)i3,
                                 i4, 192, &g_ini);
            SEP();
            print_state();
        } else if (!strcmp(cmd, "held") && sscanf(line, "held %d %d", &i1, &i2) == 2) {
            ez2_score_hold_set_held(&g_sc, i1, i2);
            SEP();
            print_state();
        } else if (!strcmp(cmd, "advance") && sscanf(line, "advance %u", &u) == 1) {
            ez2_score_hold_advance(&g_sc, u, &g_ini);
            SEP();
            print_state();
        } else if (!strcmp(cmd, "step") && sscanf(line, "step %d %d", &i1, &i2) == 2) {
            SEP();
            printf("%u", ez2_hold_step(i1, 192, (unsigned)i2));
        } else if (!strcmp(cmd, "inst") &&
                   sscanf(line, "inst %d %d %d", &i1, &i2, &i3) == 3) {
            SEP();
            printf("%ld", ez2_hold_instalments(i1, 192, (unsigned)i2, i3));
        } else if (!strcmp(cmd, "counted") &&
                   sscanf(line, "counted %d %d %d", &i1, &i2, &i3) == 3) {
            SEP();
            printf("%ld", ez2_note_counted(i1, 192, (unsigned)i2, i3));
        } else if (!strcmp(cmd, "rate") && sscanf(line, "rate %ld", &notes) == 1) {
            SEP();
            jdouble(ez2_score_rate(&g_sc, notes));
        } else if (!strcmp(cmd, "grade") && sscanf(line, "grade %ld", &notes) == 1) {
            int g = ez2_score_grade(&g_sc, notes);
            SEP();
            printf("{\"grade\":%d,\"name\":", g);
            jstr(ez2_score_grade_name(&g_sc, g));
            putchar('}');
        } else if (!strcmp(cmd, "max") && sscanf(line, "max %ld", &notes) == 1) {
            SEP();
            printf("%ld", ez2_score_max_for(ez2_score_model_of(&g_sc), notes));
        } else if (!strcmp(cmd, "state")) {
            SEP();
            print_state();
        }
#undef SEP
    }
    printf("]\n");
    return 0;
}

/* ---- judge-sim: tools/ez2judge.c's synthetic player -------------------------
 *
 * Lifted from ez2judge's main loop (third_party/ez2port-core/tools/ez2judge.c,
 * lines ~440-560) with the executable, song table, note-order and catch
 * branches removed: plaintext files only, lanes from the built-in mode table
 * or a .gds given through the environment (EZ2_GDS). Same RNG, same order,
 * same calls - so the editor's autoplay/offset simulation can be compared
 * number for number. */
static unsigned int rng_state = 1;
static double jitter_next(double amplitude_ms)
{
    rng_state = rng_state * 1664525u + 1013904223u;
    return ((double)(rng_state >> 8) / 16777216.0 * 2.0 - 1.0) * amplitude_ms;
}

static int cmd_judge_sim(const char *ez, const char *ini_path, const char *mode_name,
                         double offset_ms, double jitter_ms, unsigned seed)
{
    size_t n, ini_n = 0;
    unsigned char *bytes = slurp(ez, &n), *ini_text;
    ez2_chart chart;
    ez2_tempo tempo;
    ez2_song_ini ini;
    ez2_score sc;
    ez2_mode mode = ez2_mode_from_name(mode_name);
    int lanes[64], lane_count = 0, t, j;
    long total_notes = 0, holds = 0, hold_ticks = 0, backing = 0;
    const char *gds_path = getenv("EZ2_GDS");

    rng_state = seed;
    if (!bytes || ez2_chart_parse(bytes, n, &chart) != EZ2_CHART_OK) {
        free(bytes);
        return fail("cannot read as a chart", ez);
    }
    ini_text = ini_path[0] ? slurp(ini_path, &ini_n) : 0;
    if (ini_text)
        ez2_song_ini_parse((const char *)ini_text, ini_n, &ini);
    else
        ez2_song_ini_defaults(&ini);
    free(ini_text);
    ez2_song_ini_apply_judge_widening(&ini, 0);
    ez2_tempo_build(&chart, &tempo);
    ez2_song_ini_apply_mode_bonus(&ini, mode);
    ez2_song_ini_apply_measure_scale(&ini, mode);

    if (gds_path && gds_path[0]) {
        size_t gn;
        unsigned char *gt = slurp(gds_path, &gn);
        ez2_gds g;
        if (gt && ez2_gds_parse((const char *)gt, gn, &g) == EZ2_GDS_OK)
            lane_count = ez2_gds_lanes(&g, 0, lanes, 64);
        free(gt);
    }
    if (lane_count == 0)
        lane_count = ez2_mode_lanes(mode, lanes, 64);

    ez2_score_init(&sc, EZ2_GAUGE_MAX, EZ2_GAUGE_MAX);
    for (t = 0; t < chart.track_count; t++) {
        int is_lane = 0, L;
        for (L = 0; L < lane_count; L++)
            if (lanes[L] == t) { is_lane = 1; break; }
        for (j = 0; j < chart.tracks[t].note_count; j++) {
            const ez2_note *e = &chart.tracks[t].notes[j];
            double dt;
            ez2_judgement verdict;
            unsigned int hold;

            if (e->type != EZ2_NOTE_NOTE)
                continue;
            if (!is_lane) {
                backing++;
                continue;
            }
            total_notes += ez2_note_counted(e->unknown, chart.ticks_per_measure,
                                            (unsigned)e->length, 0);
            dt = offset_ms + (jitter_ms > 0.0 ? jitter_next(jitter_ms) : 0.0);
            verdict = ez2_judge_ms(dt, ez2_tempo_bpm_at(&tempo, e->tick), &ini);
            if (verdict == EZ2_J_NONE)
                verdict = EZ2_JUDGE_UNHIT;
            ez2_score_apply(&sc, verdict, &ini);
            hold = ez2_note_hold_ticks(e);
            if (hold && verdict != EZ2_J_MISS) {
                long cnt = ez2_hold_instalments(e->unknown, chart.ticks_per_measure,
                                                hold + 6, 0);
                ez2_judgement g = verdict == EZ2_J_COOL ? EZ2_J_KOOL : verdict;
                long k;
                holds++;
                hold_ticks += cnt;
                if (e->unknown == 6) {
                    if (g == EZ2_J_KOOL)
                        ez2_score_apply(&sc, g, &ini);
                } else {
                    for (k = 0; k < cnt; k++)
                        ez2_score_apply(&sc, g, &ini);
                }
            }
        }
    }

    printf("{\"mode\":%d,\"lanes\":[", (int)mode);
    for (t = 0; t < lane_count; t++)
        printf("%s%d", t ? "," : "", lanes[t]);
    printf("],\"windows\":[%d,%d,%d,%d],\"total_notes\":%ld,\"holds\":%ld,"
           "\"instalments\":%ld,\"backing\":%ld,\"counts\":[",
           ini.kool_ticks, ini.cool_ticks, ini.good_ticks, ini.miss_ticks,
           total_notes, holds, hold_ticks, backing);
    for (t = 0; t < 6; t++)
        printf("%s%ld", t ? "," : "", sc.counts[t]);
    printf("],\"max_combo\":%ld,\"score\":%ld,\"max\":%ld,\"gauge\":",
           sc.max_combo, sc.score,
           ez2_score_max_for(ez2_score_model_of(&sc), total_notes));
    jfloat(sc.gauge);
    printf(",\"failed\":%d,\"rate\":", sc.failed);
    jdouble(ez2_score_rate(&sc, total_notes));
    printf(",\"grade\":");
    jstr(ez2_score_grade_name(&sc, ez2_score_grade(&sc, total_notes)));
    printf("}\n");
    ez2_tempo_free(&tempo);
    ez2_chart_free(&chart);
    free(bytes);
    return 0;
}

/* ---- bmson-import -------------------------------------------------------- */

static void log_line(const char *line, void *user)
{
    int *first = (int *)user;
    printf("%s", *first ? "" : ",");
    *first = 0;
    jstr(line);
}

/* Images for the importer's art (disc, eyecatch), from a test's raw file:
 * "RGBA", u32 LE width, u32 LE height, then top-down RGBA. The port leaves
 * image decoding to its host (bmson.h ez2_bmson_decoders); this stands in
 * for it so the art steps themselves can be compared. */
static int rgba_image(const char *path, unsigned char **rgba, int *w, int *h)
{
    size_t n = 0;
    unsigned char *b = slurp(path, &n);
    unsigned ww, hh;

    if (!b || n < 12 || memcmp(b, "RGBA", 4)) {
        free(b);
        return 0;
    }
    ww = b[4] | b[5] << 8 | b[6] << 16 | (unsigned)b[7] << 24;
    hh = b[8] | b[9] << 8 | b[10] << 16 | (unsigned)b[11] << 24;
    if (!ww || !hh || n < 12 + (size_t)ww * hh * 4) {
        free(b);
        return 0;
    }
    *rgba = (unsigned char *)malloc((size_t)ww * hh * 4);
    if (!*rgba) {
        free(b);
        return 0;
    }
    memcpy(*rgba, b + 12, (size_t)ww * hh * 4);
    *w = (int)ww;
    *h = (int)hh;
    free(b);
    return 1;
}

static int cmd_bmson_import(const char *folder, const char *game_root,
                            const char *out_root, const char *key, int images)
{
    char key_out[64] = "";
    int first = 1, rc;
    ez2_bmson_decoders dec = { 0, rgba_image };

    printf("{\"log\":[");
    rc = ez2_bmson_import(folder, game_root, out_root, key, images ? &dec : 0, log_line,
                          &first, key_out, sizeof key_out);
    printf("],\"rc\":%d,\"key\":", rc);
    jstr(key_out);
    printf("}\n");
    return 0;
}


/* ---- usersongs ------------------------------------------------------------ */

/* A songs root as the port lists it for one mode: every package the merge
 * adds (key, title, the four tier levels), the category bank it lands in and
 * whether the bank view keeps it (NM level above 0), the assets and movie it
 * resolves, and where its ranking tables go. `shipped` is a comma list of
 * keys to pretend song.bin already has (the merge must skip them). Paths are
 * printed relative to ROOT. */
static void jrel(const char *root, const char *path)
{
    size_t n = strlen(root);
    if (strncmp(path, root, n) == 0 && (path[n] == '/' || path[n] == '\\'))
        jstr(path + n + 1);
    else
        jstr(path);
}

static int write_file(const char *path, const unsigned char *b, size_t n)
{
    FILE *f = fopen(path, "wb");
    int ok = f && fwrite(b, 1, n, f) == n;
    if (f)
        fclose(f);
    return ok;
}

/* One line through ez2_ttf_render_box, white on black: the plate
 * renderer's core. `text` comes from a file (any bytes, no shell quoting);
 * the RGB goes to OUT. */
static int cmd_ttf(const char *font, const char *text_path, int w, int h, int x,
                   int baseline, float cap, int align, int max_width, const char *out)
{
    size_t n = 0;
    unsigned char *text = slurp(text_path, &n), *rgb;
    char *z;
    int ok;

    if (!text || w <= 0 || h <= 0) {
        free(text);
        printf("{\"error\":\"bad input\"}\n");
        return 1;
    }
    z = (char *)malloc(n + 1);
    rgb = (unsigned char *)calloc((size_t)w * h * 3, 1);
    if (!z || !rgb) {
        free(text); free(z); free(rgb);
        return 1;
    }
    memcpy(z, text, n);
    z[n] = 0;
    ok = ez2_ttf_render_box(font, z, rgb, w, h, x, baseline, cap, align, max_width);
    if (ok)
        ok = write_file(out, rgb, (size_t)w * h * 3);
    printf("{\"ok\":%d}\n", ok);
    free(text); free(z); free(rgb);
    return ok ? 0 : 1;
}

/* A plate through the port's manifest path: ez2_textspec_load(DIR) then
 * ez2_textspec_render(REL, SCALE), the RGBA to OUT. */
static int cmd_textspec(const char *dir, const char *rel, int scale, const char *out)
{
    int w = 0, h = 0, lw = 0, lh = 0, count = ez2_textspec_load(dir, 0);
    unsigned char *rgba = count ? ez2_textspec_render(rel, scale, &w, &h, &lw, &lh) : 0;

    if (!rgba) {
        printf("{\"entries\":%d,\"rendered\":0}\n", count);
        ez2_textspec_unload();
        return 0;
    }
    if (!write_file(out, rgba, (size_t)w * h * 4)) {
        free(rgba);
        return 1;
    }
    printf("{\"entries\":%d,\"rendered\":1,\"w\":%d,\"h\":%d}\n", count, w, h);
    free(rgba);
    ez2_textspec_unload();
    return 0;
}

/* The select screen's arithmetic (ez2/selectwheel.c). Floats print with
 * %.9g, which round-trips a float exactly. */
static int cmd_select_wheel(int count, float scroll)
{
    ez2_select_wheel w;
    int i, first = 1, slots;

    ez2_select_wheel_init(&w, count, 0);
    w.scroll = scroll;
    printf("{\"place\":[");
    for (i = 0; i < w.count; i++) {
        ez2_select_place p;
        if (!ez2_select_wheel_place(&w, i, &p))
            continue;
        printf("%s[%d,%.9g,%.9g,%.9g,%d]", first ? "" : ",", i, p.x, p.y, p.size, p.bright);
        first = 0;
    }
    printf("],\"rail\":[");
    first = 1;
    slots = ez2_select_rail_slots(&w);
    for (i = 0; i < slots; i++) {
        ez2_select_rail r;
        if (!ez2_select_rail_place(&w, i, &r))
            continue;
        printf("%s[%d,%d,%.9g,%.9g,%d]", first ? "" : ",", i, r.entry, r.x, r.y, r.bright);
        first = 0;
    }
    printf("]}\n");
    return 0;
}

/* The scroll, frame by frame, after the cursor moves FROM -> TO. */
static int cmd_select_chase(int count, int from, int to, int ticks)
{
    ez2_select_wheel w;
    int t;

    ez2_select_wheel_init(&w, count, from);
    w.cursor = ((to % w.count) + w.count) % w.count;
    printf("[");
    for (t = 0; t < ticks; t++) {
        ez2_select_wheel_chase(&w);
        printf("%s%.9g", t ? "," : "", w.scroll);
    }
    printf("]\n");
    return 0;
}

/* The focused disc's swing, frame by frame, from a latch (angle 0, step
 * -30), each character of DIFFS the tier index that frame. */
static int cmd_select_swing(const char *diffs)
{
    float angle = 0.0f, step = -30.0f;
    int cur = 0, t;

    printf("[");
    for (t = 0; diffs[t]; t++) {
        int di = diffs[t] - '0';
        if (di != cur) {
            step = 0.0f - step;
            cur = di;
        }
        ez2_select_swing_tick(cur, &angle, &step);
        printf("%s[%.9g,%.9g]", t ? "," : "", angle, step);
    }
    printf("]\n");
    return 0;
}

static int cmd_usersongs(const char *root, const char *mode, const char *shipped)
{
    static const char *const kinds[4] = { "Disc", "Songname", "Eyecatch", "Preview" };
    ez2_songdb db;
    int added, i, g, t, a;

    memset(&db, 0, sizeof db);
    if (shipped && shipped[0]) {
        const char *p = shipped;
        while (*p) {
            const char *end = strchr(p, ',');
            size_t len = end ? (size_t)(end - p) : strlen(p);
            ez2_song_entry *e = (ez2_song_entry *)realloc(
                db.entries, (size_t)(db.count + 1) * sizeof *e);
            if (!e)
                return 1;
            db.entries = e;
            e = &db.entries[db.count++];
            memset(e, 0, sizeof *e);
            snprintf(e->key, sizeof e->key, "%.*s", (int)len, p);
            e->steps[0].level = 1;
            p = end ? end + 1 : p + len;
        }
    }
    ez2_usersongs_set_root(root);
    added = ez2_usersongs_merge(&db, mode);
    printf("{\"added\":%d,\"entries\":[", added);
    for (i = 0; i < db.count; i++) {
        const ez2_song_entry *e = &db.entries[i];
        char path[2048];
        int start_ms = 0, first = 1, view[4096], nview;

        printf("%s{\"key\":", i ? "," : "");
        jstr(e->key);
        printf(",\"name\":");
        jstr(e->name);
        printf(",\"levels\":[%d,%d,%d,%d],\"groups\":[", e->steps[0].level,
               e->steps[1].level, e->steps[2].level, e->steps[3].level);
        for (g = 0; g < EZ2_SONGDB_GROUPS; g++) {
            int k;
            for (k = 0; k < db.groups[g].count; k++)
                if (ez2_ci_equal(db.groups[g].keys[k], e->key)) {
                    printf("%s%d", first ? "" : ",", g + 1);
                    first = 0;
                }
        }
        printf("],\"listed\":[");
        first = 1;
        for (g = 0; g < EZ2_SONGDB_GROUPS; g++) {
            int k;
            nview = ez2_songdb_category_view(&db, g, view, 4096);
            for (k = 0; k < nview; k++)
                if (view[k] == i) {
                    printf("%s%d", first ? "" : ",", g + 1);
                    first = 0;
                }
        }
        printf("],\"assets\":{");
        for (a = 0; a < 4; a++) {
            printf("%s\"%s\":", a ? "," : "", kinds[a]);
            if (ez2_usersongs_asset(e->key, kinds[a], path, sizeof path))
                jrel(root, path);
            else
                printf("null");
        }
        printf("},\"bga\":");
        if (ez2_usersongs_bga(e->key, path, sizeof path, &start_ms)) {
            printf("{\"file\":");
            jrel(root, path);
            printf(",\"start_ms\":%d}", start_ms);
        } else {
            printf("null");
        }
        printf(",\"rank\":[");
        for (t = 0; t < 4; t++) {
            if (t)
                printf(",");
            if (ez2_ranking_path(root, mode, e->key, t, path, sizeof path))
                jrel(root, path);
            else
                printf("null");
        }
        printf("]}");
    }
    printf("]}\n");
    ez2_songdb_free(&db);
    return 0;
}

/* ---- song.bin ------------------------------------------------------------ */

static void print_songdb(const ez2_songdb *db)
{
    int i, s, g, k;

    printf("{\"entries\":[");
    for (i = 0; i < db->count; i++) {
        const ez2_song_entry *e = &db->entries[i];
        printf("%s{\"key\":", i ? "," : "");
        jstr(e->key);
        printf(",\"name\":");
        jstr(e->name);
        printf(",\"kind\":%d,\"steps\":[", e->kind);
        for (s = 0; s < EZ2_SONGDB_STEPS; s++) {
            printf("%s{\"level\":%d,\"a\":", s ? "," : "", e->steps[s].level);
            jfloat(e->steps[s].a);
            printf(",\"b\":");
            jfloat(e->steps[s].b);
            putchar('}');
        }
        printf("]}");
    }
    printf("],\"groups\":[");
    for (g = 0; g < EZ2_SONGDB_CATEGORIES; g++) {
        printf("%s[", g ? "," : "");
        for (k = 0; k < db->groups[g].count; k++) {
            if (k)
                putchar(',');
            jstr(db->groups[g].keys[k]);
        }
        putchar(']');
    }
    printf("],\"views\":[");
    for (g = 0; g < EZ2_SONGDB_CATEGORIES; g++) {
        int view[4096], n = ez2_songdb_category_view(db, g, view, 4096);
        printf("%s[", g ? "," : "");
        for (k = 0; k < n; k++)
            printf("%s%d", k ? "," : "", view[k]);
        putchar(']');
    }
    printf("]}");
}

/* songdb FILE: a decrypted song.bin, parsed. */
static int cmd_songdb(const char *path)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    ez2_songdb db;
    int rc;

    if (!bytes)
        return fail("cannot read", path);
    rc = ez2_songdb_parse(bytes, n, &db);
    free(bytes);
    if (rc != EZ2_SONGDB_OK)
        return fail("songdb", ez2_songdb_strerror(rc));
    print_songdb(&db);
    putchar('\n');
    ez2_songdb_free(&db);
    return 0;
}

/* songdb-crypt FILE TABLES: FILE through ez2_songdb_decrypt with the 64
 * bytes of TABLES (made up by the test: never the game's), as hex. */
static int cmd_songdb_crypt(const char *path, const char *tables_path)
{
    size_t n, tn;
    unsigned char *bytes = slurp(path, &n);
    unsigned char *tables = slurp(tables_path, &tn);
    size_t i;

    if (!bytes || !tables || tn != EZ2_SONGDB_TABLE_SIZE) {
        free(bytes);
        free(tables);
        return fail("cannot read", "file or 64-byte tables");
    }
    ez2_songdb_decrypt(bytes, n, tables);
    printf("{\"hex\":\"");
    for (i = 0; i < n; i++)
        printf("%02x", bytes[i]);
    printf("\"}\n");
    free(bytes);
    free(tables);
    return 0;
}

/* songdb-charts FILE ROOT MODE: for every entry of a decrypted song.bin, the
 * charts ez2_songdb_charts finds for MODE under ROOT (paths relative to ROOT). */
static int cmd_songdb_charts(const char *path, const char *root, const char *mode)
{
    size_t n;
    unsigned char *bytes = slurp(path, &n);
    ez2_songdb db;
    int rc, i, k;

    if (!bytes)
        return fail("cannot read", path);
    rc = ez2_songdb_parse(bytes, n, &db);
    free(bytes);
    if (rc != EZ2_SONGDB_OK)
        return fail("songdb", ez2_songdb_strerror(rc));
    printf("{\"entries\":[");
    for (i = 0; i < db.count; i++) {
        ez2_song_chart out[8];
        char dir[2048];
        int m = ez2_songdb_charts(root, &db.entries[i], mode, 1, out, 8);
        printf("%s{\"key\":", i ? "," : "");
        jstr(db.entries[i].key);
        printf(",\"dir\":");
        if (ez2_songdb_song_dir(root, &db.entries[i], dir, sizeof dir))
            jrel(root, dir);
        else
            printf("null");
        printf(",\"charts\":[");
        for (k = 0; k < m; k++) {
            printf("%s{\"tier\":%d,\"level\":%d,\"path\":", k ? "," : "", out[k].tier,
                   out[k].level);
            jrel(root, out[k].path);
            putchar('}');
        }
        printf("]}");
    }
    printf("]}\n");
    ez2_songdb_free(&db);
    return 0;
}

/* ---- main ---------------------------------------------------------------- */

/* ---- keys.ini and binding tokens ------------------------------------------ */

/* All of stdin, NUL-terminated (the length is returned separately). */
static char *slurp_stdin(size_t *n)
{
    size_t cap = 4096, used = 0;
    char *buf = (char *)malloc(cap);
    size_t got;
    while (buf && (got = fread(buf + used, 1, cap - used - 1, stdin)) > 0) {
        used += got;
        if (cap - used < 2) {
            char *grown = (char *)realloc(buf, cap * 2);
            if (!grown) { free(buf); return 0; }
            buf = grown;
            cap *= 2;
        }
    }
    if (buf) buf[used] = 0;
    *n = used;
    return buf;
}

static int cmd_keyconf(int bare)
{
    size_t n = 0, i;
    char *text = slurp_stdin(&n), *out;
    ez2_keyconf kc;
    int bad = 0, rc, need, c, a;

    if (!text) return fail("keyconf", "out of memory");
    if (bare) memset(&kc, 0, sizeof kc);
    else ez2_keyconf_defaults(&kc);
    rc = ez2_keyconf_parse(text, n, &kc, &bad);
    free(text);
    printf("{\"rc\":%d,\"bad_line\":%d,\"channels\":[", rc, bad);
    for (c = 0; c < EZ2_KEY_CHANNELS; c++) {
        printf("%s{\"name\":", c ? "," : "");
        jstr(ez2_keyconf_channel_name(c));
        printf(",\"names\":[");
        for (i = 0; i < (size_t)kc.count[c] && i < EZ2_KEY_ALTS; i++) {
            if (i) putchar(',');
            jstr(kc.names[c][i]);
        }
        printf("]}");
    }
    printf("],\"analog\":[");
    for (a = 0; a < EZ2_KEY_ANALOGS; a++) {
        if (a) putchar(',');
        jstr(kc.analog[a]);
    }
    need = ez2_keyconf_format(&kc, 0, 0);
    out = need > 0 ? (char *)malloc((size_t)need) : 0;
    if (out) ez2_keyconf_format(&kc, out, (size_t)need);
    printf("],\"formatted\":");
    jstr(out ? out : "");
    free(out);
    printf("}\n");
    return 0;
}

/* settings.ini as the port reads it over its defaults: whether it was read,
 * and the input Debounce (the one value EZ2BMS takes from it). */
static int cmd_portcfg(const char *path)
{
    ez2_portcfg c;
    int read;

    ez2_portcfg_defaults(&c);
    read = ez2_portcfg_load(path, &c);
    printf("{\"read\":%d,\"debounce\":%d}\n", read, c.debounce);
    return 0;
}

static int cmd_bindspec(void)
{
    char line[1024], out[256];
    int first = 1;

    printf("[");
    while (fgets(line, sizeof line, stdin)) {
        size_t len = strlen(line);
        ez2_bindspec b;
        int ok;
        while (len && (line[len - 1] == '\n' || line[len - 1] == '\r'))
            line[--len] = 0;
        memset(&b, 0, sizeof b);
        ok = ez2_bindspec_parse(line, &b);
        out[0] = 0;
        if (ok) ez2_bindspec_format(&b, out, sizeof out);
        printf("%s{\"text\":", first ? "" : ",");
        jstr(line);
        printf(",\"ok\":%d,\"kind\":%d,\"device\":", ok, b.kind);
        jstr(b.device);
        printf(",\"key\":");
        jstr(b.key);
        printf(",\"index\":%d,\"dir\":%d,\"reverse\":%d,\"velocity\":%d,\"amount\":%d,"
               "\"analog\":%d,\"formatted\":",
               b.index, b.dir, b.reverse, b.velocity, b.amount, ez2_bindspec_is_analog(&b));
        jstr(out);
        printf("}");
        first = 0;
    }
    printf("]\n");
    return 0;
}

/* ---- scroll ------------------------------------------------------------------ */

/* The field's placement arithmetic, one call per stdin line, each answer an
 * element of one JSON array (f32 results as %.9g, which reads back exactly):
 *
 *   target PERCENT MULT          ez2_scroll_target
 *   init BASE BEAT TARGET        ez2_scroll_init; answers the live rate
 *   tick TARGET                  ez2_scroll_tick; answers the live rate
 *   offset NOTE NOW NRATE LRATE  ez2_scroll_offset (ticks as doubles)
 *   y JUDGE NOTE NOW NRATE LRATE ez2_scroll_y
 */
static int cmd_scroll(void)
{
    char line[512];
    ez2_scroll s;
    int first = 1;

    ez2_scroll_init(&s, EZ2_SCROLL_MEASURE_SCALE, EZ2_SCROLL_BEAT, 1.0f);
    printf("[");
    while (fgets(line, sizeof line, stdin)) {
        char op[16];
        double a = 0, b = 0, c = 0, d = 0, e = 0;
        int n = sscanf(line, "%15s %lf %lf %lf %lf %lf", op, &a, &b, &c, &d, &e);
        float r;

        if (n < 1)
            continue;
        if (!strcmp(op, "target") && n == 3)
            r = ez2_scroll_target((int)a, (float)b);
        else if (!strcmp(op, "init") && n == 4) {
            ez2_scroll_init(&s, (float)a, (int)b, (float)c);
            r = s.rate;
        } else if (!strcmp(op, "tick") && n == 2) {
            ez2_scroll_tick(&s, (float)a);
            r = s.rate;
        } else if (!strcmp(op, "offset") && n == 5)
            r = ez2_scroll_offset(&s, a, b, (float)c, (float)d);
        else if (!strcmp(op, "y") && n == 6)
            r = ez2_scroll_y(&s, (float)a, b, c, (float)d, (float)e);
        else {
            fprintf(stderr, "scroll: bad line: %s", line);
            return 2;
        }
        printf("%s", first ? "" : ",");
        jfloat(r);
        first = 0;
    }
    printf("]\n");
    return 0;
}

int ez2bms_oracle_main(int argc, char **argv)
{
    const char *c = argc > 1 ? argv[1] : "";

    if (!strcmp(c, "chart") && argc == 3) return cmd_chart(argv[2]);
    if (!strcmp(c, "ezi") && argc == 3) return cmd_ezi(argv[2]);
    if (!strcmp(c, "songini") && (argc == 3 || argc == 4))
        return cmd_songini(argv[2], argc == 4 ? argv[3] : 0);
    if (!strcmp(c, "ssf") && argc == 3) return cmd_ssf(argv[2]);
    if (!strcmp(c, "abm") && argc == 3) return cmd_abm(argv[2]);
    if (!strcmp(c, "abm-write") && argc == 6)
        return cmd_abm_write(argv[2], atoi(argv[3]), atoi(argv[4]), argv[5]);
    if (!strcmp(c, "gds") && argc == 3) return cmd_gds(argv[2]);
    if (!strcmp(c, "pvi") && argc == 3) return cmd_pvi(argv[2]);
    if (!strcmp(c, "crypt") && argc == 6)
        return cmd_crypt(argv[2], argv[3], argv[4], argv[5]);
    if (!strcmp(c, "chart-id") && argc == 3) return cmd_chart_id(argv[2]);
    if (!strcmp(c, "mixparam")) return cmd_mixparam();
    if (!strcmp(c, "score")) return cmd_score();
    if (!strcmp(c, "judge-sim") && argc == 8)
        return cmd_judge_sim(argv[2], argv[3], argv[4], atof(argv[5]), atof(argv[6]),
                             (unsigned)strtoul(argv[7], 0, 10));
    if (!strcmp(c, "ttf") && argc == 12)
        return cmd_ttf(argv[2], argv[3], atoi(argv[4]), atoi(argv[5]), atoi(argv[6]),
                       atoi(argv[7]), (float)atof(argv[8]), atoi(argv[9]), atoi(argv[10]),
                       argv[11]);
    if (!strcmp(c, "textspec") && argc == 6)
        return cmd_textspec(argv[2], argv[3], atoi(argv[4]), argv[5]);
    if (!strcmp(c, "select-wheel") && argc == 4)
        return cmd_select_wheel(atoi(argv[2]), (float)atof(argv[3]));
    if (!strcmp(c, "select-chase") && argc == 6)
        return cmd_select_chase(atoi(argv[2]), atoi(argv[3]), atoi(argv[4]), atoi(argv[5]));
    if (!strcmp(c, "select-swing") && argc == 3)
        return cmd_select_swing(argv[2]);
    if (!strcmp(c, "songdb") && argc == 3) return cmd_songdb(argv[2]);
    if (!strcmp(c, "songdb-crypt") && argc == 4) return cmd_songdb_crypt(argv[2], argv[3]);
    if (!strcmp(c, "songdb-charts") && argc == 5)
        return cmd_songdb_charts(argv[2], argv[3], argv[4]);
    if (!strcmp(c, "usersongs") && (argc == 4 || argc == 5))
        return cmd_usersongs(argv[2], argv[3], argc == 5 ? argv[4] : 0);
    if (!strcmp(c, "keyconf") && (argc == 2 || (argc == 3 && !strcmp(argv[2], "bare"))))
        return cmd_keyconf(argc == 3);
    if (!strcmp(c, "bindspec") && argc == 2) return cmd_bindspec();
    if (!strcmp(c, "portcfg") && argc == 3) return cmd_portcfg(argv[2]);
    if (!strcmp(c, "scroll") && argc == 2) return cmd_scroll();
    if (!strcmp(c, "bmson-import") && argc >= 5 && argc <= 7) {
        /* [KEY] [--rgba]: --rgba reads the art from test RGBA files */
        int images = !strcmp(argv[argc - 1], "--rgba");
        int n = argc - images;
        if (n == 5 || n == 6)
            return cmd_bmson_import(argv[2], argv[3], argv[4], n == 6 ? argv[5] : 0, images);
    }

    fprintf(stderr,
            "usage: ez2port-oracle chart|ezi|ssf|abm|gds|pvi|chart-id FILE\n"
            "       ez2port-oracle songini FILE [MODE]\n"
            "       ez2port-oracle abm-write RGB W H OUT\n"
            "       ez2port-oracle crypt enc|dec TABLE IN OUT\n"
            "       ez2port-oracle mixparam|score   (script on stdin)\n"
            "       ez2port-oracle judge-sim EZ INI MODE OFFSET JITTER SEED\n"
            "       ez2port-oracle bmson-import FOLDER GAME_ROOT OUT_ROOT [KEY] [--rgba]\n"
            "       ez2port-oracle usersongs ROOT MODE [SHIPPED,KEYS]\n"
            "       ez2port-oracle songdb FILE | songdb-crypt FILE TABLES64\n"
            "       ez2port-oracle songdb-charts FILE ROOT MODE\n"
            "       ez2port-oracle ttf FONT TEXTFILE W H X BASELINE CAP ALIGN MAXW OUT\n"
            "       ez2port-oracle textspec DIR REL SCALE OUT\n"
            "       ez2port-oracle select-wheel COUNT SCROLL\n"
            "       ez2port-oracle select-chase COUNT FROM TO TICKS\n"
            "       ez2port-oracle select-swing DIFFS\n"
            "       ez2port-oracle keyconf [bare] | bindspec   (text on stdin)\n"
            "       ez2port-oracle portcfg FILE\n"
            "       ez2port-oracle scroll   (script on stdin)\n");
    return 2;
}
