/* Which sound cards this machine has, read out of /proc/asound.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- why this exists -----------------------------------------------------
 *
 * The exclusive audio path takes an ALSA device outright - no system mixer, no
 * resampler, ~2.9 ms off the output latency (../LATENCY.md). To take one you
 * have to NAME one, `hw:0,0` style, and until now the only way to find out
 * which name was yours was to run the game, watch it fail, and read the card
 * list it printed into the log on the way past.
 *
 * That default is worse than it looks. `hw:0,0` is card zero, device zero, and
 * card zero is whatever the kernel enumerated first - on the machine this was
 * written on it is a USB DAC, the HDMI outputs are card 1, and the motherboard
 * analog jack everybody actually means is card 2. Guessing gets it wrong more
 * often than right, and the failure is silent-ish: exclusive quietly falls back
 * to shared and the player only notices that the latency work did nothing.
 *
 * ---- what it reads -------------------------------------------------------
 *
 * Two files the kernel keeps, both plain text and both stable for twenty
 * years:
 *
 *   /proc/asound/cards    one card per two lines -
 *                          ` 2 [Generic        ]: HDA-Intel - HD-Audio Generic`
 *                          `                      HD-Audio Generic at 0xfc800000 irq 90`
 *   /proc/asound/pcm      one PCM per line, card-device first -
 *                          `02-00: ALC1220 Analog : ALC1220 Analog : playback 1`
 *
 * A line with no `playback` is a capture-only device and is not somewhere to
 * send a keysound, so it is left out.
 *
 * ---- why the PARSER is here and the file reading is not ------------------
 *
 * Same rule as every other format in this directory: text is testable, I/O is
 * not. `ez2_alsadev_parse` takes the two file contents as strings and needs no
 * ALSA, no SDL and no sound card, so the awkward cases - a machine with four
 * cards, a card whose name has a colon in it, an empty file - are checked on a
 * build machine. The platform layer reads the two files and calls this.
 */
#ifndef EZ2_ALSADEV_H
#define EZ2_ALSADEV_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_ALSA_MAX  16
#define EZ2_ALSA_ID   16    /* "hw:31,15" and room */
#define EZ2_ALSA_NAME 96

typedef struct ez2_alsadev {
    char id[EZ2_ALSA_ID];      /* what the exclusive path wants: "hw:2,0" */
    char name[EZ2_ALSA_NAME];  /* what a person recognises */
    int  card, device;
} ez2_alsadev;

/* Parse the two files' contents into `out`. `cards` may be null - the ids
 * still come out right, only the names get less friendly. Returns how many
 * playback devices were found, or 0.
 *
 * The order is the kernel's, which is the order `aplay -l` prints and the
 * order a person will be comparing against. */
int ez2_alsadev_parse(const char *pcm, const char *cards,
                      ez2_alsadev *out, int max);

/* Which entry has that id, or -1. For a settings page reopening on whatever
 * the file already names. */
int ez2_alsadev_find(const ez2_alsadev *list, int count, const char *id);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_ALSADEV_H */
