import { useEffect, useState } from 'react'

const ago = (t) => {
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function ProjectMenu({ currentId, list, onOpen, onNew, onDelete, onClose }) {
  const [projects, setProjects] = useState([])
  const refresh = () => list().then(setProjects).catch(() => setProjects([]))
  useEffect(() => { refresh() }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Projects</h2>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <button className="primary wide" onClick={onNew}>+ New project</button>
        <ul className="project-list">
          {projects.length === 0 && <li className="empty">No saved projects yet.</li>}
          {projects.map((p) => (
            <li key={p.id} className={p.id === currentId ? 'cur' : ''}>
              <div className="pl-main" onClick={() => onOpen(p.id)}>
                <span className="pl-name">{p.name || 'Untitled'}</span>
                <span className="pl-meta">{p.id === currentId ? 'open · ' : ''}{ago(p.updatedAt)}</span>
              </div>
              <button
                className="danger small"
                title="Delete project"
                onClick={async () => { await onDelete(p.id); refresh() }}
              >🗑</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
