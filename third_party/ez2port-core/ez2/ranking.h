/* `rank_<mode>_<chart>.bin` — a chart's local top five.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * What the result screen shows and what finishing a chart writes back. Sixty
 * bytes, NOT encrypted - unlike `song.bin` beside it, which needs a cipher and
 * the executable.
 *
 *     +0x00  char name[5][8]   five names, EIGHT bytes each, not terminated
 *     +0x28  int  score[5]
 *
 * The layout is not guessed from the file: the reader's missing-file branch
 * @0x430e62 fills exactly that shape, storing "EZ2AC_FN" a byte at a time with
 * a stride of 8 into one buffer and zeroing `[edx + i*4]` into another, five
 * times. Every shipped file matches - forty bytes of `EZ2AC_FN` then twenty
 * zero bytes - because none of them has ever been played on.
 *
 * The path is `sound\rank_%s_%s%s` (@0x4918a8): the mode name, the song, and a
 * TIER SUFFIX which is one of `.bin`, `-hd.bin`, `-shd.bin`, `-ex.bin`. The
 * mode is spelled as the game spells it (`5keyMix`), which is not how the
 * directories spell it, so lookup goes through ez2_vfs_child like everything
 * else.
 *
 * The `sound\e_rank_%s_%s%s` sibling @0x4918bc is now READ (2026-08-29, from
 * `src/rankingentry.cpp` / `src/songselecttier.cpp`): the SAME 60-byte record,
 * selected in place of `rank_` when `g_1b2eb70` is set - and that flag is a
 * HIDDEN BUTTON CODE, code 0 of the three the mode-select screen matches
 * (`ModeSelectDirector::m44c690` @0x44c690), cleared by TitleDirector's ctor.
 * It also swaps the EZ2CATCH rank-name art. So `e_rank_*` is a secret
 * alternate ranking table; still not handled here because the port has no
 * hidden-code input - when it grows one, add the path variant, nothing else
 * differs. `system\ranking\ranking_%s_%s.bin` @0x491984 is the mode-wide
 * table's RADIO CHANNEL variant - handled below.
 *
 * The other two default names in the binary - `AAAAAAAA` @0x491954 and eight
 * spaces @0x49196c - suggest the entry name is a fixed eight-character field
 * that is padded rather than terminated. Every file confirms it.
 *
 * ## The writer side, read 2026-08-09
 *
 * Four functions touch these files, and between them they settle everything
 * this header used to guess at:
 *
 *   @0x430cf0  READ, tiered.  `(song, char names[5][8], int scores[5], tier)`,
 *              `__stdcall`, `ret 0x10`. Builds the path with the tier suffix,
 *              `_access(path, 0)`, and on ENOENT fills the defaults in place
 *              and returns 0 WITHOUT creating a file; otherwise fopen "rb",
 *              five `fread(name, 8, 1)`, five `fread(score, 4, 1)`, returns 1.
 *              Its one caller is @0x4361fe.
 *   @0x434b80  READ-OR-CREATE, untiered. Same shape, but on ENOENT it fopen
 *              "wb" and writes the default table out before reading it back.
 *   @0x450690  the result screen's placement pass (untiered).
 *   @0x466ee0  the same pass in a second screen class.
 *
 * The two placement passes are what a port's "save" has to agree with, and
 * they run in this order:
 *
 *   1. build `sound\rank_<mode>_<song>.bin` - **no separate tier suffix**,
 *      because the song string these use (`0x1b2ec18 + index*0x80`) already
 *      carries it. `rank_5keyMix_15finite-ex.bin` is a shipped file and the
 *      two spellings agree.
 *   2. absent -> create it with the default table. The default NAME is not
 *      constant across the four: `EZ2AC_FN` @0x430cf0/@0x434b80, `EZ2AC_TT`
 *      @0x495c44 in @0x450690, and a 5-char `EZ2AC` @0x48cf48 fwritten as 8
 *      bytes in @0x466ee0. Every shipped file holds `EZ2AC_FN`, so that is
 *      the one to write.
 *   3. read the table back, **sort it descending**, and write it back out -
 *      before the player's score is looked at at all. The sort is a selection
 *      sort whose swap is guarded `jge` (@0x4507a8, @0x466fe8), so it does
 *      NOT swap on equal scores: it is stable, and an existing entry keeps
 *      its place against a tie.
 *   4. the placement is the first slot the new score STRICTLY beats -
 *      `cmp %eax,scores[i]; jl` @0x450980. So `ez2_ranking_place`'s
 *      tie-breaking was right, and it is no longer a choice: it is read.
 *
 * The insert itself (@0x4508cb) shifts the local array down from slot 4 and
 * stores the score at the placement, but that array is never written back -
 * these functions only decide WHERE the player landed, so the screen can show
 * it. Committing the name happens after name entry, which is not read yet.
 * `ez2_ranking_submit` below does load-place-insert-save in one step, which is
 * the behaviour a port wants and is not claimed to be the original's shape.
 *
 * One oddity, recorded and deliberately not reproduced: the name half of both
 * sort swaps walks its records with a stride of **0x20**, not 8, while the
 * file only ever holds 40 bytes of names. It also reads one side as a signed
 * char and writes the other as a dword. Sorting a table with distinct scores
 * would therefore scramble stack outside the names array. Nothing can be
 * checked against it - every shipped file is pristine, so no name has ever
 * been sorted - and a port has no reason to copy a bug into a file format.
 */
#ifndef EZ2_RANKING_H
#define EZ2_RANKING_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_RANK_SLOTS 5
#define EZ2_RANK_NAME  8
#define EZ2_RANK_BYTES (EZ2_RANK_SLOTS * (EZ2_RANK_NAME + 4))   /* 60 */

/* The default the game writes when there is no file: five of these, score 0. */
#define EZ2_RANK_DEFAULT_NAME "EZ2AC_FN"

typedef struct ez2_rank_entry {
    char name[EZ2_RANK_NAME + 1];   /* trailing spaces kept, terminator added */
    int  score;
} ez2_rank_entry;

typedef struct ez2_ranking {
    ez2_rank_entry slots[EZ2_RANK_SLOTS];
} ez2_ranking;

/* Five `EZ2AC_FN` at zero - what @0x430e62 fills in when the file is absent. */
void ez2_ranking_defaults(ez2_ranking *out);

/* Parse exactly EZ2_RANK_BYTES. Returns 0, or a negative ez2_ranking_err. */
int  ez2_ranking_parse(const unsigned char *data, size_t n, ez2_ranking *out);

/* Serialise back to EZ2_RANK_BYTES, so a port that finishes a chart can write
 * the file the game would read. `buf` must hold EZ2_RANK_BYTES. */
void ez2_ranking_write(const ez2_ranking *r, unsigned char *buf);

/* Load a chart's table. `tier` is 0..3 as ez2_songdb numbers them; the file's
 * suffix follows. Missing is not an error - `out` gets the defaults and the
 * call returns EZ2_RANKING_ABSENT, which is what the game does. */
int  ez2_ranking_load(const char *root, const char *mode_name,
                      const char *song, int tier, ez2_ranking *out);

/* Where that file lives, whether or not it exists yet - which is what tells
 * `load` and `save` apart, since ez2_vfs_child cannot resolve a name with no
 * file behind it. `sound/` still resolves case-insensitively; the leaf falls
 * back to its literal spelling. Returns 1 on success. */
int  ez2_ranking_path(const char *root, const char *mode_name,
                      const char *song, int tier, char *out, size_t n);

/* THE SECRET TABLES. With the flag up, every per-chart path builds
 * `e_rank_` instead of `rank_` - the alternate five-slot tables selected by
 * `g_1b2eb70`, which is HIDDEN BUTTON CODE 0 on the mode-select screen
 * (buttons 6,7,8,9 in order; ModeSelectDirector::m44c690 @0x44c690) and is
 * cleared by TitleDirector's ctor. Module state, matching the original's
 * global; same record shape either way. */
void ez2_ranking_set_alt(int on);
int  ez2_ranking_get_alt(void);

/* Sort descending, stably - the normalising pass @0x450690 runs on every
 * table it opens, before anyone's score is compared against it. Equal scores
 * keep their order, so the entry already in the table stays ahead. */
void ez2_ranking_sort(ez2_ranking *r);

/* Write the 60 bytes back. Returns 0, or a negative ez2_ranking_err. */
int  ez2_ranking_save(const char *root, const char *mode_name,
                      const char *song, int tier, const ez2_ranking *r);

/* load -> sort -> place -> insert -> save, in one call. Returns the place
 * 0..4, or -1 if the score did not make the table (in which case nothing is
 * written). `out`, if given, receives the table as it now stands on disk -
 * or as it stands unchanged when the score missed.
 *
 * This is the port's convenience, not a function the original has: the game
 * splits the placement (@0x450690) from the commit that follows name entry. */
int  ez2_ranking_submit(const char *root, const char *mode_name,
                        const char *song, int tier,
                        const char *name, int score, ez2_ranking *out);

/* Where a score would place, 0..4, or -1 if it does not make the table.
 *
 * Ties do not displace - an equal score places BELOW the one already there,
 * so matching third place lands at four. That is a CHOICE, not a finding: the
 * writer side of this file has not been read, so which way the original breaks
 * a tie is unknown. It is the conventional way round and costs nothing to
 * change if the writer ever says otherwise. */
int  ez2_ranking_place(const ez2_ranking *r, int score);

/* ---- the MODE-WIDE table: system\ranking\ranking_<mode>.bin --------------
 *
 * What the RANKING SCREEN shows, and a different file from the per-chart
 * `sound/rank_*.bin` above. Read off the screen's own loader
 * @0x4580e0..0x45820a: when the file is absent it seeds NINETY-NINE 50-byte
 * slots ("EZ2AC_FN", stride 0x32 @0x458143) plus ninety-nine dword scores in
 * a separate array - and then writes the names with fwrite(base, 8, 0x63),
 * NINETY-NINE EIGHT-BYTE elements out of the STRIDE-FIFTY array. So the
 * file's 792-byte name region is the first 792 bytes of the in-memory block:
 * name slot k survives the trip only while k*50+8 <= 792, i.e. the first
 * SIXTEEN. The scores follow intact: 99 dwords at +792, 1188 bytes in all -
 * exactly the size every shipped file has. The same cousin-bug as the
 * per-chart sort's 0x20-stride walk (ranking.h above): consistent in both
 * directions, so the game never notices. Every shipped table is factory
 * default - no name has ever been entered on this cabinet's files. */
#define EZ2_MODERANK_SLOTS 99
#define EZ2_MODERANK_NAMED 16
#define EZ2_MODERANK_BYTES 1188

typedef struct ez2_mode_ranking {
    char name[EZ2_MODERANK_NAMED][EZ2_RANK_NAME + 1];
    int  score[EZ2_MODERANK_SLOTS];
} ez2_mode_ranking;

/* Missing is not an error: `out` gets the seeded defaults, exactly what the
 * creator @0x458143 writes, and the call returns EZ2_RANKING_ABSENT.
 *
 * THE FILE COMES IN FOUR SPELLINGS (RankingDirector's ctor @0x457a90,
 * `src/rankingctor.cpp` - which also confirms the stride-50 in-memory block
 * this header's reading inferred: `char names[99][0x32]` at +0x20cc):
 *
 *     ranking_<mode>.bin                      one player
 *     ranking_<mode>_battle.bin               two players
 *     ranking_<mode>_<channel>.bin            radio family, per channel
 *     ranking_<mode>_<channel>_battle.bin     both at once
 *
 * The channel variant is loaded IN ADDITION to the mode table, into its own
 * block - a radio caller that wants both makes two calls. `channel` NULL and
 * `battle` 0 name the plain table. */
int ez2_mode_ranking_load(const char *root, const char *mode_name,
                          const char *channel, int battle,
                          ez2_mode_ranking *out);

/* Insert at that place, pushing the rest down and dropping the last. */
void ez2_ranking_insert(ez2_ranking *r, int place, const char *name, int score);

enum ez2_ranking_err {
    EZ2_RANKING_OK     =  0,
    EZ2_RANKING_ABSENT =  1,   /* no file; `out` holds the defaults */
    EZ2_RANKING_ERR_ARG = -1,
    EZ2_RANKING_ERR_SIZE = -2  /* present but not 60 bytes */
};

#ifdef __cplusplus
}
#endif

#endif /* EZ2_RANKING_H */
