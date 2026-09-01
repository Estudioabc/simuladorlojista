import { useEffect, useRef, useState } from 'react'

// Foto: 5316x7000 — parede branca, sofá no terço inferior
// Zona da parede onde o quadro vai: definida como % das dimensões da foto
const FRAME_ZONE = { top: 0.08, bottom: 0.54, left: 0.14, right: 0.86 }
const IMG_W = 5316
const IMG_H = 7000

const FRAME_STYLES = {
  branco:  { fill: '#f8f6f3', stroke: '#dedad4', inner: 'rgba(0,0,0,0.05)' },
  preto:   { fill: '#1a1a1a', stroke: '#000',    inner: 'rgba(255,255,255,0.06)' },
  madeira: { fill: '#8B5E3C', stroke: '#6b4828', inner: 'rgba(255,255,255,0.08)' },
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawFrameOnly(ctx, fx, fy, fw, fh, pad, fs) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.28)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetX = 2
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#fff'
  ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
  ctx.restore()
  ctx.fillStyle = fs.fill
  ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
  ctx.strokeStyle = fs.stroke
  ctx.lineWidth = 1.5
  ctx.strokeRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
}

// Cache da foto de fundo (carregada uma vez)
let _roomImgPromise = null
function loadRoomImg() {
  if (!_roomImgPromise) _roomImgPromise = loadImg('/mockup-sala.jpg')
  return _roomImgPromise
}

// Recorte da sala para thumbnail: mostra só a área dos quadros + contexto
const THUMB_CROP = { top: 0.04, bottom: 0.62, left: 0.08, right: 0.92 }

async function drawKitOnCanvas(canvas, kitUrls, frameColor, thumbMode = false) {
  const fs = FRAME_STYLES[frameColor] || FRAME_STYLES.branco
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')

  const roomImg = await loadRoomImg()

  if (thumbMode) {
    const srcX = THUMB_CROP.left * IMG_W
    const srcY = THUMB_CROP.top * IMG_H
    const srcW = (THUMB_CROP.right - THUMB_CROP.left) * IMG_W
    const srcH = (THUMB_CROP.bottom - THUMB_CROP.top) * IMG_H
    ctx.drawImage(roomImg, srcX, srcY, srcW, srcH, 0, 0, W, H)
  } else {
    ctx.drawImage(roomImg, 0, 0, W, H)
  }

  const mapX = thumbMode
    ? v => (v - THUMB_CROP.left) / (THUMB_CROP.right - THUMB_CROP.left) * W
    : v => v * W
  const mapY = thumbMode
    ? v => (v - THUMB_CROP.top) / (THUMB_CROP.bottom - THUMB_CROP.top) * H
    : v => v * H

  const zL = mapX(FRAME_ZONE.left)
  const zR = mapX(FRAME_ZONE.right)
  const zT = mapY(FRAME_ZONE.top)
  const zB = mapY(FRAME_ZONE.bottom)
  const zW = zR - zL
  const zH = zB - zT

  const N = kitUrls.length
  const gap = N > 1 ? Math.round(W * 0.035) : 0
  const pad = Math.max(thumbMode ? 2 : 5, Math.round(W * (thumbMode ? 0.008 : 0.012)))

  const artImgs = await Promise.all(kitUrls.map(u => loadImg(u).catch(() => null)))
  const ratios = artImgs.map(a => a ? (a.naturalWidth / a.naturalHeight) : 1)

  let fh = zH * 0.88
  let fws = ratios.map(r => fh * r)
  const totalW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
  if (totalW > zW * 0.95) {
    const scale = (zW * 0.95) / totalW
    fh *= scale
    fws = fws.map(w => w * scale)
  }

  const totalKitW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
  let cx = zL + (zW - totalKitW) / 2
  const fy = zT + (zH - fh) / 2

  const frames = []
  for (let i = 0; i < N; i++) {
    frames.push({ fx: cx, fy, fw: fws[i], fh })
    cx += fws[i] + gap
  }

  frames.forEach(({ fx, fy, fw, fh }) => {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.28)'
    ctx.shadowBlur = thumbMode ? 8 : 16
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = thumbMode ? 3 : 6
    ctx.fillStyle = '#fff'
    ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
    ctx.restore()
    ctx.fillStyle = fs.fill
    ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
    ctx.strokeStyle = fs.stroke
    ctx.lineWidth = 1
    ctx.strokeRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
  })

  frames.forEach(({ fx, fy, fw, fh }, i) => {
    if (artImgs[i]) {
      ctx.drawImage(artImgs[i], fx, fy, fw, fh)
      ctx.strokeStyle = fs.inner
      ctx.lineWidth = 0.5
      ctx.strokeRect(fx, fy, fw, fh)
    } else {
      ctx.fillStyle = '#e8e4de'
      ctx.fillRect(fx, fy, fw, fh)
    }
  })
}

// Thumbnail do kit para o grid: renderiza só quando visível (lazy)
export function KitThumb({ kitUrls, frameColor = 'branco', cardWidth = 200 }) {
  const canvasRef = useRef()
  const [drawn, setDrawn] = useState(false)

  const cropRatio = (THUMB_CROP.right - THUMB_CROP.left) / (THUMB_CROP.bottom - THUMB_CROP.top)
  const W = cardWidth
  const H = Math.round(W / cropRatio)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !kitUrls?.length) return

    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || drawn) return
      canvas.width = W
      canvas.height = H
      drawKitOnCanvas(canvas, kitUrls, frameColor, true).then(() => setDrawn(true)).catch(() => {})
    }, { rootMargin: '200px' })

    observer.observe(canvas)
    return () => observer.disconnect()
  }, [kitUrls, frameColor, W, H, drawn])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: '100%', aspectRatio: `${W}/${H}`, display: 'block' }}
    />
  )
}

// kitUrls: array de URLs (modo kit) — se undefined, usa imgUrl (modo single)
export default function MockupCanvas({ imgUrl, kitUrls, ratio = 1, frameColor = 'branco', width = 600 }) {
  const canvasRef = useRef()

  const W = width
  const H = Math.round(W * IMG_H / IMG_W)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const urls = kitUrls?.length > 1 ? kitUrls : (imgUrl ? [imgUrl] : [])
    if (!urls.length) return
    canvas.width = W
    canvas.height = H
    drawKitOnCanvas(canvas, urls, frameColor, false).catch(() => {})
  }, [imgUrl, kitUrls, ratio, frameColor, W, H])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 160px)', width: 'auto', height: 'auto', borderRadius: 8, display: 'block', margin: '0 auto' }}
    />
  )
}
