/* EZ2AC `.ezi` keysound index.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE MATCHED LOADER DOES  (EziLoader::loadEZI @0x411090, src/loadezi.cpp)
 *
 *     while (fscanf(f, "%s %d", token, &mode) != -1) {
 *         if (token[0] == ';') { fscanf(f, "\n"); continue; }
 *         note = atol(token);
 *         if (note < 0 || note >= 0x800) -> error, abandon the whole file
 *         two = 0;
 *         switch (mode) { case 1: goto have_mode; case 2: two = 1; break; }
 *     have_mode:
 *         fscanf(f, "%s", sampName);
 *         ... createSample(sampName) ...
 *         if (two) fscanf(f, "%s", sampName);      // read and DISCARDED
 *     }
 *
 * Three behaviours that a "reasonable" reimplementation would get wrong:
 *
 *   1. A ';' comment is detected on the FIRST TOKEN ONLY, and the line has
 *      already consumed a second whitespace-delimited field into `mode` by
 *      then. A comment is therefore skipped by token, not by line - which
 *      matters for how many tokens the next iteration sees.
 *   2. Mode 2 carries a SECOND filename, which the original reads and throws
 *      away. Miss it and every subsequent line is off by one token.
 *   3. Any mode that is neither 1 nor 2 falls out of the switch to the same
 *      place as mode 1 - one filename. There is no default branch.
 *
 * A bad note number ABANDONS THE WHOLE FILE (the original logs, unloads every
 * sample it had already created, and returns failure). That is reproduced:
 * ez2_ezi_parse fails rather than skipping the line.
 * ---------------------------------------------------------------------------
 */
#include "ezi.h"

#include <stdlib.h>
#include <string.h>

const char *ez2_ezi_strerror(int err)
{
    switch (err) {
    case EZ2_EZI_OK:        return "ok";
    case EZ2_EZI_ERR_NOTE:  return "note number outside [0, 0x800)";
    case EZ2_EZI_ERR_EMPTY: return "no entries";
    case EZ2_EZI_ERR_MEM:   return "out of memory";
    default:                return "unknown error";
    }
}

static int is_space(int c)
{
    return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' ||
           c == '\v';
}

/* One whitespace-delimited token, exactly as scanf's %s takes it. Returns 0
 * at end of input. */
static int next_token(const char *text, size_t n, size_t *pos,
                      char *out, size_t out_size)
{
    size_t i = *pos, len = 0;

    while (i < n && is_space((unsigned char)text[i]))
        i++;
    if (i >= n)
        return 0;
    while (i < n && !is_space((unsigned char)text[i])) {
        if (len + 1 < out_size)
            out[len++] = text[i];
        i++;
    }
    out[len] = 0;
    *pos = i;
    return 1;
}

void ez2_ezi_free(ez2_ezi *e)
{
    if (e == 0)
        return;
    free(e->entries);
    e->entries = 0;
    e->count = 0;
}

int ez2_ezi_parse(const char *text, size_t n, ez2_ezi *out)
{
    char token[64], mode_token[64];
    size_t pos = 0;
    int cap = 64;

    memset(out, 0, sizeof *out);
    out->entries = (ez2_ezi_entry *)malloc((size_t)cap * sizeof *out->entries);
    if (out->entries == 0)
        return EZ2_EZI_ERR_MEM;

    /* The loop condition is the PAIR - `fscanf("%s %d")` returning -1 means
     * end of file, so a trailing token with no mode after it ends the parse
     * rather than erroring. */
    while (next_token(text, n, &pos, token, sizeof token) &&
           next_token(text, n, &pos, mode_token, sizeof mode_token)) {
        ez2_ezi_entry *e;
        int note, mode, two;

        if (token[0] == ';')
            continue;               /* comment - see note 1 in the header */

        note = (int)strtol(token, 0, 10);
        if (note < 0 || note >= EZ2_EZI_SLOTS) {
            ez2_ezi_free(out);
            return EZ2_EZI_ERR_NOTE;
        }
        mode = (int)strtol(mode_token, 0, 10);

        if (out->count == cap) {
            ez2_ezi_entry *bigger = (ez2_ezi_entry *)realloc(
                out->entries, (size_t)cap * 2 * sizeof *out->entries);
            if (bigger == 0) {
                ez2_ezi_free(out);
                return EZ2_EZI_ERR_MEM;
            }
            out->entries = bigger;
            cap *= 2;
        }

        e = &out->entries[out->count];
        memset(e, 0, sizeof *e);
        e->note = note;
        e->mode = mode;

        if (!next_token(text, n, &pos, e->name, sizeof e->name))
            break;                  /* truncated final line */

        two = (mode == 2);          /* see note 2; every other mode reads one */
        if (two && next_token(text, n, &pos, e->name2, sizeof e->name2))
            e->has_name2 = 1;

        out->count++;
    }

    if (out->count == 0) {
        ez2_ezi_free(out);
        return EZ2_EZI_ERR_EMPTY;
    }
    return EZ2_EZI_OK;
}

const ez2_ezi_entry *ez2_ezi_lookup(const ez2_ezi *e, int note)
{
    int i;

    /* Later entries win, matching the original: it stores into
     * sampleTable[note] as it goes, so a repeated note overwrites. */
    for (i = e->count - 1; i >= 0; i--)
        if (e->entries[i].note == note)
            return &e->entries[i];
    return 0;
}

int ez2_ezi_resolve(const char *name, char *out, size_t out_size)
{
    size_t len = strlen(name);
    size_t i;
    int dot = -1;

    if (len + 1 > out_size)
        return 0;
    memcpy(out, name, len + 1);

    for (i = 0; i < len; i++)
        if (out[i] == '.')
            dot = (int)i;
    if (dot < 0 || len - (size_t)dot != 4)
        return 1;                   /* nothing that looks like an extension */

    /* .wav -> .ssf, keeping whatever case the rest of the name had. */
    out[dot + 1] = 's';
    out[dot + 2] = 's';
    out[dot + 3] = 'f';
    return 1;
}
