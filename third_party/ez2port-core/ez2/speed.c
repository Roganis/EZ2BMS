/* The speed modifier. See speed.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "speed.h"

/* The table at 0x48e6c8, verbatim: 0.25 to 5.25 in steps of 0.25. Written out
 * rather than computed, because it is data the original carries and a formula
 * would be a claim about the next entry. (The float after the twenty-first is
 * 5.5, so the sequence does continue - the table is simply longer than the
 * index is allowed to go.) */
static const float kSpeed[EZ2_SPEED_STEPS] = {
    0.25f, 0.50f, 0.75f, 1.00f, 1.25f, 1.50f, 1.75f,
    2.00f, 2.25f, 2.50f, 2.75f, 3.00f, 3.25f, 3.50f,
    3.75f, 4.00f, 4.25f, 4.50f, 4.75f, 5.00f, 5.25f
};

float ez2_speed_multiplier(int index)
{
    if (index < 0 || index >= EZ2_SPEED_STEPS)
        return 0.0f;
    return kSpeed[index];
}

int ez2_speed_percent(int index)
{
    if (index < 0 || index >= EZ2_SPEED_STEPS)
        return 0;
    /* Every step is a multiple of 0.25, so this is exact rather than rounded:
     * index 0 is 25, and each step adds 25. */
    return (index + 1) * 25;
}

int ez2_speed_step(int index, int delta, int max_index)
{
    if (max_index < 0)
        max_index = 0;
    if (max_index >= EZ2_SPEED_STEPS)
        max_index = EZ2_SPEED_STEPS - 1;

    index += delta;
    if (index < 0)
        index = 0;
    if (index > max_index)
        index = max_index;
    return index;
}

int ez2_speed_step_percent(int percent, int delta)
{
    if (delta > 0) {
        percent += EZ2_SPEED_PCT_STEP;
        if (percent > EZ2_SPEED_PCT_MAX)
            percent = EZ2_SPEED_PCT_MAX;
    } else if (delta < 0) {
        /* @0x422fe3: from the ceiling the step down is 24, not 25, which is
         * what puts the sequence back on multiples of 25 after 999 clamped it
         * off them. Reproduced rather than tidied. */
        percent -= (percent >= EZ2_SPEED_PCT_MAX) ? 24 : EZ2_SPEED_PCT_STEP;
        if (percent < EZ2_SPEED_PCT_MIN)
            percent = EZ2_SPEED_PCT_MIN;
    }
    return percent;
}

int ez2_speed_step_by(int percent, int delta)
{
    /* The sink's other arms @0x423064/0x423076 (the dial, +/-1) and
     * @0x423088/0x42309a (START + keys 4/2, +/-10): each negative step of
     * more than one takes one less from the 999 ceiling, the same
     * back-onto-the-grid rule the +/-25 pair has. */
    if (delta < -1 && percent >= EZ2_SPEED_PCT_MAX)
        delta += 1;
    percent += delta;
    if (percent > EZ2_SPEED_PCT_MAX)
        percent = EZ2_SPEED_PCT_MAX;
    if (percent < EZ2_SPEED_PCT_MIN)
        percent = EZ2_SPEED_PCT_MIN;
    return percent;
}

int ez2_scroll_bpm(int song_bpm, int percent)
{
    /* @0x41e76e, and the division truncates. */
    return song_bpm * percent / 100;
}

/* CV2Mix alone runs the index; everything else runs the percent. The gate in
 * the binary is the CV2 flag g_1b2eb6c @0x1b2eb6c, tested at the top of every
 * speed arm of m422f20 @0x422f20 and of the three panels' update2. */
int ez2_speed_uses_index(int mode)
{
    return mode == 12;   /* EZ2_MODE_CV2 - spelled numerically, as the
                            binary's g_modeIndex has it */
}

int ez2_scroll_bpm_scaled(int song_bpm, int percent, float measure_scale)
{
    /* Effector6thStyle::update2 @0x41e620, the non-classic arm: the int
     * product is promoted, scaled by the published MeasureScale and by
     * 0.625, and truncated. 1.6 * 0.625 == 1.0, so this equals the plain
     * form wherever the scale is the forced 1.6. */
    double d = (double)(percent * song_bpm);

    return (int)((double)measure_scale * 0.625 * d * 0.01);
}

/* m422f20 @0x422f20's step-down arm, CV2 branch: one song, one constant. The
 * comparison is _stricmp, so the key matches ignoring case. */
int ez2_speed_min_index(const char *song_key)
{
    static const char k[] = "11ambit";
    int i;

    if (song_key == 0)
        return 0;
    for (i = 0; k[i]; i++) {
        int a = (unsigned char)song_key[i], b = (unsigned char)k[i];

        if (a >= 'A' && a <= 'Z') a += 32;
        if (a != b)
            return 0;
    }
    return song_key[i] == 0 ? 2 : 0;
}

int ez2_speed_step_song(int index, int delta, int max_index,
                        const char *song_key)
{
    int lo = ez2_speed_min_index(song_key);

    index = ez2_speed_step(index, delta, max_index);
    return index < lo ? lo : index;
}
