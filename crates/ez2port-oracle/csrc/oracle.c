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
 */
#include "ez2/abm.h"
#include "ez2/bmson.h"
#include "ez2/chart.h"
#include "ez2/crypt.h"
#include "ez2/ezi.h"
#include "ez2/file.h"
#include "ez2/gds.h"
#include "ez2/mixparam.h"
#include "ez2/mode.h"
#include "ez2/pvi.h"
#include "ez2/score.h"
#include "ez2/songini.h"
#include "ez2/ssf.h"

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
    rc = ez2_abm_write(out, rgb, w, h);
    free(rgb);
    if (rc != EZ2_ABM_OK)
        return fail("abm-write", ez2_abm_strerror(rc));
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

static int cmd_bmson_import(const char *folder, const char *game_root,
                            const char *out_root, const char *key)
{
    char key_out[64] = "";
    int first = 1, rc;

    printf("{\"log\":[");
    rc = ez2_bmson_import(folder, game_root, out_root, key, 0, log_line, &first,
                          key_out, sizeof key_out);
    printf("],\"rc\":%d,\"key\":", rc);
    jstr(key_out);
    printf("}\n");
    return 0;
}

/* ---- main ---------------------------------------------------------------- */

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
    if (!strcmp(c, "bmson-import") && (argc == 5 || argc == 6))
        return cmd_bmson_import(argv[2], argv[3], argv[4], argc == 6 ? argv[5] : 0);

    fprintf(stderr,
            "usage: ez2port-oracle chart|ezi|ssf|abm|gds|pvi|chart-id FILE\n"
            "       ez2port-oracle songini FILE [MODE]\n"
            "       ez2port-oracle abm-write RGB W H OUT\n"
            "       ez2port-oracle crypt enc|dec TABLE IN OUT\n"
            "       ez2port-oracle mixparam|score   (script on stdin)\n"
            "       ez2port-oracle judge-sim EZ INI MODE OFFSET JITTER SEED\n"
            "       ez2port-oracle bmson-import FOLDER GAME_ROOT OUT_ROOT [KEY]\n");
    return 2;
}
