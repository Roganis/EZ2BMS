use std::path::{Path, PathBuf};

use ez2bms_launch::probe::probe_bytes;
use ez2bms_launch::{probe, write_package, Caps, LaunchError, LaunchSpec, TempSongs};

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ez2bms-launch {name} {}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// A stand-in for an ez2play binary: option literals and build strings as the
/// compiler lays them out, NUL-terminated among other data.
fn fake_binary(options: &[&str]) -> Vec<u8> {
    let mut b = b"MZ\x90\x00\x03\x00\x00\x00\xff\xff".to_vec();
    for o in options {
        b.extend_from_slice(o.as_bytes());
        b.push(0);
        b.extend_from_slice(b"\x00\x00\x07");
    }
    b.extend_from_slice(b"usage: ez2play --exe UNPACKED.exe CHART.ez [--root ASSETS]\n\0");
    b.extend_from_slice(b"80d85c1-dirty\0\0\0ez2play build %d (%s%s)\0");
    b
}

#[test]
fn probing_reads_options_and_commit_without_running_anything() {
    let p = probe_bytes(
        Path::new("x"),
        &fake_binary(&["--exe", "--root", "--mode", "--auto", "--songs", "--log"]),
    );
    assert!(p.has("--songs") && p.has("--log") && !p.has("--start"));
    assert!(!p.has("--root ASSETS"), "only whole literals count, not usage text");
    assert_eq!(p.commit.as_deref(), Some("80d85c1-dirty"));
    let c = p.caps();
    assert!(c.songs_root && c.log_file && !c.start_at && !c.skip_ready && !c.viewer);

    let newer =
        probe_bytes(Path::new("x"), &fake_binary(&["--exe", "--start", "--no-ready", "--viewer"]))
            .caps();
    assert!(newer.start_at && newer.skip_ready && newer.viewer);

    let dir = scratch("probe");
    let not = dir.join("notepad.exe");
    std::fs::write(&not, b"MZ just some program\0--verbose\0").unwrap();
    assert!(matches!(probe(&not), Err(LaunchError::NotEz2play(_))));
    let yes = dir.join("ez2play.exe");
    std::fs::write(&yes, fake_binary(&["--exe", "--root"])).unwrap();
    assert!(probe(&yes).is_ok());
}

fn spec(dir: &Path) -> LaunchSpec {
    LaunchSpec {
        ez2play: dir.join("ez2play"),
        game_root: dir.join("Final EX"),
        exe: None,
        songs: Some(dir.join("test songs")),
        chart: dir.join("test songs/abc/7streetmix1p-abc.ez"),
        mode: "7StreetMix".into(),
        auto: true,
        windowed: true,
        bga: Some(false),
        speed: Some(250),
        log: Some(dir.join("play.log")),
        start_ms: None,
        skip_ready: false,
        result: Some(dir.join("result.json")),
    }
}

#[test]
fn the_command_line_asks_only_for_what_the_build_has() {
    let d = Path::new("/g");
    let all = Caps {
        songs_root: true,
        log_file: true,
        windowed: true,
        bga_toggle: true,
        speed: true,
        ..Caps::default()
    };
    let args: Vec<String> =
        spec(d).args(&all).unwrap().iter().map(|a| a.to_string_lossy().into_owned()).collect();
    // Paths as the platform joins them (backslashes on Windows).
    let p = |x: PathBuf| x.to_string_lossy().into_owned();
    let s = spec(d);
    assert_eq!(
        args,
        [
            "--root".to_string(),
            p(s.game_root),
            "--songs".into(),
            p(s.songs.unwrap()),
            "--mode".into(),
            "7StreetMix".into(),
            "--auto".into(),
            "--windowed".into(),
            "--no-bga".into(),
            "--speed".into(),
            "250".into(),
            "--log".into(),
            p(s.log.unwrap()),
            p(s.chart),
        ]
    );
    // Nice-to-haves are dropped on an older build; must-haves refuse.
    let old = Caps { songs_root: true, ..Caps::default() };
    let args = spec(d).args(&old).unwrap();
    assert_eq!(args.len(), 8);
    assert!(matches!(spec(d).args(&Caps::default()), Err(LaunchError::Unsupported(_))));
    let from_cursor = LaunchSpec { start_ms: Some(12_345.6), skip_ready: true, ..spec(d) };
    assert!(matches!(from_cursor.args(&all), Err(LaunchError::Unsupported(_))));
    let future = Caps { start_at: true, skip_ready: true, result_file: true, ..all };
    let args: Vec<String> = from_cursor
        .args(&future)
        .unwrap()
        .iter()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    assert!(
        args.windows(2).any(|w| w == ["--start", "12346"])
            && args.contains(&"--no-ready".to_string())
    );
    let with_exe = LaunchSpec { exe: Some("/g/EZ2AC unpacked.exe".into()), ..spec(d) };
    assert_eq!(
        with_exe.args(&all).unwrap()[..2],
        ["--exe".into(), "/g/EZ2AC unpacked.exe".into()] as [std::ffi::OsString; 2]
    );
}

#[test]
fn packages_are_written_whole_and_replace_the_old_copy() {
    let songs = scratch("pkg");
    let files = |tag: &str| {
        vec![
            ("song.ini".to_string(), format!("[Song]\nKey = abc ; {tag}\n").into_bytes()),
            (format!("streetmix1p-abc-{tag}.ez"), vec![1, 2, 3]),
        ]
    };
    let dir = write_package(&songs, "abc", &files("hd")).unwrap();
    assert!(dir.join("streetmix1p-abc-hd.ez").is_file());
    write_package(&songs, "abc", &files("ex")).unwrap();
    assert!(dir.join("streetmix1p-abc-ex.ez").is_file());
    assert!(!dir.join("streetmix1p-abc-hd.ez").exists(), "the old copy is gone, not merged");
    let left: Vec<_> =
        std::fs::read_dir(&songs).unwrap().flatten().map(|e| e.file_name()).collect();
    assert_eq!(left, ["abc"], "no staging left behind");

    for key in ["", "ABC", "a-b", "sixteen_chars_xx", "abcdefghijklmnop"] {
        assert!(write_package(&songs, key, &files("nm")).is_err(), "{key:?}");
    }
    for bad in ["../x.ez", "a/b.ez", "c:\\x", ".hidden", ""] {
        assert!(write_package(&songs, "abc", &[(bad.to_string(), vec![])]).is_err(), "{bad:?}");
    }
}

#[test]
fn a_test_songs_root_is_private_and_cleans_up() {
    let base = scratch("temp");
    std::fs::create_dir_all(base.join("songs-1-2/stale")).unwrap();
    let t = TempSongs::create(&base).unwrap();
    assert!(!base.join("songs-1-2").exists(), "a crashed run's folder is cleared");
    t.write_package("k1", &[("song.ini".into(), b"x".to_vec())]).unwrap();
    let root = t.root().to_path_buf();
    assert!(root.join("k1/song.ini").is_file());
    drop(t);
    assert!(!root.exists());
}

#[cfg(unix)]
mod process {
    use super::*;
    use ez2bms_launch::{launch, Outcome, Stream};
    use std::os::unix::fs::PermissionsExt;

    /// A fake ez2play: prints its arguments, one line to stderr, exits as told.
    fn fake(dir: &Path, body: &str) -> PathBuf {
        let p = dir.join("ez2play");
        std::fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::create_dir_all(dir.join("Final EX")).unwrap();
        p
    }

    fn caps() -> Caps {
        Caps {
            songs_root: true,
            log_file: true,
            windowed: true,
            bga_toggle: true,
            speed: true,
            ..Caps::default()
        }
    }

    #[test]
    fn arguments_with_spaces_arrive_intact_and_the_log_is_captured() {
        let dir = scratch("spawn ok");
        fake(
            &dir,
            "for a in \"$@\"; do echo \"ARG:$a\"; done\necho 'user songs: here' >&2\npwd\nexit 0",
        );
        let s = spec(&dir);
        let (outcome, lines) = launch(&s, &caps()).unwrap().wait().unwrap();
        assert_eq!(outcome, Outcome::Finished);
        let got: Vec<String> =
            lines.iter().filter_map(|l| l.text.strip_prefix("ARG:").map(str::to_string)).collect();
        let want: Vec<String> =
            s.args(&caps()).unwrap().iter().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(got, want);
        assert!(lines.iter().any(|l| l.stream == Stream::Err && l.text == "user songs: here"));
        assert!(lines.iter().any(|l| l.text.ends_with("Final EX")), "runs in the game folder");
    }

    #[test]
    fn exit_codes_say_how_it_ended() {
        for (code, want) in [
            (1, Outcome::Failed),
            (2, Outcome::Usage),
            (77, Outcome::Skipped),
            (5, Outcome::Other(5)),
        ] {
            let dir = scratch(&format!("spawn {code}"));
            fake(&dir, &format!("echo 'ez2play: cannot read x as a chart' >&2\nexit {code}"));
            let (outcome, lines) = launch(&spec(&dir), &caps()).unwrap().wait().unwrap();
            assert_eq!(outcome, want);
            assert_eq!(lines.len(), 1);
        }
    }

    #[test]
    fn a_running_game_can_be_stopped() {
        let dir = scratch("spawn kill");
        fake(&dir, "echo started\nexec sleep 30");
        let mut r = launch(&spec(&dir), &caps()).unwrap();
        let t = std::time::Instant::now();
        while r.drain().is_empty() && t.elapsed().as_secs() < 5 {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert_eq!(r.try_wait().unwrap(), None);
        r.kill().unwrap();
        let (outcome, _) = r.wait().unwrap();
        assert_eq!(outcome, Outcome::Killed);
        assert!(t.elapsed().as_secs() < 5);
    }
}
