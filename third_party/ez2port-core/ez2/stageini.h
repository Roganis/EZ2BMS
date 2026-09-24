/* `stage.ini` — the Radio modes' course lists.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THE RADIO MODES HAVE NO `song.bin`, and that is not an omission: they do not
 * offer songs, they offer COURSES. Each mode's `system/<mode>/stage.ini` names
 * them, and its `.gds` says how many stages one runs — `MaxBaseStage=4` for
 * every Radio mode in the shipped tree, which is exactly how many each course
 * lists.
 *
 * **Every mode has a `stage.ini`, not only the Radio ones** — checked rather
 * than assumed, after this header first claimed otherwise. A normal mode's
 * holds a single `ALLSONG` key listing its songs, which duplicates what
 * `song.bin` already says and is why nothing here reads it. Only a file with a
 * `channel_normal` key describes courses, so that key is what this parser
 * requires; a mode without one is `EZ2_STAGEINI_ERR_EMPTY`, which is a true
 * statement about the file rather than about the mode.
 *
 * The file is encrypted with the ordinary `.ini` cipher, and decrypts to:
 *
 *     "channel_normal" = "5d;5399m;y7lightonix;...;15fex"
 *     "5d"             = "5lom-dd;5darkness-dd;5lucid-dd;5hyper-dd"
 *     "5d_Level"       = "16"
 *
 * `channel_normal` is the course list in menu order; each course key lists its
 * stages; `<course>_Level` is the difficulty the select screen prints. The
 * suffix is matched IGNORING CASE because the data is inconsistent about it -
 * `11wbu_level` is lower case where every other one is `_Level`.
 *
 * THE GAME'S OWN KEY IS A FORMAT STRING, `%s_level` @0x491bd4, IN LOWER CASE.
 * It builds `<course>_level` and looks that up, which is why the data's
 * inconsistent spelling does not trouble it - and why matching case-insensitively
 * here is right for the right reason rather than by luck.
 *
 * TWO MORE PER-COURSE KEYS EXIST AND ARE NOT PARSED: `%s_goal` @0x491bec and
 * `%s_grow` @0x491c00, beside `%s_level` in the same literal pool. Neither
 * appears in ANY of the thirteen shipped `stage.ini` files (`_level` appears
 * 239 times; those two, zero), so nothing is lost today - but a course file
 * that used them would be read as though it had not. Two semicolon-list
 * literals sit adjacent and are plausibly their defaults, four values each for
 * four stages; that is pool adjacency, not proof, so nothing here acts on it.
 *
 * ---- resolving a stage to a chart -----------------------------------------
 *
 * A stage name carries a course tag: `5lom-dd` is the song `5lom` played in
 * course `dd`. So the song FOLDER is the name minus that tag, and the chart is
 * the mode's ordinary `<mode><N>p-<stage>.ez` inside it - the whole stage name,
 * tag included:
 *
 *     5lom-dd  ->  sound/5lom/5radiomix1p-5lom-dd.ez
 *
 * Each Radio mode ships its OWN chart for the same stage - `radiomix1p-` and
 * `5radiomix1p-` versions of `5lom-dd` both exist - so the prefix is the
 * mode's, exactly as it is for a song table.
 *
 * ---- one thing to check rather than assume --------------------------------
 *
 * The file is `Stage.ini` under `14radiomix` and `stage.ini` under the other
 * three. It resolves case-insensitively like everything else here; a literal
 * lookup finds three of the four and reports the fourth as a course-less mode,
 * which is exactly the wrong conclusion.
 */
#ifndef EZ2_STAGEINI_H
#define EZ2_STAGEINI_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_STAGE_NAME    64
/* A song key out of ALLSONG. The song table's own keys are 16 bytes; 32 is
 * room to spare and keeps the array cheap. */
#define EZ2_STAGEINI_KEY  32

/* A COURSE'S LIST IS NOT ALWAYS ITS STAGES. 233 of the library's 239 courses
 * list exactly four, matching `MaxBaseStage=4` - but six list between 51 and
 * 90, and those are POOLS that the game draws from at run time.
 * `InGame::pickDistinct` @0x433cf0 picks EIGHT DISTINCT entries with
 * `rand() % n`, reseeding `srand(time(0))` on every call, and writes them into
 * the song-name table at 0x1b2ec18. The course keys `random`, `random2`,
 * `random3` and `random4` name that path @0x43d708.
 *
 * So the list is heap-allocated rather than a fixed array. It was `[8]` in the
 * first version of this file, which truncated the longest pool from ninety
 * entries to eight WITHOUT SAYING SO - and a test asserting "a course need not
 * have four stages" passed the whole time. */
typedef struct ez2_course {
    char key[EZ2_STAGE_NAME];
    int  level;                              /* 0 if the file gives none */
    int  stage_count;
    char (*stage)[EZ2_STAGE_NAME];           /* stage_count entries */
} ez2_course;

/* 1 if this course lists more entries than a run plays - a pool to draw from
 * rather than a fixed running order. `stages_per_run` is the mode's
 * `MaxBaseStage`, 4 everywhere in the shipped tree. */
#define EZ2_COURSE_IS_POOL(c, stages_per_run) ((c)->stage_count > (stages_per_run))

typedef struct ez2_stageini {
    int         count;
    ez2_course *courses;
} ez2_stageini;

/* Parse decrypted text. Returns 0, or a negative ez2_stageini_err. */
int  ez2_stageini_parse(const char *text, size_t n, ez2_stageini *out);

/* Find, decrypt and parse `system/<mode>/stage.ini`. `exe_path` is the user's
 * own unpacked executable, which is where the cipher table lives. A mode with
 * no such file is EZ2_STAGEINI_ABSENT, not an error - only the Radio modes
 * have one. */
/* THE SELECT WHEEL'S ORDER, which is NOT the song table's.
 *
 * This header used to say a normal mode's `ALLSONG` "duplicates what song.bin
 * already says and is why nothing here reads it". True of the SET, and true of
 * the order for every keys mode - 5KeyMix's two lists agree entry for entry.
 * **It is false for CV2Mix**, whose 99 songs are folders named `1`..`99`:
 * `ALLSONG` lists them 1, 2, 3, ... and `song.bin` holds them 92, 36, 64, 7,
 * ... So the wheel came out shuffled, and so did the disc art, because
 * `SongSelectDirector`'s ctor indexes it by LOOP POSITION -
 * `cv2disc_%02d.bmp` with `i + 1` (../../src/songselectctor.cpp:858).
 *
 * The game builds its entry array from `ALLSONG` and looks the metadata up per
 * entry (../../src/songselectctor.cpp:432), so this order is the authority and
 * `song.bin` is the lookup. Returns how many keys were written, in file order,
 * or a negative `ez2_stageini_err`. A mode with no `ALLSONG` returns 0, which
 * leaves the caller on the table's own order - the old behaviour. */
int  ez2_stageini_allsong(const char *root, const char *mode_name,
                          const char *exe_path,
                          char (*out)[EZ2_STAGEINI_KEY], int max);

int  ez2_stageini_load(const char *root, const char *mode_name,
                       const char *exe_path, ez2_stageini *out);

void ez2_stageini_free(ez2_stageini *s);

/* By key, ignoring case. Null if there is no such course. */
const ez2_course *ez2_stageini_find(const ez2_stageini *s, const char *key);

/* A stage name to the chart that plays it, resolved against the tree. Returns
 * 1 on success. `players` is the digit in `<mode><N>p-`. */
int  ez2_stage_chart(const char *root, const char *mode_name,
                     const char *stage, int players, char *out, size_t n);

enum ez2_stageini_err {
    EZ2_STAGEINI_OK      =  0,
    EZ2_STAGEINI_ABSENT  = -1,   /* this mode has no course list */
    EZ2_STAGEINI_ERR_ARG = -2,
    EZ2_STAGEINI_ERR_READ = -3,
    EZ2_STAGEINI_ERR_MEM = -4,
    EZ2_STAGEINI_ERR_EMPTY = -5  /* decrypted, but no channel list in it */
};

const char *ez2_stageini_strerror(int err);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_STAGEINI_H */
