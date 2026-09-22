/* `.pvi` skin reader. See pvi.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The file is a line-oriented INI: `[Section]`, `Key = value`, `Key = {`
 * opening a nested block of `Key = value` lines closed by `}`, comments from
 * `'` to end of line (in CP949 - never decoded, only skipped), values that
 * are numbers, `a,b[,c,d]` lists, or `"quoted strings"` (some carry a `;`
 * list of alternatives). Keys are matched case-insensitively.
 *
 * Nested block keys are qualified with the block name (`LeftBoader.LineWidth`),
 * which is how the two border blocks of a track are told apart. */
#include "pvi.h"
#include "util.h"
#include "vfs.h"
#include "file.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ---- tiny helpers -------------------------------------------------------- */

static int ci_eq(const char *a, const char *b)
{
    for (; *a && *b; a++, b++)
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b))
            return 0;
    return *a == 0 && *b == 0;
}

static int ci_starts(const char *s, const char *prefix)
{
    for (; *prefix; s++, prefix++)
        if (tolower((unsigned char)*s) != tolower((unsigned char)*prefix))
            return 0;
    return 1;
}

/* Up to `max` comma-separated ints out of a value. Returns how many. */
static int ints(const char *v, int *out, int max)
{
    int n = 0;
    while (n < max) {
        char *end;
        long x;
        while (*v && (isspace((unsigned char)*v) || *v == ','))
            v++;
        if (!*v)
            break;
        x = strtol(v, &end, 10);
        if (end == v)
            break;
        out[n++] = (int)x;
        v = end;
    }
    return n;
}

static void color(const char *v, ez2_pvi_color *c)
{
    int t[4] = { 255, 255, 255, 255 };
    ints(v, t, 4);
    c->r = t[0]; c->g = t[1]; c->b = t[2]; c->a = t[3];
}

static void pair(const char *v, int *a, int *b)
{
    int t[2] = { 0, 0 };
    ints(v, t, 2);
    *a = t[0]; *b = t[1];
}

/* A quoted string, or the bare word - into `out`. */
static void str(const char *v, char *out, size_t n)
{
    const char *q = strchr(v, '"');
    if (q) {
        const char *e = strchr(q + 1, '"');
        size_t len = e ? (size_t)(e - q - 1) : strlen(q + 1);
        if (len >= n) len = n - 1;
        memcpy(out, q + 1, len);
        out[len] = 0;
    } else {
        snprintf(out, n, "%s", v);
        ez2_trim(out);
    }
}

/* A `;`-separated list of prefixes into an array of paths. */
static int strlist(const char *v, char out[][EZ2_PVI_PATH], int max)
{
    char all[1024];
    char *p, *save;
    int n = 0;

    str(v, all, sizeof all);
    p = all;
    while (n < max && p && *p) {
        save = strchr(p, ';');
        if (save)
            *save++ = 0;
        ez2_trim(p);
        if (*p)
            snprintf(out[n++], EZ2_PVI_PATH, "%.*s", EZ2_PVI_PATH - 1, p);
        p = save;
    }
    return n;
}

/* ---- section handlers ---------------------------------------------------- */

static void track_kv(ez2_pvi_track *t, const char *k, const char *v)
{
    if (ci_eq(k, "Enable"))                     t->enable = atoi(v);
    else if (ci_eq(k, "Coord"))                 pair(v, &t->x, &t->y);
    else if (ci_eq(k, "Size"))                  pair(v, &t->w, &t->h);
    else if (ci_eq(k, "BKAlphaFunc"))           pair(v, &t->bk_src, &t->bk_dst);
    else if (ci_eq(k, "BkColor1"))              color(v, &t->bk1);
    else if (ci_eq(k, "BkColor2"))              color(v, &t->bk2);
    else if (ci_eq(k, "LeftBoader.LineWidth"))  t->left_line_w = atoi(v);
    else if (ci_eq(k, "LeftBoader.LineColor"))  color(v, &t->left_line);
    else if (ci_eq(k, "RightBoader.LineWidth")) t->right_line_w = atoi(v);
    else if (ci_eq(k, "RightBoader.LineColor")) color(v, &t->right_line);
    else if (ci_eq(k, "PressKeyCoord"))         pair(v, &t->press_x, &t->press_y);
    else if (ci_eq(k, "PressKeyDownTexture"))   str(v, t->press_tex, sizeof t->press_tex);
    else if (ci_eq(k, "PressKeyColor"))         color(v, &t->press_color);
    else if (ci_eq(k, "PressKeyAlphaFunc"))     pair(v, &t->press_src, &t->press_dst);
    else if (ci_eq(k, "PressBarColor"))         color(v, &t->bar_color);
    else if (ci_eq(k, "PressBarTexture"))       str(v, t->bar_tex, sizeof t->bar_tex);
    else if (ci_eq(k, "PressBarMaxHeight"))     t->bar_max_h = atoi(v);
    else if (ci_eq(k, "PressBarGrowUpSpeed"))   t->bar_grow = atoi(v);
    else if (ci_eq(k, "PressBarShrinkSpeed"))   t->bar_shrink = atoi(v);
    else if (ci_eq(k, "NoteAniTexture"))
        t->note_style_count = strlist(v, t->note_tex, EZ2_PVI_NOTE_STYLES);
}

static void anim_kv(ez2_pvi_anim *a, const char *k, const char *v)
{
    if (ci_eq(k, "Enable"))              a->enable = atoi(v);
    else if (ci_eq(k, "Left"))           a->left = atoi(v);
    else if (ci_eq(k, "HeightHotSpot"))  a->hot_y = atoi(v);
    else if (ci_eq(k, "HotSpot"))        pair(v, &a->hot_x, &a->hot_y);
    else if (ci_eq(k, "Size"))           pair(v, &a->w, &a->h);
    else if (ci_eq(k, "FrameDelay"))     a->frame_delay = atoi(v);
    else if (ci_eq(k, "MaxFrame"))       a->max_frame = atoi(v);
    else if (ci_eq(k, "AniTexture"))
        a->style_count = strlist(v, a->tex, EZ2_PVI_NOTE_STYLES);
}

static void font_kv(ez2_pvi_font *f, const char *k, const char *v)
{
    if (ci_eq(k, "Enable"))            f->enable = atoi(v);
    else if (ci_eq(k, "Coord"))        pair(v, &f->x, &f->y);
    else if (ci_eq(k, "FontTexture"))  str(v, f->tex, sizeof f->tex);
    else if (ci_eq(k, "FontSize"))     pair(v, &f->font_w, &f->font_h);
    else if (ci_eq(k, "FontPitch"))    f->pitch = atoi(v);
    else if (ci_eq(k, "Format"))       str(v, f->format, sizeof f->format);
    else if (ci_eq(k, "AlphaFunc"))    pair(v, &f->src, &f->dst);
}

/* Which section we are in, as a small enum plus an index. */
enum {
    S_NONE, S_GENERAL, S_TRACK, S_MEASURE, S_COOLBOMB, S_GOODBOMB, S_LONGBOMB,
    S_JUDGMENT, S_JUDGMENTTEX, S_COMBO, S_KEYPANEL, S_MAXCOMBO, S_SCORE,
    S_GAUGE, S_LIGHT, S_TARGET, S_RUBY, S_SKIP
};

static int section_of(const char *name, int *index)
{
    *index = 0;
    if (ci_starts(name, "Track") && isdigit((unsigned char)name[5])) {
        *index = atoi(name + 5) - 1;
        return S_TRACK;
    }
    if (ci_eq(name, "General"))       return S_GENERAL;
    if (ci_eq(name, "MeasureLine"))   return S_MEASURE;
    if (ci_eq(name, "CoolBomb"))      return S_COOLBOMB;
    if (ci_eq(name, "GoodBomb"))      return S_GOODBOMB;
    if (ci_eq(name, "LongNoteBomb"))  return S_LONGBOMB;
    if (ci_eq(name, "Judgment"))      return S_JUDGMENT;
    if (ci_eq(name, "JudgmentTex"))   return S_JUDGMENTTEX;
    if (ci_eq(name, "CoolCombo"))     return S_COMBO;
    if (ci_eq(name, "KeyPanel"))      return S_KEYPANEL;
    if (ci_eq(name, "MaxCoolCombo"))  return S_MAXCOMBO;
    if (ci_eq(name, "Score"))         return S_SCORE;
    if (ci_eq(name, "GrooveGauge"))   return S_GAUGE;
    if (ci_eq(name, "GrooveLight"))   return S_LIGHT;
    if (ci_eq(name, "TargetBar"))     return S_TARGET;
    if (ci_eq(name, "RubyGauge"))     return S_RUBY;
    return S_SKIP;
}

static void apply(ez2_pvi *o, int sec, int idx, const char *k, const char *v)
{
    switch (sec) {
    case S_GENERAL:
        if (ci_eq(k, "NumberOfTrack")) o->track_count = atoi(v);
        break;
    case S_TRACK:
        if (idx >= 0 && idx < EZ2_PVI_TRACKS)
            track_kv(&o->tracks[idx], k, v);
        break;
    case S_MEASURE:  anim_kv(&o->measure, k, v);   break;
    case S_COOLBOMB: anim_kv(&o->cool_bomb, k, v); break;
    case S_GOODBOMB: anim_kv(&o->good_bomb, k, v); break;
    case S_LONGBOMB: anim_kv(&o->long_bomb, k, v); break;
    case S_JUDGMENT:
        if (ci_eq(k, "Enable"))       o->judgment.enable = atoi(v);
        else if (ci_eq(k, "HotSpot")) pair(v, &o->judgment.hot_x, &o->judgment.hot_y);
        else if (ci_eq(k, "KoolStr")) str(v, o->judgment.kool, EZ2_PVI_PATH);
        else if (ci_eq(k, "CoolStr")) str(v, o->judgment.cool, EZ2_PVI_PATH);
        else if (ci_eq(k, "GoolStr") || ci_eq(k, "GoodStr"))
                                      str(v, o->judgment.good, EZ2_PVI_PATH);
        /* POSITIONAL, NOT BY NAME: CatchPanel::m4700f0 reads the five
         * strings in file order into kool, cool, good, FAIL, MISS. The
         * catch styles list MissStr before FailStr, so their Miss.str lands
         * in the fail slot and Fail.str in the miss slot - which is why a
         * dropped fruit (a MISS judge) shows decision_fail on the original.
         * The keys styles list Fail before Miss and are unaffected. */
        else if (ci_eq(k, "MissStr") || ci_eq(k, "FailStr")) {
            if (o->judgment.fail[0] == 0)
                str(v, o->judgment.fail, EZ2_PVI_PATH);
            else
                str(v, o->judgment.miss, EZ2_PVI_PATH);
        }
        break;
    case S_JUDGMENTTEX:
        if (ci_eq(k, "Enable"))            o->judgment_tex.enable = atoi(v);
        else if (ci_eq(k, "KoolTex"))      str(v, o->judgment_tex.kool, EZ2_PVI_PATH);
        else if (ci_eq(k, "FastCoolTex"))  str(v, o->judgment_tex.cool_fast, EZ2_PVI_PATH);
        else if (ci_eq(k, "SlowCoolTex"))  str(v, o->judgment_tex.cool_slow, EZ2_PVI_PATH);
        else if (ci_eq(k, "GoodTex"))      str(v, o->judgment_tex.good, EZ2_PVI_PATH);
        else if (ci_eq(k, "MissTex"))      str(v, o->judgment_tex.miss, EZ2_PVI_PATH);
        else if (ci_eq(k, "FailTex"))      str(v, o->judgment_tex.fail, EZ2_PVI_PATH);
        break;
    case S_COMBO:
        if (ci_eq(k, "Enable"))        o->combo.enable = atoi(v);
        else if (ci_eq(k, "Font"))     str(v, o->combo.font, EZ2_PVI_PATH);
        else if (ci_eq(k, "HotSpot"))  pair(v, &o->combo.hot_x, &o->combo.hot_y);
        else if (ci_eq(k, "Unit1Str")) str(v, o->combo.unit[0], EZ2_PVI_PATH);
        else if (ci_eq(k, "Unit2Str")) str(v, o->combo.unit[1], EZ2_PVI_PATH);
        else if (ci_eq(k, "Unit3Str")) str(v, o->combo.unit[2], EZ2_PVI_PATH);
        else if (ci_eq(k, "Unit4Str")) str(v, o->combo.unit[3], EZ2_PVI_PATH);
        break;
    case S_KEYPANEL:
        if (ci_eq(k, "Enable"))       o->key_panel.enable = atoi(v);
        else if (ci_eq(k, "Coord"))   pair(v, &o->key_panel.x, &o->key_panel.y);
        else if (ci_eq(k, "Size"))    pair(v, &o->key_panel.w, &o->key_panel.h);
        else if (ci_eq(k, "Bitmap"))  str(v, o->key_panel.bitmap, EZ2_PVI_PATH);
        break;
    case S_MAXCOMBO: font_kv(&o->max_combo, k, v); break;
    case S_SCORE:    font_kv(&o->score, k, v);     break;
    case S_GAUGE:
        if (ci_eq(k, "Enable"))            o->gauge.enable = atoi(v);
        else if (ci_eq(k, "BackCoord"))    pair(v, &o->gauge.back_x, &o->gauge.back_y);
        else if (ci_eq(k, "BackBitmap"))   str(v, o->gauge.back, EZ2_PVI_PATH);
        else if (ci_eq(k, "GaugeCoord"))   pair(v, &o->gauge.gauge_x, &o->gauge.gauge_y);
        else if (ci_eq(k, "GaugeBitmap"))  str(v, o->gauge.gauge, EZ2_PVI_PATH);
        break;
    case S_LIGHT: {
        struct ez2_pvi_light *L = &o->lights[o->light_count > 0 ? o->light_count - 1 : 0];

        /* The catch styles spell the back plate's keys BackCoord/BackSize
         * (and BackBitmap); the original reads the section's VALUES in
         * order (m470ee0/m429400) and never sees the names, so both
         * spellings are the same fields. */
        if (ci_eq(k, "Enable"))             L->enable = atoi(v);
        else if (ci_eq(k, "Coord") || ci_eq(k, "BackCoord"))
                                            pair(v, &L->x, &L->y);
        else if (ci_eq(k, "Size") || ci_eq(k, "BackSize"))
                                            pair(v, &L->w, &L->h);
        else if (ci_eq(k, "BackTexture") || ci_eq(k, "BackBitmap"))
                                            str(v, L->back, EZ2_PVI_PATH);
        else if (ci_eq(k, "FrontCoord"))    pair(v, &L->front_x, &L->front_y);
        else if (ci_eq(k, "FrontSize"))     pair(v, &L->front_w, &L->front_h);
        else if (ci_eq(k, "FrontTexture"))  str(v, L->front, EZ2_PVI_PATH);
        break;
    }
    case S_RUBY:
        if (ci_eq(k, "Enable"))              o->ruby.enable = atoi(v);
        else if (ci_eq(k, "HotSpot"))        pair(v, &o->ruby.hot_x, &o->ruby.hot_y);
        else if (ci_eq(k, "BackStr"))        str(v, o->ruby.back_str, EZ2_PVI_PATH);
        else if (ci_eq(k, "Coord"))          pair(v, &o->ruby.x, &o->ruby.y);
        else if (ci_eq(k, "ItemSize"))       pair(v, &o->ruby.item_w, &o->ruby.item_h);
        else if (ci_eq(k, "MaxItem"))        o->ruby.max_item = atoi(v);
        else if (ci_eq(k, "MaxFrame"))       o->ruby.max_frame = atoi(v);
        else if (ci_eq(k, "ItemAniTexture")) str(v, o->ruby.item_tex, EZ2_PVI_PATH);
        break;
    case S_TARGET:
        /* Repeated Coord/Size/AniTexture triples, one per target style; a
         * Coord opens the next entry. */
        if (ci_eq(k, "Enable")) {
            o->target.enable = atoi(v);
        } else if (ci_eq(k, "Coord")) {
            if (o->target.count < EZ2_PVI_TARGET_BARS) {
                ez2_pvi_target *t = &o->target.bars[o->target.count++];
                memset(t, 0, sizeof *t);
                pair(v, &t->x, &t->y);
            }
        } else if (o->target.count > 0) {
            ez2_pvi_target *t = &o->target.bars[o->target.count - 1];
            if (ci_eq(k, "Size"))            pair(v, &t->w, &t->h);
            else if (ci_eq(k, "AniTexture")) str(v, t->tex, EZ2_PVI_PATH);
        }
        break;
    default:
        break;
    }
}

static void mark_present(ez2_pvi *o, int sec, int idx)
{
    switch (sec) {
    case S_TRACK:       if (idx >= 0 && idx < EZ2_PVI_TRACKS) o->tracks[idx].present = 1; break;
    case S_MEASURE:     o->measure.present = 1;       break;
    case S_COOLBOMB:    o->cool_bomb.present = 1;     break;
    case S_GOODBOMB:    o->good_bomb.present = 1;     break;
    case S_LONGBOMB:    o->long_bomb.present = 1;     break;
    case S_JUDGMENT:    o->judgment.present = 1;      break;
    case S_JUDGMENTTEX: o->judgment_tex.present = 1;  break;
    case S_COMBO:       o->combo.present = 1;         break;
    case S_KEYPANEL:    o->key_panel.present = 1;     break;
    case S_MAXCOMBO:    o->max_combo.present = 1;     break;
    case S_SCORE:       o->score.present = 1;         break;
    case S_GAUGE:       o->gauge.present = 1;         break;
    case S_LIGHT:
        /* Each [GrooveLight] is its own entry, as m429400's f1cd4++. */
        if (o->light_count < EZ2_PVI_LIGHTS) {
            o->lights[o->light_count].present = 1;
            o->light_count++;
        }
        break;
    case S_RUBY:        o->ruby.present = 1;          break;
    case S_TARGET:      o->target.present = 1;        break;
    case S_SKIP:        o->unknown_sections++;        break;
    default: break;
    }
}

/* ---- the line walker ----------------------------------------------------- */

int ez2_pvi_parse(const char *text, size_t n, ez2_pvi *out)
{
    size_t i = 0;
    int sec = S_NONE, idx = 0, seen_general = 0;
    char block[64] = "";

    if (out == 0)
        return 0;
    memset(out, 0, sizeof *out);
    if (text == 0)
        return 0;

    while (i < n) {
        char line[1024];
        size_t L = 0;
        char *p, *eq;

        /* one line, without its terminator */
        while (i < n && text[i] != '\n' && text[i] != '\r') {
            if (L < sizeof line - 1)
                line[L++] = text[i];
            i++;
        }
        line[L] = 0;
        while (i < n && (text[i] == '\n' || text[i] == '\r'))
            i++;

        /* comments: from `'` to the end - but not inside a quoted string,
         * where a path could not carry one anyway; the shipped files never
         * quote an apostrophe. */
        {
            int inq = 0;
            for (p = line; *p; p++) {
                if (*p == '"') inq = !inq;
                else if (*p == '\'' && !inq) { *p = 0; break; }
            }
        }
        ez2_trim(line);
        if (!line[0])
            continue;

        if (line[0] == '[') {
            char name[64];
            char *close = strchr(line, ']');
            size_t len = close ? (size_t)(close - line - 1) : strlen(line + 1);
            if (len >= sizeof name) len = sizeof name - 1;
            memcpy(name, line + 1, len);
            name[len] = 0;
            ez2_trim(name);
            sec = section_of(name, &idx);
            if (sec == S_GENERAL)
                seen_general = 1;
            mark_present(out, sec, idx);
            block[0] = 0;
            continue;
        }
        if (line[0] == '}') {
            block[0] = 0;
            continue;
        }
        eq = strchr(line, '=');
        if (!eq)
            continue;
        *eq = 0;
        ez2_trim(line);
        p = eq + 1;
        ez2_trim(p);
        if (*p == '{' || (*p == 0 && strchr(eq + 1, '{'))) {
            /* `Key = {` opens a block; its lines get the block's name */
            snprintf(block, sizeof block, "%s", line);
            continue;
        }
        if (block[0]) {
            char qual[160];
            snprintf(qual, sizeof qual, "%s.%s", block, line);
            apply(out, sec, idx, qual, p);
        } else {
            apply(out, sec, idx, line, p);
        }
    }
    return seen_general;
}

int ez2_pvi_load(const char *root, const char *mode_name, int style, int player,
                 ez2_pvi *out, char *dir_out, size_t dir_n)
{
    return ez2_pvi_load_variant(root, mode_name, style, player, 0, 0, out,
                                dir_out, dir_n);
}

int ez2_pvi_load_variant(const char *root, const char *mode_name, int style,
                         int player, int black, int cv2, ez2_pvi *out,
                         char *dir_out, size_t dir_n)
{
    char rel[300], full[2048];
    unsigned char *bytes;
    size_t n = 0;
    int ok;
    /* The black-panel option's spelling - "STYLE_<mode><style>_Black_<p>.pvi"
     * (the directors' ctors @0x423f40/@0x460110 insert the token). */
    const char *blk = black ? "Black_" : "";

    if (root == 0 || mode_name == 0 || out == 0)
        return 0;
    /* WHICH DIRECTORY FIRST is what `cv2` decides - see the header. Inside
     * CV2Mix the sub-mode's own panel under System\CV2Mix\ is the one the
     * game uses; outside it, the mode's own. The other is still tried as a
     * fallback, so a tree missing one still gets a field rather than none. */
    if (cv2)
        snprintf(rel, sizeof rel,
                 "system\\CV2Mix\\%s\\panel\\STYLE_%s%d_%s%d.pvi",
                 mode_name, mode_name, style, blk, player);
    else
        snprintf(rel, sizeof rel, "system\\%s\\panel\\STYLE_%s%d_%s%d.pvi",
                 mode_name, mode_name, style, blk, player);
    if (!ez2_vfs_resolve(root, rel, full, sizeof full)) {
        if (cv2)
            snprintf(rel, sizeof rel,
                     "system\\%s\\panel\\STYLE_%s%d_%s%d.pvi",
                     mode_name, mode_name, style, blk, player);
        else
            snprintf(rel, sizeof rel,
                     "system\\CV2Mix\\%s\\panel\\STYLE_%s%d_%s%d.pvi",
                     mode_name, mode_name, style, blk, player);
        if (!ez2_vfs_resolve(root, rel, full, sizeof full))
            return 0;
    }
    bytes = ez2_file_read(full, &n);
    if (bytes == 0)
        return 0;
    ok = ez2_pvi_parse((const char *)bytes, n, out);
    free(bytes);
    if (ok && dir_out && dir_n) {
        size_t k = strlen(full);
        while (k > 0 && full[k - 1] != '/' && full[k - 1] != '\\')
            k--;
        if (k > 0) k--;
        if (k >= dir_n) k = dir_n - 1;
        memcpy(dir_out, full, k);
        dir_out[k] = 0;
    }
    return ok;
}
