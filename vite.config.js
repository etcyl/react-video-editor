import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cross-origin isolation headers let ffmpeg.wasm use SharedArrayBuffer (threaded core).
// 'credentialless' keeps the page cross-origin isolated in Chrome while still
// allowing cross-origin resources (Google Fonts) to load without CORP headers.
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  // Relative base so the production build works under a GitHub Pages subpath
  // (https://<user>.github.io/react-video-editor/) as well as at the root.
  base: './',
  plugins: [react()],
  server: { headers: coiHeaders },
  preview: { headers: coiHeaders },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
})
