// Project persistence in IndexedDB. Two stores:
//   - 'sources'  : the imported media blobs (written once per import; large)
//   - 'projects' : small JSON of clips + transitions + which source ids it uses
// Keeping blobs in their own store means frequent autosaves only rewrite the
// tiny project record, not the multi-hundred-MB video files.

const DB = 'react-video-editor'
const VER = 1

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VER)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('sources')) db.createObjectStore('sources', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const req = fn(s)
    t.oncomplete = () => resolve(req && req.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

// Store a source's blob once. `src` is a runtime source {id,name,duration,...,file}.
export async function saveSource(src) {
  const db = await openDb()
  const existing = await tx(db, 'sources', 'readonly', (s) => s.get(src.id))
  if (existing) return
  await tx(db, 'sources', 'readwrite', (s) => s.put({
    id: src.id, name: src.name, duration: src.duration,
    width: src.width, height: src.height, blob: src.file,
  }))
}

export async function saveProject({ id, name, clips, transitions, sourceIds }) {
  const db = await openDb()
  await tx(db, 'projects', 'readwrite', (s) => s.put({
    id, name, clips, transitions, sourceIds, updatedAt: Date.now(),
  }))
}

export async function listProjects() {
  const db = await openDb()
  const all = await tx(db, 'projects', 'readonly', (s) => s.getAll())
  return (all || []).sort((a, b) => b.updatedAt - a.updatedAt)
}

// Returns { project, sources } with sources rebuilt into runtime objects
// (file blob + a fresh object URL).
export async function loadProject(id) {
  const db = await openDb()
  const project = await tx(db, 'projects', 'readonly', (s) => s.get(id))
  if (!project) return null
  const sources = []
  for (const sid of project.sourceIds || []) {
    const rec = await tx(db, 'sources', 'readonly', (s) => s.get(sid))
    if (rec) sources.push({
      id: rec.id, name: rec.name, duration: rec.duration, width: rec.width,
      height: rec.height, file: rec.blob, url: URL.createObjectURL(rec.blob),
    })
  }
  return { project, sources }
}

export async function deleteProject(id) {
  const db = await openDb()
  await tx(db, 'projects', 'readwrite', (s) => s.delete(id))
}

export const LAST_KEY = 'rve-last-project'
