import { useEffect, useRef } from 'react'

// Adapted from 21st.dev's Halftone Wordmark Footer: the word printed as dots that part around the pointer.
const WORD = 'VAANI'
const FONT = '800 100px "Helvetica Neue", Arial, system-ui, sans-serif'
const GAP = 6
const RADIUS = 80
const CROP = 0.05
const BACKGROUND = '#0c0d10'
const INK = [138, 143, 153]
const WARM = [232, 163, 61]

function step(x, y, vx, vy, hx, hy, px, py) {
  const dx = x - px
  const dy = y - py
  const d2 = dx * dx + dy * dy
  if (d2 < RADIUS * RADIUS) {
    const d = Math.sqrt(d2) + 0.001
    const f = (1 - d / RADIUS) * 2.6
    vx += (dx / d) * f
    vy += (dy / d) * f
  }
  vx = (vx + (hx - x) * 0.05) * 0.84
  vy = (vy + (hy - y) * 0.05) * 0.84
  return [x + vx, y + vy, vx, vy]
}

export default function Wordmark() {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let dpr = 1
    let px = -1e5
    let py = -1e5
    let raf = 0
    let visible = true
    let awake = true
    let ring = { x: 0, y: 0, t: -1 }
    let dots = new Float32Array(0) // x, y, vx, vy, hx, hy, r per dot
    let count = 0
    let pattern = null

    const layout = () => {
      const rect = root.getBoundingClientRect()
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)

      const mask = document.createElement('canvas')
      mask.width = w
      mask.height = h
      const m = mask.getContext('2d', { willReadFrequently: true })
      m.font = FONT
      const fit = (w * 0.85) / m.measureText(WORD).width * 100
      m.font = FONT.replace('100px', `${fit}px`)
      const box = m.measureText(WORD)
      const cap = box.actualBoundingBoxAscent || fit * 0.72
      m.fillText(WORD, (w - box.width) / 2, h + cap * CROP)
      const img = m.getImageData(0, 0, w, h).data

      const cols = Math.ceil(w / GAP)
      const rows = Math.ceil(h / GAP)
      const tmp = []
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          let sum = 0
          for (let sy = 0; sy < 3; sy++) {
            for (let sx = 0; sx < 3; sx++) {
              const x = Math.min(w - 1, Math.floor(gx * GAP + ((sx + 0.5) * GAP) / 3))
              const y = Math.min(h - 1, Math.floor(gy * GAP + ((sy + 0.5) * GAP) / 3))
              sum += img[(y * w + x) * 4 + 3]
            }
          }
          const cov = sum / (9 * 255)
          if (cov < 0.06) continue
          const hx = gx * GAP + GAP / 2
          const hy = gy * GAP + GAP / 2
          // Area-true radius, so the tone stays even.
          tmp.push(hx, hy, 0, 0, hx, hy, Math.sqrt(cov) * GAP * 0.56)
        }
      }
      dots = new Float32Array(tmp)
      count = tmp.length / 7

      const tile = document.createElement('canvas')
      tile.width = 256
      tile.height = 256
      const g = tile.getContext('2d')
      const id = g.createImageData(256, 256)
      for (let i = 0; i < id.data.length; i += 4) {
        id.data[i] = id.data[i + 1] = id.data[i + 2] = Math.random() * 255
        id.data[i + 3] = Math.random() < 0.5 ? 0 : 255
      }
      g.putImageData(id, 0, 0)
      pattern = ctx.createPattern(tile, 'repeat')
      awake = true
    }

    const draw = (now) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = BACKGROUND
      ctx.fillRect(0, 0, w, h)
      const ringAge = ring.t < 0 ? 1e9 : now - ring.t
      const ringR = ringAge * 0.9
      let moving = false
      for (let i = 0; i < count; i++) {
        const j = i * 7
        let x = dots[j]
        let y = dots[j + 1]
        let vx = dots[j + 2]
        let vy = dots[j + 3]
        const hx = dots[j + 4]
        const hy = dots[j + 5]
        if (!reduced) {
          if (ringAge < 900) {
            const dx = hx - ring.x
            const dy = hy - ring.y
            const d = Math.sqrt(dx * dx + dy * dy) + 0.001
            const band = 1 - Math.min(1, Math.abs(d - ringR) / 26)
            if (band > 0) {
              const f = band * 3.2 * (1 - ringAge / 900)
              vx += (dx / d) * f
              vy += (dy / d) * f
            }
          }
          ;[x, y, vx, vy] = step(x, y, vx, vy, hx, hy, px, py)
          if (Math.abs(vx) + Math.abs(vy) > 0.02 || Math.abs(x - hx) + Math.abs(y - hy) > 0.05) moving = true
          else {
            x = hx
            y = hy
            vx = 0
            vy = 0
          }
          dots[j] = x
          dots[j + 1] = y
          dots[j + 2] = vx
          dots[j + 3] = vy
        }
        const k = Math.min(1, Math.hypot(x - hx, y - hy) / 28)
        ctx.fillStyle = `rgb(${INK.map((c, n) => Math.round(c + (WARM[n] - c) * k))})`
        ctx.beginPath()
        ctx.arc(x, y, dots[j + 6], 0, 2 * Math.PI)
        ctx.fill()
      }
      ctx.globalAlpha = 0.045
      ctx.globalCompositeOperation = 'overlay'
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      awake = moving || ringAge < 900 || px > -1e4
    }

    const loop = (now) => {
      raf = 0
      if (!visible) return
      draw(now)
      if (awake) raf = requestAnimationFrame(loop)
    }
    const wake = () => {
      awake = true
      if (!raf && visible) raf = requestAnimationFrame(loop)
    }
    const onMove = (e) => {
      if (reduced) return
      const b = canvas.getBoundingClientRect()
      px = e.clientX - b.left
      py = e.clientY - b.top
      wake()
    }
    const onLeave = () => {
      px = -1e5
      py = -1e5
      wake()
    }
    const onDown = (e) => {
      if (reduced) return
      const b = canvas.getBoundingClientRect()
      ring = { x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() }
      wake()
    }

    layout()
    draw(performance.now())
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('pointerdown', onDown)
    const ro = new ResizeObserver(() => {
      layout()
      wake()
    })
    ro.observe(root)
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting
      if (visible) wake()
    })
    io.observe(root)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return (
    <footer ref={rootRef} style={{ position: 'relative', height: 'clamp(120px, 20vw, 360px)', overflow: 'hidden' }}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{WORD}</span>
    </footer>
  )
}
