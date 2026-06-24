import { useRef } from 'react'
import { tracksOf, clipDuration, clipEnd } from '../lib/model.js'

const LANES = [
  { kind: 'title', label: 'T' },
  { kind: 'video', label: 'V' },
  { kind: 'audio', label: 'A' },
]

export default function Timeline({
  clips, sources, pps, playhead, tool, selectedIds, duration, transitions,
  onSelect, onClear, onSeek, onTrackClick, onMoveGroup, onTrim,
}) {
  const scrollRef = useRef(null)
  const contentW = Math.max((duration + 4) * pps, 600)

  const nameOf = (id) => sources.find((s) => s.id === id)?.name || ''
  const labelOf = (c) => (c.kind === 'title' ? (c.text || 'Title') : nameOf(c.sourceId))

  // time (seconds) from a mouse event, relative to the content origin
  const timeFromEvent = (e) => {
    const el = scrollRef.current
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left + el.scrollLeft
    return Math.max(0, x / pps)
  }

  const onLaneMouseDown = (e, kind) => {
    if (e.target.dataset.clip) return // clip handles its own interaction
    const t = timeFromEvent(e)
    if (tool === 'cut') { onTrackClick(kind, t); return }
    onClear(); onSeek(t)
  }

  const startDrag = (e, clip) => {
    e.stopPropagation()
    const additive = e.ctrlKey || e.metaKey
    if (tool === 'cut') { onSelect(clip.id, false); onTrackClick(clip.kind, timeFromEvent(e)); return }
    // Ctrl/Cmd-click toggles selection without starting a drag.
    if (additive) { onSelect(clip.id, true); return }
    const inSel = selectedIds.includes(clip.id)
    if (!inSel) onSelect(clip.id, false)
    // Drag the whole selection as a block if this clip belongs to it, else just it.
    const groupIds = inSel ? selectedIds : [clip.id]
    const origStarts = {}
    groupIds.forEach((id) => { const c = clips.find((x) => x.id === id); if (c) origStarts[id] = c.start })
    const minOrig = Math.min(...Object.values(origStarts))
    const startX = e.clientX
    const move = (ev) => {
      let delta = (ev.clientX - startX) / pps
      if (minOrig + delta < 0) delta = -minOrig // keep the block out of negative time
      const map = {}
      for (const id in origStarts) map[id] = origStarts[id] + delta
      onMoveGroup(map)
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const startTrim = (e, clip, edge) => {
    e.stopPropagation()
    onSelect(clip.id, false)
    const move = (ev) => onTrim(clip.id, edge, timeFromEvent(ev))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // tick marks every N seconds depending on zoom
  const step = pps < 50 ? 5 : pps < 120 ? 2 : 1
  const ticks = []
  for (let t = 0; t <= duration + 4; t += step) ticks.push(t)

  return (
    <div className={`timeline tool-${tool}`} ref={scrollRef}>
      <div className="tl-content" style={{ width: contentW }}>
        <div className="ruler" onMouseDown={(e) => onSeek(timeFromEvent(e))}>
          {ticks.map((t) => (
            <div key={t} className="tick" style={{ left: t * pps }}>
              <span>{t}s</span>
            </div>
          ))}
        </div>

        {LANES.map(({ kind, label }) => {
          const lane = tracksOf(clips, kind)
          return (
            <div key={kind} className={`lane lane-${kind}`} onMouseDown={(e) => onLaneMouseDown(e, kind)}>
              <div className="lane-label">{label}</div>
              {lane.map((c, i) => {
                const left = c.start * pps
                const w = clipDuration(c) * pps
                const prev = lane[i - 1]
                const joins = transitions.crossfade && prev && Math.abs(clipEnd(prev) - c.start) < 0.05
                return (
                  <div
                    key={c.id}
                    data-clip="1"
                    className={`clip ${selectedIds.includes(c.id) ? 'sel' : ''}`}
                    style={{ left, width: Math.max(2, w) }}
                    onMouseDown={(e) => startDrag(e, c)}
                    title={`${labelOf(c)}  ${clipDuration(c).toFixed(2)}s`}
                  >
                    {kind !== 'title' && transitions.introFade && i === 0 && <span className="fade-in-mark" />}
                    {kind !== 'title' && transitions.outroFade && i === lane.length - 1 && <span className="fade-out-mark" />}
                    {kind !== 'title' && joins && <span className="xfade-mark" />}
                    <span className="clip-name">{labelOf(c)}</span>
                    <span className="trim-handle left" data-clip="1" onMouseDown={(e) => startTrim(e, c, 'left')} />
                    <span className="trim-handle right" data-clip="1" onMouseDown={(e) => startTrim(e, c, 'right')} />
                  </div>
                )
              })}
            </div>
          )
        })}

        <div className="playhead" style={{ left: playhead * pps }} />
      </div>
    </div>
  )
}
