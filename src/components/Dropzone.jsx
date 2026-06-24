import { useRef, useState } from 'react'

export default function Dropzone({ onFiles, compact }) {
  const [hover, setHover] = useState(false)
  const inputRef = useRef(null)

  const pick = (list) => {
    const files = [...list].filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name))
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={`dropzone ${compact ? 'compact' : ''} ${hover ? 'hover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setHover(true) }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => { e.preventDefault(); setHover(false); pick(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef} type="file" accept="video/*" multiple hidden
        onChange={(e) => { pick(e.target.files); e.target.value = '' }}
      />
      {compact
        ? <span>+ Drop or click to add more video</span>
        : <div className="dz-big">
            <div className="dz-icon">⤓</div>
            <strong>Drag & drop a video here</strong>
            <span>or click to browse. MP4, MOV, MKV, WebM.</span>
          </div>}
    </div>
  )
}
