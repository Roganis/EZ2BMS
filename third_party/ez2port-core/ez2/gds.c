/* `.gds` - the per-mode descriptor. See gds.h and ../../docs/gds-slots.md.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "gds.h"

#include "file.h"
#include "mode.h"
#include "vfs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int ci_equal_n(const char *a, const char *b, size_t n)
{
    size_t i;

    for (i = 0; i < n; i++) {
        int x = (unsigned char)a[i], y = (unsigned char)b[i];
        if (x >= 'A' && x <= 'Z') x += 32;
        if (y >= 'A' && y <= 'Z') y += 32;
        if (x != y)
            return 0;
        if (x == 0)
            return 1;
    }
    return 1;
}

/* A cursor over the text. The game runs a real tokenizer (@0x413940); this
 * walks lines, which is enough for the shapes the format actually uses and
 * does not care about the brace layout. */
typedef struct {
    const char *p;
    const char *end;
} Cur;

/* Next non-blank line, trimmed of leading blanks and of CR. Returns 0 at EOF.
 * `len` gets the trimmed length. */
static const char *next_line(Cur *c, size_t *len)
{
    while (c->p < c->end) {
        const char *s = c->p, *e;

        while (s < c->end && (*s == ' ' || *s == '\t'))
            s++;
        e = s;
        while (e < c->end && *e != '\n')
            e++;
        c->p = (e < c->end) ? e + 1 : c->end;
        while (e > s && (e[-1] == '\r' || e[-1] == ' ' || e[-1] == '\t'))
            e--;
        if (e > s) {
            *len = (size_t)(e - s);
            return s;
        }
    }
    return 0;
}

/* The integer after '=' on this line, or `def`. */
static int value_int(const char *line, size_t len, int def)
{
    size_t i;

    for (i = 0; i < len; i++)
        if (line[i] == '=') {
            char buf[64];
            size_t n = len - i - 1;
            if (n >= sizeof buf)
                n = sizeof buf - 1;
            memcpy(buf, line + i + 1, n);
            buf[n] = 0;
            return (int)strtol(buf, 0, 10);
        }
    return def;
}

/* The comma-separated pair after '=', e.g. `Key=15,16` or `Key=10,-1`. A
 * missing second value stays -1, which is what the file writes explicitly. */
static void value_pair(const char *line, size_t len, int *a, int *b)
{
    char buf[128];
    char *comma;
    size_t i;

    *a = -1;
    *b = -1;
    for (i = 0; i < len; i++)
        if (line[i] == '=')
            break;
    if (i == len)
        return;
    {
        size_t n = len - i - 1;
        if (n >= sizeof buf)
            n = sizeof buf - 1;
        memcpy(buf, line + i + 1, n);
        buf[n] = 0;
    }
    *a = (int)strtol(buf, 0, 10);
    comma = strchr(buf, ',');
    if (comma)
        *b = (int)strtol(comma + 1, 0, 10);
}

/* `[Slot3]` -> 2 (the game does atoi(name + 4) - 1 @0x421272). -1 if the line
 * is some other section, -2 if it is not a section header at all. */
static int slot_index(const char *line, size_t len)
{
    if (len < 2 || line[0] != '[')
        return -2;
    if (len >= 6 && ci_equal_n(line + 1, "Slot", 4)) {
        int n = (int)strtol(line + 5, 0, 10);
        return n - 1;
    }
    return -1;
}

int ez2_gds_parse(const char *text, size_t n, ez2_gds *out)
{
    Cur c;
    const char *line;
    size_t len;
    ez2_gds_slot *slot = 0;
    int pending_key = -1, pending_key2 = -1, have_key = 0;

    if (text == 0 || out == 0)
        return EZ2_GDS_ERR_ARG;

    memset(out, 0, sizeof *out);
    c.p = text;
    c.end = text + n;

    while ((line = next_line(&c, &len)) != 0) {
        int si = slot_index(line, len);

        if (si != -2) {                     /* a section header */
            slot = 0;
            have_key = 0;
            if (si >= 0 && si < EZ2_GDS_MAX_SLOTS) {
                slot = &out->slots[si];
                if (si + 1 > out->slots_seen)
                    out->slots_seen = si + 1;
            }
            continue;
        }

        if (slot == 0) {
            if (ci_equal_n(line, "NumberOfSlot", 12))
                out->slot_count = value_int(line, len, 0);
            else if (ci_equal_n(line, "MaxBaseStage", 12))
                out->max_base_stage = value_int(line, len, 0);
            else if (ci_equal_n(line, "MaxBonusStage", 13))
                out->max_bonus_stage = value_int(line, len, 0);
            else if (ci_equal_n(line, "UseChainPlay", 12))
                out->use_chain_play = value_int(line, len, 0);
            continue;
        }

        if (ci_equal_n(line, "NumberOfTrack", 13)) {
            slot->declared = value_int(line, len, 0);
            continue;
        }
        if (ci_equal_n(line, "Key", 3) && !ci_equal_n(line, "Keys", 4)) {
            value_pair(line, len, &pending_key, &pending_key2);
            have_key = 1;
            continue;
        }
        if (ci_equal_n(line, "SongTrack", 9)) {
            /* SongTrack CLOSES an entry, and entries land in FILE ORDER - the
             * `N` in `TrackN` is never read as an index (@0x420f60 walks a
             * pointer). A Key without a SongTrack contributes nothing. */
            if (slot->count < EZ2_GDS_MAX_TRACKS) {
                ez2_gds_lane *l = &slot->lanes[slot->count++];
                l->key   = have_key ? pending_key  : -1;
                l->key2  = have_key ? pending_key2 : -1;
                l->track = value_int(line, len, -1);
            }
            have_key = 0;
            continue;
        }
    }

    return out->slots_seen ? EZ2_GDS_OK : EZ2_GDS_ERR_NO_SLOT;
}

/* ---- finding the descriptor --------------------------------------------- */

/* This was an EIGHTH hand-rolled whole-file read, which the audit that
 * collapsed the other seven missed because it is not called `slurp`. Searching
 * by NAME finds copies that were copied; it does not find copies that were
 * written again from scratch. */
static int read_and_parse(const char *path, ez2_gds *out)
{
    size_t n;
    unsigned char *buf = ez2_file_read(path, &n);
    int rc;

    if (!buf)
        return EZ2_GDS_ERR_NOT_FOUND;
    rc = ez2_gds_parse((const char *)buf, n, out);
    free(buf);
    return rc;
}

int ez2_gds_load_for_mode(const char *root, const char *mode_name, ez2_gds *out)
{
    char sys[2048], modedir[2048], file[2048];

    if (root == 0 || mode_name == 0 || *mode_name == 0 || out == 0)
        return EZ2_GDS_ERR_ARG;

    if (!ez2_vfs_child(root, "system", sys, sizeof sys))
        return EZ2_GDS_ERR_NOT_FOUND;

    /* Directly under system/, then under system/CV2Mix/ - the CV2 modes keep
     * their own descriptors in a sub-tree of the same shape. */
    if (!ez2_vfs_child(sys, mode_name, modedir, sizeof modedir)) {
        char cv2[2048];

        /* A MODE CAN GO BY TWO NAMES, and exactly one does: a chart file says
         * `catch1p-...` while the directory is `system/ez2catch`. Callers hand
         * us the filename's spelling because that is what they have, so retry
         * with the canonical one before giving up - without this, EZ2CATCH
         * silently gets no lane order at all. */
        const char *canon = ez2_mode_name(ez2_mode_from_name(mode_name));

        if (canon == 0 || ez2_mode_from_name(mode_name) == EZ2_MODE_UNKNOWN ||
            !ez2_vfs_child(sys, canon, modedir, sizeof modedir)) {
            if (!ez2_vfs_child(sys, "CV2Mix", cv2, sizeof cv2) ||
                !ez2_vfs_child(cv2, mode_name, modedir, sizeof modedir))
                return EZ2_GDS_ERR_NOT_FOUND;
        }
    }

    /* The file's casing does not follow the directory's on the shipped data,
     * so take whichever .gds is in there - there is exactly one per mode. */
    if (!ez2_vfs_child_ext(modedir, ".gds", file, sizeof file)) {
#ifdef _WIN32
        /* No scan there; the game's own literal path works, because Windows
         * does not care that the two spellings differ. */
        int k = snprintf(file, sizeof file, "%s/%s.gds", modedir, mode_name);
        if (k < 0 || (size_t)k >= sizeof file)
            return EZ2_GDS_ERR_NOT_FOUND;
#else
        return EZ2_GDS_ERR_NOT_FOUND;
#endif
    }
    return read_and_parse(file, out);
}

int ez2_gds_lanes(const ez2_gds *g, int player, int *tracks, int max)
{
    const ez2_gds_slot *s;
    int i;

    if (g == 0 || tracks == 0 || player < 0 || player >= EZ2_GDS_MAX_SLOTS)
        return 0;
    s = &g->slots[player];
    for (i = 0; i < s->count && i < max; i++)
        tracks[i] = s->lanes[i].track;
    return i;
}

int ez2_gds_lane_for_key(const ez2_gds *g, int player, int key)
{
    const ez2_gds_slot *s;
    int i;

    if (g == 0 || key < 0 || player < 0 || player >= EZ2_GDS_MAX_SLOTS)
        return -1;
    s = &g->slots[player];
    for (i = 0; i < s->count; i++)
        if (s->lanes[i].key == key || s->lanes[i].key2 == key)
            return i;
    return -1;
}
