//! Where a stem's hits are, and its tempo: suggestions for slicing it.
//!
//! Onsets come from spectral flux, the standard detector for percussive and
//! pitched material alike: short-time spectra (Hann window of ~46 ms, hop of
//! an eighth of it), log-compressed, and per frame the summed rise of every
//! bin over the previous frame's local maximum (SuperFlux's vibrato filter,
//! Böck & Widmer 2013). Peaks standing above the flux's moving median are
//! onsets; each is then placed on the waveform itself, at the first sample
//! where the attack rises clear of what came before - a slice cut there
//! starts on the hit rather than a few milliseconds into it.
//!
//! The tempo is the beat period whose comb of multiples best matches the
//! flux's autocorrelation (tempi near EZ2's usual 150 BPM preferred when a
//! half or double tempo explains the audio as well), then fitted by least
//! squares to the onsets on its beats for a precise period and phase.
//!
//! Everything is deterministic: the same sample gives the same analysis,
//! which the disk cache keeps beside the decoded audio. Nothing here is
//! applied to a chart - the editor shows these as suggestions.

use realfft::RealFftPlanner;

use crate::sample::Sample;

/// Bump when the analysis changes, so cached analyses are recomputed.
pub const ANALYSIS_VERSION: u32 = 1;

/// Onsets this strong or more are suggested by default (the editor's
/// sensitivity starts here). Strength is 0..1, relative to the file's
/// strongest attacks.
pub const DEFAULT_MIN_STRENGTH: f32 = 0.1;
/// Weaker onsets are not kept at all.
const FLOOR: f32 = 0.02;
/// Two onsets closer than this are one hit (the stronger is kept).
const MIN_GAP: f64 = 0.030;
/// Log compression of spectral magnitudes (a full-scale sine is 1).
const LAMBDA: f64 = 100.0;
/// The moving median the flux must rise above, each side, seconds.
const MEDIAN_SPAN: f64 = 0.1;
/// The least rise that counts as a full-strength attack (see `analyse`).
const MIN_SCALE: f64 = 0.5;

pub const MIN_BPM: f64 = 60.0;
pub const MAX_BPM: f64 = 240.0;
/// Tempo prior: a log-Gaussian around this many BPM, one octave wide. It
/// only decides between tempi the audio supports equally (half and double).
const PRIOR_BPM: f64 = 150.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Onset {
    /// Seconds from the start of the file.
    pub sec: f64,
    /// 0..1.
    pub strength: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tempo {
    pub bpm: f64,
    /// The first beat, seconds from the start of the file (0 <= it < a beat).
    pub first_beat: f64,
    /// 0..1: how many beats have an onset, and how many onsets are on beats.
    pub confidence: f32,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Analysis {
    /// In time order, at least `MIN_GAP` apart.
    pub onsets: Vec<Onset>,
    /// Best first; empty for a file too short or too sparse to have one.
    pub tempo: Vec<Tempo>,
}

/// The flux and what it was computed with.
struct Flux {
    /// Per frame; frame t is centred on sample `t * hop`.
    flux: Vec<f64>,
    hop: usize,
    n: usize,
}

fn mono(s: &Sample) -> Vec<f32> {
    if s.channels == 1 {
        return s.data.clone();
    }
    s.data.chunks_exact(2).map(|f| 0.5 * (f[0] + f[1])).collect()
}

fn spectral_flux(x: &[f32], rate: u32) -> Flux {
    // ~46 ms (2048 at 44.1/48 kHz): long enough to resolve bass, short
    // enough to separate sixteenths at 200 BPM with the hop an eighth of it.
    let n = (0.046 * rate as f64).log2().round().exp2().clamp(256.0, 8192.0) as usize;
    let hop = n / 8;
    let frames = x.len() / hop + 1;
    let window: Vec<f64> = (0..n)
        .map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / n as f64).cos())
        .collect();
    let norm = 2.0 / window.iter().sum::<f64>();
    let fft = RealFftPlanner::<f64>::new().plan_fft_forward(n);
    let mut buf = fft.make_input_vec();
    let mut spec = fft.make_output_vec();
    let mut scratch = fft.make_scratch_vec();
    let bins = n / 2 + 1;
    let mut prev = vec![0.0f64; bins];
    let mut cur = vec![0.0f64; bins];
    // Only whole windows: a window hanging off either end of the file sees
    // the audio start or stop, and the cut's broadband click reads as an
    // attack. So the first and last half window (23 ms) have no onsets -
    // at the start there is nothing to cut anyway, the slice begins there.
    let first = (n / 2).div_ceil(hop);
    let mut flux = vec![0.0; frames];
    #[allow(clippy::needless_range_loop)] // t is the frame's time as well as its index
    for t in first..frames {
        let Some(start) = (t * hop).checked_sub(n / 2) else { continue };
        if start + n > x.len() {
            break;
        }
        for (i, b) in buf.iter_mut().enumerate() {
            *b = x[start + i] as f64 * window[i];
        }
        fft.process_with_scratch(&mut buf, &mut spec, &mut scratch).expect("sizes match the plan");
        for (c, z) in cur.iter_mut().zip(&spec) {
            *c = (1.0 + LAMBDA * z.norm() * norm).ln();
        }
        if t > first {
            let mut sum = 0.0;
            for k in 0..bins {
                let lo = prev[k.saturating_sub(1)];
                let hi = prev[(k + 1).min(bins - 1)];
                sum += (cur[k] - prev[k].max(lo).max(hi)).max(0.0);
            }
            flux[t] = sum;
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    Flux { flux, hop, n }
}

/// Moving median over `±half` frames.
fn moving_median(v: &[f64], half: usize) -> Vec<f64> {
    let mut win = Vec::with_capacity(2 * half + 1);
    (0..v.len())
        .map(|t| {
            win.clear();
            win.extend_from_slice(&v[t.saturating_sub(half)..(t + half + 1).min(v.len())]);
            let mid = win.len() / 2;
            *win.select_nth_unstable_by(mid, |a, b| a.total_cmp(b)).1
        })
        .collect()
}

fn percentile(v: &[f64], p: f64) -> f64 {
    let mut s: Vec<f64> = v.iter().copied().filter(|&x| x > 0.0).collect();
    if s.is_empty() {
        return 0.0;
    }
    let i = ((s.len() - 1) as f64 * p).round() as usize;
    *s.select_nth_unstable_by(i, |a, b| a.total_cmp(b)).1
}

pub fn analyse(s: &Sample) -> Analysis {
    let x = mono(s);
    let rate = s.rate;
    if x.len() < rate as usize / 20 {
        return Analysis::default();
    }
    let f = spectral_flux(&x, rate);
    let fps = rate as f64 / f.hop as f64;
    let med = moving_median(&f.flux, (MEDIAN_SPAN * fps).round() as usize);
    let rise: Vec<f64> = f.flux.iter().zip(&med).map(|(a, m)| (a - m).max(0.0)).collect();
    // Strengths are relative to the file's strongest attacks, but never to
    // less than a plain attack's worth: a held tone's tiny ripples are not
    // scaled up into onsets. (Drum hits make a rise of ~200 here, plucked
    // notes ~15, a tone held still under 0.02.)
    let scale = percentile(&rise, 0.99).max(MIN_SCALE);

    // Peaks of the rise: local maxima within half the minimum gap, strong
    // enough, then the minimum gap enforced strongest first.
    let w = ((MIN_GAP / 2.0) * fps).round().max(1.0) as usize;
    let mut peaks: Vec<(usize, f32)> = Vec::new();
    for t in 0..rise.len() {
        let r = rise[t];
        let strength = (r / scale).min(1.0) as f32;
        if strength < FLOOR {
            continue;
        }
        let lo = t.saturating_sub(w);
        let hi = (t + w + 1).min(rise.len());
        // The first of equal neighbours wins, so a flat top is one peak.
        if rise[lo..t].iter().all(|&q| q < r) && rise[t + 1..hi].iter().all(|&q| q <= r) {
            peaks.push((t, strength));
        }
    }
    let gap = (MIN_GAP * fps).round() as usize;
    let mut by_strength = peaks.clone();
    by_strength.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    let mut kept: Vec<(usize, f32)> = Vec::new();
    for p in by_strength {
        if kept.iter().all(|k| k.0.abs_diff(p.0) >= gap) {
            kept.push(p);
        }
    }
    kept.sort_by_key(|k| k.0);

    let env = Envelope::new(&x, rate);
    let centres: Vec<f64> = kept.iter().map(|k| (k.0 * f.hop) as f64 / rate as f64).collect();
    let reach = f.n as f64 / 2.0 / rate as f64;
    let mut onsets: Vec<Onset> = Vec::with_capacity(kept.len());
    for (i, (&c, k)) in centres.iter().zip(&kept).enumerate() {
        // The flux peaks up to a quarter window before the attack (the
        // window's rising slope meets it first) and at most half a window
        // after: search there, but never past the midpoint to a neighbour.
        let mut lo = c - 0.015;
        let mut hi = c + reach + 0.005;
        if i > 0 {
            lo = lo.max(0.5 * (centres[i - 1] + c));
        }
        if let Some(&next) = centres.get(i + 1) {
            hi = hi.min(0.5 * (c + next));
        }
        let sec = env.attack(&x, lo.max(0.0), hi).unwrap_or(c.max(0.0));
        let sec = sec.min(x.len() as f64 / rate as f64);
        if onsets.last().is_some_and(|o: &Onset| sec - o.sec < MIN_GAP) {
            // Two flux peaks placed on one attack: keep the stronger.
            let last = onsets.last_mut().unwrap();
            last.strength = last.strength.max(k.1);
            continue;
        }
        onsets.push(Onset { sec, strength: k.1 });
    }

    let tempo = tempo(&rise, fps, &onsets);
    Analysis { onsets, tempo }
}

/// The waveform's peak level per half millisecond, to place attacks.
struct Envelope {
    block: usize,
    rate: f64,
    peak: Vec<f32>,
}

impl Envelope {
    fn new(x: &[f32], rate: u32) -> Envelope {
        let block = (rate as usize / 2000).max(1);
        let peak = x.chunks(block).map(|c| c.iter().fold(0.0f32, |m, v| m.max(v.abs()))).collect();
        Envelope { block, rate: rate as f64, peak }
    }

    /// The attack in `[lo, hi)` seconds, up to the loudest block there: the
    /// block where the level of the next 5 ms stands highest over the level
    /// of the 10 ms before it, and from there the first sample a fifth of the
    /// way up. Measured against what came just before, a new note over older
    /// ones still ringing (whose sum swells and fades as they beat) is placed
    /// where it starts; if anything, a little early - a slice then starts on
    /// a sliver of the tail before rather than cutting into the attack. None
    /// when nothing rises.
    fn attack(&self, x: &[f32], lo: f64, hi: f64) -> Option<f64> {
        const AHEAD: usize = 10;
        const BEHIND: usize = 20;
        let n = self.peak.len();
        let b0 = ((lo * self.rate) as usize / self.block).min(n);
        let b1 = ((hi * self.rate).ceil() as usize).div_ceil(self.block).min(n);
        if b1 <= b0 + 1 {
            return None;
        }
        let max = |a: usize, b: usize| {
            self.peak[a.min(n)..b.min(n)].iter().fold(0.0f32, |m, &v| m.max(v))
        };
        let (jp, top) =
            (b0..b1)
                .fold((b0, 0.0f32), |m, j| if self.peak[j] > m.1 { (j, self.peak[j]) } else { m });
        let floor = self.peak[b0..=jp].iter().fold(f32::INFINITY, |m, &v| m.min(v));
        if top <= floor * 1.5 + 1e-6 {
            return None;
        }
        let (mut best, mut rise, mut at) = (b0, f32::NEG_INFINITY, (0.0, 0.0));
        for j in b0..=jp {
            let ahead = max(j, j + AHEAD);
            let behind = max(j.saturating_sub(BEHIND), j);
            if ahead - behind > rise {
                (best, rise, at) = (j, ahead - behind, (behind, ahead));
            }
        }
        let level = at.0 + 0.2 * (at.1 - at.0);
        let from = best * self.block;
        let to = ((best + AHEAD) * self.block).min(x.len());
        let i = (from..to).find(|&i| x[i].abs() >= level).unwrap_or(from);
        Some(i as f64 / self.rate)
    }
}

fn prior(bpm: f64) -> f64 {
    let o = (bpm / PRIOR_BPM).log2();
    (-0.5 * o * o).exp()
}

fn tempo(rise: &[f64], fps: f64, onsets: &[Onset]) -> Vec<Tempo> {
    let strong: Vec<Onset> =
        onsets.iter().filter(|o| o.strength >= DEFAULT_MIN_STRENGTH).copied().collect();
    let seconds = rise.len() as f64 / fps;
    if strong.len() < 4 || seconds < 4.0 * 60.0 / MIN_BPM {
        return Vec::new();
    }
    // Autocorrelation of the rise out to four slowest beats (the comb's reach).
    let max_lag = ((4.0 * 60.0 / MIN_BPM * fps).ceil() as usize + 2).min(rise.len() - 1);
    let mean = rise.iter().sum::<f64>() / rise.len() as f64;
    let e: Vec<f64> = rise.iter().map(|v| v - mean).collect();
    let r: Vec<f64> = (0..=max_lag)
        .map(|l| {
            e[..e.len() - l].iter().zip(&e[l..]).map(|(a, b)| a * b).sum::<f64>()
                / (e.len() - l) as f64
        })
        .collect();
    let r_at = |lag: f64| -> f64 {
        let i = lag.floor() as usize;
        if i + 1 >= r.len() {
            return 0.0;
        }
        let t = lag - i as f64;
        r[i] * (1.0 - t) + r[i + 1] * t
    };
    // The comb score on a fine BPM grid.
    let step = 0.05;
    let grid: Vec<(f64, f64)> = (0..=((MAX_BPM - MIN_BPM) / step).round() as usize)
        .map(|i| {
            let bpm = MIN_BPM + i as f64 * step;
            let lag = 60.0 / bpm * fps;
            let s: f64 = (1..=4).map(|k| r_at(k as f64 * lag) / k as f64).sum();
            (bpm, s.max(0.0) * prior(bpm))
        })
        .collect();
    let best = grid.iter().map(|g| g.1).fold(0.0, f64::max);
    if best <= 0.0 {
        return Vec::new();
    }
    let mut cands: Vec<(f64, f64)> = (1..grid.len() - 1)
        .filter(|&i| {
            grid[i].1 >= grid[i - 1].1 && grid[i].1 > grid[i + 1].1 && grid[i].1 >= 0.3 * best
        })
        .map(|i| grid[i])
        .collect();
    cands.sort_by(|a, b| b.1.total_cmp(&a.1));

    let mut out: Vec<Tempo> = Vec::new();
    let add = |out: &mut Vec<Tempo>, t: Tempo, front: bool| {
        if out.iter().all(|o| (o.bpm / t.bpm - 1.0).abs() > 0.03) {
            if front {
                out.insert(0, t);
            } else {
                out.push(t);
            }
        }
    };
    for (bpm, _) in cands {
        if let Some(t) = fit(bpm, &strong, seconds) {
            add(&mut out, t, false);
        }
    }
    // Half and double tempo explain a beat equally; the prior picks the one
    // nearer 150. When the pick's off-beats hit as hard as its beats (a fast
    // song read at half speed), the double is the pulse; when every other
    // beat is much weaker (a slow song with eighth-note hats), the half is.
    if let Some(&top) = out.first() {
        let double = top.bpm * 2.0;
        if double <= MAX_BPM * 1.03 && offbeat(&top, &strong) >= 0.67 {
            if let Some(t) = fit(double, &strong, seconds) {
                out.retain(|o| (o.bpm / t.bpm - 1.0).abs() > 0.03);
                add(&mut out, t, true);
            }
        }
    }
    if let Some(&top) = out.first() {
        let half = top.bpm / 2.0;
        if half >= MIN_BPM * 0.97 && accent(&top, &strong) >= 2.0 {
            if let Some(t) = fit(half, &strong, seconds) {
                out.retain(|o| (o.bpm / t.bpm - 1.0).abs() > 0.03);
                add(&mut out, t, true);
            }
        }
    }
    out.truncate(3);
    out
}

/// The onset strength halfway between a tempo's beats, as a fraction of the
/// strength on them (0 when nothing falls between).
fn offbeat(t: &Tempo, onsets: &[Onset]) -> f64 {
    let period = 60.0 / t.bpm;
    let (mut on, mut off) = (0.0f64, 0.0f64);
    for o in onsets {
        let x = ((o.sec - t.first_beat) / period).rem_euclid(1.0);
        if !(0.05..=0.95).contains(&x) {
            on += o.strength as f64;
        } else if (x - 0.5).abs() < 0.05 {
            off += o.strength as f64;
        }
    }
    if on <= 0.0 {
        return 0.0;
    }
    off / on
}

/// How much stronger the onsets on one half of a tempo's beats are than on
/// the other half (even against odd beats, either way round).
fn accent(t: &Tempo, onsets: &[Onset]) -> f64 {
    let period = 60.0 / t.bpm;
    let (mut sum, mut n) = ([0.0f64; 2], [0usize; 2]);
    for o in onsets {
        let k = ((o.sec - t.first_beat) / period).round();
        if (o.sec - (t.first_beat + k * period)).abs() < 0.05 * period {
            let parity = (k as i64).rem_euclid(2) as usize;
            sum[parity] += o.strength as f64;
            n[parity] += 1;
        }
    }
    if n[0] == 0 || n[1] == 0 {
        return 1.0;
    }
    let (a, b) = (sum[0] / n[0] as f64, sum[1] / n[1] as f64);
    a.max(b) / a.min(b).max(1e-9)
}

/// A tempo near `bpm` fitted to the onsets: the phase that puts the most
/// onset strength on beats, then period and phase by least squares over the
/// onsets within a tenth of a beat of one.
fn fit(bpm: f64, onsets: &[Onset], seconds: f64) -> Option<Tempo> {
    let mut period = 60.0 / bpm;
    let near = |t0: f64, p: f64, o: f64| {
        let k = ((o - t0) / p).round();
        (o - (t0 + k * p)).abs()
    };
    // Phase: try each onset as a beat; keep the one that puts the most
    // strength on beats (so the downbeats win over the hats between them).
    let score = |t: f64| -> f64 {
        onsets
            .iter()
            .filter(|o| near(t, period, o.sec) < 0.05 * period)
            .map(|o| o.strength as f64)
            .sum()
    };
    let mut t0 = onsets
        .iter()
        .map(|o| (o.sec, score(o.sec)))
        .fold((0.0, f64::NEG_INFINITY), |m, (t, s)| if s > m.1 { (t, s) } else { m })
        .0;
    for _ in 0..4 {
        let on: Vec<(f64, f64)> = onsets
            .iter()
            .filter(|o| near(t0, period, o.sec) < 0.1 * period)
            .map(|o| (((o.sec - t0) / period).round(), o.sec))
            .collect();
        if on.len() < 4 {
            return None;
        }
        let n = on.len() as f64;
        let (sk, so) = on.iter().fold((0.0, 0.0), |a, (k, o)| (a.0 + k, a.1 + o));
        let (mk, mo) = (sk / n, so / n);
        let (cov, var) = on
            .iter()
            .fold((0.0, 0.0), |a, (k, o)| (a.0 + (k - mk) * (o - mo), a.1 + (k - mk) * (k - mk)));
        if var <= 0.0 {
            return None;
        }
        period = cov / var;
        t0 = mo - period * mk;
    }
    let bpm = 60.0 / period;
    if !(MIN_BPM * 0.97..=MAX_BPM * 1.03).contains(&bpm) {
        return None;
    }
    let first_beat = t0.rem_euclid(period);
    // How well it holds: beats between the first and last onset that have
    // one, times onsets that fall on a beat.
    let (a, b) = (onsets[0].sec, onsets[onsets.len() - 1].sec);
    let beats = ((b - a) / period).round() as usize + 1;
    let on = onsets.iter().filter(|o| near(t0, period, o.sec) < 0.05 * period).count();
    let mut hit = 0usize;
    let k0 = ((a - t0) / period).round() as i64;
    for k in k0..k0 + beats as i64 {
        let t = t0 + k as f64 * period;
        if t > seconds {
            break;
        }
        if onsets.iter().any(|o| (o.sec - t).abs() < 0.05 * period) {
            hit += 1;
        }
    }
    let confidence = (hit as f64 / beats as f64) * (on as f64 / onsets.len() as f64);
    Some(Tempo { bpm, first_beat, confidence: confidence.clamp(0.0, 1.0) as f32 })
}

impl Analysis {
    /// For the disk cache: version, onsets, tempi, little-endian.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut v = Vec::with_capacity(12 + self.onsets.len() * 12 + self.tempo.len() * 20);
        v.extend_from_slice(&ANALYSIS_VERSION.to_le_bytes());
        v.extend_from_slice(&(self.onsets.len() as u32).to_le_bytes());
        for o in &self.onsets {
            v.extend_from_slice(&o.sec.to_le_bytes());
            v.extend_from_slice(&o.strength.to_le_bytes());
        }
        v.extend_from_slice(&(self.tempo.len() as u32).to_le_bytes());
        for t in &self.tempo {
            v.extend_from_slice(&t.bpm.to_le_bytes());
            v.extend_from_slice(&t.first_beat.to_le_bytes());
            v.extend_from_slice(&t.confidence.to_le_bytes());
        }
        v
    }

    /// `to_bytes` read back; None for another version or damaged bytes.
    pub fn from_bytes(b: &[u8]) -> Option<Analysis> {
        let mut at = 0usize;
        let mut take = |n: usize| -> Option<&[u8]> {
            let s = b.get(at..at + n)?;
            at += n;
            Some(s)
        };
        let u32_ = |s: &[u8]| u32::from_le_bytes(s.try_into().unwrap());
        let f64_ = |s: &[u8]| f64::from_le_bytes(s.try_into().unwrap());
        let f32_ = |s: &[u8]| f32::from_le_bytes(s.try_into().unwrap());
        if u32_(take(4)?) != ANALYSIS_VERSION {
            return None;
        }
        let n = u32_(take(4)?) as usize;
        let mut onsets = Vec::with_capacity(n.min(1 << 20));
        for _ in 0..n {
            onsets.push(Onset { sec: f64_(take(8)?), strength: f32_(take(4)?) });
        }
        let n = u32_(take(4)?) as usize;
        let mut tempo = Vec::with_capacity(n.min(16));
        for _ in 0..n {
            tempo.push(Tempo {
                bpm: f64_(take(8)?),
                first_beat: f64_(take(8)?),
                confidence: f32_(take(4)?),
            });
        }
        (at == b.len()).then_some(Analysis { onsets, tempo })
    }
}
