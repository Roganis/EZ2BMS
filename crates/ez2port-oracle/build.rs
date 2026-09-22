//! Compiles EZ2PORT's `ez2core` (third_party/ez2port-core, vendored unmodified)
//! plus the oracle's own C front end into one static library.
//!
//! The file list is `ez2core`'s from EZ2PORT's CMakeLists.txt. ez2core has no
//! dependencies beyond libc and libm by design ("that is what keeps the cipher,
//! the chart parser and the scoring testable on a machine with no graphics and
//! no libraries"), which is what lets this build anywhere cargo runs.

use std::path::PathBuf;

const EZ2CORE: &[&str] = &[
    "crypt",
    "keytable",
    "abm",
    "dds",
    "str",
    "strplay",
    "scr",
    "chart",
    "ssf",
    "ezi",
    "opini",
    "songini",
    "testmenu",
    "score",
    "scroll",
    "mode",
    "rng",
    "gds",
    "pvi",
    "layout",
    "portcfg",
    "mixparam",
    "songdb",
    "usersongs",
    "json",
    "bmson",
    "ttf",
    "textspec",
    "vfs",
    "cfgdir",
    "pluginmsg",
    "playeropts",
    "file",
    "noteorder",
    "selectwheel",
    "session",
    "ranking",
    "font",
    "keyconf",
    "stageini",
    "speed",
    "credit",
    "trace",
    "lamps",
    "bindspec",
    "alsadev",
    "lampcfg",
    "hidout",
];

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let core = manifest.join("../../third_party/ez2port-core");
    let mut build = cc::Build::new();
    build
        .include(&core)
        .include(core.join("third_party"))
        .file(manifest.join("csrc/oracle.c"))
        .warnings(false)
        .extra_warnings(false);
    // gnu99 rather than c99: vfs.c and friends use strcasecmp/nanosleep, as
    // EZ2PORT's own mingw toolchain file notes. MSVC has no such switch.
    if !build.get_compiler().is_like_msvc() {
        build.flag("-std=gnu99");
    }
    for f in EZ2CORE {
        build.file(core.join("ez2").join(format!("{f}.c")));
    }
    build.compile("ez2port_oracle_c");
    println!("cargo:rerun-if-changed=csrc/oracle.c");
    println!("cargo:rerun-if-changed=../../third_party/ez2port-core/ez2");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        println!("cargo:rustc-link-lib=m");
    }
}
