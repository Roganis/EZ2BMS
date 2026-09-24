/* EZ2AC `.scr` - the background scene timeline.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * A `.scr` sequences `.str` clips and `.bmp` textures against a song. Loader
 * wrapper @0x45cd40, fix-up pass @0x41b680, sequencer near @0x46be20.
 *
 * TICKS ARE FRAMES AT 60 Hz, not musical ticks - `seconds = tick / 60`. Do not
 * route them through the chart's BPM clock. The prior RE records this as
 * settled after many cabinet iterations, so it is a conclusion, not a guess.
 *
 * ---- the layout, read off @0x41b680 ---------------------------------------
 *
 *     +0x00  "SCR0"
 *     +0x0c  TEN sections, each:
 *              [u32 size]     the authoring tool's byte count - see below
 *              [u32 count]
 *              count records, each:
 *                [u32 tick][u32 type] + a tail whose size the TYPE decides
 *
 *     type 1      8 bytes total, no name    a control record
 *     type 2, 3   136 bytes, name at +8     strcat ".str", loadStr @0x402de0
 *     type 4, 5   164 bytes, name at +36    strcat ".bmp", loadTexture @0x408d00
 *
 * Any other type is a hard error in the original - it logs and returns 0 - and
 * is `EZ2_SCR_ERR_TYPE` here.
 *
 * VERIFIED, NOT INFERRED: walking every SCR0 file in the shipped tree this way
 * lands exactly on the last byte in **294 of 294**. The reader that this
 * replaced scanned for plausible names and read the two words in front, which
 * could not report sections at all and missed the 35 `.bmp` records entirely.
 *
 * **Do not validate against the section `size` word.** The engine never does -
 * it overwrites the header with pointers - and just as well, because the word
 * is computed with 144 for a type-4/5 record where the engine advances 164. It
 * is short by exactly 20 per such record in 23 of the library's 2,940 section
 * headers.
 *
 * ---- what a section IS, read off the sequencer @0x45c6a0 -----------------
 *
 * TEN SECTIONS, TEN CLIP PLAYERS, PLAYED AT ONCE. The scene object holds ten
 * `Obj402860` clip players at +0x1006a0, stride 0x21c, built by the array-ctor
 * iterator @0x41b559 - and the reset @0x41b4a0 walks the ten section headers
 * and the ten players in lockstep. Section `i` drives player `i`. They are
 * concurrent LAYERS, not alternatives, and nothing selects between them.
 *
 * The sequencer is one pass per frame:
 *
 *     for (sec = 0; sec < 10; sec++) {
 *         rec = hdr[sec].cursor;
 *         if (!rec || now < rec->tick) continue;
 *         stop(sec, hdr[sec].playing);          // @0x41af50
 *         start(sec, rec);                      // @0x45c5f0
 *         hdr[sec].playing = rec;
 *         hdr[sec].cursor  = next(rec);         // 0 once it passes .end
 *     }
 *
 * In memory each 16-byte header is `{start, playing, cursor, end}`; on disk
 * the first two words are `{size, count}` and the fix-up overwrites them.
 *
 * ---- and what each record type DOES - all five READ, 2026-08-13 -----------
 *
 *     type 1   stop this section's player            @0x402890
 *     type 2   attach the clip, ONE-SHOT             @0x4028b0, flag 0
 *     type 3   attach the clip, LOOPING              @0x4028b0, flag 1
 *     type 4   the waving FLAG                       @0x406600 + @0x45c730
 *     type 5   the procedural cloth MESH             @0x409d90 + @0x41afc0
 *
 * **The type 2/3 boolean IS "loop", read off the player's advance @0x4029b0:**
 * when every layer has finished, flag 0 DETACHES the clip (`*this = 0` - the
 * layer goes dark) and flag 1 rewinds the cursor and pose state and plays it
 * again. The earlier reading here, that type 3 was the normal scene and
 * type 2 a "COOL" alternative told apart by a `cool` or `iba` token in the
 * name, was wrong on both counts: the token appears in only 380 of 15,509
 * events, spread across every type, and the two types reach the same handler.
 *
 * **Types 4 and 5 are the scene's two 3D DECORATIONS**, and the draw pass
 * @0x41b040 is what gives the "current record" its meaning: each frame, each
 * section draws whatever its current record's type says - the attached clip
 * for 2/3, the flag for 4, the mesh for 5.
 *
 *   type 4 - the FLAG. The scene embeds a GfxFlag block at +0x101bb8 (0x4bc
 *   bytes - it ends exactly at the mesh pointer, +0x102074). startRecord
 *   @0x45c5f0 writes the record's two floats (+0x10, +0x14) into the block's
 *   first pair via the matched setter @0x406600 - and those are the cloth
 *   SIMULATION constants, not a position: every shipped record carries the
 *   same 0.3f / 0.00012f the background constructors hand to createFlag
 *   @0x406620. The per-frame draw @0x45c730 accumulates the record's +0x08
 *   into a rotation at +0x28 (0.0 in every shipped record - static),
 *   oscillates an angle at +0x2c by the step at +0x0c between two bounds
 *   (@0x48e1d0/@0x48e1d4, direction latch at +0x30; shipped files use 0.0
 *   or 1.0), then steps the cloth simulation (@0x406900) and draws it
 *   (@0x406850) under the record's own blend pair (+0x18 src, +0x1c dst)
 *   and texture.
 *
 *   type 5 - the MESH. @0x409d90 builds a SINGLETON procedural mesh (globals
 *   @0xd49cb8; three malloc'd buffers freed by @0x409420) from four record
 *   fields: +0x08 = int segment count (100 in every shipped record; sizes
 *   every buffer), +0x0c and +0x10 = float shape parameters (shipped:
 *   0.008..0.021 and 1.0), +0x14 = path mode - 1 traces a circle (cos/sin;
 *   the only value shipped), any other value a flat cos(2t) ribbon - and
 *   stores its address at scene +0x102074. Per frame @0x41afc0 steps and
 *   draws it (@0x40a300 + @0x409480) under the record's blend and texture;
 *   the stop pass @0x41af50 frees it when the section moves on.
 *
 *   The library carries THIRTEEN scenes with these records - flags in eleven
 *   (sun.bmp, hu.bmp, pink8.bmp, sky_an0014.bmp...), the cloth in two
 *   (frantic1.scr and test.scr, both waving back-heart.bmp).
 *
 *   Both textures come from the record's `.bmp` name at +0x24: the fix-up
 *   pass loads it (@0x408d00) and stores the KTexture pointer IN PLACE over
 *   the name's first bytes - the same scheme as the type 2/3 `.str` head at
 *   +0x08 - and the type-4 runtime fields (+0x28, +0x2c initialised to the
 *   angle constant @0x48e2c0, +0x30) overlay the dead name's tail.
 *
 * Eleven files have no magic at all; those keep the old name-scanning path and
 * report `section == -1`, because it genuinely cannot tell.
 */
#ifndef EZ2_SCR_H
#define EZ2_SCR_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_SCR_NAME 128
#define EZ2_SCR_SECTIONS 10

/* The record types the fix-up pass @0x41b680 dispatches on. */
typedef enum ez2_scr_rectype {
    EZ2_SCR_CONTROL = 1,   /* 8 bytes, no name - stop the section */
    EZ2_SCR_CLIP    = 2,   /* names a .str - play the clip once */
    EZ2_SCR_LOOP    = 3,   /* names a .str - play the clip looping */
    EZ2_SCR_FLAG    = 4,   /* names a .bmp - the waving flag decoration */
    EZ2_SCR_CLOTH   = 5    /* names a .bmp - the cloth-mesh decoration */
} ez2_scr_rectype;

/* The pre-2026-08-13 names, kept so old readers still compile; the semantics
 * are in the header comment above. */
#define EZ2_SCR_STR_A EZ2_SCR_CLIP
#define EZ2_SCR_STR_B EZ2_SCR_LOOP
#define EZ2_SCR_BMP_A EZ2_SCR_FLAG
#define EZ2_SCR_BMP_B EZ2_SCR_CLOTH

typedef struct ez2_scr_event {
    unsigned int tick;                 /* frames at 60 Hz */
    unsigned int type;                 /* an ez2_scr_rectype */
    int          section;              /* 0..9, or -1 in a headerless file */
    char         name[EZ2_SCR_NAME];   /* "" for a control record */
} ez2_scr_event;

typedef struct ez2_scr {
    int            count;
    ez2_scr_event *events;
    int            has_magic;          /* 0 for the legacy headerless files */
    int            section_count[EZ2_SCR_SECTIONS];
} ez2_scr;

/* 1 if this record names a `.str` clip, 0 if a `.bmp` or a control record. */
#define EZ2_SCR_IS_STR(t) ((t) == EZ2_SCR_STR_A || (t) == EZ2_SCR_STR_B)
#define EZ2_SCR_IS_BMP(t) ((t) == EZ2_SCR_BMP_A || (t) == EZ2_SCR_BMP_B)

/* Returns 0, or a negative ez2_scr_err. Caller must ez2_scr_free on success.
 * An empty scene is not an error - a file may legitimately declare ten empty
 * sections. */
int  ez2_scr_parse(const unsigned char *data, size_t n, ez2_scr *out);
void ez2_scr_free(ez2_scr *s);

/* ---- the EZ2DJ 1st BACKGROUND FORMAT - what a headerless file really is --
 *
 * The engine's .scr parser falls back to a SECOND, OLDER format when the
 * buffer does not begin "SCR0" - its own error string names it "EZ2DJ 1st
 * Background". Read off `BackGround::m41b0c0` @0x41b0c0 / `CatchBackGround::
 * m46b0e0` @0x46b0e0 (../../src/bgparse1st.cpp, both 169/169 instructions):
 *
 *     i32 frames
 *     per frame: i32 a; i32 b; then EXACTLY THREE sub-records
 *
 * A sub-record is `i32 kind` + a kind-sized payload:
 *
 *     kind 0, 5     nothing - just the kind word
 *     kind 1        0x84 bytes; a clip name the engine loads via loadStr
 *     kind 2        0x80 bytes; the same load
 *     kind 3, 4, 6  8 bytes (kept here as `prefix`), then 0x80 bytes whose
 *                   name the engine copies but does NOT load
 *     anything else fails the parse ("Unsuported Type", sic)
 *
 * The names arrive WITHOUT an extension and the engine strcat()s ".str" -
 * appended even past an existing dot, unlike SCR0's set-extension rule.
 *
 * Twelve files in the shipped tree are this format (freedom, rave, letitgo,
 * minus144, ...), and the walk lands exactly on freedom.scr's last byte
 * (4 + 6 * 0x94 = 892). WHAT THE TWO FRAME WORDS MEAN IS UNREAD - the
 * runtime that consumes the parsed table (+0x102138) is not reconstructed
 * yet - so this parser exposes them raw as `a` and `b` and deliberately does
 * NOT map frames onto ez2_scr_event ticks. ez2_scr_parse keeps its legacy
 * name-scanning fallback for playback until the player is read. */

typedef struct ez2_scr1_sub {
    int           kind;
    char          name[EZ2_SCR_NAME];  /* "" for kinds 0 and 5 */
    unsigned char prefix[8];           /* kinds 3/4/6: the skipped words */
} ez2_scr1_sub;

typedef struct ez2_scr1_frame {
    int          a, b;                 /* semantics unread - see above */
    ez2_scr1_sub sub[3];
} ez2_scr1_frame;

typedef struct ez2_scr1 {
    int             frame_count;
    ez2_scr1_frame *frames;
} ez2_scr1;

/* Parse a 1st-format buffer. Returns 0 (caller must ez2_scr1_free), or a
 * negative ez2_scr_err - EZ2_SCR_ERR_TYPE for an unknown sub-record kind,
 * EZ2_SCR_ERR_TRUNC for a walk that leaves the buffer. A buffer that begins
 * "SCR0" is refused as EZ2_SCR_ERR_SHORT: it belongs to ez2_scr_parse. */
int  ez2_scr1_parse(const unsigned char *data, size_t n, ez2_scr1 *out);
void ez2_scr1_free(ez2_scr1 *s);

/* Does this buffer walk cleanly as the 1st format? Cheap probe for a caller
 * holding a headerless file; parses and throws the result away. */
int  ez2_scr1_sniff(const unsigned char *data, size_t n);

/* A record's name to the file it means.
 *
 * THE ENGINE DOES NOT strcat THE EXTENSION, IT SETS IT. @0x413000 finds the
 * FIRST `.` in the name and overwrites from there, appending only when there
 * is none - so `WAVE.str` stays `WAVE.str` and a bare `BACK` becomes
 * `BACK.str`. Passing the name through unchanged loses every bare stem, and
 * `bg/rdm/` alone names 130 of them.
 *
 * `ext` is ".str" for a type 2/3 record and ".bmp" for a type 4/5 one. Returns
 * 1 on success. (First dot, not last: a name with two dots truncates at the
 * first, which is what the original does.) */
int ez2_scr_asset_name(const char *record_name, const char *ext,
                       char *out, size_t n);

/* The scene's state at `tick`: for each of the ten sections, the index into
 * `s->events` of the record in force - the last one whose tick has arrived -
 * or -1 for a section that is stopped or has not started.
 *
 * This is the sequencer @0x45c6a0 asked as a question instead of run as a
 * loop, which is what a port wants for scrubbing and for a headless render. A
 * type-1 record stops its section, so it resolves to -1 rather than to itself.
 *
 * `out` must have room for EZ2_SCR_SECTIONS entries. */
void ez2_scr_state_at(const ez2_scr *s, unsigned int tick, int *out);

enum ez2_scr_err {
    EZ2_SCR_OK        =  0,
    EZ2_SCR_ERR_SHORT = -1,
    EZ2_SCR_ERR_EMPTY = -2,   /* headerless, and no names found in it */
    EZ2_SCR_ERR_MEM   = -3,
    EZ2_SCR_ERR_TYPE  = -4,   /* a record type the original rejects too */
    EZ2_SCR_ERR_TRUNC = -5    /* a section runs past the end of the file */
};

const char *ez2_scr_strerror(int err);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SCR_H */
