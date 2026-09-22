/* `.pvi` - the play field's SKIN: where the lanes are, what a note looks
 * like, where the gauge, combo, score and judgement go.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The game's main note field is entirely DATA-driven. `Panel::LoadPVI`
 * @0x42d700 (../../src/panelgds.cpp, matched) opens
 * `System\<mode>\panel\STYLE_<mode><style>_<player>.pvi` - a CP949 text file,
 * INI-shaped, comments after `'` - and hands each `[Section]` to one of 27
 * readers, every one of which reads its values POSITIONALLY through
 * readGdsInt/readGdsFloat/readGdsTexSeries and never compares a key name
 * (the same finding as the mode `.gds`, ez2/gds.h). The section names ARE in
 * the binary, matched with `_stricmp`; the key names are not.
 *
 * WHAT THIS IS AND IS NOT. This parser matches keys BY NAME - the port's own
 * convention, chosen because it describes the shipped files correctly and
 * survives a reordered file where a positional read silently shifts every
 * value. It is not a reconstruction of the game's tokenizer, and it covers
 * the sections the port DRAWS - the tracks, the key panel, the gauge, the
 * combo and score fonts, the judgement art, the measure line, the target
 * bar, the bombs. Sections it does not model (RubyGauge, PuzzleNote,
 * SpecialNote, Effector, AudienceRating, ...) are skipped by name, never
 * rejected: a skin the game plays, the port plays.
 *
 * Paths inside are as the file spells them - backslashes, `.bmp` where the
 * tree ships `.abm`, relative to the panel directory unless they start with
 * `system\` - and are left that way; the loader resolves them, this reads.
 * A `NoteAniTexture` is a `;`-separated LIST of prefixes (one per note style
 * the mode offers); the game picks by its note-style option, index 0 here. */
#ifndef EZ2_PVI_H
#define EZ2_PVI_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_PVI_PATH   192
#define EZ2_PVI_TRACKS 20
#define EZ2_PVI_NOTE_STYLES 8
#define EZ2_PVI_TARGET_BARS 16

#define EZ2_PVI_LIGHTS 4

typedef struct ez2_pvi_color { int r, g, b, a; } ez2_pvi_color;

typedef struct ez2_pvi_track {
    int  present;                       /* the section was in the file */
    int  enable;
    int  x, y;                          /* Coord */
    int  w, h;                          /* Size */
    int  bk_src, bk_dst;                /* BKAlphaFunc - D3DBLEND pair */
    ez2_pvi_color bk1, bk2;             /* top and bottom of the lane fill */
    int  left_line_w, right_line_w;
    ez2_pvi_color left_line, right_line;
    int  press_x, press_y;              /* PressKeyCoord */
    char press_tex[EZ2_PVI_PATH];       /* PressKeyDownTexture */
    ez2_pvi_color press_color;
    int  press_src, press_dst;          /* PressKeyAlphaFunc */
    ez2_pvi_color bar_color;            /* PressBarColor */
    char bar_tex[EZ2_PVI_PATH];         /* PressBarTexture */
    int  bar_max_h, bar_grow, bar_shrink;
    int  note_style_count;
    char note_tex[EZ2_PVI_NOTE_STYLES][EZ2_PVI_PATH]; /* NoteAniTexture prefixes */
} ez2_pvi_track;

typedef struct ez2_pvi_anim {          /* MeasureLine, CoolBomb, GoodBomb, LongNoteBomb */
    int  present, enable;
    int  left;                          /* MeasureLine only */
    int  hot_y, hot_x;                  /* HeightHotSpot / HotSpot */
    int  w, h;
    int  frame_delay, max_frame;
    int  style_count;
    char tex[EZ2_PVI_NOTE_STYLES][EZ2_PVI_PATH];  /* AniTexture prefixes */
} ez2_pvi_anim;

typedef struct ez2_pvi_font {          /* MaxCoolCombo, Score */
    int  present, enable;
    int  x, y;
    char tex[EZ2_PVI_PATH];             /* FontTexture prefix - digits 0..9 */
    int  font_w, font_h, pitch;
    char format[32];                    /* "%07d" */
    int  src, dst;                      /* AlphaFunc */
} ez2_pvi_font;

typedef struct ez2_pvi_target {
    int  x, y, w, h;
    char tex[EZ2_PVI_PATH];             /* AniTexture prefix */
} ez2_pvi_target;

typedef struct ez2_pvi {
    int track_count;                    /* [General] NumberOfTrack */
    ez2_pvi_track tracks[EZ2_PVI_TRACKS];

    ez2_pvi_anim measure, cool_bomb, good_bomb, long_bomb;

    struct {                            /* [Judgment] - the flash clips */
        int  present, enable;
        int  hot_x, hot_y;
        char kool[EZ2_PVI_PATH], cool[EZ2_PVI_PATH], good[EZ2_PVI_PATH],
             miss[EZ2_PVI_PATH], fail[EZ2_PVI_PATH];
    } judgment;
    struct {                            /* [JudgmentTex] - the still plates */
        int  present, enable;
        char kool[EZ2_PVI_PATH], cool_fast[EZ2_PVI_PATH], cool_slow[EZ2_PVI_PATH],
             good[EZ2_PVI_PATH], miss[EZ2_PVI_PATH], fail[EZ2_PVI_PATH];
    } judgment_tex;
    struct {                            /* [CoolCombo] */
        int  present, enable;
        char font[EZ2_PVI_PATH];        /* digit prefix */
        int  hot_x, hot_y;
        char unit[4][EZ2_PVI_PATH];     /* combo0/00/000/0000 .str */
    } combo;
    struct {                            /* [KeyPanel] */
        int  present, enable;
        int  x, y, w, h;
        char bitmap[EZ2_PVI_PATH];
    } key_panel;
    ez2_pvi_font max_combo, score;
    struct {                            /* [GrooveGauge] */
        int  present, enable;
        int  back_x, back_y, gauge_x, gauge_y;
        char back[EZ2_PVI_PATH], gauge[EZ2_PVI_PATH];
    } gauge;
    /* [GrooveLight] - REPEATABLE. Panel::m429400 @0x429400 appends each
     * section to s1cd8[f1cd4++]; the Ruby style has two (1p_left with the
     * pulsing 1pGrvLight in front, and 1p_right with no front). */
    struct ez2_pvi_light {
        int  present, enable;
        int  x, y, w, h, front_x, front_y, front_w, front_h;
        char back[EZ2_PVI_PATH], front[EZ2_PVI_PATH];
    } lights[EZ2_PVI_LIGHTS];
    int light_count;
    /* [RubyGauge] - Panel::m42ce40 @0x42ce40: Enable, HotSpot (where the
     * BackStr chart sits), BackStr, Coord, ItemSize, MaxItem, MaxFrame,
     * ItemAniTexture (a series of MaxFrame). */
    struct {
        int  present, enable;
        int  hot_x, hot_y, x, y, item_w, item_h, max_item, max_frame;
        char back_str[EZ2_PVI_PATH], item_tex[EZ2_PVI_PATH];
    } ruby;
    struct {                            /* [TargetBar] - one entry per style */
        int  present, enable;
        int  count;
        ez2_pvi_target bars[EZ2_PVI_TARGET_BARS];
    } target;

    int unknown_sections;               /* skipped by name; never an error */
} ez2_pvi;

/* Parse the file's bytes (as shipped - CP949 comments are skipped, never
 * decoded). Returns 1 on success, 0 if the text is not a .pvi at all (no
 * [General]). Everything absent stays zero. */
int ez2_pvi_parse(const char *text, size_t n, ez2_pvi *out);

/* The game's own file choice: `System\<mode>\panel\STYLE_<mode><style>_<player>.pvi`
 * (the two main-game directors' ctors @0x423f40 / @0x460110 build the
 * "STYLE_<tag>1_" prefix - "STYLE_<tag>1_Black_" under the black-panel
 * option - and the panel appends the player digit; the "1" is the panel
 * style, the only one the shipped directors ever ask for). Resolves
 * case-insensitively under `root`, reads and parses. `dir_out` (if given)
 * receives the panel directory the file's relative paths resolve against.
 * Returns 1 on success. */
int ez2_pvi_load(const char *root, const char *mode_name, int style, int player,
                 ez2_pvi *out, char *dir_out, size_t dir_n);

/* The same with the black-panel option: `black` nonzero loads the
 * "STYLE_<mode><style>_Black_<player>.pvi" spelling. */
/* `cv2` says the chart is playing inside CV2Mix, and it decides WHICH panel
 * directory wins. A CV2 chart plays one of the ten sub-modes, and the game
 * takes that sub-mode's panel from under `System\CV2Mix\` unconditionally -
 * PlayerSlot::m430b50 @0x430b50 branches on the CV2 flag for the directory
 * (`"System\\CV2Mix\\%s\\Panel", g_styleTag` against
 * `"System\\%s\\Panel", g_modeName`) and PlayerRecord::m465d90 @0x465d90 does
 * the same for the scratch player. Without the flag the plain directory is
 * tried first and a sub-mode that also exists on its own - 5KeyMix does -
 * wins, which is how a CV2 chart ended up wearing 5KeyMix's field. */
int ez2_pvi_load_variant(const char *root, const char *mode_name, int style,
                         int player, int black, int cv2, ez2_pvi *out,
                         char *dir_out, size_t dir_n);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_PVI_H */
