import { FONTS, loadFont } from '../lib/fonts.js'

export default function TitleEditor({ clip, onChange }) {
  const set = (patch) => onChange(patch)
  // Preload the font for the dropdown's current value so the preview updates.
  loadFont(clip.font)

  return (
    <div className="title-editor">
      <h3>Title</h3>

      <label className="te-row">
        <span>Title text</span>
        <input value={clip.text} onChange={(e) => set({ text: e.target.value })} placeholder="Title" />
      </label>
      <label className="te-row">
        <span>Subtext</span>
        <input value={clip.subtext} onChange={(e) => set({ subtext: e.target.value })} placeholder="(optional)" />
      </label>

      <label className="te-row">
        <span>Font</span>
        <select
          value={clip.font}
          style={{ fontFamily: `"${clip.font}"` }}
          onChange={(e) => { loadFont(e.target.value); set({ font: e.target.value }) }}
          onFocus={() => FONTS.forEach(loadFont)}
        >
          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
        </select>
      </label>

      <div className="te-row split">
        <label><span>Title size</span>
          <input type="range" min="0.03" max="0.2" step="0.005" value={clip.titleSize}
            onChange={(e) => set({ titleSize: +e.target.value })} />
        </label>
        <label><span>Sub size</span>
          <input type="range" min="0.02" max="0.12" step="0.005" value={clip.subSize}
            onChange={(e) => set({ subSize: +e.target.value })} />
        </label>
      </div>

      <div className="te-row split">
        <label className="color"><span>Title color</span>
          <input type="color" value={clip.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="color"><span>Sub color</span>
          <input type="color" value={clip.subColor} onChange={(e) => set({ subColor: e.target.value })} />
        </label>
      </div>

      <div className="te-row split">
        <label><span>Align</span>
          <select value={clip.align} onChange={(e) => set({ align: e.target.value })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <div className="te-toggles">
          <button className={clip.bold ? 'active' : ''} onClick={() => set({ bold: !clip.bold })} title="Bold"><b>B</b></button>
          <button className={clip.italic ? 'active' : ''} onClick={() => set({ italic: !clip.italic })} title="Italic"><i>I</i></button>
          <button className={clip.outline !== false ? 'active' : ''} onClick={() => set({ outline: clip.outline === false })} title="Outline">O</button>
        </div>
      </div>

      <p className="hint">Drag the title in the preview to position it. Trim its bar on the timeline to set how long it shows.</p>
    </div>
  )
}
