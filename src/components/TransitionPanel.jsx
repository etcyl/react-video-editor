export default function TransitionPanel({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <div className="transitions">
      <h3>Transitions</h3>
      <label className="cb">
        <input type="checkbox" checked={value.introFade} onChange={(e) => set({ introFade: e.target.checked })} />
        Fade in (intro)
      </label>
      <label className="cb">
        <input type="checkbox" checked={value.outroFade} onChange={(e) => set({ outroFade: e.target.checked })} />
        Fade out (outro)
      </label>
      <label className="cb">
        <input type="checkbox" checked={value.crossfade} onChange={(e) => set({ crossfade: e.target.checked })} />
        Crossfade between clips
      </label>
      <label className="range">
        Fade length: {value.fadeDuration.toFixed(1)}s
        <input
          type="range" min="0.2" max="3" step="0.1" value={value.fadeDuration}
          onChange={(e) => set({ fadeDuration: +e.target.value })}
        />
      </label>
      <p className="hint">Checked transitions apply on export: intro/outro fades plus a dissolve where clips meet.</p>
    </div>
  )
}
