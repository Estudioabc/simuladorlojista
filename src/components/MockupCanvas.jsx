import { useEffect, useRef } from 'react'

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

function drawFrame(ctx, fx, fy, fw, fh, pad, fs) {
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

    const ctx = canvas.getContext('2d')
    canvas.width = W
    canvas.height = H

    const fs = FRAME_STYLES[frameColor] || FRAME_STYLES.branco
    const pad = Math.max(5, Math.round(W * 0.012))

    loadImg('/mockup-sala.jpg').then(async roomImg => {
      ctx.drawImage(roomImg, 0, 0, W, H)

      const zL = FRAME_ZONE.left * W
      const zR = FRAME_ZONE.right * W
      const zT = FRAME_ZONE.top * H
      const zB = FRAME_ZONE.bottom * H
      const zW = zR - zL
      const zH = zB - zT

      const N = urls.length
      const gap = N > 1 ? Math.round(W * 0.015) : 0
      const colW = (zW - gap * (N - 1)) / N

      // Calcula altura baseada no ratio (assumindo todos com mesmo ratio)
      const zoneRatio = colW / zH
      let fw, fh
      if (ratio >= zoneRatio) {
        fw = colW * 0.88
        fh = fw / ratio
      } else {
        fh = zH * 0.88
        fw = fh * ratio
      }

      // Carrega todas as artes em paralelo
      const artImgs = await Promise.all(
        urls.map(u => loadImg(u).catch(() => null))
      )

      // Posição vertical: centralizada na zona
      const fy = zT + (zH - fh) / 2

      // Largura total do kit com gaps e frames
      const totalKitW = fw * N + gap * (N - 1)
      let startX = zL + (zW - totalKitW) / 2

      for (let i = 0; i < N; i++) {
        const fx = startX + i * (fw + gap)
        drawFrame(ctx, fx, fy, fw, fh, pad, fs)
        if (artImgs[i]) {
          ctx.drawImage(artImgs[i], fx, fy, fw, fh)
          ctx.strokeStyle = fs.inner
          ctx.lineWidth = 1
          ctx.strokeRect(fx, fy, fw, fh)
        } else {
          ctx.fillStyle = '#e8e4de'
          ctx.fillRect(fx, fy, fw, fh)
        }
      }
    }).catch(() => {})
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
