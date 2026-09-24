/* TrueType text for the port's own art: the imported songs' title plates.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The shipped plates under `system/songname/` (.abm) are rasterised art: a bold
 * humanist sans, white, antialiased, RIGHT-aligned nine pixels from the
 * plate's edge, capitals nine pixels tall on a baseline at row 23 of 32. The
 * game's bitmap font (font.h) cannot make that, so an imported song's plate
 * is rendered from a TrueType face through stb_truetype (third_party/) and
 * the closest bold sans the machine has - Roboto if present, else Open Sans,
 * Liberation Sans, DejaVu Sans, or Windows' Arial / Segoe UI Bold.
 * `EZ2_TITLE_FONT=<file>` names one explicitly. */
#ifndef EZ2_TTF_H
#define EZ2_TTF_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Where the port's OWN copy lives: `<dir>/fonts/Roboto-Bold.ttf` (the build
 * copies it beside the executable) or `<dir>/../third_party/fonts/` (a build
 * tree). Set from the executable's folder; searched before the system. */
void ez2_ttf_set_dir(const char *dir);

/* The first usable face: EZ2_TITLE_FONT, the port's own Roboto Bold, then
 * the system's bold sans faces; 1 if found. */
int ez2_ttf_find(char *out, size_t n);

/* The LIGHT face, for the select's category strip: the shipped Sortimage
 * labels are a light geometric sans. EZ2_LABEL_FONT, the port's own Fira
 * Sans Light, then the system's light faces, then the bold one above. */
int ez2_ttf_find_light(char *out, size_t n);

/* A CJK face, for the game's Korean plates (textspec.h): EZ2_CJK_FONT,
 * then the system's Noto Sans CJK / Noto Sans KR / Nanum Gothic, the bold
 * cut when `bold` is set (falling back to the regular one, then to the
 * Latin faces above, which draw boxes for hangul). Not vendored: a CJK
 * face is 5 to 20 MB. */
int ez2_ttf_find_cjk(char *out, size_t n, int bold);

/* Read a face into the renderer's cache now rather than on its first use -
 * the CJK collection is 20 MB, and its first render otherwise lands in the
 * middle of a screen. A `#N` suffix is stripped. Harmless on a face that
 * cannot be read. */
void ez2_ttf_warm(const char *font_path);

/* As ez2_ttf_render, with `align`: 0 = the ink ends at `x`, 1 = centred on
 * `x`, 2 = starts at `x`. */
int ez2_ttf_render_at(const char *font_path, const char *text,
                      unsigned char *rgb, int w, int h,
                      int x, int baseline_y, float cap_px, int align);

/* As ez2_ttf_render_at, with a WIDTH cap: a line wider than `max_width`
 * pixels is condensed horizontally to it - the capitals keep their height -
 * which is how the shipped strip labels ("1.5-2.0", "3s-BE") fit their
 * bank. 0 means the plate rule (scale both ways to the tile). */
int ez2_ttf_render_box(const char *font_path, const char *text,
                       unsigned char *rgb, int w, int h,
                       int x, int baseline_y, float cap_px, int align,
                       int max_width);

/* A font path may end in `#N` to pick face N of a collection (.ttc).
 *
 * Render `text` (UTF-8) white on black into a top-down RGB buffer of w x h:
 * capitals `cap_px` tall, the last glyph ending at `right_x`, the baseline
 * at `baseline_y`; a line too wide for the plate is scaled down to fit.
 * Returns 1 on success, 0 when the face cannot be read (the buffer is then
 * left as it was). */
int ez2_ttf_render(const char *font_path, const char *text,
                   unsigned char *rgb, int w, int h,
                   int right_x, int baseline_y, float cap_px);

#ifdef __cplusplus
}
#endif

#endif
