import { useEffect, useRef, useState } from 'react'

// Floating, resizable, auto-scrolling console for ffmpeg output. Auto-follows
// the tail unless the user scrolls up to read back.
export default function LogConsole({ lines, onClose, onClear }) {
  const bodyRef = useRef(null)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    const el = bodyRef.current
    if (el && follow) el.scrollTop = el.scrollHeight
  }, [lines, follow])

  const onScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setFollow(atBottom)
  }

  return (
    <div className="log-console">
      <div className="log-head">
        <span className="log-title">ffmpeg log <em>{lines.length} lines</em></span>
        <div className="log-actions">
          {!follow && <button className="ghost small" onClick={() => setFollow(true)}>↓ Follow</button>}
          <button className="ghost small" onClick={onClear}>Clear</button>
          <button className="ghost small" onClick={onClose}>✕</button>
        </div>
      </div>
      <pre ref={bodyRef} className="log-body" onScroll={onScroll}>
        {lines.length ? lines.join('\n') : 'No output yet. Start an export to see ffmpeg logs here.'}
      </pre>
    </div>
  )
}
