//! Smoke tests for the oracle binary itself. The real parity tests live next
//! to the code they check (packages/chart-core/test/*.oracle.test.ts); these
//! only prove the C core built and the command plumbing answers.

use std::io::Write;
use std::process::{Command, Stdio};

fn oracle() -> Command {
    Command::new(env!("CARGO_BIN_EXE_ez2port-oracle"))
}

fn run_with_stdin(args: &[&str], input: &str) -> serde_json::Value {
    let mut child = oracle()
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn oracle");
    child.stdin.take().unwrap().write_all(input.as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success(), "oracle failed: {out:?}");
    serde_json::from_slice(&out.stdout).expect("oracle printed JSON")
}

#[test]
fn usage_exits_2() {
    let out = oracle().output().unwrap();
    assert_eq!(out.status.code(), Some(2));
}

#[test]
fn judge_windows_are_inclusive_ticks() {
    // Defaults 6/24/36/72, widened by 3 -> 9/27/39/75 (ez2/songini.c).
    let v = run_with_stdin(&["score"], "judge 9\njudge 10\njudge 75\njudge 76\n");
    assert_eq!(v, serde_json::json!(["KOOL", "COOL", "FAIL", "NONE"]));
}

#[test]
fn cipher_round_trips_with_a_synthetic_table() {
    let dir = std::env::temp_dir().join(format!("ez2oracle-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let table: Vec<u8> = (0..512u32).map(|i| (i.wrapping_mul(97) ^ 0x5a) as u8).collect();
    let plain: Vec<u8> = (0..1001u32).map(|i| (i * 7 % 251) as u8).collect();
    std::fs::write(dir.join("t.bin"), &table).unwrap();
    std::fs::write(dir.join("p.bin"), &plain).unwrap();
    let p = |n: &str| dir.join(n).to_string_lossy().into_owned();
    for (d, i, o) in [("enc", "p.bin", "c.bin"), ("dec", "c.bin", "r.bin")] {
        let st = oracle().args(["crypt", d, &p("t.bin"), &p(i), &p(o)]).output().unwrap();
        assert!(st.status.success());
    }
    assert_ne!(std::fs::read(dir.join("c.bin")).unwrap(), plain);
    assert_eq!(std::fs::read(dir.join("r.bin")).unwrap(), plain);
    std::fs::remove_dir_all(&dir).ok();
}
