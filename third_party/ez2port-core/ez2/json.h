/* A small JSON reader, for bmson (bmson.h).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The whole document is parsed into a tree of ez2_json nodes owned by one
 * arena, freed together. Numbers are kept as doubles (bmson pulses fit), and
 * strings are unescaped in place. Nothing more than bmson needs. */
#ifndef EZ2_JSON_H
#define EZ2_JSON_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum ez2_json_type {
    EZ2_JSON_NULL = 0, EZ2_JSON_BOOL, EZ2_JSON_NUMBER, EZ2_JSON_STRING,
    EZ2_JSON_ARRAY, EZ2_JSON_OBJECT
} ez2_json_type;

typedef struct ez2_json {
    ez2_json_type    type;
    double           number;        /* NUMBER, and BOOL as 0/1 */
    char            *string;        /* STRING: the text */
    char            *key;           /* an OBJECT member's key, else NULL */
    struct ez2_json *first;         /* ARRAY / OBJECT: the first child */
    struct ez2_json *next;          /* the next sibling */
    int              count;         /* ARRAY / OBJECT: how many children */
} ez2_json;

/* Parse `text` (need not be NUL-terminated). Returns the root, or NULL with
 * `*err` pointing at a short reason. Free with ez2_json_free. */
ez2_json *ez2_json_parse(const char *text, size_t n, const char **err);
void      ez2_json_free(ez2_json *root);

/* Lookups that return NULL / a default rather than crash on a wrong shape. */
const ez2_json *ez2_json_get(const ez2_json *obj, const char *key);
const ez2_json *ez2_json_at(const ez2_json *arr, int index);
double          ez2_json_num(const ez2_json *obj, const char *key, double dflt);
const char     *ez2_json_str(const ez2_json *obj, const char *key, const char *dflt);
int             ez2_json_bool(const ez2_json *obj, const char *key, int dflt);
/* A STRING node's text (an array element, say), or NULL. */
const char     *ez2_json_text(const ez2_json *v);

#ifdef __cplusplus
}
#endif

#endif
