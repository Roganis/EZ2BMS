/* See pluginmsg.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "pluginmsg.h"

#include <stdio.h>
#include <string.h>

size_t ez2_plugin_json_escape(char *out, size_t n, const char *s)
{
    size_t w = 0;

    if (!out || n == 0)
        return 0;
    out[0] = 0;
    if (!s)
        return 0;

    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        char buf[8];
        size_t len;

        switch (c) {
        case '"':  memcpy(buf, "\\\"", 2); len = 2; break;
        case '\\': memcpy(buf, "\\\\", 2); len = 2; break;
        case '\n': memcpy(buf, "\\n",  2); len = 2; break;
        case '\r': memcpy(buf, "\\r",  2); len = 2; break;
        case '\t': memcpy(buf, "\\t",  2); len = 2; break;
        default:
            if (c < 0x20) {
                /* The only escape JSON insists on for the rest of C0. */
                len = (size_t)snprintf(buf, sizeof buf, "\\u%04x", c);
            } else {
                /* BYTES ABOVE 0x7f GO THROUGH UNTOUCHED, and that is a
                 * decision rather than an oversight. The game's own strings
                 * are whatever encoding the data files used - the song table
                 * is not UTF-8 - so re-encoding here would be guessing. A
                 * plugin that cares reads the bytes and decides; one that
                 * does not gets a string it can still print. */
                buf[0] = (char)c;
                len = 1;
            }
            break;
        }
        if (w + len + 1 > n) {          /* +1 for the terminator */
            out[0] = 0;
            return 0;
        }
        memcpy(out + w, buf, len);
        w += len;
    }
    out[w] = 0;
    return w;
}

/* THE CHART'S IDENTITY, AND WHY THE PORT HAS TO DECIDE IT.
 *
 * `mode`, `song` and `tier` are spelled the way the data spelled them, and in
 * this game that is NOT stable: ez2/vfs.h documents the sweep - of 436 song
 * keys only 340 match their folder exactly, and all 436 match ignoring case.
 * The same chart reached through song select and through a chart path can
 * come back as `Babydance` and `babydance`.
 *
 * For a leaderboard that is not cosmetic. Two spellings is two rows for one
 * chart, and the person who played it sees their best score vanish. Every
 * plugin would have to know that, and would have to know it from this comment
 * rather than from anything in the data - so the port emits a normalised
 * `key` alongside the readable fields, and a plugin keys on that.
 *
 * Lowercase and slash-joined. Not a hash: a key you can read is one you can
 * grep for in somebody's ranking file when they say a score went missing. */
static int chart_key(char *out, size_t n, const char *mode, const char *song,
                     const char *tier)
{
    char raw[512];
    size_t i;
    int k = snprintf(raw, sizeof raw, "%s/%s/%s",
                     mode ? mode : "", song ? song : "",
                     (tier && tier[0]) ? tier : "nm");

    if (k <= 0 || (size_t)k >= sizeof raw)
        return 0;
    for (i = 0; raw[i]; i++)
        if (raw[i] >= 'A' && raw[i] <= 'Z')
            raw[i] = (char)(raw[i] + 32);
    return (int)ez2_plugin_json_escape(out, n, raw) > 0 || raw[0] == 0;
}

/* `"key":"escaped"` into a fixed scratch buffer, or an empty string when the
 * value does not fit. Keeping the escape and the quoting together is what
 * stops a caller quoting a raw string by accident. */
static int quoted(char *dst, size_t n, const char *s)
{
    char esc[512];

    if (ez2_plugin_json_escape(esc, sizeof esc, s ? s : "") == 0 && s && *s)
        return 0;
    return snprintf(dst, n, "\"%s\"", esc) > 0;
}

size_t ez2_plugin_msg_hello(char *out, size_t n, const char *port_version)
{
    char ver[128];
    int k;

    if (!out || n == 0)
        return 0;
    if (!quoted(ver, sizeof ver, port_version ? port_version : "unknown"))
        return 0;

    k = snprintf(out, n,
                 "{\"ev\":\"hello\",\"proto\":%d,\"port\":%s}\n",
                 EZ2_PLUGIN_PROTO, ver);
    if (k <= 0 || (size_t)k >= n) {
        out[0] = 0;
        return 0;
    }
    return (size_t)k;
}

size_t ez2_plugin_msg_result(char *out, size_t n, const ez2_plugin_result *r)
{
    char mode[256], song[256], tier[64], player[256], key[600];
    const ez2_score *s;
    double rate;
    int k;

    if (!out || n == 0 || !r || !r->score)
        return 0;
    out[0] = 0;
    s = r->score;

    if (!quoted(mode,   sizeof mode,   r->mode)   ||
        !quoted(song,   sizeof song,   r->song)   ||
        !quoted(tier,   sizeof tier,   r->tier)   ||
        !quoted(player, sizeof player, r->player))
        return 0;
    if (!chart_key(key, sizeof key, r->mode, r->song, r->tier))
        return 0;

    /* THE LETTER THE PLAYER SAW, which is not simply "the rank for this
     * rate". `ez2_score_grade` picks the ladder by the score MODEL - CV2Mix
     * grades on (KOOL+COOL) hits where everything else grades on the score
     * rate - and `ez2_score_grade_name` then spells it the way that mode
     * spells it. Going straight to `ez2_score_rank_hits` here, which is what
     * this first did, silently applied CV2's ladder to every mode.
     *
     * A plugin uploading scores has to agree with the result screen or the
     * leaderboard says something the player can see is wrong.
     *
     * BOTH THE NUMBER AND THE LETTER go out. `rank` is for showing; `grade`
     * is the game's own 0..10 index into the rank sprite table @0x4ae1f8, and
     * it is what a consumer STORING a score wants - the card reader's score
     * records keep a grade int, not a string, because that is what the game's
     * own ranking files keep. Emitting only the letter would have made every
     * such consumer parse it back. */
    rate = ez2_score_rate(s, r->notes);

    /* NAMED, not an array. `counts` is indexed by ez2_judgement, whose
     * numbering runs KOOL=1 .. MISS=5 while the GAME's own grade numbering
     * runs the other way (KOOL is grade 5) - see ez2/score.h. Emitting the
     * array raw would hand every plugin author that trap. Note `fail` and
     * `miss` are different things: FAIL is the mash band, MISS is a note
     * nobody pressed. */
    k = snprintf(out, n,
                 "{\"ev\":\"stage_result\""
                 ",\"t\":%ld"
                 ",\"key\":\"%s\""
                 ",\"mode\":%s,\"song\":%s,\"tier\":%s,\"level\":%d"
                 ",\"player\":%s"
                 ",\"stage\":%d,\"rounds\":%d"
                 ",\"score\":%ld,\"notes\":%ld,\"max_combo\":%ld"
                 ",\"rate\":%.4f,\"grade\":%d,\"rank\":\"%s\""
                 ",\"counts\":{\"kool\":%ld,\"cool\":%ld,\"good\":%ld"
                 ",\"miss\":%ld,\"fail\":%ld}"
                 ",\"cleared\":%s,\"failed\":%s,\"place\":%d}\n",
                 r->unix_time,
                 key,
                 mode, song, tier, r->level,
                 player,
                 r->stage, r->rounds,
                 s->score, r->notes, s->max_combo,
                 rate,
                 ez2_score_grade(s, r->notes),
                 ez2_score_grade_name(s, ez2_score_grade(s, r->notes)),
                 s->counts[EZ2_J_KOOL], s->counts[EZ2_J_COOL],
                 s->counts[EZ2_J_GOOD], s->counts[EZ2_J_MISS],
                 s->counts[EZ2_J_FAIL],
                 r->cleared ? "true" : "false",
                 s->failed  ? "true" : "false",
                 r->place);

    if (k <= 0 || (size_t)k >= n) {
        out[0] = 0;
        return 0;
    }
    return (size_t)k;
}
