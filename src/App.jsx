import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Dropzone from './components/Dropzone.jsx'
import Preview from './components/Preview.jsx'
import Toolbar from './components/Toolbar.jsx'
import Timeline from './components/Timeline.jsx'
import TransitionPanel from './components/TransitionPanel.jsx'
import { probeFile } from './lib/media.js'
import {
  uid, clipsFromSource, makeTitleClip, splitClip, clipAt, clipEnd, timelineDuration, trimLeft, trimRight,
} from './lib/model.js'
import { DEFAULT_TITLE } from './lib/titleRender.js'
import TitleEditor from './components/TitleEditor.jsx'
import { exportTimeline, cancelExport, FORMATS } from './lib/exporter.js'
import {
  saveSource, saveProject, loadProject, listProjects, deleteProject, LAST_KEY,
} from './lib/projectStore.js'
import ProjectMenu from './components/ProjectMenu.jsx'
import LogConsole from './components/LogConsole.jsx'

export default function App() {
  const [sources, setSources] = useState([])
  const [clips, setClips] = useState([])
  const [tool, setTool] = useState('move') // 'move' | 'cut'
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [pps, setPps] = useState(80) // pixels per second (zoom)
  const [transitions, setTransitions] = useState({
    introFade: true, outroFade: true, crossfade: true, fadeDuration: 0.8,
  })
  const [formatKey, setFormatKey] = useState('mp4')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [logLines, setLogLines] = useState([])
  const [logOpen, setLogOpen] = useState(false)
  const logRef = useRef('')
  const logBuf = useRef([])
  const flushPending = useRef(false)

  // Coalesce bursty ffmpeg log lines into one state update per frame.
  const pushLog = useCallback((m) => {
    logRef.current = m
    logBuf.current.push(m)
    if (!flushPending.current) {
      flushPending.current = true
      requestAnimationFrame(() => {
        flushPending.current = false
        setLogLines((prev) => {
          const next = prev.concat(logBuf.current)
          logBuf.current = []
          return next.length > 1500 ? next.slice(-1500) : next
        })
      })
    }
  }, [])

  const [projectId, setProjectId] = useState(() => uid('proj'))
  const [projectName, setProjectName] = useState('Untitled project')
  const [savedAt, setSavedAt] = useState(0)
  const [showProjects, setShowProjects] = useState(false)
  const hydratedRef = useRef(false) // guards autosave until the first load finishes

  const duration = useMemo(() => timelineDuration(clips), [clips])

  const onDropFiles = useCallback(async (files) => {
    const probed = []
    for (const f of files) {
      try { probed.push(await probeFile(f)) }
      catch (e) { setStatus(e.message) }
    }
    if (!probed.length) return
    const newSources = probed.map((p) => ({ id: uid('src'), ...p }))
    newSources.forEach((s) => saveSource(s).catch(() => {})) // persist blobs once
    setSources((prev) => [...prev, ...newSources])
    setClips((prev) => {
      let end = timelineDuration(prev)
      const added = []
      for (const src of newSources) {
        added.push(...clipsFromSource(src, end))
        end += src.duration
      }
      return [...prev, ...added]
    })
  }, [])

  // Split the clip of `kind` under the playhead. Independent per track so the
  // user can cut video then audio (or vice versa); both land on the playhead.
  const cutAt = useCallback((kind, t) => {
    setClips((prev) => {
      const target = clipAt(prev, kind, t)
      if (!target) return prev
      const pair = splitClip(target, t)
      if (!pair) return prev
      return prev.flatMap((c) => (c.id === target.id ? pair : c))
    })
  }, [])

  // Apply a map of { clipId: newStart } in one update (used for group drags).
  const moveClips = useCallback((startMap) => {
    setClips((prev) => prev.map((c) => (c.id in startMap ? { ...c, start: Math.max(0, startMap[c.id]) } : c)))
  }, [])

  // Ctrl/Cmd-click toggles a clip in the selection; a plain click replaces it.
  const selectClip = useCallback((id, additive) => {
    setSelectedIds((prev) => {
      if (!additive) return [id]
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    })
  }, [])
  const clearSelection = useCallback(() => setSelectedIds([]), [])

  // Patch arbitrary fields on a clip (used by the title editor + preview drag).
  const updateClip = useCallback((id, patch) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const addTitle = useCallback(() => {
    const start = playhead
    const t = makeTitleClip(start, 3, DEFAULT_TITLE)
    setClips((prev) => [...prev, t])
    setSelectedIds([t.id])
  }, [playhead])

  // Shift the selected clips left as one block, until the binding clip butts up
  // against the nearest non-selected clip on its track (or 0). The same shift is
  // applied to every selected clip, so video and audio stay in sync.
  const sendToLastAvailable = useCallback(() => {
    setClips((prev) => {
      if (!selectedIds.length) return prev
      const sel = new Set(selectedIds)
      let shift = Infinity
      for (const c of prev) {
        if (!sel.has(c.id)) continue
        let prevEnd = 0
        for (const o of prev) {
          if (sel.has(o.id) || o.kind !== c.kind) continue
          const oe = clipEnd(o)
          if (oe <= c.start + 1e-4 && oe > prevEnd) prevEnd = oe
        }
        shift = Math.min(shift, c.start - prevEnd)
      }
      if (!isFinite(shift) || shift <= 1e-4) return prev
      return prev.map((c) => (sel.has(c.id) ? { ...c, start: Math.max(0, c.start - shift) } : c))
    })
  }, [selectedIds])

  const trimClip = useCallback((id, edge, tAbs) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const src = sources.find((s) => s.id === c.sourceId)
      // Titles have no media, so their right edge can extend freely.
      const srcDur = c.kind === 'title' ? Infinity : (src?.duration ?? c.out)
      return edge === 'left' ? trimLeft(c, tAbs) : trimRight(c, tAbs, srcDur)
    }))
  }, [sources])

  const deleteSelected = useCallback(() => {
    setSelectedIds((ids) => {
      if (ids.length) setClips((prev) => prev.filter((c) => !ids.includes(c.id)))
      return []
    })
  }, [])

  const onTimelineClick = useCallback((kind, t) => {
    if (tool === 'cut') cutAt(kind, t)
    else setPlayhead(t)
  }, [tool, cutAt])

  const doExport = useCallback(async () => {
    setExporting(true); setProgress(0); setStatus('Loading ffmpeg core...')
    setLogLines([]); setLogOpen(true)
    try {
      const { blob, ext } = await exportTimeline({
        clips, sources, transitions, formatKey,
        onLog: (m) => {
          setStatus(m); pushLog(m)
          // Drive the % from ffmpeg's own "time=HH:MM:SS.xx" stat lines.
          const tm = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(m)
          if (tm && duration > 0) {
            const secs = (+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3])
            setProgress(Math.min(0.99, secs / duration))
          }
        },
        onProgress: (p) => setProgress((cur) => Math.max(cur, p)),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName.replace(/[^\w.-]+/g, '_') || 'export'}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      setStatus('Export complete.')
    } catch (e) {
      if (/terminate/i.test(e.message)) setStatus('Export canceled.')
      else { console.error(e); setStatus(`Export failed: ${e.message}. ${logRef.current}`) }
    } finally {
      setExporting(false)
    }
  }, [clips, sources, transitions, formatKey, projectName, pushLog, duration])

  const onCancelExport = useCallback(() => { cancelExport(); setStatus('Canceling export...') }, [])

  // ---- project persistence ----
  const applyProject = useCallback((project, srcs) => {
    setSources(srcs)
    setClips(project.clips || [])
    setTransitions(project.transitions || { introFade: true, outroFade: true, crossfade: true, fadeDuration: 0.8 })
    setProjectId(project.id)
    setProjectName(project.name || 'Untitled project')
    setPlayhead(0); setSelectedIds([])
    localStorage.setItem(LAST_KEY, project.id)
  }, [])

  // Reopen the last project on load.
  useEffect(() => {
    (async () => {
      const last = localStorage.getItem(LAST_KEY)
      if (last) {
        try {
          const res = await loadProject(last)
          if (res) applyProject(res.project, res.sources)
        } catch {}
      }
      // Optional deterministic seek for screenshots/links: localhost:5173/#t=9
      const m = /[#&]t=(\d+(?:\.\d+)?)/.exec(location.hash)
      if (m) setPlayhead(parseFloat(m[1]))
      hydratedRef.current = true
    })()
  }, [applyProject])

  // Debounced autosave whenever the project content changes.
  useEffect(() => {
    if (!hydratedRef.current) return
    if (!clips.length && !sources.length) return
    const t = setTimeout(() => {
      saveProject({ id: projectId, name: projectName, clips, transitions, sourceIds: sources.map((s) => s.id) })
        .then(() => { setSavedAt(Date.now()); localStorage.setItem(LAST_KEY, projectId) })
        .catch(() => {})
    }, 700)
    return () => clearTimeout(t)
  }, [clips, transitions, sources, projectName, projectId])

  const newProject = useCallback(() => {
    setSources([]); setClips([]); setSelectedIds([]); setPlayhead(0)
    setTransitions({ introFade: true, outroFade: true, crossfade: true, fadeDuration: 0.8 })
    const id = uid('proj')
    setProjectId(id); setProjectName('Untitled project')
    localStorage.setItem(LAST_KEY, id)
    setShowProjects(false)
  }, [])

  const openProject = useCallback(async (id) => {
    const res = await loadProject(id)
    if (res) applyProject(res.project, res.sources)
    setShowProjects(false)
  }, [applyProject])

  const removeProject = useCallback(async (id) => {
    await deleteProject(id)
    if (id === projectId) newProject()
  }, [projectId, newProject])

  // Keyboard shortcuts: V move, C cut, Space play/pause, Del/Backspace delete.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (k === 'v') setTool('move')
      else if (k === 'c') setTool('cut')
      else if (k === ' ') { e.preventDefault(); setPlaying((p) => !p) }
      else if (k === 'delete' || k === 'backspace') deleteSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected])

  const hasMedia = clips.length > 0
  const selectedTitle = selectedIds.length === 1
    ? clips.find((c) => c.id === selectedIds[0] && c.kind === 'title') || null
    : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>React Video Editor</h1>
          <div className="project-id">
            <button className="ghost" onClick={() => setShowProjects(true)} title="Open / manage projects">☰ Projects</button>
            <input
              className="project-name" value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              spellCheck={false} title="Project name (click to rename)"
            />
            <span className="saved">{savedAt ? 'Saved' : ''}</span>
          </div>
        </div>
        <div className="export-controls">
          <button className="ghost" onClick={() => setLogOpen((o) => !o)} title="Show ffmpeg log console">
            ▤ Logs{logLines.length ? ` (${logLines.length})` : ''}
          </button>
          <select value={formatKey} onChange={(e) => setFormatKey(e.target.value)} disabled={exporting}>
            {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </select>
          {exporting
            ? <>
                <button className="primary" disabled>{`Exporting ${Math.round(progress * 100)}%`}</button>
                <button className="danger" onClick={onCancelExport}>Cancel</button>
              </>
            : <button className="primary" onClick={doExport} disabled={!hasMedia}>Export</button>}
        </div>
      </header>

      {showProjects && (
        <ProjectMenu
          currentId={projectId}
          list={listProjects}
          onOpen={openProject}
          onNew={newProject}
          onDelete={removeProject}
          onClose={() => setShowProjects(false)}
        />
      )}

      <div className="stage">
        <div className="left">
          <Preview
            sources={sources}
            clips={clips}
            playhead={playhead}
            playing={playing}
            duration={duration}
            transitions={transitions}
            selectedIds={selectedIds}
            onTime={setPlayhead}
            onTogglePlay={() => setPlaying((p) => !p)}
            onEnded={() => setPlaying(false)}
            onTitleMove={(id, pos) => updateClip(id, { pos })}
            onSelect={selectClip}
          />
          {selectedTitle
            ? <TitleEditor clip={selectedTitle} onChange={(patch) => updateClip(selectedTitle.id, patch)} />
            : <TransitionPanel value={transitions} onChange={setTransitions} />}
        </div>

        <div className="right">
          {!hasMedia && <Dropzone onFiles={onDropFiles} />}
          {hasMedia && <Dropzone onFiles={onDropFiles} compact />}
        </div>
      </div>

      <Toolbar
        tool={tool} setTool={setTool}
        playing={playing} onTogglePlay={() => setPlaying((p) => !p)}
        pps={pps} setPps={setPps}
        playhead={playhead} duration={duration}
        selectedCount={selectedIds.length}
        onDelete={deleteSelected} onSnapLeft={sendToLastAvailable}
        onAddTitle={addTitle}
      />

      <Timeline
        clips={clips}
        sources={sources}
        pps={pps}
        playhead={playhead}
        tool={tool}
        duration={duration}
        transitions={transitions}
        selectedIds={selectedIds}
        onSelect={selectClip}
        onClear={clearSelection}
        onSeek={setPlayhead}
        onTrackClick={onTimelineClick}
        onMoveGroup={moveClips}
        onTrim={trimClip}
      />

      {status && <div className="status">{status}</div>}

      {logOpen && (
        <LogConsole lines={logLines} onClose={() => setLogOpen(false)} onClear={() => setLogLines([])} />
      )}
    </div>
  )
}
