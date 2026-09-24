# Provenance - `third_party/stb`

`stb_truetype.h` **v1.26**, by Sean Barrett (public domain / MIT, both texts
at the bottom of the file), unmodified.

It is the copy EZ2PORT build 1582 renders its title plates with
(`source/port/third_party/stb_truetype.h`, SHA-256
`899e3c67ccf08c15ad333a47f1f0bc5972a1f0486f2a8fc88d9eccbfdd9d6477`), the
same file as `third_party/ez2port-core/third_party/stb_truetype.h`.

**Why this copy and not the current upstream one.** Upstream's `master`
still says v1.26 but has since changed how a composite glyph's offset is
scaled (four lines in `stbtt__GetGlyphShapeTT`, around line 1866). A glyph
built from components would then rasterise differently from the port's, and
the plates are meant to be byte-identical to EZ2PORT's
(`packages/chart-core/test/plate.oracle.test.ts`). Take a new copy only
together with the port.

`crates/ez2bms-media` compiles it (`csrc/stb.c`) for the plate renderer.
