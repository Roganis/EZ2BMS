/* The game's own bitmap fonts, and the CP949 text they draw.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The port's HUD font was a 3x5 built-in with no lower case, which was fine
 * for KOOL and COOL and useless for anything a person reads. It did not need
 * to be: **the game ships two fonts and the decomp says exactly how it reads
 * them.**
 *
 *     system\common\fontEn.dat    2,560 bytes
 *     system\common\fontkr.dat   75,200 bytes
 *
 * and three unused siblings, `fontkr1/3/4.dat`, byte-identical in size.
 *
 * ---- where this comes from ------------------------------------------------
 *
 * `KGraphics::drawText` @0x406f50 and the four glyph blitters under it. The
 * sizes are not guessed: `loadAsciiFont` @0x407120 reads `sizeof(g_asciiBits)`
 * then `sizeof(g_asciiWidth)` (128*16 then 128*4 = 2,560), and the Hangul
 * loader @0x407080 reads a single **0x125c0 = 75,200** bytes, which is 2350*32
 * to the byte.
 *
 *   fontEn.dat  128 glyphs, 8x16, ONE byte a row, then 128 ints of advance.
 *               The advance is per glyph, so the ASCII font is proportional.
 *   fontkr.dat  2,350 glyphs, 16x16, TWO bytes a row. Fixed 15px advance
 *               (`add $0xf,%edi` @0x406fbb), which is one less than the glyph
 *               is wide - the columns overlap by a pixel.
 *
 * **2,350 is the count of precomposed Hangul syllables in KS X 1001**, and the
 * index arithmetic confirms it. @0x406f9c computes
 *
 *     lea -0x4141(%edx,%ecx,2)   where ecx = 47*lead, edx = trail
 *     => glyph = lead*94 + trail - 16705
 *     => glyph = (lead - 0xB0)*94 + (trail - 0xA1)
 *
 * because 0xB0*94 + 0xA1 == 16705. That is the EUC-KR Hangul block, 94 per
 * row starting at lead 0xB0. So the font covers **syllables only**: no Hanja,
 * no symbol rows.
 *
 * The bit order is LSB FIRST. The blitters test `bits & tbl[col & 7]` against
 * the table at 0x487c64, which is `01 02 04 08 10 20 40 80` - so bit 0 is the
 * LEFTMOST column, not the usual way round. Getting that backwards mirrors
 * every glyph and still looks like text, which is why it is worth saying.
 *
 * ---- two faithful oddities ------------------------------------------------
 *
 * Both are the original's behaviour, reproduced deliberately:
 *
 * 1. A lead byte **above 0xCA** (the Hanja range) is skipped WITHOUT consuming
 *    its trail byte - @0x406f8a jumps straight to the advance, past the
 *    `add $1,%ebx` that would eat the second half. The trail is then read as
 *    the next character, so Hanja does not render as a blank, it desynchronises
 *    the rest of the line. No shipped title has been seen to hit it.
 * 2. A lead byte **below 0xB0** gives a negative glyph index, which the
 *    blitters reject (`test ebx,ebx; jl`) - but the caller has already eaten
 *    the trail and still advances 15px. So KS X 1001's symbol and Latin rows
 *    (0xA1..0xAF) come out as correctly-sized blanks.
 *
 * ---- what it does NOT solve ----------------------------------------------
 *
 * Song titles. Twelve of the thirteen `song.bin` tables leave the name field
 * empty and the key IS the title there, so a readable song select needs the
 * title from wherever the game really gets it - not a better font. This module
 * is for the text the game does draw as text: menus, the test mode, options.
 */
#ifndef EZ2_FONT_H
#define EZ2_FONT_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_FONT_ASCII_GLYPHS 128
#define EZ2_FONT_ASCII_BYTES  (EZ2_FONT_ASCII_GLYPHS * 16)
#define EZ2_FONT_EN_FILE      (EZ2_FONT_ASCII_BYTES + EZ2_FONT_ASCII_GLYPHS * 4)

#define EZ2_FONT_KR_GLYPHS    2350          /* KS X 1001 Hangul syllables */
#define EZ2_FONT_KR_BYTES     (EZ2_FONT_KR_GLYPHS * 32)

#define EZ2_FONT_KR_ADVANCE   15            /* @0x406fbb, one less than 16 */

typedef struct ez2_font {
    unsigned char ascii[EZ2_FONT_ASCII_BYTES];        /* 8x16, stride 1 */
    int           advance[EZ2_FONT_ASCII_GLYPHS];
    unsigned char kr[EZ2_FONT_KR_BYTES];              /* 16x16, stride 2 */
    int           have_ascii;
    int           have_kr;
} ez2_font;

/* One decoded character. `bits` is null for a glyph the font cannot draw -
 * which still has an advance, because the original still moves the pen. */
typedef struct ez2_glyph {
    const unsigned char *bits;
    int stride;                /* 1 for ASCII, 2 for Hangul */
    int w, h;                  /* 8x16 or 16x16 */
    int advance;
    int code;                  /* the ASCII byte, or the EUC-KR pair */
} ez2_glyph;

/* Load both files from a game root: `system/common/font{En,kr}.dat`, resolved
 * case-insensitively like everything else. Missing either one is not fatal -
 * the corresponding `have_` flag stays 0 and those glyphs draw blank. Returns
 * 0 if NEITHER could be read. */
int ez2_font_load(const char *root, ez2_font *out);

/* The same from explicit paths; either may be null. */
int ez2_font_load_files(const char *en_path, const char *kr_path,
                        ez2_font *out);

/* Decode the next character at `*s` and advance `*s` past it. Returns 0 at the
 * terminator. Handles the two faithful oddities documented above. */
int ez2_font_next(const ez2_font *f, const char **s, ez2_glyph *g);

/* 1 if the glyph paints at (x, y). Out of range, or a glyph with no bits, is
 * 0. The LSB-first column order is handled here so no caller repeats it. */
int ez2_font_pixel(const ez2_glyph *g, int x, int y);

/* Total advance of a string, in pixels. */
int ez2_font_text_width(const ez2_font *f, const char *s);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_FONT_H */
