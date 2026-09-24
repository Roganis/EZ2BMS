/* The screen layout - what the `.ini`'s `Wide` key means in the port.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * `Wide` is a real key in the operator's EZ2AC.ini and the original READS it
 * four times - `KEngineApp::create` @0x401450, `EZ2AC::readSettings`
 * @0x415a40, `EZ2AC::loadCounters` @0x4156c0, `saveSettings` @0x415310 - and
 * then never uses the value: a scan of the whole of `.text` finds three
 * references to `g_wide` @0x16963e4 and one to `g_1b2eb64`, all of them
 * writes. The window it sizes cannot reach the screen either, because
 * `createPrimary` @0x405740 forces `SetDisplayMode(640, 480, 32, ...)`. The
 * key was wired up and abandoned.
 *
 * The port makes it mean something, and the whole of the policy is here. See
 * ../WIDESCREEN.md for the evidence and the design; the two facts that matter
 * to a reader of this header are:
 *
 *   DESIGN SPACE IS 640x480 AND NOTHING HERE CHANGES THAT. Every coordinate
 *   the game computes stays in it. A wider CANVAS is a presentation choice
 *   that the platform layer applies as an anchor offset at draw time.
 *
 *   AT `Wide = 0` EVERY ANSWER HERE IS THE IDENTITY - canvas 640x480, gutter
 *   zero, every anchor a no-op. The 4:3 fallback is this code path with a
 *   zero in it, not a second one that could drift.
 */
#ifndef EZ2_LAYOUT_H
#define EZ2_LAYOUT_H

#ifdef __cplusplus
extern "C" {
#endif

/* Design space. Not configurable, by design. */
#define EZ2_DESIGN_W 640
#define EZ2_DESIGN_H 480

/* These mirror the platform layer's EZ_ANCHOR_* one for one, so a value can
 * be handed straight to ezPushAnchor. ez2core must not depend on the platform
 * header (the oracle links it without a renderer), which is why they are
 * declared twice rather than shared; test_enums_agree() in
 * ../tests/test_layout.c is what stops them drifting apart. */
enum {
    EZ2_ANCHOR_LEFT = 0,
    EZ2_ANCHOR_CENTER,
    EZ2_ANCHOR_RIGHT,
    EZ2_ANCHOR_CANVAS,
    EZ2_ANCHOR_COVER
};

/* What the background does with the room the anchored panels open up. The
 * measured trade-off is in ../WIDESCREEN.md part 5. */
enum {
    EZ2_BGA_COVER = 0,   /* scale to fill; crops 60 design rows top and bottom */
    EZ2_BGA_NATIVE,      /* 640x480 centred; black behind the panels */
    EZ2_BGA_BACKDROP     /* the gutters covered, the middle native */
};

/* And what the screens that are NOT the play field do with it. `bg` scales
 * the backdrop and leaves the furniture alone, which is the default because
 * covering a whole UI screen eats the top and bottom rows it keeps its
 * headers and hint bars in (../WIDESCREEN.md 6f/6g). */
enum {
    EZ2_UI_BG = 0,       /* backdrop covers, UI stays in design space */
    EZ2_UI_CENTER,       /* nothing scales - the 640 design, pillarboxed */
    EZ2_UI_COVER         /* the whole composition scales, UI included */
};

typedef struct ez2_layout {
    int canvas_w, canvas_h;    /* what is presented */
    int window_w, window_h;    /* what to ask the platform for */
    int gutter;                /* canvas_w - 640, the room the anchors hand out */
    int bga_mode;              /* EZ2_BGA_* */
} ez2_layout;

/* `wide` is the .ini's own number, and the port keeps the original's meaning
 * of each value rather than redefining them:
 *
 *   0  640x480 canvas, 640x480 window   - the default and the fallback
 *   1  854x480 canvas, 854x480 window   - 16:9, the anchored layout
 *   2  640x480 canvas, 1440x1080 window - the original's "big 4:3 window";
 *                                         1440x1080 IS 4:3, not widescreen
 *
 * Anything else is treated as 0. `bga_mode` is EZ2_BGA_* and out-of-range
 * falls back to EZ2_BGA_COVER. */
void ez2_layout_from_wide(int wide, int bga_mode, ez2_layout *out);

/* WHICH EDGE A PLAY FIELD BELONGS TO, from its horizontal extent in design
 * space. Measured over all 712 shipped STYLE_*.pvi files, fields come in
 * exactly two families: two-player modes put 1P hard against the left edge
 * and 2P hard against the right, an outer margin of a couple of dozen pixels
 * at most, while single-field modes sit centred with margins that agree
 * within a few pixels (../tests/test_layout.c re-measures the shipped skins
 * whenever EZ2_ROOT is set). So the rule is a ratio of the two margins and
 * needs no per-mode table:
 *
 *   min(Lgap, Rgap) / max(Lgap, Rgap) >= 0.5  ->  CENTER
 *   Lgap < Rgap                               ->  LEFT
 *   otherwise                                 ->  RIGHT
 *
 * A degenerate box (right <= left) is CENTER, which is what a mode with no
 * skin should get. */
int ez2_layout_anchor_for_box(int left, int right);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_LAYOUT_H */
