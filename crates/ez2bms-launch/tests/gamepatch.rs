//! Writing into a game folder (gamepatch.rs): all or nothing, names kept as
//! on disk, a backup and a restore that give the folder back byte for byte.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use ez2bms_launch::gamepatch::{
    apply, backups, fnv1a64, resolve_ci, restore, write_tree, Content, Expect, PatchEntry,
    PatchSpec,
};

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ez2bms-gamepatch {name} {}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn put(root: &Path, rel: &str, bytes: &[u8]) {
    let p = root.join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, bytes).unwrap();
}

/// A small game folder, mixed case as shipped ones are.
fn game(name: &str) -> PathBuf {
    let root = scratch(name);
    put(&root, "sound/Alpha/StreetMix1p-alpha.ez", b"old chart");
    put(&root, "sound/Alpha/StreetMix1p-alpha.ezi", b"1 1 kick.wav\r\n");
    put(&root, "sound/Alpha/kick.ssf", b"kick");
    put(&root, "system/StreetMix/song.bin", b"old table");
    root
}

/// Every file under root but our dot-folders, with its bytes, keyed by its
/// path with forward slashes on every platform (as the reports give them).
fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn rel(root: &Path, p: &Path) -> String {
        p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/")
    }
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        for e in std::fs::read_dir(dir).unwrap().flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if dir == root && name.starts_with(".ez2bms") {
                continue;
            }
            if p.is_dir() {
                out.insert(format!("{}/", rel(root, &p)), vec![]);
                walk(root, &p, out);
            } else {
                out.insert(rel(root, &p), std::fs::read(&p).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

fn entry(rel: &str, bytes: &[u8], expect: Expect) -> PatchEntry {
    PatchEntry { rel: rel.into(), content: Content::Bytes(bytes.to_vec()), expect }
}

fn spec(stamp: &str, entries: Vec<PatchEntry>) -> PatchSpec {
    PatchSpec { stamp: stamp.into(), label: "Alpha remix".into(), entries, keep: vec![] }
}

#[test]
fn fnv_matches_chart_core() {
    assert_eq!(fnv1a64(b""), 0xcbf2_9ce4_8422_2325);
    assert_eq!(fnv1a64(b"a"), 0xaf63_dc4c_8601_ec8c);
    assert_eq!(fnv1a64(b"foobar"), 0x8594_4171_f739_67e8);
}

#[test]
fn finds_files_in_any_case_and_keeps_their_names() {
    let root = game("resolve");
    let (p, exists) = resolve_ci(&root, "SOUND/alpha/streetmix1p-ALPHA.ez").unwrap();
    assert!(exists);
    assert_eq!(p, root.join("sound/Alpha/StreetMix1p-alpha.ez"));
    let (p, exists) = resolve_ci(&root, "sound/alpha/new/x.ssf").unwrap();
    assert!(!exists);
    assert_eq!(p, root.join("sound/Alpha/new/x.ssf"));
    for bad in ["../x", "/etc/passwd", ".ez2bms-backup/x", "sound/.hidden", "", "a\\b"] {
        assert!(resolve_ci(&root, bad).is_err(), "{bad:?}");
    }
}

#[test]
fn applies_with_a_backup_and_restores_byte_for_byte() {
    let root = game("apply");
    let before = tree(&root);
    let mut s = spec(
        "20260923-120000-alpha",
        vec![
            entry(
                "sound/alpha/streetmix1p-alpha.ez",
                b"new chart",
                Expect::Fnv(fnv1a64(b"old chart")),
            ),
            entry("sound/alpha/streetmix1p-alpha-shd.ez", b"a new tier", Expect::Absent),
            entry("sound/alpha/remix/kick~2.ssf", b"kick 2", Expect::Absent),
            entry("system/streetmix/SONG.BIN", b"new table", Expect::Any),
        ],
    );
    s.keep.push(("sound/alpha/KICK.ssf".into(), fnv1a64(b"kick")));
    let mut steps = vec![];
    let r = apply(&root, &s, &mut |d, t| steps.push((d, t))).unwrap();
    assert_eq!(steps.last(), Some(&(8, 8)));
    assert_eq!(r.replaced, vec!["sound/Alpha/StreetMix1p-alpha.ez", "system/StreetMix/song.bin"]);
    assert_eq!(
        r.created,
        vec!["sound/Alpha/streetmix1p-alpha-shd.ez", "sound/Alpha/remix/kick~2.ssf"]
    );
    // Replaced under the name on disk: no second, lower-case file.
    let after = tree(&root);
    assert_eq!(after["sound/Alpha/StreetMix1p-alpha.ez"], b"new chart");
    assert_eq!(after["system/StreetMix/song.bin"], b"new table");
    assert_eq!(after["sound/Alpha/remix/kick~2.ssf"], b"kick 2");
    // Two files and a folder more.
    assert_eq!(after.len(), before.len() + 3);
    // The backup holds what was replaced; no staging is left behind.
    let b = root.join(".ez2bms-backup/20260923-120000-alpha");
    assert_eq!(
        std::fs::read(b.join("files/sound/Alpha/StreetMix1p-alpha.ez")).unwrap(),
        b"old chart"
    );
    assert!(!root.join(".ez2bms-staging").exists());
    let list = backups(&root).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(
        (list[0].state.as_str(), list[0].files, list[0].label.as_str()),
        ("applied", 4, "Alpha remix")
    );

    let r = restore(&root, "20260923-120000-alpha", false).unwrap();
    assert_eq!(r.conflicts, Vec::<String>::new());
    assert_eq!(r.restored.len(), 2);
    assert_eq!(r.removed.len(), 2);
    assert_eq!(tree(&root), before);
    assert_eq!(backups(&root).unwrap()[0].state, "restored");
    // Twice is harmless: every file is already as it was.
    let again = restore(&root, "20260923-120000-alpha", false).unwrap();
    assert_eq!(again.skipped.len(), 4);
    assert!(again.restored.is_empty() && again.conflicts.is_empty());
    assert_eq!(tree(&root), before);
}

#[test]
fn restore_leaves_what_changed_since_unless_forced() {
    let root = game("conflict");
    let before = tree(&root);
    apply(
        &root,
        &spec(
            "s1",
            vec![
                entry("sound/Alpha/StreetMix1p-alpha.ez", b"new chart", Expect::Any),
                entry("sound/Alpha/x.ssf", b"x", Expect::Absent),
            ],
        ),
        &mut |_, _| {},
    )
    .unwrap();
    put(&root, "sound/Alpha/StreetMix1p-alpha.ez", b"edited by hand");
    let r = restore(&root, "s1", false).unwrap();
    assert_eq!(r.conflicts, vec!["sound/Alpha/StreetMix1p-alpha.ez"]);
    assert!(r.restored.is_empty() && r.removed.is_empty());
    assert!(root.join("sound/Alpha/x.ssf").exists()); // nothing done
    let r = restore(&root, "s1", true).unwrap();
    assert_eq!(r.restored, vec!["sound/Alpha/StreetMix1p-alpha.ez"]);
    assert_eq!(tree(&root), before);
}

#[test]
fn a_stale_plan_or_a_failure_leaves_the_game_as_it_was() {
    let root = game("fail");
    let before = tree(&root);
    let no_stage_or_backup = |root: &Path| {
        assert!(
            !root.join(".ez2bms-staging").exists()
                || std::fs::read_dir(root.join(".ez2bms-staging")).unwrap().next().is_none()
        );
        assert!(backups(root).unwrap().is_empty());
    };
    // The file changed since the plan.
    let e = apply(
        &root,
        &spec(
            "a",
            vec![entry("sound/Alpha/StreetMix1p-alpha.ez", b"x", Expect::Fnv(fnv1a64(b"other")))],
        ),
        &mut |_, _| {},
    );
    assert!(e.unwrap_err().to_string().contains("plan it again"));
    // A file planned as new is there.
    assert!(apply(
        &root,
        &spec("b", vec![entry("sound/Alpha/kick.ssf", b"x", Expect::Absent)]),
        &mut |_, _| {}
    )
    .is_err());
    // A reused file changed.
    let mut s = spec("c", vec![entry("sound/Alpha/n.ssf", b"x", Expect::Absent)]);
    s.keep.push(("sound/Alpha/kick.ssf".into(), fnv1a64(b"not kick")));
    assert!(apply(&root, &s, &mut |_, _| {}).is_err());
    // A copy whose source is gone: fails while staging.
    let s = spec(
        "d",
        vec![
            entry("sound/Alpha/StreetMix1p-alpha.ez", b"new", Expect::Any),
            PatchEntry {
                rel: "sound/Alpha/y.ssf".into(),
                content: Content::Copy(root.join("nowhere")),
                expect: Expect::Absent,
            },
        ],
    );
    assert!(apply(&root, &s, &mut |_, _| {}).is_err());
    // Fails while moving into place, after some files are in: all backed out.
    let s = spec(
        "e",
        vec![
            entry("sound/Alpha/StreetMix1p-alpha.ez", b"new", Expect::Any),
            entry("sound/Alpha/fresh/z.ssf", b"z", Expect::Absent),
            entry("sound/Alpha/kick.ssf/under-a-file", b"!", Expect::Absent),
        ],
    );
    assert!(apply(&root, &s, &mut |_, _| {}).is_err());
    assert_eq!(tree(&root), before);
    no_stage_or_backup(&root);
    // Bad names never get that far.
    assert!(apply(&root, &spec("f", vec![entry("../escape", b"x", Expect::Any)]), &mut |_, _| {})
        .is_err());
    assert!(apply(&root, &spec("bad stamp", vec![]), &mut |_, _| {}).is_err());
    assert!(apply(
        &root,
        &spec("g", vec![entry("a.ez", b"1", Expect::Any), entry("A.EZ", b"2", Expect::Any)]),
        &mut |_, _| {}
    )
    .is_err());
    assert_eq!(tree(&root), before);
}

#[cfg(unix)]
#[test]
fn a_read_only_file_is_replaced_and_stays_read_only() {
    let root = game("readonly");
    let p = root.join("system/StreetMix/song.bin");
    let mut perm = std::fs::metadata(&p).unwrap().permissions();
    perm.set_readonly(true);
    std::fs::set_permissions(&p, perm).unwrap();
    apply(
        &root,
        &spec("ro", vec![entry("system/StreetMix/song.bin", b"new table", Expect::Any)]),
        &mut |_, _| {},
    )
    .unwrap();
    assert_eq!(std::fs::read(&p).unwrap(), b"new table");
    assert!(std::fs::metadata(&p).unwrap().permissions().readonly());
    restore(&root, "ro", false).unwrap();
    assert_eq!(std::fs::read(&p).unwrap(), b"old table");
    assert!(std::fs::metadata(&p).unwrap().permissions().readonly());
}

#[test]
fn writes_a_new_folder_shaped_like_the_game() {
    let d = scratch("tree");
    let src = d.join("made.ssf");
    std::fs::write(&src, b"made").unwrap();
    let dest = d.join("export");
    let out = write_tree(
        &dest,
        &[
            ("sound/alpha/a.ez".into(), Content::Bytes(b"a".to_vec())),
            ("sound/alpha/made.ssf".into(), Content::Copy(src)),
            ("system/StreetMix/song.bin".into(), Content::Bytes(b"t".to_vec())),
        ],
        &mut |_, _| {},
    )
    .unwrap();
    assert_eq!(out, dest);
    assert_eq!(std::fs::read(dest.join("sound/alpha/made.ssf")).unwrap(), b"made");
    assert_eq!(std::fs::read(dest.join("system/StreetMix/song.bin")).unwrap(), b"t");
    // Not over something that is there, and never outside the folder.
    assert!(write_tree(&dest, &[("x".into(), Content::Bytes(vec![]))], &mut |_, _| {}).is_err());
    assert!(write_tree(&d.join("e2"), &[("../x".into(), Content::Bytes(vec![]))], &mut |_, _| {})
        .is_err());
    assert!(!d.join("e2").exists());
}
