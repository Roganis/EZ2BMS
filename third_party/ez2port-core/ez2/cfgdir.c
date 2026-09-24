/* See cfgdir.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "cfgdir.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char g_override[1024];
static char g_resolved[1024];

void ez2_cfgdir_set(const char *dir)
{
    g_override[0] = 0;
    g_resolved[0] = 0;              /* re-resolve on the next ask */

    if (dir && dir[0]) {
        int k = snprintf(g_override, sizeof g_override, "%s", dir);

        /* A TRUNCATED DIRECTORY IS A DIFFERENT DIRECTORY, and it is one that
         * probably exists - lop the tail off a deep path and you land on a
         * parent. Refusing is the same rule ez2_cfgfile applies to the leaf,
         * and for the same reason: settings written somewhere other than
         * where they are read from are worse than settings that did not
         * save. Falling back to the per-user location is the honest answer. */
        if (k < 0 || (size_t)k >= sizeof g_override)
            g_override[0] = 0;
    }
}

const char *ez2_cfgdir(void)
{
    const char *xdg, *home, *appdata;

    if (g_override[0])
        return g_override;
    if (g_resolved[0])
        return g_resolved;

    xdg = getenv("XDG_CONFIG_HOME");
    if (xdg && xdg[0]) {
        snprintf(g_resolved, sizeof g_resolved, "%s/ez2port", xdg);
        return g_resolved;
    }
    home = getenv("HOME");
    if (home && home[0]) {
        snprintf(g_resolved, sizeof g_resolved, "%s/.config/ez2port", home);
        return g_resolved;
    }
    /* Windows has neither of the two above. It has this. */
    appdata = getenv("APPDATA");
    if (appdata && appdata[0]) {
        snprintf(g_resolved, sizeof g_resolved, "%s/ez2port", appdata);
        return g_resolved;
    }
    return 0;
}

int ez2_cfgfile(const char *leaf, char *out, size_t n)
{
    const char *dir = ez2_cfgdir();
    int k;

    if (!leaf || !out || n == 0)
        return 0;
    if (!dir)
        return 0;

    k = snprintf(out, n, "%s/%s", dir, leaf);
    if (k <= 0 || (size_t)k >= n) {
        out[0] = 0;
        return 0;
    }
    return 1;
}
