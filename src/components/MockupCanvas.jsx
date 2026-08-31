import { useEffect, useRef } from 'react'

function roundRect(ctx, x, y, w, h, r = 0) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r]
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
  ctx.lineTo(x + bl, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
  ctx.lineTo(x, y + tl)
  ctx.quadraticCurveTo(x, y, x + tl, y)
  ctx.closePath()
}

function drawRoom(ctx, W, H, isLandscape) {
  const floorY = isLandscape ? H * 0.72 : H * 0.82

  // Parede
  const wallGrad = ctx.createLinearGradient(0, 0, 0, floorY)
  wallGrad.addColorStop(0, '#f2ede6')
  wallGrad.addColorStop(1, '#e6e0d8')
  ctx.fillStyle = wallGrad
  ctx.fillRect(0, 0, W, floorY)

  // Piso
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, H)
  floorGrad.addColorStop(0, '#c8a87a')
  floorGrad.addColorStop(1, '#a8885a')
  ctx.fillStyle = floorGrad
  ctx.fillRect(0, floorY, W, H - floorY)

  // Rodapé
  ctx.fillStyle = '#d4cfc8'
  ctx.fillRect(0, floorY - 4, W, 4)

  if (isLandscape) {
    // Sofá — encosto
    const couchY = floorY - 88
    ctx.fillStyle = '#9e9590'
    roundRect(ctx, W * 0.08, couchY, W * 0.84, 34, [6, 6, 0, 0])
    ctx.fill()
    // Sofá — assento
    ctx.fillStyle = '#b0a89e'
    roundRect(ctx, W * 0.08, couchY + 34, W * 0.84, 52, [0, 0, 6, 6])
    ctx.fill()
    // Almofadas
    ctx.fillStyle = '#ccc5bc'
    roundRect(ctx, W * 0.16, couchY + 6, W * 0.14, 28, 5)
    ctx.fill()
    roundRect(ctx, W * 0.70, couchY + 6, W * 0.14, 28, 5)
    ctx.fill()
  } else {
    // Mesa lateral
    const tableY = floorY - 62
    ctx.fillStyle = '#8a6e48'
    ctx.fillRect(W * 0.70, tableY, W * 0.22, 7)
    ctx.fillRect(W * 0.74, tableY + 7, 7, 58)
    ctx.fillRect(W * 0.83, tableY + 7, 7, 58)
    // Vaso com planta
    ctx.fillStyle = '#c8a07a'
    ctx.fillRect(W * 0.775, tableY - 22, 14, 24)
    ctx.fillStyle = '#6a9060'
    ctx.beginPath()
    ctx.ellipse(W * 0.782, tableY - 28, 12, 18, -0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(W * 0.785, tableY - 32, 10, 14, 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function getFrameRect(W, H, ratio, isLandscape) {
  const floorY = isLandscape ? H * 0.72 : H * 0.82

  if (isLandscape) {
    let fw = Math.round(W * 0.50)
    let fh = Math.round(fw / ratio)
    if (fh > floorY * 0.68) { fh = Math.round(floorY * 0.68); fw = Math.round(fh * ratio) }
    return { fx: Math.round((W - fw) / 2), fy: Math.round((floorY - fh) * 0.38), fw, fh }
  } else {
    let fh = Math.round(floorY * 0.62)
    let fw = Math.round(fh * ratio)
    if (fw > W * 0.52) { fw = Math.round(W * 0.52); fh = Math.round(fw / ratio) }
    return { fx: Math.round((W - fw) / 2), fy: Math.round((floorY - fh) * 0.32), fw, fh }
  }
}

export default function MockupCanvas({ imgUrl, ratio = 1, width = 600 }) {
  const canvasRef = useRef()
  const isLandscape = ratio >= 1
  const W = width
  const H = isLandscape ? Math.round(W * 0.65) : Math.round(W * 1.38)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgUrl) return
    const ctx = canvas.getContext('2d')
    canvas.width = W
    canvas.height = H

    drawRoom(ctx, W, H, isLandscape)

    const { fx, fy, fw, fh } = getFrameRect(W, H, ratio, isLandscape)
    const pad = 8  // largura da moldura

    // Sombra do quadro
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.28)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetX = 3
    ctx.shadowOffsetY = 8
    ctx.fillStyle = '#fff'
    ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)
    ctx.restore()

    // Moldura branca
    ctx.fillStyle = '#f8f6f2'
    ctx.fillRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)

    // Borda da moldura
    ctx.strokeStyle = '#d4cdc4'
    ctx.lineWidth = 1.5
    ctx.strokeRect(fx - pad, fy - pad, fw + pad * 2, fh + pad * 2)

    // Arte
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      ctx.drawImage(img, fx, fy, fw, fh)
      // Sutil linha interna separando moldura da arte
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'
      ctx.lineWidth = 1
      ctx.strokeRect(fx, fy, fw, fh)
    }
    img.onerror = () => {
      // Fallback: placeholder cinza
      ctx.fillStyle = '#ddd'
      ctx.fillRect(fx, fy, fw, fh)
    }
    img.src = imgUrl
  }, [imgUrl, ratio, W, H])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }}
    />
  )
}
