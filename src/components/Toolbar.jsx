import { fmtTime } from '../lib/media.js'

export default function Toolbar({ tool, setTool, playing, onTogglePlay, pps, setPps, playhead, duration, selectedCount, onDelete, onSnapLeft, onAddTitle }) {
  return (
    <div className="toolbar">
      <div className="group">
        <button className={tool === 'move' ? 'active' : ''} onClick={() => setTool('move')} title="Move clips (V)">
          ✥ Move
        </button>
        <button className={tool === 'cut' ? 'active' : ''} onClick={() => setTool('cut')} title="Cut at playhead (C)">
          ✂ Cut
        </button>
        <button onClick={onAddTitle} title="Add a title at the playhead">＋ Title</button>
      </div>

      <div className="group">
        <button onClick={onTogglePlay}>{playing ? '❚❚ Pause' : '► Play'}</button>
        <span className="tc">{fmtTime(playhead)} / {fmtTime(duration)}</span>
      </div>

      <div className="group">
        <label>Zoom</label>
        <input type="range" min="20" max="240" value={pps} onChange={(e) => setPps(+e.target.value)} />
      </div>

      <div className="group right">
        {selectedCount > 0 && <span className="sel-count">{selectedCount} selected</span>}
        <button disabled={!selectedCount} onClick={onSnapLeft}
          title="Shift selected clips left to close the gap, keeping video and audio in sync">
          ⟸ Send left (close gap)
        </button>
        <button disabled={!selectedCount} onClick={onDelete} title="Delete selected clips (Del)">
          🗑 Delete
        </button>
      </div>
    </div>
  )
}
