import { useEffect, useRef, useState } from 'react'

// Ambientes disponíveis — zone define área da parede em % das dimensões da foto
export const ROOMS = [
  // zone = área livre da parede (fração da foto); paredeCm = largura real dessa área,
  // calibrada pelo móvel de referência indicado
  {
    id: 'sala-clara',
    label: 'Sala clara',
    src: '/ambiente-sala-clara.jpg',
    w: 1920, h: 1536,
    zone: { top: 0.05, bottom: 0.55, left: 0.16, right: 0.84 },
    paredeCm: 202, // sofá capitonê 3 lugares ≈ 230 cm ocupa 77,5% da largura
    thumb: { top: 0.0, bottom: 1.0, left: 0.0, right: 1.0 },
  },
  {
    id: 'sala-escura',
    label: 'Sala azul-marinho',
    src: '/ambiente-sala-escura.jpg',
    w: 1920, h: 1280,
    zone: { top: 0.05, bottom: 0.50, left: 0.18, right: 0.95 },
    paredeCm: 222, // poltrona ≈ 75 cm ocupa 26% da largura
    thumb: { top: 0.0, bottom: 1.0, left: 0.0, right: 1.0 },
  },
  {
    id: 'quarto',
    label: 'Quarto',
    src: '/ambiente-quarto.jpg',
    w: 1920, h: 1076,
    zone: { top: 0.04, bottom: 0.48, left: 0.25, right: 0.72 },
    paredeCm: 255, // travesseiros de 70 cm junto à parede ≈ 1,85 px/cm a 1000 px → zona de 47% ≈ 255 cm (cama queen ≈ 158 cm)
    thumb: { top: 0.0, bottom: 1.0, left: 0.0, right: 1.0 },
  },
  {
    id: 'jantar',
    label: 'Sala de jantar',
    src: '/ambiente-jantar.jpg',
    w: 1920, h: 1072,
    zone: { top: 0.06, bottom: 0.56, left: 0.10, right: 0.90 },
    paredeCm: 349, // mesa redonda ≈ 120 cm ocupa 27,5% da largura
    thumb: { top: 0.0, bottom: 1.0, left: 0.0, right: 1.0 },
  },
]

const FRAME_STYLES = {
  branco:  { fill: '#f8f6f3', stroke: '#dedad4', inner: 'rgba(0,0,0,0.05)' },
  preto:   { fill: '#1a1a1a', stroke: '#000',    inner: 'rgba(255,255,255,0.06)' },
  madeira: { fill: '#8B5E3C', stroke: '#6b4828', inner: 'rgba(255,255,255,0.08)' },
  // cores reais das molduras (utils/molduras.js → CORES_MOLDURA)
  escura:  { fill: '#4b2c20', stroke: '#2e1a12', inner: 'rgba(255,255,255,0.07)' },
  clara:   { fill: '#d8bd8f', stroke: '#b89a6a', inner: 'rgba(0,0,0,0.06)' },
  mel:     { fill: '#a4602b', stroke: '#7a4419', inner: 'rgba(255,255,255,0.08)' },
  branca:  { fill: '#f1f0ec', stroke: '#d9d6cf', inner: 'rgba(0,0,0,0.05)' },
  preta:   { fill: '#1c1c1e', stroke: '#000',    inner: 'rgba(255,255,255,0.06)' },
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

// Cache da foto de fundo por src
const _roomImgCache = {}
function loadRoomImg(src) {
  if (!_roomImgCache[src]) _roomImgCache[src] = loadImg(src)
  return _roomImgCache[src]
}

const PAD_RATIO = 0.018  // espessura da moldura como fração da altura do quadro
const GAP_CM = 5         // espaço real entre quadros de uma composição

// Escala real: px por cm na parede do ambiente (null quando não há medida)
function pxPorCm(room, zW, tamanhoCm) {
  return room?.paredeCm && tamanhoCm?.altura > 0 ? zW / room.paredeCm : null
}

// Uma imagem vendida fatiada vira N "peças", cada uma com o recorte da sua faixa
function expandSlices(artImgs, slices) {
  if (!(slices > 1) || artImgs.length !== 1 || !artImgs[0]) return artImgs
  const img = artImgs[0]
  const sw = img.naturalWidth / slices
  return Array.from({ length: slices }, (_, i) => ({ img, sx: sw * i, sy: 0, sw, sh: img.naturalHeight }))
}

function artRatio(a) {
  if (!a) return 1
  if (a.img) return a.sw / a.sh
  return a.naturalWidth / a.naturalHeight
}

async function drawKitOnCanvas(canvas, kitUrls, frameColor, room, thumbMode = false, slices = 1, tamanhoCm = null) {
  const fs = FRAME_STYLES[frameColor] || FRAME_STYLES.branco
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')
  const THUMB_CROP = room.thumb
  const FRAME_ZONE = room.zone

  const roomImg = await loadRoomImg(room.src)

  if (thumbMode) {
    const srcX = THUMB_CROP.left * room.w
    const srcY = THUMB_CROP.top * room.h
    const srcW = (THUMB_CROP.right - THUMB_CROP.left) * room.w
    const srcH = (THUMB_CROP.bottom - THUMB_CROP.top) * room.h
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

  const artImgs = expandSlices(await Promise.all(kitUrls.map(u => loadImg(u).catch(() => null))), slices)
  const ratios = artImgs.map(artRatio)
  const N = artImgs.length
  const escala = thumbMode ? null : pxPorCm(room, zW, tamanhoCm)
  const gap = N > 1 ? Math.round(escala ? GAP_CM * escala : W * 0.03) : 0

  let fh = escala ? tamanhoCm.altura * escala : zH * 0.55
  let fws = ratios.map(r => fh * r)
  const totalW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
  if (!escala && totalW > zW * 0.75) {
    const scale = (zW * 0.75) / totalW
    fh *= scale
    fws = fws.map(w => w * scale)
  }
  const pad = thumbMode ? 2 : Math.max(2, Math.round(fh * PAD_RATIO))

  const totalKitW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
  let startX = zL + (zW - totalKitW) / 2
  const fy = zT + (zH - fh) / 2

  const frames = []
  for (let i = 0; i < N; i++) {
    frames.push({ fx: startX, fy, fw: fws[i], fh })
    startX += fws[i] + gap
  }

  drawFrames(ctx, frames, artImgs, fs, pad, thumbMode)
}

function drawFrames(ctx, frames, artImgs, fs, pad, thumbMode = false) {
  frames.forEach(({ fx, fy, fw, fh }) => {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.30)'
    ctx.shadowBlur = thumbMode ? 8 : 18
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = thumbMode ? 3 : 7
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
    const a = artImgs[i]
    if (a) {
      if (a.img) ctx.drawImage(a.img, a.sx, a.sy, a.sw, a.sh, fx, fy, fw, fh)
      else ctx.drawImage(a, fx, fy, fw, fh)
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
export function KitThumb({ kitUrls, frameColor = 'branco', cardWidth = 200, room }) {
  const canvasRef = useRef()
  const [drawn, setDrawn] = useState(false)
  const roomCfg = room || ROOMS[0]

  const thumbCrop = roomCfg.thumb
  const cropRatio = (thumbCrop.right - thumbCrop.left) / ((thumbCrop.bottom - thumbCrop.top) || 1) * (roomCfg.w / roomCfg.h)
  const W = cardWidth
  const H = Math.round(W / cropRatio)

  useEffect(() => { setDrawn(false) }, [roomCfg.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !kitUrls?.length) return
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || drawn) return
      canvas.width = W
      canvas.height = H
      drawKitOnCanvas(canvas, kitUrls, frameColor, roomCfg, true).then(() => setDrawn(true)).catch(() => {})
    }, { rootMargin: '200px' })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [kitUrls, frameColor, W, H, drawn, roomCfg])

  return (
    <canvas ref={canvasRef} width={W} height={H}
      style={{ width: '100%', aspectRatio: `${W}/${H}`, display: 'block' }} />
  )
}

// Hash determinístico para escolher cor de moldura pelo src
function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
const GRID_FRAME_PALETTE = [
  { fill: '#1a1a1a', stroke: '#000' },    // preta
  { fill: '#f0ede8', stroke: '#d5cfc8' }, // branca
  { fill: '#7B5230', stroke: '#5c3a1e' }, // madeira
]

// Miniatura de arte com moldura sobre fundo claro — para uso no grid.
// Com `srcs` (kit), desenha as peças lado a lado com a mesma altura, cada uma na proporção original.
export function FramedArtThumb({ src, srcs }) {
  const lista = srcs?.length ? srcs : (src ? [src] : [])
  const chave = lista.join('|')
  const wrapRef = useRef()
  const canvasRef = useRef()
  const imgCacheRef = useRef(null)
  const fs = GRID_FRAME_PALETTE[hashStr(lista[0] || '') % 3]

  function drawOn(canvas, imgs, W) {
    const H = Math.round(W * 0.95)
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f7f5f2'
    ctx.fillRect(0, 0, W, H)
    const N = imgs.length
    const OUTER_PAD = Math.round(H * (N > 1 ? 0.08 : 0.1))
    const gap = N > 1 ? Math.round(W * 0.075) : 0 // inclui as molduras, desenhadas por fora de cada arte
    const maxArtW = W - OUTER_PAD * 2 - gap * (N - 1)
    const maxArtH = H - OUTER_PAD * 2
    const ratios = imgs.map(im => im.naturalWidth / im.naturalHeight)
    // 4 a 6 peças: duas fileiras (no card, uma fileira só deixaria cada peça minúscula)
    const nLinhas = N >= 4 ? 2 : 1
    const porLinha = Math.ceil(N / nLinhas)
    const linhas = Array.from({ length: nLinhas }, (_, l) => ratios.map((r, i) => ({ r, i })).slice(l * porLinha, (l + 1) * porLinha))
    const larguraUtil = W - OUTER_PAD * 2
    // altura comum: a maior que cabe em todas as fileiras e na altura disponível
    const artH = Math.min(
      (maxArtH - gap * (nLinhas - 1)) / nLinhas,
      ...linhas.map(lin => (larguraUtil - gap * (lin.length - 1)) / lin.reduce((a, b) => a + b.r, 0)),
    )
    const FRAME_THICK = Math.max(1, Math.round(artH * 0.018 * (N > 1 ? 1.4 : 1)))
    const totalH = artH * nLinhas + gap * (nLinhas - 1)
    let y = (H - totalH) / 2
    linhas.forEach(lin => {
      const totalW = artH * lin.reduce((a, b) => a + b.r, 0) + gap * (lin.length - 1)
      let x = (W - totalW) / 2
      lin.forEach(({ r, i }) => {
        desenharQuadro(ctx, imgs[i], x, y, artH * r, artH, FRAME_THICK)
        x += artH * r + gap
      })
      y += artH + gap
    })
  }

  function desenharQuadro(ctx, img, artX, artY, artW, artH, FRAME_THICK) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.22)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 5
    ctx.fillStyle = fs.fill
    ctx.fillRect(artX - FRAME_THICK, artY - FRAME_THICK, artW + FRAME_THICK * 2, artH + FRAME_THICK * 2)
    ctx.restore()
    ctx.fillStyle = fs.fill
    ctx.fillRect(artX - FRAME_THICK, artY - FRAME_THICK, artW + FRAME_THICK * 2, artH + FRAME_THICK * 2)
    ctx.strokeStyle = fs.stroke
    ctx.lineWidth = 0.5
    ctx.strokeRect(artX - FRAME_THICK, artY - FRAME_THICK, artW + FRAME_THICK * 2, artH + FRAME_THICK * 2)
    ctx.drawImage(img, artX, artY, artW, artH)
  }

  useEffect(() => {
    imgCacheRef.current = null
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas || !lista.length) return
    let ro
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      Promise.all(lista.map(u => loadImg(u))).then(imgs => {
        imgCacheRef.current = imgs
        const W = wrap.offsetWidth || 320
        drawOn(canvas, imgs, W)
        ro = new ResizeObserver(([e]) => {
          const W2 = Math.round(e.contentRect.width)
          if (W2 > 0) drawOn(canvas, imgs, W2)
        })
        ro.observe(wrap)
      }).catch(() => {})
    }, { rootMargin: '300px' })
    io.observe(wrap)
    return () => { io.disconnect(); ro?.disconnect() }
  }, [chave])

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
    </div>
  )
}

// MockupCanvas: modo normal (interactive=false) ou interativo (drag + resize)
// tamanhoCm = { altura }: desenha o quadro no tamanho real em relação à parede (ambientes com paredeCm)
// onTamanhoChange(alturaCm): com tamanho real, puxar um canto muda o tamanho do pedido
export default function MockupCanvas({ imgUrl, kitUrls, ratio = 1, frameColor = 'branco', width = 600, room, interactive = false, slices = 1, tamanhoCm = null, onTamanhoChange = null, inline = false, aspect = null }) {
  const canvasRef = useRef()
  const roomCfg = room || ROOMS[0]

  const W = width
  const H = Math.round(W * roomCfg.h / roomCfg.w)

  // ── Modo normal (não interativo) ──────────────────────────────────────────
  useEffect(() => {
    if (interactive) return
    const canvas = canvasRef.current
    if (!canvas) return
    const urls = kitUrls?.length >= 1 ? kitUrls : (imgUrl ? [imgUrl] : [])
    if (!urls.length) return
    canvas.width = W
    canvas.height = H
    drawKitOnCanvas(canvas, urls, frameColor, roomCfg, false, slices, tamanhoCm).catch(() => {})
  }, [imgUrl, kitUrls, ratio, frameColor, W, H, roomCfg, interactive, slices, tamanhoCm?.altura])

  // ── Modo interativo ───────────────────────────────────────────────────────
  // cx, cy = centro do kit como fração do canvas; scale = fator de escala
  const zoneCenter = () => ({
    cx: (roomCfg.zone.left + roomCfg.zone.right) / 2,
    cy: (roomCfg.zone.top + roomCfg.zone.bottom) / 2,
    scale: 1.0,
  })
  const stateRef = useRef(zoneCenter())
  const loadedRef = useRef({ roomImg: null, artImgs: null, ratios: null })
  const dragRef = useRef(null)

  // Calcula layout do kit com base no estado atual
  const getLayout = () => {
    const { cx, cy, scale } = stateRef.current
    const { ratios } = loadedRef.current
    if (!ratios) return null
    const fs = FRAME_STYLES[frameColor] || FRAME_STYLES.branco
    const N = ratios.length
    const FRAME_ZONE = roomCfg.zone
    const zH = (FRAME_ZONE.bottom - FRAME_ZONE.top) * H
    const zW = (FRAME_ZONE.right - FRAME_ZONE.left) * W
    const escala = pxPorCm(roomCfg, zW, tamanhoCm)
    const gap = N > 1 ? Math.round(escala ? GAP_CM * escala : W * 0.03) : 0

    // tamanho real: altura fixa pelo pedido, sem redimensionar
    let fh = escala ? tamanhoCm.altura * escala : zH * 0.55 * scale
    let fws = ratios.map(r => fh * r)
    const totalW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
    if (!escala && totalW > zW * 0.9) {
      const sc = (zW * 0.9) / totalW
      fh *= sc; fws = fws.map(w => w * sc)
    }
    const pad = Math.max(2, Math.round(fh * PAD_RATIO))

    const kitW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
    const kitH = fh
    const kitX = cx * W - kitW / 2
    const kitY = cy * H - kitH / 2

    const frames = []
    let x = kitX
    for (let i = 0; i < N; i++) {
      frames.push({ fx: x, fy: kitY, fw: fws[i], fh })
      x += fws[i] + gap
    }
    return { frames, fs, pad, kitX, kitY, kitW, kitH }
  }

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas || !loadedRef.current.roomImg) return
    const ctx = canvas.getContext('2d')
    const { roomImg, artImgs } = loadedRef.current

    ctx.drawImage(roomImg, 0, 0, W, H)

    const layout = getLayout()
    if (!layout) return
    const { frames, fs, pad, kitX, kitY, kitW, kitH } = layout

    drawFrames(ctx, frames, artImgs, fs, pad, false)

    // Borda tracejada só aparece durante interação (drag ou resize)
    if (dragRef.current) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 5])
      ctx.strokeRect(kitX - pad - 4, kitY - pad - 4, kitW + (pad + 4) * 2, kitH + (pad + 4) * 2)
      ctx.restore()
    }
  }

  // Carrega assets quando entra no modo interativo ou muda imagem/room
  useEffect(() => {
    if (!interactive) return
    const urls = kitUrls?.length >= 1 ? kitUrls : (imgUrl ? [imgUrl] : [])
    if (!urls.length) return
    // Reset posição ao trocar imagem ou ambiente
    stateRef.current = zoneCenter()
    loadedRef.current = { roomImg: null, artImgs: null, ratios: null }

    // Só redimensiona o canvas quando o ambiente novo carregou: evita a tela em branco e o "pulo" da página
    Promise.all([
      loadRoomImg(roomCfg.src),
      Promise.all(urls.map(u => loadImg(u).catch(() => null))),
    ]).then(([roomImg, loaded]) => {
      const canvas = canvasRef.current
      if (canvas) { canvas.width = W; canvas.height = H }
      const artImgs = expandSlices(loaded, slices)
      loadedRef.current = { roomImg, artImgs, ratios: artImgs.map(artRatio) }
      redraw()
    })
  }, [imgUrl, JSON.stringify(kitUrls), roomCfg.id, interactive, W, H, slices])

  // Redesenha quando a cor da moldura ou o tamanho do pedido mudam
  useEffect(() => {
    if (!interactive || !loadedRef.current.roomImg) return
    redraw()
  }, [frameColor, tamanhoCm?.altura])

  // Converte evento de mouse/touch para coordenadas internas do canvas
  const getCanvasPt = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    if (crop) {
      // object-fit: cover — a imagem é escalada para cobrir e deslocada pelo object-position
      const k = Math.max(rect.width / W, rect.height / H)
      const offX = (rect.width - W * k) * crop.x
      const offY = (rect.height - H * k) * crop.y
      return { x: (src.clientX - rect.left - offX) / k, y: (src.clientY - rect.top - offY) / k }
    }
    const sx = W / rect.width
    const sy = H / rect.height
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy }
  }

  const handleDown = (e) => {
    if (!interactive) return
    e.preventDefault()
    const pt = getCanvasPt(e)
    const layout = getLayout()
    if (!layout) return

    const { pad, kitX, kitY, kitW, kitH } = layout
    const H_SIZE = 18  // hit area maior que o visual para facilitar toque

    // Detecta clique em handle de canto
    const corners = [
      [kitX - pad, kitY - pad],
      [kitX + kitW + pad, kitY - pad],
      [kitX - pad, kitY + kitH + pad],
      [kitX + kitW + pad, kitY + kitH + pad],
    ]
    const onCorner = corners.some(([cx, cy]) =>
      Math.abs(pt.x - cx) < H_SIZE && Math.abs(pt.y - cy) < H_SIZE
    )

    if (onCorner && tamanhoCm && onTamanhoChange) {
      const { cx, cy } = stateRef.current
      dragRef.current = { mode: 'resizeReal', startDist: Math.hypot(pt.x - cx * W, pt.y - cy * H), startAltura: tamanhoCm.altura }
    } else if (onCorner && !tamanhoCm) {
      const { cx, cy, scale } = stateRef.current
      const dist = Math.hypot(pt.x - cx * W, pt.y - cy * H)
      dragRef.current = { mode: 'resize', startDist: dist, startScale: scale }
    } else if (
      pt.x >= kitX - pad - 4 && pt.x <= kitX + kitW + pad + 4 &&
      pt.y >= kitY - pad - 4 && pt.y <= kitY + kitH + pad + 4
    ) {
      const { cx, cy } = stateRef.current
      dragRef.current = { mode: 'drag', startPt: pt, startCx: cx, startCy: cy }
    }
  }

  const handleMove = (e) => {
    if (!interactive || !dragRef.current) return
    e.preventDefault()
    const pt = getCanvasPt(e)
    const d = dragRef.current

    if (d.mode === 'drag') {
      stateRef.current.cx = Math.max(0.02, Math.min(0.98, d.startCx + (pt.x - d.startPt.x) / W))
      stateRef.current.cy = Math.max(0.02, Math.min(0.98, d.startCy + (pt.y - d.startPt.y) / H))
    } else if (d.mode === 'resizeReal') {
      const { cx, cy } = stateRef.current
      const dist = Math.hypot(pt.x - cx * W, pt.y - cy * H)
      const alt = Math.round(Math.max(10, Math.min(300, d.startAltura * dist / Math.max(1, d.startDist))))
      if (alt !== tamanhoCm?.altura) onTamanhoChange(alt)
      return // redesenha quando o novo tamanho volta pela prop
    } else if (d.mode === 'resize') {
      const { cx, cy } = stateRef.current
      const dist = Math.hypot(pt.x - cx * W, pt.y - cy * H)
      stateRef.current.scale = Math.max(0.25, Math.min(4.0, d.startScale * dist / Math.max(1, d.startDist)))
    }

    redraw()
  }

  const handleUp = () => { dragRef.current = null }

  // aspect: moldura fixa (ex.: 3/2) para todos os ambientes terem o mesmo tamanho na tela.
  // A foto é recortada (object-fit: cover) centrada na zona da parede, sem sair da imagem.
  const crop = (() => {
    if (!aspect) return null
    const z = roomCfg.zone, imgA = W / H
    const centro = (ini, fim, visivel) => {           // posição do recorte (0..1) para centrar a zona
      if (visivel >= 1) return 0.5
      const start = Math.min(Math.max((ini + fim) / 2 - visivel / 2, 0), 1 - visivel)
      return start / (1 - visivel)
    }
    return aspect < imgA
      ? { x: centro(z.left, z.right, aspect / imgA), y: 0.5 }
      : { x: 0.5, y: centro(z.top, z.bottom, imgA / aspect) }
  })()

  // inline: ocupa a largura da coluna (tela do pedido); senão cabe na tela (modal ampliado)
  const canvasStyle = {
    ...(inline
      ? { width: '100%', height: 'auto', aspectRatio: crop ? String(aspect) : `${W}/${H}`, borderRadius: 0, background: '#e9e6e0',
          ...(crop ? { objectFit: 'cover', objectPosition: `${crop.x * 100}% ${crop.y * 100}%` } : {}) }
      : { maxWidth: '100%', maxHeight: 'calc(100vh - 320px)', width: 'auto', height: 'auto', borderRadius: 8 }),
    display: 'block',
    margin: '0 auto',
    ...(interactive ? { cursor: 'grab', touchAction: 'none' } : {}),
  }

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={canvasStyle}
      {...(interactive ? {
        onMouseDown: handleDown,
        onMouseMove: handleMove,
        onMouseUp: handleUp,
        onMouseLeave: handleUp,
        onTouchStart: handleDown,
        onTouchMove: handleMove,
        onTouchEnd: handleUp,
      } : {})}
    />
  )
}
