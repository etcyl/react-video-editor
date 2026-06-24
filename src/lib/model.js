// Editor data model + pure helpers.
//
// A "source" is an imported media file. Adding a source to the timeline creates
// a linked pair of clips (one on the video track, one on the audio track) sharing
// a groupId so they can be split independently yet stay aligned by playhead time.

let idCounter = 0
export const uid = (p = 'id') => `${p}_${++idCounter}_${Math.floor(performance.now())}`

export function makeSource({ name, file, url, duration, width, height }) {
  return { id: uid('src'), name, file, url, duration, width: width || 0, height: height || 0 }
}

// Create the V+A clip pair for a source placed at timeline position `start`.
export function clipsFromSource(source, start) {
  const groupId = uid('grp')
  const base = {
    groupId,
    sourceId: source.id,
    in: 0,
    out: source.duration,
    start,
  }
  return [
    { ...base, id: uid('clip'), kind: 'video' },
    { ...base, id: uid('clip'), kind: 'audio' },
  ]
}

// A title clip carries text/style instead of a media source. It still uses
// in/out (= 0..duration) so all the timeline math (split, trim, move) just works.
export function makeTitleClip(start, duration, style) {
  return {
    id: uid('title'), kind: 'title', sourceId: null,
    in: 0, out: duration, start,
    ...style,
  }
}

export const clipDuration = (c) => c.out - c.in
export const clipEnd = (c) => c.start + clipDuration(c)

const MIN_DUR = 0.05

// Trim the left edge to absolute timeline time `tAbs`: moves `start` and the
// source `in` together so the kept frames stay put, clamped so `in >= 0` and a
// minimum clip length remains.
export function trimLeft(clip, tAbs) {
  const earliest = clip.start - clip.in // where in would hit 0
  const latest = clipEnd(clip) - MIN_DUR
  const newStart = Math.min(Math.max(tAbs, earliest), latest)
  const delta = newStart - clip.start
  return { ...clip, start: newStart, in: clip.in + delta }
}

// Trim the right edge to absolute timeline time `tAbs`, clamped to the source's
// available length and a minimum clip duration.
export function trimRight(clip, tAbs, srcDuration) {
  const maxEnd = clip.start + (srcDuration - clip.in)
  const newEnd = Math.min(Math.max(tAbs, clip.start + MIN_DUR), maxEnd)
  return { ...clip, out: clip.in + (newEnd - clip.start) }
}

// Split a single clip at absolute timeline time `t`. Returns [left, right] or
// null if t is not strictly inside the clip.
export function splitClip(clip, t) {
  const localStart = clip.start
  const localEnd = clipEnd(clip)
  if (t <= localStart + 1e-4 || t >= localEnd - 1e-4) return null
  const offset = t - clip.start // seconds into the clip
  const cutSource = clip.in + offset
  const left = { ...clip, id: uid('clip'), out: cutSource }
  const right = { ...clip, id: uid('clip'), in: cutSource, start: t }
  return [left, right]
}

// Clips on one track, sorted, that contain time t.
export function clipAt(clips, kind, t) {
  return clips.find((c) => c.kind === kind && t > c.start + 1e-4 && t < clipEnd(c) - 1e-4)
}

export const tracksOf = (clips, kind) =>
  clips.filter((c) => c.kind === kind).sort((a, b) => a.start - b.start)

export function timelineDuration(clips) {
  return clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
}
