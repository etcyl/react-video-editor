// Google Fonts catalog + on-demand loader. Fonts load via an injected <link>;
// because we render titles to a canvas at export time (not ffmpeg drawtext), we
// only need the web font available in the document, no .ttf wrangling.

export const FONTS = [
  'Anton', 'Oswald', 'Bebas Neue', 'Archivo Black', 'Staatliches', 'Teko', 'Rajdhani',
  'Montserrat', 'Poppins', 'Inter', 'Roboto', 'Roboto Condensed', 'Open Sans', 'Lato',
  'Raleway', 'Nunito', 'Work Sans', 'Barlow', 'Cabin', 'Rubik', 'Josefin Sans',
  'Quicksand', 'Comfortaa', 'Fredoka', 'Dosis', 'Mukta', 'PT Sans', 'Source Sans 3',
  'Titillium Web', 'Saira', 'Secular One', 'Russo One', 'Righteous', 'Passion One',
  'Concert One', 'Baloo 2', 'Playfair Display', 'Merriweather', 'Bitter', 'Bitter',
  'Crimson Text', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond', 'Cinzel',
  'Marcellus', 'Abril Fatface', 'Alfa Slab One', 'Lobster', 'Pacifico', 'Dancing Script',
  'Great Vibes', 'Sacramento', 'Satisfy', 'Courgette', 'Kaushan Script', 'Yellowtail',
  'Caveat', 'Shadows Into Light', 'Indie Flower', 'Patrick Hand', 'Amatic SC',
  'Gloria Hallelujah', 'Permanent Marker', 'Bangers', 'Luckiest Guy', 'Chewy',
  'Special Elite', 'Monoton', 'Audiowide', 'Orbitron', 'Black Ops One', 'Press Start 2P',
  'VT323',
].filter((f, i, a) => a.indexOf(f) === i)

const requested = new Set()

export function loadFont(family) {
  if (!family || requested.has(family)) return
  requested.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&display=swap`
  document.head.appendChild(link)
}

// Ensure a family is actually ready to paint (preview + canvas export).
export async function ensureFont(family, px = 64) {
  loadFont(family)
  try {
    await document.fonts.load(`400 ${px}px "${family}"`)
    await document.fonts.load(`700 ${px}px "${family}"`)
    await document.fonts.ready
  } catch {}
}
