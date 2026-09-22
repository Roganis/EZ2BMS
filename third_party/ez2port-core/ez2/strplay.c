/* EZ2AC `.str` clip player - the engine's tween, headless. See strplay.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Transcribed from Obj402860::m403940 @0x403940 (../../src/accessors.cpp,
 * 100%), minus its draw tail. Two things the engine does by accident are
 * not carried: it reads key[1] past a row's last key (the next row's cell
 * count), and it writes the zeroed speed back into the file image. Neither
 * is reachable in the shipped library - no same-time pair ends at a row's
 * last key (checked over every .str under bg/ and system/). */
#include "strplay.h"

#include <stdlib.h>
#include <string.h>

static void rows_reset(ez2_str_player *p)
{
    int r;

    p->f8 = 0;
    p->retired = 0;
    for (r = 0; r < p->clip->layer_count; r++) {
        p->rows[r].cursor = 0;
        p->rows[r].drawn = 0;
    }
}

void ez2_str_player_reset(ez2_str_player *p)
{
    if (p == 0 || p->rows == 0)
        return;
    rows_reset(p);
    p->played = 0;
    p->finished = 0;
}

int ez2_str_player_init(ez2_str_player *p, const ez2_str *clip, int loop)
{
    int n;

    if (p == 0 || clip == 0)
        return 0;
    memset(p, 0, sizeof *p);
    n = clip->layer_count > 0 ? clip->layer_count : 1;
    p->rows = (ez2_str_row *)calloc((size_t)n, sizeof *p->rows);
    if (p->rows == 0)
        return 0;
    p->clip = clip;
    p->loop = loop;
    /* attach @0x4028b0: rows to retire = the row count, less one when row 0
     * has no track at all */
    p->fc = clip->layer_count;
    if (clip->layer_count > 0 && clip->layers[0].key_count == 0)
        p->fc--;
    ez2_str_player_reset(p);
    return 1;
}

void ez2_str_player_free(ez2_str_player *p)
{
    if (p == 0)
        return;
    free(p->rows);
    p->rows = 0;
    p->clip = 0;
}

static int key_time(const ez2_str_layer *la, int i)
{
    return (i >= 0 && i < la->key_count) ? la->keys[i].framenum : -1;
}

static void blit_add(ez2_str_key *out, const ez2_str_key *k)
{
    int i;

    out->pos[0] += k->pos[0];
    out->pos[1] += k->pos[1];
    for (i = 0; i < 4; i++) out->uv0[i]  += k->uv0[i];
    for (i = 0; i < 4; i++) out->uv1[i]  += k->uv1[i];
    for (i = 0; i < 8; i++) out->quad[i] += k->quad[i];
    for (i = 0; i < 4; i++) out->color[i] += k->color[i];
    out->rotation += k->rotation;
}

int ez2_str_player_tick(ez2_str_player *p)
{
    int r;

    if (p == 0 || p->rows == 0)
        return 0;
    if (p->retired >= p->fc) {
        if (!p->loop) {
            p->finished = 1;
            return 0;
        }
        rows_reset(p);
    }
    for (r = 0; r < p->clip->layer_count; r++) {
        const ez2_str_layer *la = &p->clip->layers[r];
        ez2_str_row *rs = &p->rows[r];
        const ez2_str_key *key;
        int dt, cur;

        rs->drawn = 0;
        if (la->key_count == 0)
            continue;
        if (rs->cursor == -1)
            continue;
        cur = rs->cursor;
        key = &la->keys[cur];
        dt = p->f8 - key->framenum;
        if (dt < 0)
            continue;
        if (dt != 0 && key_time(la, cur + 1) == p->f8) {
            cur++;
            rs->cursor = cur;
            if (cur >= la->key_count - 1) {
                rs->cursor = -1;
                p->retired++;
            }
            key = &la->keys[cur];
        }
        if (key->frametype == 0) {
            rs->out = *key;
            rs->cp  = *key;
            if (rs->cursor != -1 && key_time(la, cur + 1) == key->framenum)
                rs->cursor++;
        } else {
            float speed = key->anim_delta;
            float count = (float)la->texture_count;

            if (!(speed <= 100000.0f))
                speed = 0.0f;
            blit_add(&rs->out, key);
            rs->cp = rs->out;
            switch (key->anim_type) {
            case 1:
                rs->out.texture_id = key->texture_id + rs->out.texture_id;
                rs->cp.texture_id = rs->out.texture_id;
                break;
            case 2:
                rs->out.texture_id = speed + rs->out.texture_id;
                if (rs->out.texture_id >= count)
                    rs->out.texture_id = count - 1.0f;
                rs->cp.texture_id = rs->out.texture_id;
                break;
            case 3:
                rs->out.texture_id = speed + rs->out.texture_id;
                if (rs->out.texture_id >= count)
                    rs->out.texture_id -=
                        (float)(int)(rs->out.texture_id / count) * count;
                rs->cp.texture_id = rs->out.texture_id;
                break;
            case 4:
                rs->out.texture_id -= speed;
                if (0.0f > rs->out.texture_id) {
                    float f = rs->out.texture_id -
                              (float)(int)(rs->out.texture_id / count) * count;
                    if (0.0f > f)
                        f = count + f;
                    rs->out.texture_id = f;
                }
                rs->cp.texture_id = rs->out.texture_id;
                break;
            case 5: {
                int n = (int)((float)dt * speed + rs->out.texture_id);
                int per = la->texture_count - 1;
                int q;

                if (per > 0) {
                    q = n / per;
                    if (q & 1)
                        n = (q + 1) * per - n;
                    else
                        n = n - q * per;
                }
                rs->cp.texture_id = (float)n;
                break;
            }
            default:
                break;
            }
        }
        rs->drawn = 1;
    }
    p->f8++;
    p->played++;
    return 1;
}

void ez2_str_player_seek(ez2_str_player *p, int frame)
{
    if (p == 0 || p->rows == 0)
        return;
    if (frame < 0)
        frame = 0;
    if (frame < p->played - 1 || (p->finished && frame < p->played))
        ez2_str_player_reset(p);
    while (p->played <= frame && !p->finished)
        ez2_str_player_tick(p);
}

const ez2_str_key *ez2_str_player_row(const ez2_str_player *p, int r)
{
    if (p == 0 || p->rows == 0 || p->finished || r < 0 ||
        r >= p->clip->layer_count || !p->rows[r].drawn)
        return 0;
    return &p->rows[r].cp;
}

int ez2_str_player_finished(const ez2_str_player *p)
{
    return p && p->finished;
}
