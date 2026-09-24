fn main() {
    // The build's commit for the About box and reports: CI's GITHUB_SHA, else
    // the checkout's HEAD, else "unknown" (a source archive).
    let commit = std::env::var("GITHUB_SHA")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            std::process::Command::new("git")
                .args(["rev-parse", "HEAD"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .and_then(|o| String::from_utf8(o.stdout).ok())
        })
        .map(|s| s.trim().chars().take(12).collect::<String>())
        .unwrap_or_else(|| "unknown".into());
    println!("cargo:rustc-env=EZ2BMS_COMMIT={commit}");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    tauri_build::build()
}
