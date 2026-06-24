import { useEffect, useRef } from 'react'
import { tracksOf, clipEnd } from '../lib/model.js'
import { fmtTime } from '../lib/media.js'
import { loadFont } from '../lib/fonts.js'

// Maps the timeline playhead onto the underlying source <video>. Within a clip
// the element plays natively (smooth video + audio); at a cut boundary we hop to
// the next clip. A fade overlay visualises intro / outro / crossfade dimming.
// Title clips are rendered as draggable text overlays positioned over the frame.
export default function Preview({ sources, clips, playhead, playing, duration, transitions, selectedIds, onTime, onTogglePlay, onEnded, onTitleMove, onSelect }) {
  const videoRef = useRef(null)
  const screenRef = useRef(null)
  const state = useRef({})
  state.current = { sources, clips, playhead, duration, transitions }

  const activeVideoClip = (t) => {
    const vts = tracksOf(state.current.clips, 'video')
    return vts.find((c) => t >= c.start - 1e-3 && t < clipEnd(c) - 1e-3) || null
  }
  const srcUrl = (id) => state.current.sources.find((s) => s.id === id)?.url

  // Keep the element pointed at the right source + time when the playhead moves
  // externally (scrubbing) or when paused.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const clip = activeVideoClip(playhead)
    if (!clip) return
    const url = srcUrl(clip.sourceId)
    if (v.dataset.url !== url) { v.src = url; v.dataset.url = url }
    const want = clip.in + (playhead - clip.start)
    if (Math.abs(v.currentTime - want) > 0.25 || v.paused) {
      try { v.currentTime = Math.min(want, (v.duration || want)) } catch {}
    }
  }, [playhead, clips, sources])

  // Playback loop.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let raf
    if (playing) {
      const clip = activeVideoClip(state.current.playhead)
      if (clip) v.play().catch(() => {})
      const tick = () => {
        const { playhead: ph, duration: dur } = state.current
        const c = activeVideoClip(ph)
        if (c && !v.paused) {
          let t = c.start + (v.currentTime - c.in)
          if (v.currentTime >= c.out - 1e-2 || v.ended) {
            t = clipEnd(c) + 1e-3 // hop past the cut; effect above loads next clip
          }
          if (t >= dur - 1e-3) { onTime(dur); onEnded(); return }
          onTime(t)
        } else {
          // gap with no video: advance by wall clock
          const t = ph + 1 / 60
          if (t >= dur - 1e-3) { onTime(dur); onEnded(); return }
          onTime(t)
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    } else {
      v.pause()
    }
    return () => raf && cancelAnimationFrame(raf)
  }, [playing])

  // Fade overlay opacity (visual approximation of the exported fades).
  const fadeAlpha = (() => {
    const { fadeDuration: D, introFade, outroFade } = transitions
    if (introFade && playhead < D) return 1 - playhead / D
    if (outroFade && playhead > duration - D && duration > 0) return 1 - (duration - playhead) / D
    return 0
  })()

  const activeTitles = tracksOf(clips, 'title').filter((c) => playhead >= c.start - 1e-3 && playhead < clipEnd(c) - 1e-3)

  // Drag a title to reposition it (normalized 0..1 over the frame).
  const dragTitle = (e, t) => {
    e.preventDefault(); e.stopPropagation()
    onSelect && onSelect(t.id, false)
    const rect = screenRef.current.getBoundingClientRect()
    const move = (ev) => {
      const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height))
      onTitleMove(t.id, { x, y })
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  const titleStyle = (t, key) => {
    const h = screenRef.current?.clientHeight || 360
    const px = (key === 'sub' ? t.subSize : t.titleSize) * h
    const isTitle = key !== 'sub'
    return {
      fontFamily: `"${t.font}", system-ui, sans-serif`,
      fontSize: `${px}px`,
      color: isTitle ? t.color : (t.subColor || t.color),
      fontWeight: isTitle && t.bold ? 700 : 400,
      fontStyle: t.italic ? 'italic' : 'normal',
      lineHeight: 1.1,
      WebkitTextStroke: t.outline !== false ? `${Math.max(1, px * 0.04)}px rgba(0,0,0,.85)` : 'none',
      paintOrder: 'stroke fill',
    }
  }

  return (
    <div className="preview">
      <div className="screen" ref={screenRef}>
        <video ref={videoRef} playsInline />
        <div className="fade-overlay" style={{ opacity: Math.max(0, Math.min(1, fadeAlpha)) }} />
        {activeTitles.map((t) => {
          loadFont(t.font)
          const selected = selectedIds?.includes(t.id)
          return (
            <div
              key={t.id}
              className={`title-overlay ${selected ? 'sel' : ''}`}
              style={{ left: `${t.pos.x * 100}%`, top: `${t.pos.y * 100}%`, textAlign: t.align }}
              onMouseDown={(e) => dragTitle(e, t)}
            >
              <div style={titleStyle(t, 'title')}>{t.text}</div>
              {t.subtext && <div style={titleStyle(t, 'sub')}>{t.subtext}</div>}
            </div>
          )
        })}
      </div>
      <div className="preview-bar">
        <button onClick={onTogglePlay}>{playing ? '❚❚' : '►'}</button>
        <span className="tc">{fmtTime(playhead)} / {fmtTime(duration)}</span>
      </div>
    </div>
  )
}
