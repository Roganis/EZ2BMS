//! Song art for the song manager and for publishing: an image from the song
//! folder decoded and cut into the disc or the eyecatch (crates/ez2bms-media,
//! which follows EZ2PORT's importer). The pixels go back raw; chart-core
//! encodes the `.abm`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use ez2bms_media::{decode, render, ArtJob, Rgba};

use crate::error::{CmdError, CmdResult};
use crate::files;

/// Which file a decoded image came from, as it was on disk.
type Key = (PathBuf, Option<SystemTime>, u64);

/// The images decoded last: dragging a crop re-cuts the same image many times
/// a second, and a camera JPEG takes longer to decode than to cut. Two, for
/// the disc's image and the eyecatch's.
#[derive(Default)]
pub struct Media {
    recent: Mutex<Vec<(Key, Arc<Rgba>)>>,
}

const KEEP: usize = 2;

impl Media {
    /// `[u32 LE width][u32 LE height]` then the RGB pixels, top-down.
    pub fn art(&self, path: &Path, job: ArtJob) -> CmdResult<Vec<u8>> {
        let img = self.image(path)?;
        let (w, h, rgb) = render(&img, job)?;
        let mut out = Vec::with_capacity(8 + rgb.len());
        out.extend_from_slice(&w.to_le_bytes());
        out.extend_from_slice(&h.to_le_bytes());
        out.extend_from_slice(&rgb);
        Ok(out)
    }

    fn image(&self, path: &Path) -> CmdResult<Arc<Rgba>> {
        let meta = std::fs::metadata(path).map_err(|e| CmdError::io(path, e))?;
        let key = (path.to_path_buf(), meta.modified().ok(), meta.len());
        let lock = || self.recent.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((_, img)) = lock().iter().find(|(k, _)| *k == key) {
            return Ok(img.clone());
        }
        // Decoded outside the lock: another cut need not wait for this one.
        let img = Arc::new(decode(&files::read(path)?).map_err(|e| match e {
            ez2bms_media::MediaError::Decode(m) => {
                CmdError::Invalid(format!("{}: {m}", path.display()))
            }
            e => e.into(),
        })?);
        let mut recent = lock();
        recent.retain(|(k, _)| k.0 != key.0);
        recent.insert(0, (key, img.clone()));
        recent.truncate(KEEP);
        Ok(img)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 2x1 24-bit BMP: red then blue.
    fn bmp() -> Vec<u8> {
        let mut b = vec![0u8; 54];
        b[0..2].copy_from_slice(b"BM");
        b[10] = 54;
        b[14] = 40;
        b[18] = 2;
        b[22] = 1;
        b[26] = 1;
        b[28] = 24;
        b.extend_from_slice(&[0, 0, 255, 255, 0, 0, 0, 0]);
        let n = b.len() as u32;
        b[2..6].copy_from_slice(&n.to_le_bytes());
        b
    }

    #[test]
    fn cuts_an_image_from_disk_and_notices_when_it_changes() {
        let dir = std::env::temp_dir().join(format!("ez2bms-media-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("jacket.bmp");
        std::fs::write(&p, bmp()).unwrap();
        let media = Media::default();
        let job: ArtJob = serde_json_job(r#"{"kind":"eyecatch","mode":"stretch"}"#);
        let out = media.art(&p, job).unwrap();
        assert_eq!(&out[0..8], &[0, 4, 0, 0, 0, 2, 0, 0]);
        assert_eq!(&out[8..11], &[255, 0, 0], "the left half is red");
        // A new file under the same name (another size) is decoded again.
        std::fs::write(&p, [bmp(), vec![0; 2]].concat()).unwrap();
        let again = media.art(&p, job).unwrap();
        assert_eq!(again, out);
        assert_eq!(media.recent.lock().unwrap().len(), 1, "one entry per file");
        std::fs::write(&p, b"not an image").unwrap();
        let err = media.art(&p, job).unwrap_err().to_string();
        assert!(err.contains("jacket.bmp"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn serde_json_job(s: &str) -> ArtJob {
        serde_json::from_str(s).unwrap()
    }
}
