//! Builds stb_truetype (third_party/stb, the copy EZ2PORT renders with) for
//! the plate renderer.

fn main() {
    let stb = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../third_party/stb");
    println!("cargo:rerun-if-changed=csrc/stb.c");
    println!("cargo:rerun-if-changed={}", stb.join("stb_truetype.h").display());
    // No fast-math, no contraction: the rasteriser's floats must round as the
    // port's build rounds them, or the plates differ in a level here and there.
    let mut b = cc::Build::new();
    b.file("csrc/stb.c").include(&stb).warnings(false);
    // NDEBUG, as EZ2PORT's builds have it: stb asserts on some tiny glyph
    // edges, and the port renders on past them.
    b.define("NDEBUG", None);
    if !b.get_compiler().is_like_msvc() {
        b.flag_if_supported("-ffp-contract=off");
    }
    b.compile("ez2bms_stb");
}
