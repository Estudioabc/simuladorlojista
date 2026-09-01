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
      const gap = N > 1 ? Math.round(W * 0.035) : 0

      // Carrega todas as artes em paralelo
      const artImgs = await Promise.all(
        urls.map(u => loadImg(u).catch(() => null))
      )

      // Usa o ratio real de cada imagem carregada; fallback para prop ratio (modo single)
      const ratios = artImgs.map(a =>
        a ? (a.naturalWidth / a.naturalHeight) : ratio
      )

      // Altura comum para todos os quadros: começa com 88% da zona
      let fh = zH * 0.88
      // Larguras individuais baseadas no ratio real de cada parte
      let fws = ratios.map(r => fh * r)
      const totalW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
      // Se não couber na zona, escala para caber em 95% da zona
      if (totalW > zW * 0.95) {
        const scale = (zW * 0.95) / totalW
        fh = fh * scale
        fws = fws.map(w => w * scale)
      }

      const totalKitW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
      let startX = zL + (zW - totalKitW) / 2
      const fy = zT + (zH - fh) / 2

      // Calcula posição x de cada quadro
      const frames = []
      let cx = startX
      for (let i = 0; i < N; i++) {
        frames.push({ fx: cx, fy, fw: fws[i], fh })
        cx += fws[i] + gap
      }

      // 1ª passada: desenha todos os frames (sombra não vaza sobre a arte vizinha)
      frames.forEach(({ fx, fy, fw, fh }) => drawFrameOnly(ctx, fx, fy, fw, fh, pad, fs))

      // 2ª passada: desenha as artes por cima
      frames.forEach(({ fx, fy, fw, fh }, i) => {
        if (artImgs[i]) {
          ctx.drawImage(artImgs[i], fx, fy, fw, fh)
          ctx.strokeStyle = fs.inner
          ctx.lineWidth = 1
          ctx.strokeRect(fx, fy, fw, fh)
        } else {
          ctx.fillStyle = '#e8e4de'
          ctx.fillRect(fx, fy, fw, fh)
        }
      })
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
