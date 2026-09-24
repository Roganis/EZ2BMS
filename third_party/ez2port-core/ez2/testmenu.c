/* The test menu's page model. See testmenu.h - every rule is transcribed.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "testmenu.h"

#include <stdio.h>
#include <string.h>

void ez2_menu_init(ez2_menu *m, const char *title)
{
    if (!m)
        return;
    memset(m, 0, sizeof *m);
    if (title)
        snprintf(m->title, sizeof m->title, "%s", title);
}

void ez2_menu_label(ez2_menu *m, int index, const char *label)
{
    ez2_menu_row *r;

    if (!m || index < 0 || index >= EZ2_MENU_ROWS)
        return;
    r = &m->rows[index];
    /* setLabel @0x474500: "the first time an index is used - open the row:
     * bump the row count, mark it enabled and clear its choice list". The
     * port keeps `enabled` for the CURSOR and lets a caption clear it, which
     * is how a row with no choices ends up skipped. */
    if (!r->open) {
        r->open = 1;
        r->choice_count = 0;
        if (index + 1 > m->row_count)
            m->row_count = index + 1;
    }
    snprintf(r->label, sizeof r->label, "%s", label ? label : "");
    r->enabled = r->choice_count > 0;
}

void ez2_menu_choice(ez2_menu *m, int index, int slot, const char *text)
{
    ez2_menu_row *r;

    if (!m || index < 0 || index >= EZ2_MENU_ROWS)
        return;
    if (slot < 0 || slot >= EZ2_MENU_CHOICES)
        return;
    r = &m->rows[index];
    snprintf(r->choices[slot], sizeof r->choices[slot], "%s",
             text ? text : "");
    if (slot + 1 > r->choice_count)
        r->choice_count = slot + 1;
    r->enabled = 1;
}

void ez2_menu_entry(ez2_menu *m, int index, const char *label,
                    const char *const *choices, int count)
{
    int i;

    /* addEntry @0x474600: the label, then each choice in turn. */
    ez2_menu_label(m, index, label);
    for (i = 0; i < count; i++)
        ez2_menu_choice(m, index, i, choices ? choices[i] : "");
}

void ez2_menu_next_row(ez2_menu *m)
{
    int guard;

    if (!m || m->row_count <= 0)
        return;
    /* nextRow @0x4744c0 is a do-while with NO exit but an enabled row, so a
     * page with none would spin. The port bounds it; a menu that cannot be
     * navigated leaves the cursor alone rather than hanging. */
    for (guard = 0; guard < EZ2_MENU_ROWS + 1; guard++) {
        m->index++;
        if (m->index >= m->row_count)
            m->index = 0;
        if (m->rows[m->index].enabled)
            return;
    }
}

/* THE CLASS'S OWN UPWARD STEP, not a port addition: SystemMenu::update2
 * @0x474660 has `nextRow()` on SERVICE (2) and 2P START (5), and on 1P START
 * (4) an inline `do { m_index--; if (m_index < 0) m_index = m_rowCount - 1; }
 * while (m_rows[m_index].enabled == 0)` - the director's own hint text
 * @0x49f990 reads "1P Start Button to Up, 2P Start Button to Down, Effect 1
 * Button to Enter". An earlier note here called this the port's invention
 * and bound the two starts the other way round (SCREEN-AUDIT.md 8.1). Same
 * bound as nextRow. */
void ez2_menu_prev_row(ez2_menu *m)
{
    int guard;

    if (!m || m->row_count <= 0)
        return;
    for (guard = 0; guard < EZ2_MENU_ROWS + 1; guard++) {
        m->index--;
        if (m->index < 0)
            m->index = m->row_count - 1;
        if (m->rows[m->index].enabled)
            return;
    }
}

void ez2_menu_next_choice(ez2_menu *m)
{
    ez2_menu_row *r;

    if (!m || m->index < 0 || m->index >= EZ2_MENU_ROWS)
        return;
    r = &m->rows[m->index];
    if (r->choice_count <= 0)
        return;
    /* update2 @0x474660's TEST (1) / EFFECT 1 (6) arm on a value row:
     * `cur->value++; if (cur->value >= cur->choiceCount) cur->value = 0;`
     * then onMenu(1, row, value). EFFECT 4 (9) is the other way, below. */
    if (++r->value >= r->choice_count)
        r->value = 0;
}

void ez2_menu_prev_choice(ez2_menu *m)
{
    ez2_menu_row *r;

    if (!m || m->index < 0 || m->index >= EZ2_MENU_ROWS)
        return;
    r = &m->rows[m->index];
    if (r->choice_count <= 0)
        return;
    /* prevChoice @0x474490, exactly: down one, and below zero it wraps to
     * the last. */
    if (--r->value < 0)
        r->value = r->choice_count - 1;
}

const char *ez2_menu_value(const ez2_menu *m, int index)
{
    const ez2_menu_row *r;

    if (!m || index < 0 || index >= EZ2_MENU_ROWS)
        return "";
    r = &m->rows[index];
    if (r->choice_count <= 0 || r->value < 0 || r->value >= r->choice_count)
        return "";
    return r->choices[r->value];
}
