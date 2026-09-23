//! The desktop host. The editor (apps/editor) does all chart work in
//! TypeScript; these commands are what a browser cannot do: read and write
//! files, play audio with EZ2PORT's rules, cut keysounds, and run EZ2PORT.
//! Every command is mirrored by the web mock in `apps/editor/src/bridge/`.

mod audio;
mod error;
mod files;
mod media;
mod port;

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Manager, State};

use crate::audio::{
    Audio, AudioInfo, Audition, ClockDto, EventDto, Loaded, PreviewJob, TriggerDto,
};
use crate::error::{CmdError, CmdResult};
use crate::files::{Entry, ImportKind, Imported, ProjectScan};
use crate::media::Media;
use crate::port::{
    InspectionDto, Located, PackageDto, ProbeDto, PublishOptions, Published, RunEvent, Runs,
    TestDto,
};
use ez2bms_media::text::PlateSpec;

/// Which clock stream is current; older ones stop (a reloaded page opens a new one).
static CLOCK_STREAM: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
struct AppInfo {
    version: &'static str,
    os: &'static str,
    config_dir: Option<PathBuf>,
    cache_dir: Option<PathBuf>,
}

#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        config_dir: app.path().app_config_dir().ok(),
        cache_dir: app.path().app_cache_dir().ok(),
    }
}

// ---- files

#[tauri::command]
fn fs_read(path: PathBuf) -> CmdResult<Response> {
    Ok(Response::new(files::read(&path)?))
}

#[tauri::command]
fn fs_read_text(path: PathBuf) -> CmdResult<String> {
    String::from_utf8(files::read(&path)?)
        .map_err(|_| CmdError::Invalid(format!("{} is not UTF-8", path.display())))
}

#[tauri::command]
fn fs_write_text(path: PathBuf, text: String, backup: bool) -> CmdResult<()> {
    files::write_atomic(&path, text.as_bytes(), backup)
}

#[tauri::command]
fn fs_write_bytes(path: PathBuf, bytes: Vec<u8>, backup: bool) -> CmdResult<()> {
    files::write_atomic(&path, &bytes, backup)
}

#[tauri::command]
fn fs_list(dir: PathBuf) -> CmdResult<Vec<Entry>> {
    files::list(&dir)
}

#[tauri::command]
fn project_scan(dir: PathBuf) -> CmdResult<ProjectScan> {
    files::scan_project(&dir)
}

/// Copy sound files (and the audio in folders) into the song folder.
#[tauri::command]
async fn fs_copy_into(
    dir: PathBuf,
    paths: Vec<PathBuf>,
    kind: Option<ImportKind>,
) -> CmdResult<Vec<Imported>> {
    let kind = kind.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || files::copy_into(&dir, &paths, kind))
        .await
        .map_err(|e| CmdError::Io(e.to_string()))
}

#[tauri::command]
fn fs_rename(from: PathBuf, to: PathBuf) -> CmdResult<()> {
    files::rename(&from, &to)
}

// ---- song art

/// The title plate (media.rs `Media::plate`).
#[tauri::command]
async fn media_plate(media: State<'_, Arc<Media>>, spec: PlateSpec) -> CmdResult<Response> {
    let media = media.inner().clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || media.plate(&spec))
        .await
        .map_err(|e| CmdError::Io(e.to_string()))??;
    Ok(Response::new(bytes))
}

/// The disc or the eyecatch cut from an image: `[u32 w][u32 h]` + RGB.
#[tauri::command]
async fn media_art(
    media: State<'_, Arc<Media>>,
    path: PathBuf,
    job: ez2bms_media::ArtJob,
) -> CmdResult<Response> {
    let media = media.inner().clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || media.art(&path, job))
        .await
        .map_err(|e| CmdError::Io(e.to_string()))??;
    Ok(Response::new(bytes))
}

// ---- settings (the front end owns the schema)

fn settings_path(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(app.path().app_config_dir().map_err(|e| CmdError::Io(e.to_string()))?.join("settings.json"))
}

#[tauri::command]
fn settings_load(app: AppHandle) -> CmdResult<serde_json::Value> {
    let p = settings_path(&app)?;
    match std::fs::read(&p) {
        Ok(b) => serde_json::from_slice(&b)
            .map_err(|e| CmdError::Invalid(format!("{}: {e}", p.display()))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(serde_json::json!({})),
        Err(e) => Err(CmdError::io(&p, e)),
    }
}

#[tauri::command]
fn settings_save(app: AppHandle, value: serde_json::Value) -> CmdResult<()> {
    let text = serde_json::to_vec_pretty(&value).map_err(|e| CmdError::Invalid(e.to_string()))?;
    files::write_atomic(&settings_path(&app)?, &text, true)
}

// ---- audio

#[tauri::command]
fn audio_info(audio: State<'_, Arc<Audio>>) -> AudioInfo {
    audio.info()
}

#[tauri::command]
async fn audio_load(audio: State<'_, Arc<Audio>>, paths: Vec<PathBuf>) -> CmdResult<Vec<Loaded>> {
    let audio = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || audio.load(&paths))
        .await
        .map_err(|e| CmdError::Io(e.to_string()))
}

#[tauri::command]
fn audio_peaks(audio: State<'_, Arc<Audio>>, id: u32, frames_per_px: f64) -> CmdResult<Response> {
    Ok(Response::new(audio.peaks(id, frames_per_px)?))
}

/// Waveform thumbnails for many samples, off the main thread.
#[tauri::command]
async fn audio_thumbs(
    audio: State<'_, Arc<Audio>>,
    ids: Vec<u32>,
    width: u32,
) -> CmdResult<Response> {
    let audio = audio.inner().clone();
    let bytes =
        tauri::async_runtime::spawn_blocking(move || audio.thumbs(&ids, width.min(4096) as usize))
            .await
            .map_err(|e| CmdError::Io(e.to_string()))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn audio_set_events(audio: State<'_, Arc<Audio>>, events: Vec<EventDto>) -> CmdResult<()> {
    audio.set_events(&events)
}

/// The whole song's loudness for the preview picker (renders it: off the main thread).
#[tauri::command]
async fn audio_preview_overview(
    audio: State<'_, Arc<Audio>>,
    events: Vec<EventDto>,
    end_ms: f64,
    width: u32,
) -> CmdResult<Response> {
    let audio = audio.inner().clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        audio.preview_overview(&events, end_ms, width.clamp(1, 8192) as usize)
    })
    .await
    .map_err(|e| CmdError::Io(e.to_string()))??;
    Ok(Response::new(bytes))
}

/// The preview, rendered for auditioning; trigger it on `voice` of the result.
#[tauri::command]
async fn audio_preview(audio: State<'_, Arc<Audio>>, job: PreviewJob) -> CmdResult<Audition> {
    let audio = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || audio.preview(&job))
        .await
        .map_err(|e| CmdError::Io(e.to_string()))?
}

#[tauri::command]
fn audio_play(audio: State<'_, Arc<Audio>>, from_ms: f64) {
    audio.engine.play_from(audio.frame_at_ms(from_ms));
}

#[tauri::command]
fn audio_seek(audio: State<'_, Arc<Audio>>, ms: f64) {
    audio.engine.seek(audio.frame_at_ms(ms));
}

#[tauri::command]
fn audio_stop(audio: State<'_, Arc<Audio>>) {
    audio.engine.stop();
}

#[tauri::command]
fn audio_trigger(audio: State<'_, Arc<Audio>>, trigger: TriggerDto) -> CmdResult<bool> {
    audio.trigger(&trigger)
}

#[tauri::command]
fn audio_set_master(audio: State<'_, Arc<Audio>>, gain: f32) {
    audio.engine.set_master(gain);
}

#[tauri::command]
fn audio_clock(audio: State<'_, Arc<Audio>>) -> ClockDto {
    audio.clock()
}

/// Host time, for the front end's clock-offset pings.
#[tauri::command]
fn audio_now(audio: State<'_, Arc<Audio>>) -> u64 {
    audio.engine.now_ns()
}

/// The clock every 8 ms until the page opens another stream or goes away.
#[tauri::command]
fn audio_clock_stream(audio: State<'_, Arc<Audio>>, on_clock: Channel<ClockDto>) {
    let audio = audio.inner().clone();
    let me = CLOCK_STREAM.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        while CLOCK_STREAM.load(Ordering::SeqCst) == me {
            if on_clock.send(audio.clock()).is_err() {
                break;
            }
            std::thread::sleep(Duration::from_millis(8));
        }
    });
}

// ---- EZ2PORT

#[tauri::command]
fn port_probe(path: PathBuf) -> CmdResult<ProbeDto> {
    Ok(ProbeDto::from(&ez2bms_launch::probe(&path)?))
}

#[tauri::command]
fn port_locate(start: PathBuf) -> Located {
    port::locate(&start)
}

#[tauri::command]
async fn port_publish(
    songs_root: PathBuf,
    package: PackageDto,
    options: Option<PublishOptions>,
) -> CmdResult<Published> {
    let options = options.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        port::publish_with(&songs_root, &package, &options)
    })
    .await
    .map_err(|e| CmdError::Io(e.to_string()))?
}

#[tauri::command]
fn port_inspect(
    songs_root: PathBuf,
    key: String,
    game_root: Option<PathBuf>,
) -> CmdResult<InspectionDto> {
    port::inspect(&songs_root, &key, game_root.as_deref())
}

#[tauri::command]
fn port_retire(songs_root: PathBuf, key: String, song_ini: String) -> CmdResult<()> {
    Ok(ez2bms_launch::retire_package(&songs_root, &key, song_ini.as_bytes())?)
}

#[tauri::command]
async fn port_test(
    app: AppHandle,
    runs: State<'_, Arc<Runs>>,
    test: TestDto,
    on_event: Channel<RunEvent>,
) -> CmdResult<u32> {
    let cache = app.path().app_cache_dir().map_err(|e| CmdError::Io(e.to_string()))?;
    let runs = runs.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runs.start(&cache, &test, move |ev| on_event.send(ev).is_ok())
    })
    .await
    .map_err(|e| CmdError::Io(e.to_string()))?
}

#[tauri::command]
fn port_stop(runs: State<'_, Arc<Runs>>, id: u32) -> CmdResult<()> {
    runs.stop(id)
}

/// The plate fonts (fonts/README.md): `EZ2BMS_FONTS`, else the bundle's
/// `fonts` resource folder, else - running from the source tree - the
/// repository's `fonts/`.
fn fonts_dir(app: &AppHandle) -> PathBuf {
    if let Some(dir) = std::env::var_os("EZ2BMS_FONTS") {
        return PathBuf::from(dir);
    }
    let bundled = app.path().resource_dir().ok().map(|d| d.join("fonts"));
    match bundled {
        Some(d) if d.join("Roboto-Bold.ttf").is_file() => d,
        _ => PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fonts"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(Arc::new(Audio::open()));
            app.manage(Arc::new(Runs::default()));
            app.manage(Arc::new(Media::new(fonts_dir(app.handle()))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            fs_read,
            fs_read_text,
            fs_write_text,
            fs_write_bytes,
            fs_list,
            project_scan,
            fs_copy_into,
            fs_rename,
            media_art,
            media_plate,
            settings_load,
            settings_save,
            audio_info,
            audio_load,
            audio_peaks,
            audio_thumbs,
            audio_set_events,
            audio_preview_overview,
            audio_preview,
            audio_play,
            audio_seek,
            audio_stop,
            audio_trigger,
            audio_set_master,
            audio_clock,
            audio_now,
            audio_clock_stream,
            port_probe,
            port_locate,
            port_publish,
            port_inspect,
            port_retire,
            port_test,
            port_stop,
        ])
        .run(tauri::generate_context!())
        .expect("EZ2BMS failed to start");
}
