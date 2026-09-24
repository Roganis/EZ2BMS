//! Exports (M6): keysounds made for the cabinet or a BMS folder, and the
//! files written into a game folder with a backup (ez2bms-launch gamepatch.rs)
//! or into a new folder shaped like the game. The editor plans every byte of
//! the charts and tables (chart-core publish/cabinet.ts, io/bms); what it
//! cannot do - read samples, compare them with what the game has, write the
//! game's folder all or nothing - is here.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use ez2bms_audio::export::{export_sound, how, How, SoundFormat, SoundJob};
use ez2bms_audio::ssf;
use ez2bms_launch::gamepatch::{
    self, fnv1a64, fnv_hex, BackupInfo, Content, Expect, PatchEntry, PatchReport, PatchSpec,
    RestoreReport,
};

use crate::audio::publish_cache;
use crate::error::{CmdError, CmdResult};

fn how_name(h: How) -> &'static str {
    match h {
        How::Rewrap => "rewrap",
        How::Copy => "copy",
        How::Cut => "cut",
        How::Decode => "decode",
    }
}

fn format_of(s: &str) -> CmdResult<SoundFormat> {
    match s {
        "ssf" => Ok(SoundFormat::Ssf),
        "wav" => Ok(SoundFormat::Wav),
        _ => Err(CmdError::Invalid(format!("no keysound format {s:?}"))),
    }
}

/// A cabinet keysound to look for in the game's folder.
#[derive(Debug, Deserialize)]
pub struct ProbeSound {
    pub src: PathBuf,
    pub start_frame: u64,
    pub end_frame: Option<u64>,
    /// Files already there that may hold it (`kick.ssf`, `kick~2.ssf`...).
    pub candidates: Vec<PathBuf>,
}

#[derive(Debug, Serialize)]
pub struct ProbeResult {
    /// How it would be made: "rewrap", "cut"...
    pub how: Option<&'static str>,
    /// The candidate that already holds exactly this audio.
    pub equal: Option<usize>,
    /// That file's bytes' FNV-1a (hex): the export relies on it staying so.
    pub fnv: Option<String>,
    /// Why the source cannot be read (the editor lists it as missing).
    pub error: Option<String>,
}

pub fn probe(sounds: Vec<ProbeSound>) -> Vec<ProbeResult> {
    let cache = publish_cache();
    sounds
        .into_iter()
        .map(|s| {
            let job = SoundJob {
                src: s.src,
                start_frame: s.start_frame,
                end_frame: s.end_frame,
                format: SoundFormat::Ssf,
            };
            let h = match how(&job) {
                Ok(h) => h,
                Err(e) => {
                    return ProbeResult {
                        how: None,
                        equal: None,
                        fnv: None,
                        error: Some(e.to_string()),
                    }
                }
            };
            let mut out =
                ProbeResult { how: Some(how_name(h)), equal: None, fnv: None, error: None };
            if s.candidates.is_empty() {
                return out;
            }
            let bytes = match export_sound(&cache, &job) {
                Ok((b, _)) => b,
                Err(e) => {
                    out.error = Some(e.to_string());
                    return out;
                }
            };
            for (i, c) in s.candidates.iter().enumerate() {
                let Ok(there) = std::fs::read(c) else { continue };
                if ssf::same_audio(&bytes, &there) {
                    out.equal = Some(i);
                    out.fnv = Some(fnv_hex(fnv1a64(&there)));
                    break;
                }
            }
            out
        })
        .collect()
}

#[derive(Debug, Deserialize)]
pub struct ExportFileDto {
    pub path: String,
    pub bytes: Vec<u8>,
    /// "any", "absent", or the FNV-1a (hex) of the bytes there now.
    pub expect: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExportCopyDto {
    pub from: PathBuf,
    pub path: String,
    pub expect: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExportSoundDto {
    pub src: PathBuf,
    pub start_frame: u64,
    pub end_frame: Option<u64>,
    pub path: String,
    /// "ssf" or "wav".
    pub format: String,
    pub expect: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KeepDto {
    pub path: String,
    pub fnv: String,
}

/// An export as the editor sends it: files it made, files to copy, keysounds
/// to make here, and files it relies on being there as they are.
#[derive(Debug, Deserialize)]
pub struct ExportJobDto {
    pub stamp: Option<String>,
    pub label: Option<String>,
    pub files: Vec<ExportFileDto>,
    #[serde(default)]
    pub copies: Vec<ExportCopyDto>,
    #[serde(default)]
    pub sounds: Vec<ExportSoundDto>,
    #[serde(default)]
    pub keep: Vec<KeepDto>,
}

fn expect_of(e: Option<&str>) -> CmdResult<Expect> {
    match e {
        None | Some("any") => Ok(Expect::Any),
        Some("absent") => Ok(Expect::Absent),
        Some(h) => u64::from_str_radix(h, 16)
            .map(Expect::Fnv)
            .map_err(|_| CmdError::Invalid(format!("no such expectation {h:?}"))),
    }
}

/// Files the export relies on without writing, with their bytes' hash.
type Keep = Vec<(String, u64)>;

/// Every file of the job, keysounds made (the slow part: `progress` counts them).
fn entries(
    job: ExportJobDto,
    progress: &mut dyn FnMut(usize, usize),
) -> CmdResult<(Vec<PatchEntry>, Keep)> {
    let mut out = Vec::new();
    for f in job.files {
        out.push(PatchEntry {
            rel: f.path,
            content: Content::Bytes(f.bytes),
            expect: expect_of(f.expect.as_deref())?,
        });
    }
    for c in job.copies {
        out.push(PatchEntry {
            rel: c.path,
            content: Content::Copy(c.from),
            expect: expect_of(c.expect.as_deref())?,
        });
    }
    let cache = publish_cache();
    let total = job.sounds.len();
    for (i, s) in job.sounds.into_iter().enumerate() {
        let sound = SoundJob {
            src: s.src,
            start_frame: s.start_frame,
            end_frame: s.end_frame,
            format: format_of(&s.format)?,
        };
        let (bytes, _) = export_sound(&cache, &sound)?;
        out.push(PatchEntry {
            rel: s.path,
            content: Content::Bytes(bytes),
            expect: expect_of(s.expect.as_deref())?,
        });
        progress(i + 1, total);
    }
    let keep = job
        .keep
        .into_iter()
        .map(|k| {
            u64::from_str_radix(&k.fnv, 16)
                .map(|h| (k.path, h))
                .map_err(|_| CmdError::Invalid(format!("no such hash {:?}", k.fnv)))
        })
        .collect::<CmdResult<Vec<_>>>()?;
    Ok((out, keep))
}

/// Progress over both phases: keysounds made, then files staged and moved.
fn phased(send: impl Fn(usize, usize), sounds: usize, files: usize) -> impl FnMut(usize, usize) {
    let total = sounds + files * 2;
    move |done, _| send(done.min(total), total)
}

pub fn to_game(
    root: PathBuf,
    job: ExportJobDto,
    send: impl Fn(usize, usize) + Clone,
) -> CmdResult<PatchReport> {
    let stamp =
        job.stamp.clone().ok_or_else(|| CmdError::Invalid("an export needs a stamp".into()))?;
    let label = job.label.clone().unwrap_or_default();
    let sounds = job.sounds.len();
    let files = job.files.len() + job.copies.len() + sounds;
    let mut p1 = phased(send.clone(), sounds, files);
    let (entries, keep) = entries(job, &mut p1)?;
    let mut p2 = phased(send, sounds, files);
    let spec = PatchSpec { stamp, label, entries, keep };
    Ok(gamepatch::apply(&root, &spec, &mut |d, t| p2(sounds + d, t))?)
}

#[derive(Debug, Serialize)]
pub struct FolderReport {
    pub dir: PathBuf,
    pub files: usize,
}

pub fn to_folder(
    dest: PathBuf,
    job: ExportJobDto,
    send: impl Fn(usize, usize) + Clone,
) -> CmdResult<FolderReport> {
    let sounds = job.sounds.len();
    let files = job.files.len() + job.copies.len() + sounds;
    let mut p1 = phased(send.clone(), sounds, files);
    let (entries, _) = entries(job, &mut p1)?;
    let tree: Vec<(String, Content)> = entries.into_iter().map(|e| (e.rel, e.content)).collect();
    let n = tree.len();
    let mut p2 = phased(send, sounds, files);
    let dir = gamepatch::write_tree(&dest, &tree, &mut |d, _| p2(sounds + d * 2, 0))?;
    Ok(FolderReport { dir, files: n })
}

pub fn backups(root: PathBuf) -> CmdResult<Vec<BackupInfo>> {
    Ok(gamepatch::backups(&root)?)
}

pub fn restore(root: PathBuf, stamp: String, force: bool) -> CmdResult<RestoreReport> {
    Ok(gamepatch::restore(&root, &stamp, force)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("ez2bms-host-export {name} {}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_job_deserializes_as_the_editor_sends_it() {
        let job: ExportJobDto = serde_json::from_str(
            r#"{"stamp":"s","label":"l","files":[{"path":"sound/a/a.ez","bytes":[1,2],"expect":"absent"}],
                "sounds":[{"src":"/p/k.wav","start_frame":0,"end_frame":null,"path":"sound/a/k.ssf","format":"ssf","expect":"absent"}],
                "keep":[{"path":"sound/a/x.ssf","fnv":"cbf29ce484222325"}]}"#,
        )
        .unwrap();
        assert_eq!(job.files[0].bytes, vec![1, 2]);
        assert_eq!(job.sounds[0].end_frame, None);
        assert_eq!(expect_of(Some("cbf29ce484222325")).unwrap(), Expect::Fnv(0xcbf29ce484222325));
        assert!(expect_of(Some("nope")).is_err());
    }

    #[test]
    fn writes_a_game_folder_end_to_end() {
        let d = scratch("e2e");
        let root = d.join("game");
        std::fs::create_dir_all(root.join("sound/Alpha")).unwrap();
        std::fs::write(root.join("sound/Alpha/Kick.ssf"), b"old").unwrap();
        // A game keysound brought in as a WAV, and a stem to slice.
        let pcm: Vec<i16> = (0..2000).map(|i| (i * 13 % 3000) as i16).collect();
        let game_ssf = ssf::encode_pcm16(1, 22050, &pcm);
        std::fs::write(d.join("g.ssf"), &game_ssf).unwrap();
        let wav =
            ez2bms_audio::import::converted(&d.join("g.ssf"), ez2bms_audio::import::Convert::Pcm)
                .unwrap();
        std::fs::write(d.join("snare.wav"), &wav).unwrap();
        std::fs::write(d.join("stem.wav"), ez2bms_audio::wav::encode_pcm16(2, 44100, &pcm))
            .unwrap();
        // The probe sees the game's own file holds the same audio.
        std::fs::write(root.join("sound/Alpha/snare.ssf"), &game_ssf).unwrap();
        let p = probe(vec![ProbeSound {
            src: d.join("snare.wav"),
            start_frame: 0,
            end_frame: None,
            candidates: vec![root.join("sound/Alpha/snare.ssf")],
        }]);
        assert_eq!(p[0].how, Some("rewrap"));
        assert_eq!(p[0].equal, Some(0));
        assert_eq!(p[0].fnv.as_deref(), Some(fnv_hex(fnv1a64(&game_ssf)).as_str()));
        let missing = probe(vec![ProbeSound {
            src: d.join("gone.wav"),
            start_frame: 0,
            end_frame: None,
            candidates: vec![],
        }]);
        assert!(missing[0].error.is_some());

        let job = ExportJobDto {
            stamp: Some("t1".into()),
            label: Some("alpha".into()),
            files: vec![ExportFileDto {
                path: "sound/alpha/streetmix1p-alpha.ez".into(),
                bytes: b"chart".to_vec(),
                expect: Some("absent".into()),
            }],
            copies: vec![],
            sounds: vec![ExportSoundDto {
                src: d.join("stem.wav"),
                start_frame: 100,
                end_frame: Some(300),
                path: "sound/alpha/stem_2_7.ssf".into(),
                format: "ssf".into(),
                expect: Some("absent".into()),
            }],
            keep: vec![KeepDto {
                path: "sound/alpha/snare.ssf".into(),
                fnv: fnv_hex(fnv1a64(&game_ssf)),
            }],
        };
        let seen = std::sync::Mutex::new(vec![]);
        let r = to_game(root.clone(), job, |a, b| seen.lock().unwrap().push((a, b))).unwrap();
        assert_eq!(r.created, vec!["sound/Alpha/streetmix1p-alpha.ez", "sound/Alpha/stem_2_7.ssf"]);
        let cut = std::fs::read(root.join("sound/Alpha/stem_2_7.ssf")).unwrap();
        assert_eq!(ssf::parse(&cut).unwrap().0.frames(), 200);
        assert_eq!(seen.lock().unwrap().last(), Some(&(5, 5)));
        assert_eq!(backups(root.clone()).unwrap().len(), 1);
        restore(root.clone(), "t1".into(), false).unwrap();
        assert!(!root.join("sound/Alpha/stem_2_7.ssf").exists());
    }
}
