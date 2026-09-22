/* Native text for the game's plain-text bitmaps (TEXT.md).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Much of the game's UI text is baked into small textures: the select's
 * category labels, the version badges, the stage plates, the countdown's
 * two Korean lines. A manifest names such a texture and says what text it
 * carries and where - font face, capital height, baseline, alignment,
 * colour, in the tile's own 640-space pixels - and a strings file holds the
 * words by key. The loader asks here BEFORE the HD pack and the game's file:
 * an entry is rasterised from a TrueType face at the window's scale and
 * uploaded at the tile's logical size, so the text is sharp at any window,
 * a strings file in another language translates it, and a modder edits the
 * manifest. Anything not in the manifest falls through untouched, so
 * coverage grows one texture at a time and nothing is ever required.
 *
 *     text/manifest.ini
 *         [fonts]                      ; optional; faces found on their own otherwise
 *         bold  = fonts/Roboto-Bold.ttf
 *         light = fonts/FiraSans-Light.ttf
 *         cjk   = /usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc
 *         cjkbold = ...
 *
 *         [system/SongSelect/Sortimage/category_01.abm]
 *         size = 128,16                ; the tile, as the game's file has it
 *         line = cat.hot | 62,13,11 | light | ffffff | center | 35
 *                ; key | x,baseline,cap | face | rrggbb[/glow] | align | max width (0 = none)
 *
 *         [system/BattleMode/count.abm]
 *         size = 256,256
 *         mask = system/BattleMode/count_mask.abm    ; the plate's mask twin
 *         line = play.speed_hint | 128,119,12 | cjkbold | ffffff | center
 *         line = play.start_soon | 128,150,15 | cjk | ffffff | center
 *
 *     text/strings.ini             ; the originals, by key
 *     text/strings.<lang>.ini      ; overrides for a language (Language= in
 *                                  ; settings.ini, --lang, or EZ2_LANG)
 *         @cjk = sc                ; jp | kr | sc | tc | hk: which forms of the
 *                                  ; shared ideographs (Noto Sans CJK's faces)
 *
 * A run set in a Latin face whose words hold CJK characters is rendered
 * with the CJK face instead, so a translation into Chinese or Japanese of
 * a plate the manifest set in Roboto needs no manifest change.
 *
 * A mask twin is rendered from the same lines as its plate, black text on
 * white, which is how the game's own `_mask` files read; the loader uploads
 * both. Only PLAIN text belongs here - a plate whose look is an effect
 * (a glow, a gradient, a techno face) stays art, so the game keeps its
 * style; see TEXT.md for what qualifies. */
#ifndef EZ2_TEXTSPEC_H
#define EZ2_TEXTSPEC_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Read `<dir>/manifest.ini`, `<dir>/strings.ini` and, when `lang` is set and
 * the file exists, `<dir>/strings.<lang>.ini`. Returns the number of
 * textures the manifest covers (0 = nothing, the module stays inert).
 * Calling it again replaces everything. */
int ez2_textspec_load(const char *dir, const char *lang);

/* How many textures the manifest covers; 0 when unloaded. */
int ez2_textspec_count(void);

/* 1 if `rel` - a path relative to the game root, either slash, any case,
 * .bmp or .abm - has an entry (a plate or a mask twin). */
int ez2_textspec_has(const char *rel);

/* 1 if `rel`'s entry is `base = pack`: its words go OVER the plate's own art
 * (the HD pack's cleaned copy, or the game's file), and the loader renders
 * it through ez2_textspec_render_over. */
int ez2_textspec_over_base(const char *rel);

/* 1 if `rel`'s entry is `base = pack+clean`: the pack's copy of the plate was
 * upscaled with the game's words still in it, so the loader runs
 * ez2_textspec_clean over that copy as well (at the copy's scale) before
 * rendering. A mask twin answers for its plate. */
int ez2_textspec_clean_pack(const char *rel);

/* Without a pack copy of a lifted plate the loader bases on the game's own
 * file: fill the manifest's `clean` boxes across from their edges (the words
 * out of the art), then blow it up `k` times nearest so the words render at
 * the window's scale. Returns the box count; 0 means nothing to clean. */
int ez2_textspec_clean(const char *rel, unsigned char *rgba, int w, int h, int lw, int lh);
unsigned char *ez2_textspec_upscale(const unsigned char *rgba, int w, int h, int k);

/* The entry's lines composited over `base` - top-down RGBA, `bw` x `bh`,
 * which is the tile `lw` x `lh` at some integer scale; the lines render at
 * that scale. malloc'd, `bw` x `bh`; NULL when there is no entry, no face,
 * or the sizes make no sense. */
unsigned char *ez2_textspec_render_over(const char *rel,
                                        const unsigned char *base, int bw, int bh,
                                        int lw, int lh);

/* Render the entry for `rel` `scale` times larger than its tile: top-down
 * RGBA, malloc'd, `*w` x `*h` = tile x scale; `*lw`,`*lh` the tile. A plate
 * carries its coverage in the colour (the game's plates are colour-keyed
 * and often drawn additively, where alpha is ignored) with alpha 255 where
 * there is ink; a mask twin is white with black text, alpha 255. NULL when
 * there is no entry or no face can be read. */
unsigned char *ez2_textspec_render(const char *rel, int scale,
                                   int *w, int *h, int *lw, int *lh);

/* The languages `dir` offers: the `<lang>` of every `strings.<lang>.ini`
 * in it, sorted, up to `max` codes of `stride` bytes each. Returns how
 * many. The test menu's LANGUAGE row is built from this. */
int ez2_textspec_languages(const char *dir, char *out, size_t stride, int max);

/* The text for `key` after the language override, or NULL. */
const char *ez2_textspec_string(const char *key);

/* Forget everything. */
void ez2_textspec_unload(void);

#ifdef __cplusplus
}
#endif

#endif
