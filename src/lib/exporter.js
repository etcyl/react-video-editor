// Export the timeline to a real video file using ffmpeg.wasm.
//
// Strategy: each track's clips are ordered by timeline position, trimmed from
// their source, then either concatenated (back to back) or chained with xfade /
// acrossfade when the crossfade transition is enabled. Intro / outro fades are
// applied to the final stream. Resolution is never scaled, so 2K in => 2K out.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { clipDuration, clipEnd, tracksOf } from './model.js'
import { renderTitlePng } from './titleRender.js'

const CORE_VER = '0.12.6'
const MT_BASE = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VER}/dist/esm`
const ST_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VER}/dist/esm`

// '-preset veryfast' is far quicker than 'medium' and at CRF 18 the quality
// difference is negligible. '-threads 0' lets x264 use every CPU core, which
// only actually parallelises when the multi-threaded core is loaded.
const X264_SPEED = ['-preset', 'veryfast', '-threads', '0']

export const FORMATS = {
  mp4:  { label: 'MP4 (H.264 / AAC)',  ext: 'mp4', v: 'libx264',     a: 'aac',
          va: ['-pix_fmt', 'yuv420p', ...X264_SPEED], vq: ['-crf', '18'], aq: ['-b:a', '320k'] },
  mov:  { label: 'MOV (H.264 / AAC)',  ext: 'mov', v: 'libx264',     a: 'aac',
          va: ['-pix_fmt', 'yuv420p', ...X264_SPEED], vq: ['-crf', '18'], aq: ['-b:a', '320k'] },
  mkv:  { label: 'MKV (H.264 / AAC)',  ext: 'mkv', v: 'libx264',     a: 'aac',
          va: ['-pix_fmt', 'yuv420p', ...X264_SPEED], vq: ['-crf', '18'], aq: ['-b:a', '320k'] },
  webm: { label: 'WebM (VP9 / Opus)',  ext: 'webm', v: 'libvpx-vp9', a: 'libopus',
          va: ['-row-mt', '1', '-threads', '0', '-deadline', 'good', '-cpu-used', '4'],
          vq: ['-crf', '24', '-b:v', '0'], aq: ['-b:a', '256k'] },
}

let ffmpeg = null
let usingMt = false

// The multi-threaded core hangs during exec on some setups. Keep it off by
// default (reliable single-threaded) until proven stable; flip to re-enable.
const PREFER_MT = false

export function isThreaded() { return usingMt }

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
])

async function loadCore(ff, mt, onLog) {
  const base = mt ? MT_BASE : ST_BASE
  const say = (m) => onLog && onLog(m)
  say('Fetching ffmpeg core script...')
  const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript')
  say('Downloading ffmpeg-core.wasm (~32 MB, first run only)...')
  const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
  const cfg = { coreURL, wasmURL }
  if (mt) { say('Fetching worker...'); cfg.workerURL = await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript') }
  say(`Initializing ${mt ? 'multi-threaded' : 'single-threaded'} core...`)
  await withTimeout(ff.load(cfg), 30000, 'Core init')
  say(`Ready (${mt ? 'multi-threaded' : 'single-threaded'}).`)
}

async function getFfmpeg(onLog) {
  if (ffmpeg) return ffmpeg
  const make = () => { const f = new FFmpeg(); if (onLog) f.on('log', ({ message }) => onLog(message)); return f }
  // The multi-threaded core needs SharedArrayBuffer, i.e. a cross-origin isolated page.
  usingMt = PREFER_MT && typeof self !== 'undefined' && self.crossOriginIsolated
  ffmpeg = make()
  try {
    await loadCore(ffmpeg, usingMt, onLog)
  } catch (e) {
    if (!usingMt) { ffmpeg = null; throw e }
    // Multi-threaded core stalled or failed: fall back to the single-threaded one.
    onLog && onLog(`Multi-threaded core failed (${e.message}); falling back to single-threaded.`)
    try { ffmpeg.terminate() } catch {}
    usingMt = false
    ffmpeg = make()
    await loadCore(ffmpeg, false, onLog)
  }
  return ffmpeg
}

// Abort an in-flight export. terminate() kills the worker, so the next export
// reloads the core from cache.
export function cancelExport() {
  if (ffmpeg) {
    try { ffmpeg.terminate() } catch {}
    ffmpeg = null
  }
}

// Build a per-track filtergraph chain. `label` is the input stream type tag (v / a).
// Returns { filters: [...], out: '<final label>', total: seconds }.
function buildTrack(clips, inputIndexOf, kind, opts) {
  const isV = kind === 'video'
  const tag = isV ? 'v' : 'a'
  const trim = isV ? 'trim' : 'atrim'
  const setpts = isV ? 'setpts=PTS-STARTPTS' : 'asetpts=PTS-STARTPTS'
  const filters = []
  const segLabels = []

  clips.forEach((c, i) => {
    const inIdx = inputIndexOf(c.sourceId)
    const lbl = `${tag}${i}`
    // For audio, also resample to a common rate so xfade/concat are happy.
    const extra = isV ? '' : ',aformat=sample_rates=48000:channel_layouts=stereo'
    // Gap before this clip on the timeline (collapsed when crossfading, since
    // crossfade deliberately overlaps neighbours instead of spacing them).
    const prevEnd = i === 0 ? 0 : clipEnd(clips[i - 1])
    const gap = opts.crossfade ? 0 : Math.max(0, c.start - prevEnd)
    const pad = gap > 1e-3
      ? (isV ? `,tpad=start_duration=${gap.toFixed(3)}:color=black`
             : `,adelay=delays=${Math.round(gap * 1000)}:all=1`)
      : ''
    filters.push(
      `[${inIdx}:${tag}]${trim}=start=${c.in.toFixed(3)}:end=${c.out.toFixed(3)},${setpts}${extra}${pad}[${lbl}]`,
    )
    segLabels.push({ lbl, dur: gap + clipDuration(c) })
  })

  const D = opts.fadeDuration
  let outLabel
  let total

  if (segLabels.length === 1) {
    outLabel = segLabels[0].lbl
    total = segLabels[0].dur
  } else if (opts.crossfade) {
    // Chain xfade / acrossfade. Each join overlaps by D and shortens the timeline.
    let prev = segLabels[0].lbl
    let acc = segLabels[0].dur
    for (let i = 1; i < segLabels.length; i++) {
      const cur = segLabels[i]
      const off = Math.max(0, acc - D)
      const out = `x${tag}${i}`
      if (isV) {
        filters.push(`[${prev}][${cur.lbl}]xfade=transition=fade:duration=${D}:offset=${off.toFixed(3)}[${out}]`)
      } else {
        filters.push(`[${prev}][${cur.lbl}]acrossfade=d=${D}[${out}]`)
      }
      acc = acc + cur.dur - D
      prev = out
    }
    outLabel = prev
    total = acc
  } else {
    // Plain concat, back to back.
    const inputs = segLabels.map((s) => `[${s.lbl}]`).join('')
    const out = `c${tag}`
    filters.push(`${inputs}concat=n=${segLabels.length}:v=${isV ? 1 : 0}:a=${isV ? 0 : 1}[${out}]`)
    outLabel = out
    total = segLabels.reduce((s, x) => s + x.dur, 0)
  }

  // Intro / outro fades on the final stream.
  const fades = []
  if (opts.introFade) fades.push(isV ? `fade=t=in:st=0:d=${D}` : `afade=t=in:st=0:d=${D}`)
  if (opts.outroFade) {
    const st = Math.max(0, total - D).toFixed(3)
    fades.push(isV ? `fade=t=out:st=${st}:d=${D}` : `afade=t=out:st=${st}:d=${D}`)
  }
  if (fades.length) {
    const out = `${tag}fin`
    filters.push(`[${outLabel}]${fades.join(',')}[${out}]`)
    outLabel = out
  }

  return { filters, out: outLabel, total }
}

export async function exportTimeline({ clips, sources, transitions, formatKey, onLog, onProgress }) {
  const fmt = FORMATS[formatKey] || FORMATS.mp4
  const vClips = tracksOf(clips, 'video')
  const aClips = tracksOf(clips, 'audio')
  if (vClips.length === 0 && aClips.length === 0) throw new Error('Timeline is empty.')

  const ff = await getFfmpeg(onLog)
  if (onProgress) ff.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress))))

  // Write each unique media source used by any clip; map sourceId -> input index.
  const usedIds = [...new Set(clips.map((c) => c.sourceId).filter(Boolean))]
  const inputArgs = []
  const idToIndex = new Map()
  for (let i = 0; i < usedIds.length; i++) {
    const src = sources.find((s) => s.id === usedIds[i])
    const fname = `in${i}.${src.name.split('.').pop() || 'mp4'}`
    await ff.writeFile(fname, await fetchFile(src.file))
    inputArgs.push('-i', fname)
    idToIndex.set(src.id, i)
  }
  const inputIndexOf = (id) => idToIndex.get(id)

  // Export resolution comes from the first video source (no scaling => 2K in/out).
  const firstVid = vClips.length ? sources.find((s) => s.id === vClips[0].sourceId) : null
  const W = firstVid?.width || 1920
  const H = firstVid?.height || 1080

  const filterParts = []
  const maps = []
  let videoOut = null

  if (vClips.length) {
    const v = buildTrack(vClips, inputIndexOf, 'video', transitions)
    filterParts.push(...v.filters)
    videoOut = v.out
  }
  if (aClips.length) {
    const a = buildTrack(aClips, inputIndexOf, 'audio', transitions)
    filterParts.push(...a.filters)
    maps.push('-map', `[${a.out}]`)
  }

  // Render each title to a full-frame transparent PNG and overlay it onto the
  // assembled video for the clip's time range. WYSIWYG with the preview.
  const titles = tracksOf(clips, 'title')
  if (titles.length && videoOut) {
    let inputIdx = usedIds.length
    let base = videoOut
    for (let k = 0; k < titles.length; k++) {
      const t = titles[k]
      const png = await renderTitlePng(t, W, H)
      const fname = `title${k}.png`
      await ff.writeFile(fname, new Uint8Array(await png.arrayBuffer()))
      inputArgs.push('-loop', '1', '-i', fname)
      const start = t.start.toFixed(3)
      const end = clipEnd(t).toFixed(3)
      const out = `tov${k}`
      filterParts.push(`[${base}][${inputIdx}:v]overlay=0:0:enable='between(t,${start},${end})'[${out}]`)
      base = out
      inputIdx++
    }
    videoOut = base
  }

  if (videoOut) maps.unshift('-map', `[${videoOut}]`)

  const outName = `output.${fmt.ext}`
  const args = [
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    ...maps,
  ]
  if (vClips.length) args.push('-c:v', fmt.v, ...fmt.va, ...fmt.vq)
  if (aClips.length) args.push('-c:a', fmt.a, ...fmt.aq)
  args.push('-movflags', '+faststart', outName)

  onLog && onLog(`ffmpeg ${args.join(' ')}`)
  await ff.exec(args)

  const data = await ff.readFile(outName)
  const mime = fmt.ext === 'webm' ? 'video/webm' : fmt.ext === 'mov' ? 'video/quicktime' : 'video/mp4'
  return { blob: new Blob([data.buffer], { type: mime }), ext: fmt.ext }
}
