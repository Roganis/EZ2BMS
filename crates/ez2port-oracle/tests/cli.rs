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

#[test]
fn keyconf_reads_alternates_quotes_and_turntables_over_the_defaults() {
    let v = run_with_stdin(
        &["keyconf"],
        "[Keys]\nKey1 = Z, 0810:e501/b3 ; the panel too\nScratch1 = \";\"\n[Analog]\nP1 Turntable = 0810:e501/a0:rev\n",
    );
    // Two channels and a turntable set.
    assert_eq!(v["rc"], 3);
    assert_eq!(v["bad_line"], 0);
    assert_eq!(v["channels"][0]["name"], "Key1");
    assert_eq!(v["channels"][0]["names"], serde_json::json!(["Z", "0810:e501/b3"]));
    assert_eq!(v["channels"][7]["names"], serde_json::json!([";"]));
    // A channel the file does not name keeps its default.
    assert_eq!(v["channels"][1]["names"], serde_json::json!(["S"]));
    assert_eq!(v["analog"], serde_json::json!(["0810:e501/a0:rev", ""]));
    // The formatted text reads back to the same thing.
    let again = run_with_stdin(&["keyconf", "bare"], v["formatted"].as_str().unwrap());
    assert_eq!(again["channels"], v["channels"]);
    assert_eq!(again["analog"], v["analog"]);
}

#[test]
fn bindspec_parses_every_kind_and_refuses_a_broken_device_token() {
    let v = run_with_stdin(&["bindspec"], "Left Ctrl\n0810:e501#2/h0.downright\n0810:e501/b\n");
    assert_eq!(v[0]["kind"], 1);
    assert_eq!(v[0]["key"], "Left Ctrl");
    assert_eq!(v[1]["kind"], 3);
    assert_eq!(v[1]["device"], "0810:e501#2");
    assert_eq!(v[1]["formatted"], "0810:e501#2/h0.downright");
    assert_eq!(v[2]["ok"], 0);
}

#[test]
fn portcfg_reads_debounce_over_the_default() {
    let dir = std::env::temp_dir().join(format!("ez2oracle-cfg-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("settings.ini");
    let run = |text: Option<&str>| {
        match text {
            Some(t) => std::fs::write(&file, t).unwrap(),
            None => {
                let _ = std::fs::remove_file(&file);
            }
        }
        let out = oracle().args(["portcfg", file.to_str().unwrap()]).output().unwrap();
        assert!(out.status.success());
        serde_json::from_slice::<serde_json::Value>(&out.stdout).unwrap()
    };
    assert_eq!(run(None), serde_json::json!({ "read": 0, "debounce": 8 }));
    assert_eq!(
        run(Some("[Port]\ndebounce = 12 ; ms\n")),
        serde_json::json!({ "read": 1, "debounce": 12 })
    );
    // Out of range: ignored.
    assert_eq!(run(Some("Debounce = 101\n"))["debounce"], 8);
    std::fs::remove_dir_all(&dir).ok();
}
