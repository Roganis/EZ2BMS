/* What the port tells a plugin, and how it is spelled.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- the shape of the plugin interface -----------------------------------
 *
 * A plugin is a SEPARATE PROCESS. The port spawns it and writes newline-
 * delimited JSON to its standard input; the plugin does whatever it likes.
 * That is the whole protocol. It is deliberately the smallest thing that is
 * useful, and every part of the smallness is load-bearing:
 *
 *   - **Out of process** so a plugin cannot take the cabinet down. This thing
 *     runs unattended with a paying player in front of it; an in-process
 *     plugin that segfaults or blocks for 200 ms is a dead machine mid-song.
 *     A child that dies is noticed, logged, and ignored.
 *   - **Out of process** also settles the licence question. The port is
 *     GPL-3.0; code linked into it inherits that. A separate program at the
 *     end of a pipe is at arm's length, so a plugin may be written under any
 *     licence, in any language.
 *   - **JSON lines** because the point is that anyone can write one. A binary
 *     format would be smaller and would need a parser in every language
 *     somebody wants to use; `for line in sys.stdin` needs nothing.
 *   - **One way, for now.** The port talks and the plugin listens. A plugin
 *     that could talk back would need a policy for what it is allowed to
 *     change, and there is no good answer to that until the port has feature
 *     parity to change things *in*.
 *
 * WHY NOT THE ORACLE TRACE, which already exists and is already a stream.
 * Because its records are the judgement model's internals - the slot state
 * before and after every sink call - which is the right vocabulary for
 * byte-exact replay and the wrong one for "somebody finished a song". It is
 * also game-derived data (ez2/trace.h) that should not be handed around. The
 * shape is borrowed - a versioned stream a reader can skip forward through -
 * and none of the records are.
 *
 * ---- what stays still ----------------------------------------------------
 *
 * Everything named in these messages is fixed by the ORIGINAL: the mode
 * names, the tier names, the six judgements, the rank letters, the song keys.
 * They cannot drift, because the game they came from is finished. That is
 * deliberate - it is the reason this is safe to publish while the rest of the
 * port is still moving. Nothing here exposes the renderer, the scene graph or
 * the session machine, all of which are still being built.
 *
 * `proto` is bumped when a field CHANGES OR DISAPPEARS. New fields may be
 * added at any time without a bump, so a plugin must ignore what it does not
 * recognise.
 */
#ifndef EZ2_PLUGINMSG_H
#define EZ2_PLUGINMSG_H

#include <stddef.h>

#include "score.h"

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_PLUGIN_PROTO 1

/* One finished stage, as the port knows it. Filled by the caller and turned
 * into a line by ez2_plugin_msg_result.
 *
 * The score pointer is the model itself rather than a copy of its totals,
 * because the derived numbers - the rate, the rank letter - have exactly one
 * correct definition (ez2/score.h) and a second one here would be a second
 * one to get wrong. */
typedef struct ez2_plugin_result {
    const ez2_score *score;
    long        notes;          /* the chart's note total, for the rate */
    const char *mode;           /* "StreetMix", "5RadioMix", ... */
    const char *song;           /* the song-table key, e.g. "babydance" */
    const char *tier;           /* "nm" | "hd" | "shd" | "ex", or "" */
    const char *player;         /* the entered name, or "" */
    int         level;          /* the .ini's [General] Level */
    int         stage;          /* 1-based */
    int         rounds;         /* how many this session has */
    int         cleared;        /* finished without the gauge running out */
    int         place;          /* local ranking slot 0..4, or -1 */
    long        unix_time;      /* seconds; 0 to leave it out */
} ez2_plugin_result;

/* THE MESSAGES CARRY A NORMALISED `key` as well as the readable mode, song and
 * tier, and a plugin that stores or looks up a score should use it. The
 * readable fields are spelled the way the data spelled them, which in this
 * game varies in case (ez2/vfs.h: of 436 song keys only 340 match their folder
 * exactly) - so keying on them gives two leaderboard rows for one chart and a
 * player whose best score appears to vanish.
 *
 * Write one JSON line (with its newline) into `out`. Returns the length
 * written, or 0 if it did not fit - never a truncated line, because half a
 * JSON object is not a smaller JSON object. */
size_t ez2_plugin_msg_result(char *out, size_t n,
                             const ez2_plugin_result *r);

/* The greeting, sent once when the plugin starts, so a plugin can refuse a
 * protocol it does not understand rather than guessing. */
size_t ez2_plugin_msg_hello(char *out, size_t n, const char *port_version);

/* A JSON string body - quotes, backslashes and control characters escaped -
 * WITHOUT the surrounding quotes. Returns the length written, or 0 if it did
 * not fit. Exposed because it is the part worth testing on its own: a song
 * key or a player name is whatever bytes the game's data had in it, and one
 * unescaped quote turns a line into something no parser will take. */
size_t ez2_plugin_json_escape(char *out, size_t n, const char *s);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_PLUGINMSG_H */
