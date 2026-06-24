// Render a title clip to a full-frame transparent PNG using the exact web font,
// so the export matches the preview pixel for pixel. Sizes are fractions of the
// frame height, so they scale to whatever resolution we export at.

import { ensureFont } from './fonts.js'

export const DEFAULT_TITLE = {
  text: 'Title',
  subtext: '',
  font: 'Anton',
  titleSize: 0.09,   // fraction of frame height
  subSize: 0.045,
  color: '#ffffff',
  subColor: '#e9c684',
  pos: { x: 0.5, y: 0.5 }, // normalized center
  align: 'center',
  bold: false,
  italic: false,
  outline: true,
}

function drawLine(ctx, text, x, y, color, px, outline) {
  if (outline) {
    ctx.lineWidth = Math.max(2, px * 0.09)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

// Paint the title onto a 2D context sized W x H.
export function drawTitle(ctx, clip, W, H) {
  const cx = clip.pos.x * W
  const cy = clip.pos.y * H
  const titlePx = Math.round((clip.titleSize ?? 0.09) * H)
  const subPx = Math.round((clip.subSize ?? 0.045) * H)
  const weight = clip.bold ? '700' : '400'
  const style = clip.italic ? 'italic' : 'normal'
  const fam = `"${clip.font}", system-ui, sans-serif`
  ctx.textAlign = clip.align || 'center'
  ctx.textBaseline = 'alphabetic'

  const hasSub = !!(clip.subtext && clip.subtext.trim())
  const gap = hasSub ? subPx * 0.45 : 0
  const totalH = titlePx + (hasSub ? gap + subPx : 0)
  const titleBaseline = cy - totalH / 2 + titlePx

  ctx.font = `${style} ${weight} ${titlePx}px ${fam}`
  drawLine(ctx, clip.text || '', cx, titleBaseline, clip.color || '#fff', titlePx, clip.outline !== false)

  if (hasSub) {
    ctx.font = `${style} 400 ${subPx}px ${fam}`
    drawLine(ctx, clip.subtext, cx, titleBaseline + gap + subPx, clip.subColor || clip.color || '#fff', subPx, clip.outline !== false)
  }
}

export async function renderTitlePng(clip, W, H) {
  await ensureFont(clip.font, Math.round((clip.titleSize ?? 0.09) * H))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  drawTitle(ctx, clip, W, H)
  return await new Promise((res) => canvas.toBlob(res, 'image/png'))
}
