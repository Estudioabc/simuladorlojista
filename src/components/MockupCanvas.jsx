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

export default function MockupCanvas({ imgUrl, ratio = 1, frameColor = 'branco', width = 600 }) {
  const canvasRef = useRef()

  const W = width
  const H = Math.round(W * IMG_H / IMG_W)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgUrl) return
    const ctx = canvas.getContext('2d')
    canvas.width = W
    canvas.height = H

    const roomImg = new Image()
    roomImg.onload = () => {
      // Fundo: foto da sala
      ctx.drawImage(roomImg, 0, 0, W, H)

      // Zona disponível na parede (em pixels do canvas)
      const zL = FRAME_ZONE.left * W
      const zR = FRAME_ZONE.right * W
      const zT = FRAME_ZONE.top * H
      const zB = FRAME_ZONE.bottom * H
      const zW = zR - zL
      const zH = zB - zT

      // Tamanho do quadro dentro da zona, preservando ratio da arte
      const zoneRatio = zW / zH
      let fw, fh
      if (ratio >= zoneRatio) {
        fw = zW * 0.82
        fh = fw / ratio
      } else {
        fh = zH * 0.82
        fw = fh * ratio
      }
      const fx = zL + (zW - fw) / 2
      const fy = zT + (zH - fh) / 2
      const pad = Math.max(6, Math.round(W * 0.013))

      // Sombra
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.28)'
      ctx.shadowBlur = W * 0.05
      ctx.shadowOffsetX = W * 0.004
      ctx.shadowOffsetY = W * 0.018
      ctx.fillStyle = '#fff'
      ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
      ctx.restore()

      // Moldura
      const fs = FRAME_STYLES[frameColor] || FRAME_STYLES.branco
      ctx.fillStyle = fs.fill
      ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
      ctx.strokeStyle = fs.stroke
      ctx.lineWidth = 1.5
      ctx.strokeRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)

      // Arte
      const artImg = new Image()
      artImg.crossOrigin = 'anonymous'
      artImg.onload = () => {
        ctx.drawImage(artImg, fx, fy, fw, fh)
        ctx.strokeStyle = fs.inner
        ctx.lineWidth = 1
        ctx.strokeRect(fx, fy, fw, fh)
      }
      artImg.onerror = () => {
        ctx.fillStyle = '#e8e4de'
        ctx.fillRect(fx, fy, fw, fh)
      }
      artImg.src = imgUrl
    }
    roomImg.src = '/mockup-sala.jpg'
  }, [imgUrl, ratio, frameColor, W, H])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 160px)', width: 'auto', height: 'auto', borderRadius: 8, display: 'block', margin: '0 auto' }}
    />
  )
}
