/* `song.bin` — the per-mode song table, and its own cipher.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * One `song.bin` per mode under `system/<mode>/`, beside that mode's `.gds`.
 * It is what song select lists and what `loadSongInfo` @0x431660 (matched,
 * ../../src/songinfo.cpp) reads a chart's difficulty levels out of.
 *
 * A FOURTH CIPHER, not the `.ez`/`.ezi`/`.ini` one. `loadBinFile` @0x469c30
 * decrypts in place with a per-byte loop over two adjacent 32-byte tables at
 * 0x4ae9dc and 0x4ae9fc:
 *
 *     c = tbl2[(i + 1) & 31] ^ buf[i] ^ (i & 0xff)
 *     for (k = 0; k < 32; k++)
 *         c ^= tbl1[i % (k ? k : 12)] ^ tbl1[k] ^ tbl2[k];
 *     buf[i] = c;
 *
 * Note the `k ? k : 12` — the k=0 round divides by twelve, not by zero; the
 * original spells that as `test edi,edi; jne; mov edi,0xc`. The plaintext
 * starts with the magic **"EZSL"**, which is how the reading was confirmed.
 *
 * The tables stay in the user's executable, exactly like the other three:
 * `ez2_songdb_load` pulls them out through `ez2_exe_read` at run time and this
 * repository never contains them. See ../../docs/DISTRIBUTION.md.
 *
 * ---- the record, and why two names ---------------------------------------
 *
 * 0x56 bytes, which the three `loadGds` functions and the copy loop in
 * `loadBinFile` independently agree on:
 *
 *     +0x00  key    char[0x10]   what SongTable::find @0x469ed0 matches on
 *     +0x10  name   char[0x20]   what loadSongInfo @0x431660 reads
 *     +0x30  kind   u8
 *     +0x32  levels 4 x { u8 level; float a; float b; }  PACKED, stride 9
 *
 * The two name fields looked like a contradiction — the file plainly has the
 * chart name at +0, while the matched `loadSongInfo` reads +0x10 — until
 * CV2Mix's table settled it: there the key is a NUMBER ("92") and the name at
 * +0x10 is the chart ("11ambit-5o1"). In the other twelve tables the key is
 * the chart name and +0x10 is empty. Both readings were right.
 *
 * The floats sit at odd offsets, which is why the original loads them with
 * unaligned `movss`es and why this parser reads them byte-wise rather than
 * overlaying a packed struct (PORTING.md 4c).
 */
#ifndef EZ2_SONGDB_H
#define EZ2_SONGDB_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_SONGDB_KEY   0x10
#define EZ2_SONGDB_NAME  0x20
#define EZ2_SONGDB_STEPS 4
#define EZ2_SONGDB_RECORD 0x56
#define EZ2_SONGDB_CATEGORIES 47
/* The table's 47 groups plus ONE the port adds for its user songs (the
 * "CUSTOM" category the select shows after the game's own; usersongs.h). */
#define EZ2_SONGDB_GROUPS     (EZ2_SONGDB_CATEGORIES + 1)

typedef struct ez2_song_level {
    int   level;      /* the difficulty number the select screen prints */
    float a;
    float b;
} ez2_song_level;

typedef struct ez2_song_entry {
    char           key[EZ2_SONGDB_KEY + 1];
    char           name[EZ2_SONGDB_NAME + 1];
    int            kind;
    ez2_song_level steps[EZ2_SONGDB_STEPS];
} ez2_song_entry;

/* THE 47 CATEGORIES ARE IN THE FILE TOO. `song.bin`'s header carries a
 * second offset at +0x0c (SongTable::loadBinFile @0x469c30,
 * ../../src/songbin.cpp): 47 sequential groups, each a u16 count and then
 * that many 16-byte song KEYS. They are the select screen's category strip
 * (`Sortimage\category_01..47.bmp`), and the page seed m435070 @0x435070
 * resolves each key against the loaded entries case-insensitively, in
 * category order, keeping rows whose first level is non-zero. */
typedef struct ez2_song_group {
    int  count;
    char (*keys)[EZ2_SONGDB_KEY + 1];   /* count keys, NUL-terminated */
} ez2_song_group;

typedef struct ez2_songdb {
    int             count;
    ez2_song_entry *entries;
    ez2_song_group  groups[EZ2_SONGDB_GROUPS];
} ez2_songdb;

/* Decrypt and parse `song.bin`. `exe_path` is the user's own unpacked
 * executable, which is where the cipher tables live. Returns 0 on success. */
int  ez2_songdb_load(const char *path, const char *exe_path, ez2_songdb *out);

/* Parse already-decrypted bytes - the half that needs no executable, and what
 * the self-contained test drives. */
int  ez2_songdb_parse(const unsigned char *data, size_t n, ez2_songdb *out);

/* Decrypt in place. `tables` is the 64 bytes at 0x4ae9dc. */
void ez2_songdb_decrypt(unsigned char *buf, size_t n,
                        const unsigned char *tables);

void ez2_songdb_free(ez2_songdb *db);

/* The entry whose KEY matches, as SongTable::find @0x469ed0 compares it, or
 * null. The match is case-insensitive: find calls the same comparison the
 * `.gds` section dispatch uses. */
const ez2_song_entry *ez2_songdb_find(const ez2_songdb *db, const char *key);

/* Seed a category view the way the page seed m435070 @0x435070 does: walk
 * the category's keys IN CATEGORY ORDER, resolve each against the entries
 * case-insensitively, and keep the rows whose first level is non-zero.
 * Writes up to `max` ENTRY INDICES into `view`; returns how many. A category
 * out of range, or one whose group is empty, yields zero - the caller
 * decides whether that means "show everything" (the port's fallback) or an
 * empty page (the game's own behaviour). */
int ez2_songdb_category_view(const ez2_songdb *db, int cat,
                             int *view, int max);

/* The banks the strip shows, in order: HOT, NEW, ALL first (Sortimage's
 * category_01..03). ALL is the one every table fills. */
#define EZ2_SONGDB_CAT_HOT 0
#define EZ2_SONGDB_CAT_NEW 1
#define EZ2_SONGDB_CAT_ALL 2

/* Where the cipher tables live, and how many bytes of them. */
#define EZ2_SONGDB_TABLE_VA   0x4ae9dcUL
#define EZ2_SONGDB_TABLE_SIZE 64

enum ez2_songdb_err {
    EZ2_SONGDB_OK        =  0,
    EZ2_SONGDB_ERR_ARG   = -1,
    EZ2_SONGDB_ERR_OPEN  = -2,
    EZ2_SONGDB_ERR_MAGIC = -3,   /* decrypted, but it does not say EZSL */
    EZ2_SONGDB_ERR_SHORT = -4,   /* the header points past the end */
    EZ2_SONGDB_ERR_MEM   = -5,
    EZ2_SONGDB_ERR_EXE   = -6    /* the cipher tables could not be read */
};

/* ---- from a table entry to a playable chart ------------------------------
 *
 * THE FOUR DIFFICULTY STEPS ARE THE FOUR TIERS, in filename order: no suffix,
 * `-hd`, `-shd`, `-ex`. A level of 0 means the mode does not offer that tier.
 *
 * Swept over three modes and 3,470 charts: **a level greater than zero always
 * has a file** - zero exceptions. The converse does not hold; a handful of
 * charts sit on disk with the table saying 0 (seven in 5keymix, five in
 * streetmix, four in clubmix). So SONG SELECT SHOULD WALK THE TABLE, not the
 * directory: the table never promises a chart that is not there, and the
 * strays are things the game does not offer.
 *
 * `steps[t].b` is the song's BPM - 186 on `9site`, which is what the chart
 * itself reports. `a` is 0 on everything looked at so far.
 *
 * CV2Mix does not use tiers at all. It names by `<song>-<variant>` and its
 * charts are `<mode><N>p-<name>.ez`, one per entry, the variant (`5o1`, `tm1`,
 * `7s1`, ...) standing where a tier suffix would be. All 99 resolve that way,
 * and the tier walk finds none of them - so the two shapes do not overlap and
 * the second is only tried when the first comes up empty. */
typedef struct ez2_song_chart {
    int  tier;                 /* an ez2_tier - 0 NM, 1 HD, 2 SHD, 3 EX */
    int  level;                /* the table's difficulty, always > 0 here */
    char path[1024];           /* the resolved .ez */
} ez2_song_chart;

/* The charts `mode_name` offers for this entry, table order. Returns how many
 * were written. `players` is the digit in `<mode><N>p-`. */
int ez2_songdb_charts(const char *root, const ez2_song_entry *e,
                      const char *mode_name, int players,
                      ez2_song_chart *out, int max);

/* Open a mode's `song.bin` - `system/<mode>/song.bin`, or under
 * `system/CV2Mix/` for the CV2 modes, resolved case-insensitively. */
int ez2_songdb_open_for_mode(const char *root, const char *mode_name,
                             const char *exe_path, ez2_songdb *out);

/* The CV2 sub-mode a chart plays in, as a name ez2_gds_load_for_mode accepts,
 * or null. CV2Mix is a container of ten modes and a song's `kind` byte says
 * which - see ez2_cv2_submode in mode.h for the evidence. `stem` is the chart
 * name as it appears in the table (`11ambit-5o1`); this looks it up.
 *
 * The table is CACHED across calls, keyed by (root, exe_path), because a sweep
 * asks this once per chart and the answer never changes. Drop it with
 * ez2_songdb_forget_cache if the data tree changes underneath a long-running
 * process; handing a different root or exe re-opens it on its own. */
const char *ez2_songdb_cv2_submode(const char *root, const char *exe_path,
                                   const char *stem);

/* Release the cached CV2 table. Not needed for a normal run - it exists so a
 * leak checker sees a clean exit, and for a process that swaps data trees. */
void ez2_songdb_forget_cache(void);

/* "nm", "hd", "shd", "ex" and back. -1 if the name is none of them. */
const char *ez2_songdb_tier_name(int tier);
int         ez2_songdb_tier_from_name(const char *s);

/* Resolve an entry to its chart folder under `root` - the select-to-play glue.
 *
 * Three steps, because the shipped tables need all three:
 *
 *   1. the KEY, which is the folder for all twelve keys-mode tables - though
 *      not its spelling: of 436 keys, 340 match a directory exactly and ALL
 *      436 match one ignoring case (`dirtyd` against `sound/DirtyD/`);
 *   2. the NAME, for a table that keys by something else;
 *   3. the NAME with its trailing `-suffix` cut. CV2Mix keys by NUMBER and
 *      names by `<song>-<stage>`: "92" / "11ambit-5o1" against `11ambit`.
 *
 * Step 3 is EMPIRICAL - it resolves all 99 CV2Mix entries and nothing else
 * needs it, but it came from sweeping the library rather than from the binary.
 * Returns 1 on success. */
int ez2_songdb_song_dir(const char *root, const ez2_song_entry *e,
                        char *out, size_t n);

const char *ez2_songdb_strerror(int err);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SONGDB_H */
