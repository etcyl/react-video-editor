// Probe a dropped File for duration + dimensions via a throwaway <video>.
export function probeFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      resolve({
        name: file.name,
        file,
        url,
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      })
    }
    v.onerror = () => reject(new Error(`Could not read ${file.name}`))
    v.src = url
  })
}

export const fmtTime = (s) => {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
