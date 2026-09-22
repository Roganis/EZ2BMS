/* Which sound cards this machine has. See alsadev.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "alsadev.h"
#include "util.h"

#include <stdio.h>
#include <string.h>

/* One line of `text` into `buf`, advancing past it. Returns 0 at the end. */
static int next_line(const char **text, char *buf, size_t n)
{
    const char *p = *text;
    size_t len = 0;

    if (!p || !*p)
        return 0;
    while (*p && *p != '\n') {
        if (len + 1 < n)
            buf[len++] = *p;
        p++;
    }
    if (*p == '\n')
        p++;
    buf[len] = 0;
    *text = p;
    return 1;
}

/* The card's long name, from /proc/asound/cards.
 *
 *      0 [Device         ]: USB-Audio - DSD TECH USB Audio Device
 *                           C-Media Electronics Inc. ... at usb-...
 *
 * The FIRST line's tail after the dash is the one worth showing: the second is
 * the bus address, which identifies the hardware but does not help a person
 * pick their headphone jack out of a list. */
static void card_name(const char *cards, int want, char *out, size_t n)
{
    char line[256];
    const char *p = cards;

    out[0] = 0;
    if (!cards)
        return;
    while (next_line(&p, line, sizeof line)) {
        char *br, *dash;
        int idx = -1;

        /* A card line starts with the index and has `[id]:` after it; the
         * continuation line does not, which is how the two are told apart
         * without counting lines - a card with no second line would otherwise
         * shift everything after it. */
        if (sscanf(line, " %d [", &idx) != 1)
            continue;
        br = strchr(line, ']');
        if (!br || br[1] != ':')
            continue;
        if (idx != want)
            continue;
        dash = strstr(br + 2, " - ");
        if (dash)
            snprintf(out, n, "%s", dash + 3);
        else
            snprintf(out, n, "%s", br + 2);
        ez2_trim(out);
        return;
    }
}

int ez2_alsadev_parse(const char *pcm, const char *cards,
                      ez2_alsadev *out, int max)
{
    char line[256];
    const char *p = pcm;
    int n = 0;

    if (!pcm || !out || max <= 0)
        return 0;
    if (max > EZ2_ALSA_MAX)
        max = EZ2_ALSA_MAX;

    while (n < max && next_line(&p, line, sizeof line)) {
        int card = -1, dev = -1;
        char cname[EZ2_ALSA_NAME], pname[EZ2_ALSA_NAME];
        const char *colon;

        /* `02-00: ALC1220 Analog : ALC1220 Analog : playback 1 : capture 1` */
        if (sscanf(line, "%d-%d:", &card, &dev) != 2)
            continue;
        if (card < 0 || dev < 0)
            continue;
        /* Playback only. A capture-only PCM is not somewhere to send a
         * keysound, and offering one would be offering a dead end. */
        if (!strstr(line, "playback"))
            continue;

        colon = strchr(line, ':');
        if (!colon)
            continue;
        snprintf(pname, sizeof pname, "%s", colon + 1);
        /* The PCM's own name is the first of the colon-separated fields after
         * the index. It is cut at the next colon rather than at the last,
         * because a name may itself contain one. */
        {
            char *cut = strchr(pname, ':');

            if (cut)
                *cut = 0;
        }
        ez2_trim(pname);

        card_name(cards, card, cname, sizeof cname);

        out[n].card   = card;
        out[n].device = dev;
        snprintf(out[n].id, sizeof out[n].id, "hw:%d,%d", card, dev);
        if (cname[0] && pname[0]) {
            /* Both halves are name-sized, so the pair can overrun the field.
             * The CARD is the half a person picks by - "HD-Audio Generic" is
             * what tells them it is the motherboard - so the PCM name is the
             * half that gets cut. */
            snprintf(out[n].name, sizeof out[n].name, "%.*s - %.*s",
                     (int)(sizeof out[n].name / 2 - 2), cname,
                     (int)(sizeof out[n].name / 2 - 2), pname);
        }
        else if (pname[0])
            snprintf(out[n].name, sizeof out[n].name, "%s", pname);
        else if (cname[0])
            snprintf(out[n].name, sizeof out[n].name, "%s", cname);
        else
            snprintf(out[n].name, sizeof out[n].name, "%s", out[n].id);
        n++;
    }
    return n;
}

int ez2_alsadev_find(const ez2_alsadev *list, int count, const char *id)
{
    int i;

    if (!list || !id || !id[0])
        return -1;
    for (i = 0; i < count; i++) {
        if (strcmp(list[i].id, id) == 0)
            return i;
    }
    return -1;
}
