/* A small JSON reader - see json.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "json.h"

#include <stdlib.h>
#include <string.h>
#include <ctype.h>

typedef struct {
    const char *p, *end;
    const char *err;
    int depth;
} Parser;

static void skip_ws(Parser *ps)
{
    while (ps->p < ps->end && (*ps->p == ' ' || *ps->p == '\t' ||
                               *ps->p == '\n' || *ps->p == '\r'))
        ps->p++;
}

static ez2_json *node(ez2_json_type t)
{
    ez2_json *n = (ez2_json *)calloc(1, sizeof *n);
    if (n)
        n->type = t;
    return n;
}

static int hexval(int c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static int put_utf8(char *out, unsigned cp)
{
    if (cp < 0x80) { out[0] = (char)cp; return 1; }
    if (cp < 0x800) {
        out[0] = (char)(0xc0 | (cp >> 6)); out[1] = (char)(0x80 | (cp & 0x3f));
        return 2;
    }
    if (cp < 0x10000) {
        out[0] = (char)(0xe0 | (cp >> 12)); out[1] = (char)(0x80 | ((cp >> 6) & 0x3f));
        out[2] = (char)(0x80 | (cp & 0x3f));
        return 3;
    }
    out[0] = (char)(0xf0 | (cp >> 18)); out[1] = (char)(0x80 | ((cp >> 12) & 0x3f));
    out[2] = (char)(0x80 | ((cp >> 6) & 0x3f)); out[3] = (char)(0x80 | (cp & 0x3f));
    return 4;
}

static char *parse_string(Parser *ps)
{
    const char *s;
    char *out, *w;

    if (ps->p >= ps->end || *ps->p != '"') { ps->err = "string expected"; return 0; }
    ps->p++;
    s = ps->p;
    /* size the buffer by the escaped span - the unescaped form is never
     * longer - rather than by the rest of the document, which a bmson with
     * thousands of strings would turn into gigabytes */
    {
        const char *q = s;
        while (q < ps->end && *q != '"') {
            if (*q == '\\' && q + 1 < ps->end)
                q++;
            q++;
        }
        out = (char *)malloc((size_t)(q - s) + 1);
    }
    if (!out) { ps->err = "out of memory"; return 0; }
    w = out;
    while (ps->p < ps->end && *ps->p != '"') {
        char c = *ps->p++;
        if (c != '\\') { *w++ = c; continue; }
        if (ps->p >= ps->end) break;
        c = *ps->p++;
        switch (c) {
        case '"': case '\\': case '/': *w++ = c; break;
        case 'b': *w++ = '\b'; break;
        case 'f': *w++ = '\f'; break;
        case 'n': *w++ = '\n'; break;
        case 'r': *w++ = '\r'; break;
        case 't': *w++ = '\t'; break;
        case 'u': {
            unsigned cp = 0;
            int i, h;
            for (i = 0; i < 4; i++) {
                if (ps->p >= ps->end || (h = hexval(*ps->p++)) < 0) {
                    free(out); ps->err = "bad \\u escape"; return 0;
                }
                cp = cp * 16 + (unsigned)h;
            }
            if (cp >= 0xd800 && cp < 0xdc00 && ps->end - ps->p >= 6 &&
                ps->p[0] == '\\' && ps->p[1] == 'u') {
                unsigned lo = 0;
                for (i = 0; i < 4; i++) {
                    h = hexval(ps->p[2 + i]);
                    if (h < 0) break;
                    lo = lo * 16 + (unsigned)h;
                }
                if (i == 4 && lo >= 0xdc00 && lo < 0xe000) {
                    cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                    ps->p += 6;
                }
            }
            w += put_utf8(w, cp);
            break;
        }
        default: *w++ = c; break;
        }
    }
    if (ps->p >= ps->end) { free(out); ps->err = "unterminated string"; return 0; }
    ps->p++;
    *w = 0;
    return out;
}

static ez2_json *parse_value(Parser *ps);

static ez2_json *parse_container(Parser *ps, int is_object)
{
    ez2_json *c = node(is_object ? EZ2_JSON_OBJECT : EZ2_JSON_ARRAY);
    ez2_json *last = 0;
    char close = is_object ? '}' : ']';

    if (!c) { ps->err = "out of memory"; return 0; }
    if (++ps->depth > 64) { ps->err = "nested too deep"; free(c); return 0; }
    ps->p++;
    skip_ws(ps);
    if (ps->p < ps->end && *ps->p == close) { ps->p++; ps->depth--; return c; }
    for (;;) {
        ez2_json *v;
        char *key = 0;

        skip_ws(ps);
        if (is_object) {
            key = parse_string(ps);
            if (!key) { ez2_json_free(c); return 0; }
            skip_ws(ps);
            if (ps->p >= ps->end || *ps->p != ':') {
                free(key); ez2_json_free(c); ps->err = "':' expected"; return 0;
            }
            ps->p++;
        }
        v = parse_value(ps);
        if (!v) { free(key); ez2_json_free(c); return 0; }
        if (is_object)
            v->key = key;
        if (last) last->next = v; else c->first = v;
        last = v;
        c->count++;
        skip_ws(ps);
        if (ps->p < ps->end && *ps->p == ',') { ps->p++; continue; }
        if (ps->p < ps->end && *ps->p == close) { ps->p++; ps->depth--; return c; }
        ez2_json_free(c);
        ps->err = is_object ? "',' or '}' expected" : "',' or ']' expected";
        return 0;
    }
}

static ez2_json *parse_value(Parser *ps)
{
    skip_ws(ps);
    if (ps->p >= ps->end) { ps->err = "unexpected end"; return 0; }
    switch (*ps->p) {
    case '{': return parse_container(ps, 1);
    case '[': return parse_container(ps, 0);
    case '"': {
        ez2_json *n = node(EZ2_JSON_STRING);
        if (!n) { ps->err = "out of memory"; return 0; }
        n->string = parse_string(ps);
        if (!n->string) { free(n); return 0; }
        return n;
    }
    case 't': case 'f': case 'n': {
        ez2_json *n;
        if (ps->end - ps->p >= 4 && memcmp(ps->p, "true", 4) == 0) {
            n = node(EZ2_JSON_BOOL); if (n) n->number = 1; ps->p += 4; return n;
        }
        if (ps->end - ps->p >= 5 && memcmp(ps->p, "false", 5) == 0) {
            n = node(EZ2_JSON_BOOL); ps->p += 5; return n;
        }
        if (ps->end - ps->p >= 4 && memcmp(ps->p, "null", 4) == 0) {
            n = node(EZ2_JSON_NULL); ps->p += 4; return n;
        }
        ps->err = "bad literal";
        return 0;
    }
    default: {
        char buf[64];
        size_t k = 0;
        ez2_json *n;
        const char *s = ps->p;
        while (ps->p < ps->end && k < sizeof buf - 1 &&
               (isdigit((unsigned char)*ps->p) || *ps->p == '-' || *ps->p == '+' ||
                *ps->p == '.' || *ps->p == 'e' || *ps->p == 'E'))
            buf[k++] = *ps->p++;
        if (k == 0) { ps->err = "value expected"; return 0; }
        buf[k] = 0;
        n = node(EZ2_JSON_NUMBER);
        if (!n) { ps->err = "out of memory"; return 0; }
        n->number = strtod(buf, 0);
        (void)s;
        return n;
    }
    }
}

ez2_json *ez2_json_parse(const char *text, size_t n, const char **err)
{
    Parser ps;
    ez2_json *root;

    ps.p = text; ps.end = text + n; ps.err = 0; ps.depth = 0;
    if (n >= 3 && (unsigned char)text[0] == 0xef && (unsigned char)text[1] == 0xbb &&
        (unsigned char)text[2] == 0xbf)
        ps.p += 3;                                   /* a UTF-8 BOM */
    root = parse_value(&ps);
    if (err)
        *err = root ? 0 : (ps.err ? ps.err : "parse error");
    return root;
}

void ez2_json_free(ez2_json *root)
{
    ez2_json *c, *nx;

    if (!root)
        return;
    for (c = root->first; c; c = nx) {
        nx = c->next;
        ez2_json_free(c);
    }
    free(root->string);
    free(root->key);
    free(root);
}

const ez2_json *ez2_json_get(const ez2_json *obj, const char *key)
{
    const ez2_json *m;

    if (!obj || obj->type != EZ2_JSON_OBJECT || !key)
        return 0;
    for (m = obj->first; m; m = m->next)
        if (m->key && strcmp(m->key, key) == 0)
            return m;
    return 0;
}

const ez2_json *ez2_json_at(const ez2_json *arr, int index)
{
    const ez2_json *m;

    if (!arr || (arr->type != EZ2_JSON_ARRAY && arr->type != EZ2_JSON_OBJECT) || index < 0)
        return 0;
    for (m = arr->first; m && index > 0; m = m->next)
        index--;
    return m;
}

double ez2_json_num(const ez2_json *obj, const char *key, double dflt)
{
    const ez2_json *m = ez2_json_get(obj, key);
    return (m && (m->type == EZ2_JSON_NUMBER || m->type == EZ2_JSON_BOOL)) ? m->number : dflt;
}

const char *ez2_json_str(const ez2_json *obj, const char *key, const char *dflt)
{
    const ez2_json *m = ez2_json_get(obj, key);
    return (m && m->type == EZ2_JSON_STRING && m->string) ? m->string : dflt;
}

int ez2_json_bool(const ez2_json *obj, const char *key, int dflt)
{
    const ez2_json *m = ez2_json_get(obj, key);
    return (m && (m->type == EZ2_JSON_BOOL || m->type == EZ2_JSON_NUMBER)) ? (m->number != 0) : dflt;
}

const char *ez2_json_text(const ez2_json *v)
{
    return (v && v->type == EZ2_JSON_STRING) ? v->string : 0;
}
