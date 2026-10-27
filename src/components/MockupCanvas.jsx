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
export const GAP_CM = 5  // espaço real entre quadros de uma composição (de moldura a moldura)
// largura real da face da moldura, igual em qualquer tamanho de quadro: canaleta do canvas ≈ 1,2 cm, caixa do papel ≈ 2 cm;
// sem acabamento escolhido (e no card do acervo), o meio-termo
export const MOLDURA_CM = 1.5
export const MOLDURA_CM_ACABAMENTO = { canvas: 1.2, convencional: 2 }

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

// Tamanho padrão com obra fora da proporção: o quadro tem a proporção pedida e a obra é cortada no centro
function cortarProporcao(artImgs, alvo) {
  const img = artImgs.length === 1 ? artImgs[0] : null
  if (!img || img.img || !(alvo > 0)) return artImgs
  return [cortarImg(img, alvo)]
}
function cortarImg(img, alvo) {
  const iw = img?.naturalWidth, ih = img?.naturalHeight
  if (!(iw > 0 && ih > 0) || Math.abs(iw / ih - alvo) / alvo < 0.01) return img
  const sw = Math.min(iw, ih * alvo), sh = Math.min(ih, iw / alvo)
  return { img, sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh }
}
// Composição no tamanho padrão: cada peça cortada no centro para a proporção do tamanho (cortePecas = largura/altura)
const cortarObra = (imgs, proporcao, cortePecas) => cortePecas > 0 ? imgs.map(i => cortarImg(i, cortePecas)) : cortarProporcao(imgs, proporcao)

function artRatio(a) {
  if (!a) return 1
  if (a.img) return a.sw / a.sh
  return a.naturalWidth / a.naturalHeight
}

async function drawKitOnCanvas(canvas, kitUrls, frameColor, room, thumbMode = false, slices = 1, tamanhoCm = null, proporcao = null, cortePecas = null, molduraCm = MOLDURA_CM) {
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

  const lidas = await Promise.all(kitUrls.map(u => loadImg(u).catch(() => null)))
  const artImgs = slices > 1 ? expandSlices(lidas, slices) : cortarObra(lidas, proporcao, cortePecas)
  const ratios = artImgs.map(artRatio)
  const N = artImgs.length
  const escala = thumbMode ? null : pxPorCm(room, zW, tamanhoCm)
  const gap = N > 1 ? Math.round(escala ? (GAP_CM + 2 * molduraCm) * escala : W * 0.03) : 0  // a moldura é desenhada por fora da arte

  let fh = escala ? tamanhoCm.altura * escala : zH * 0.55
  let fws = ratios.map(r => fh * r)
  const totalW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
  if (!escala && totalW > zW * 0.75) {
    const scale = (zW * 0.75) / totalW
    fh *= scale
    fws = fws.map(w => w * scale)
  }
  const pad = thumbMode ? 2 : Math.max(2, Math.round(escala ? molduraCm * escala : fh * PAD_RATIO))

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

// Mockup do card do acervo: o QUADRO é o protagonista, grande na parede como na Artspot.
// Ambientes próprios do card (gerados com parede alta e móveis baixos, formato do card). Calibração em fração da foto:
// top/bottom = faixa livre da parede (bottom = topo do móvel), cx = centro horizontal da parede livre.
export const CARD_ROOMS = {
  vertical: [
    { src: '/card_v_aparador.jpg', top: 0.13, bottom: 0.68, cx: 0.49 },
    { src: '/card_v_banco.jpg', top: 0.04, bottom: 0.74, cx: 0.45 },
    { src: '/card_v_corredor.jpg', top: 0.09, bottom: 0.73, cx: 0.50 },
    { src: '/card_v_poltrona.jpg', top: 0.05, bottom: 0.78, cx: 0.60 },
    { src: '/card_v_quarto.jpg', top: 0.04, bottom: 0.80, cx: 0.48 },
    { src: '/card_v_sala_bege.jpg', top: 0.04, bottom: 0.72, cx: 0.49 },
    { src: '/card_v_lavabo.jpg', top: 0.0, bottom: 0.68, cx: 0.50 },
    { src: '/card_v_hall.jpg', top: 0.075, bottom: 0.68, cx: 0.45 },
    // corporativos (bar, restaurante, descompressão, reunião, recepção): servem para obra vertical e horizontal
    { src: '/card_c_bar.jpg', top: 0.05, bottom: 0.60, cx: 0.50 },
    { src: '/card_c_restaurante.jpg', top: 0.12, bottom: 0.64, cx: 0.50 },
    { src: '/card_c_descompressao.jpg', top: 0.14, bottom: 0.64, cx: 0.50 },
    { src: '/card_c_reuniao.jpg', top: 0.05, bottom: 0.60, cx: 0.50 },
    { src: '/card_c_recepcao.jpg', top: 0.06, bottom: 0.58, cx: 0.50 },
  ],
  horizontal: [
    { src: '/card_h_aparador.jpg', top: 0.06, bottom: 0.76, cx: 0.50 },
    { src: '/card_h_cama.jpg', top: 0.06, bottom: 0.67, cx: 0.49 },
    { src: '/card_h_sofa_curvo.jpg', top: 0.06, bottom: 0.71, cx: 0.51 },
    { src: '/card_h_varanda.jpg', top: 0.09, bottom: 0.69, cx: 0.46 },
    { src: '/card_h_cozinha.jpg', top: 0.30, bottom: 0.68, cx: 0.51, livreDe: 0.30 },   // abaixo do pendente (subido na foto)
    { src: '/card_h_recepcao.jpg', top: 0.0, bottom: 0.69, cx: 0.50 },
    { src: '/card_h_consultorio.jpg', top: 0.0, bottom: 0.72, cx: 0.50 },
    { src: '/card_h_hall_predio.jpg', top: 0.08, bottom: 0.83, cx: 0.52 },
    // corporativos (bar, restaurante, descompressão, reunião, recepção): servem para obra vertical e horizontal
    { src: '/card_c_bar.jpg', top: 0.05, bottom: 0.60, cx: 0.50 },
    { src: '/card_c_restaurante.jpg', top: 0.12, bottom: 0.64, cx: 0.50 },
    { src: '/card_c_descompressao.jpg', top: 0.14, bottom: 0.64, cx: 0.50 },
    { src: '/card_c_reuniao.jpg', top: 0.05, bottom: 0.60, cx: 0.50 },
    { src: '/card_c_recepcao.jpg', top: 0.06, bottom: 0.58, cx: 0.50 },
  ],
}

// Salas do pedido = as mesmas do card, no formato de ROOMS (zone + paredeCm para o tamanho real).
// Escala pelo pé-direito: do piso ao teto = 270 cm (Pedro: 250 a 280 cm), medido em cada foto (teto/piso = fração da
// altura; teto fora da foto = valor fora de 0..1). fotoCm = largura real da foto inteira = 270 × 1088 / altura da parede em px,
// ou fixo quando teto e piso não aparecem (lavabo).
// Assim o quadro nunca passa do teto. (Antes a escala vinha do móvel e dava pé-direito de 2,00 a 2,34 m.)
const PE_DIREITO_CM = 270
const CARD_INFO = {
  '/card_v_aparador.jpg': { id: 'v-aparador', label: 'Aparador', teto: 0.095, piso: 0.90 },
  '/card_v_banco.jpg': { id: 'v-banco', label: 'Banco', teto: 0.09, piso: 0.915 },
  '/card_v_corredor.jpg': { id: 'v-corredor', label: 'Corredor', teto: 0.045, piso: 0.925 },
  '/card_v_poltrona.jpg': { id: 'v-poltrona', label: 'Poltrona', teto: 0.07, piso: 0.895 },
  '/card_v_quarto.jpg': { id: 'v-quarto', label: 'Quarto', teto: 0.07, piso: 0.955 },
  '/card_v_sala_bege.jpg': { id: 'v-sala', label: 'Sala', teto: 0.04, piso: 0.955 },
  '/card_h_aparador.jpg': { id: 'h-aparador', label: 'Aparador', teto: 0.08, piso: 0.94 },
  '/card_h_cama.jpg': { id: 'h-cama', label: 'Quarto', teto: 0.11, piso: 0.95 },
  '/card_h_sofa_curvo.jpg': { id: 'h-sofa-curvo', label: 'Sofá curvo', teto: 0.10, piso: 0.95 },
  // out/2026: cômodos e corporativos (recortes dos ambientes do site, mesma calibração pelo pé-direito)
  '/card_v_lavabo.jpg': { id: 'v-lavabo', label: 'Lavabo', fotoCm: 158, maxCm: 65 },   // parede pequena: no card, até 65 cm          // teto e piso fora da foto: escala pela cuba
  '/card_v_hall.jpg': { id: 'v-hall', label: 'Hall de entrada', teto: 0.055, piso: 0.945 },
  '/card_h_varanda.jpg': { id: 'h-varanda', label: 'Varanda gourmet', teto: 0.07, piso: 0.931 },
  '/card_h_cozinha.jpg': { id: 'h-cozinha', label: 'Cozinha', teto: 0.141, piso: 0.859 },
  '/card_h_recepcao.jpg': { id: 'h-recepcao', label: 'Recepção', teto: -0.028, piso: 1.028, peDireito: 400, grande: true },  // pé-direito alto: parede pede quadro maior
  '/card_h_consultorio.jpg': { id: 'h-consultorio', label: 'Consultório', teto: -0.018, piso: 1.018 },
  '/card_h_hall_predio.jpg': { id: 'h-hall-predio', label: 'Hall do prédio', teto: 0.059, piso: 0.942 },
  '/card_c_bar.jpg': { id: 'c-bar', label: 'Bar', teto: 0.03, piso: 0.90 },
  '/card_c_restaurante.jpg': { id: 'c-restaurante', label: 'Restaurante', teto: 0.10, piso: 0.88 },
  '/card_c_descompressao.jpg': { id: 'c-descompressao', label: 'Descompressão', teto: 0.12, piso: 0.80 },
  '/card_c_reuniao.jpg': { id: 'c-reuniao', label: 'Sala de reunião', teto: 0.03, piso: 0.80 },
  '/card_c_recepcao.jpg': { id: 'c-recepcao', label: 'Recepção corporativa', teto: 0.04, piso: 0.85 },
}
const FOLGA_TETO_CM = 5   // o quadro (com moldura) para pelo menos 5 cm abaixo do teto
// largura real (cm) da foto inteira da sala; peDireito próprio quando a sala é de pé-direito duplo
function fotoCmDe(src) {
  const { teto, piso, fotoCm, peDireito = PE_DIREITO_CM } = CARD_INFO[src]
  return fotoCm ?? peDireito * 1088 / ((piso - teto) * 1024)
}
function salaDoPedido(c) {
  const { teto, piso, fotoCm: _f, peDireito: _p, ...info } = CARD_INFO[c.src]
  const w = 1088, h = 1024
  const fotoCm = fotoCmDe(c.src)
  // parede livre começa abaixo do teto (com folga); livreDe empurra mais para baixo (ex.: abaixo do pendente)
  const top = Math.max(c.livreDe ?? 0, teto != null ? teto + FOLGA_TETO_CM * (w / fotoCm) / h : c.top)
  const left = Math.max(0.06, c.cx - 0.42), right = Math.min(0.94, c.cx + 0.42)
  return { ...info, src: c.src, w, h, zone: { top, bottom: c.bottom, left, right },
    paredeCm: Math.round((right - left) * fotoCm), thumb: { top: 0, bottom: 1, left: 0, right: 1 } }
}
export const PEDIDO_ROOMS = {
  vertical: CARD_ROOMS.vertical.map(salaDoPedido),
  horizontal: CARD_ROOMS.horizontal.map(salaDoPedido),
}
// O quadro (com moldura) cabe na parede livre da sala no tamanho real? Parede livre = entre o móvel e o teto (menos a folga).
export function cabeNaSala(room, alturaCm, larguraCm) {
  if (!room?.paredeCm || !(alturaCm > 0)) return true
  const z = room.zone, cmPorPx = room.paredeCm / ((z.right - z.left) * room.w)
  return alturaCm + 2 * MOLDURA_CM <= (z.bottom - z.top) * room.h * cmPorPx && !(larguraCm + 2 * MOLDURA_CM > room.paredeCm)
}
// Mesma escolha do card: orientação pelo conjunto e sala pelo hash da obra
export function orientacaoDe(ratios) {
  return ratios.reduce((a, b) => a + b, 0) + (ratios.length > 1 ? 0.06 * (ratios.length - 1) : 0) <= 1.05 ? 'vertical' : 'horizontal'
}
export function salaDaObra(chave, orientacao) {
  const lista = PEDIDO_ROOMS[orientacao]
  return lista[hashStr(chave || '') % lista.length]
}

export function CardMockup({ urls, chave = '', frameColor = null, aspect = 0.95 }) {
  const wrapRef = useRef()
  const canvasRef = useRef()
  const lista = urls?.length ? urls : []

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas || !lista.length) return
    let vivo = true
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      desenhar()
    }, { rootMargin: '300px' })
    io.observe(wrap)
    const desenhar = () => Promise.all(lista.map(u => loadImg(u))).then(async arts => {
      const ratios = arts.map(a => a.naturalWidth / a.naturalHeight)
      const N = arts.length
      const gapRel = N > 1 ? 0.06 : 0   // só para decidir a orientação; o vão de verdade é em cm, mais abaixo
      const grupoAsp = ratios.reduce((a, b) => a + b, 0) + gapRel * (N - 1)
      const vertical = grupoAsp <= 1.05
      const salas = vertical ? CARD_ROOMS.vertical : CARD_ROOMS.horizontal
      const sala = salas[hashStr(chave || lista[0]) % salas.length] // mesma regra de salaDaObra()
      const roomImg = await loadRoomImg(sala.src)
      if (!vivo) return
      const W = Math.max(320, Math.round((wrap.offsetWidth || 320) * 2)), H = Math.round(W * aspect)
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      // foto do ambiente cobrindo o card (o formato já é quase o mesmo)
      const rA = roomImg.naturalWidth / roomImg.naturalHeight, cA = W / H
      const dw = rA > cA ? H * rA : W, dh = rA > cA ? H : W / rA
      const ox = (W - dw) / 2, oy = (H - dh) / 2
      // faixa livre da parede no card
      const topo = oy + sala.top * dh, base = oy + sala.bottom * dh
      const livreH = base - topo
      // quadro grande: vertical ≈ 88% da parede livre (máx. 62% da largura); horizontal até 74% da largura
      const gGrande = vertical ? Math.min(livreH * 0.88, (W * 0.62) / grupoAsp) : Math.min(livreH * 0.80, (W * 0.74) / grupoAsp)
      // ...mas do tamanho de um quadro comum de verdade na escala da sala (até 150 cm de altura no vertical, 110 cm no
      // horizontal, 200 cm de largura do conjunto). Para o quadro seguir protagonista, a câmera chega mais perto (zoom).
      // (sala de parede grande: até 180 / 130 / 220 cm; sala pequena tem maxCm; o vertical comum vai até 150 cm)
      const pxCm = dw / fotoCmDe(sala.src)
      const info = CARD_INFO[sala.src] || {}
      const lim = info.grande ? [180, 130, 220] : info.maxCm ? [info.maxCm, info.maxCm, info.maxCm] : [150, 110, 200]
      const gap = N > 1 ? (GAP_CM + 2 * MOLDURA_CM) * pxCm : 0   // vão real entre as peças (a moldura fica por fora)
      const somaR = ratios.reduce((a, b) => a + b, 0)
      const gH = Math.min(gGrande, (vertical ? lim[0] : lim[1]) * pxCm, (lim[2] * pxCm - gap * (N - 1)) / somaR)
      const gW = gH * somaR + gap * (N - 1)
      const zoom = Math.max(1.12, Math.min(gGrande / gH, 1.3))
      const gy = base - Math.max(livreH * 0.06, (livreH - gH) * 0.5) - gH  // centrado na parede livre (no mínimo 6% acima do móvel)
      let x = W / 2 - gW / 2   // card: quadro sempre no centro
      const frames = []
      ratios.forEach(r => { frames.push({ fx: x, fy: gy, fw: gH * r, fh: gH }); x += gH * r + gap })
      // zoom em volta do quadro, que fica no centro do card; a foto sempre cobre o card (sem borda vazia)
      const py = (gy + gH / 2 + base) / 2   // mira entre o quadro e o móvel: os dois aparecem
      const tx = Math.min(-ox * zoom, Math.max(W - (ox + dw) * zoom, W / 2 - (W / 2) * zoom))
      // sem cortar o quadro: o topo dele fica pelo menos 4% abaixo da borda do card
      const ty = Math.min(-oy * zoom, Math.max(H - (oy + dh) * zoom, py - py * zoom, H * 0.04 - (gy - 3 * pxCm) * zoom))
      ctx.setTransform(zoom, 0, 0, zoom, tx, ty)
      ctx.drawImage(roomImg, ox, oy, dw, dh)
      // mesma moldura da miniatura do card (preta, branca ou madeira, escolhida pela obra)
      const fs = frameColor ? FRAME_STYLES[frameColor] : { ...GRID_FRAME_PALETTE[hashStr(lista[0]) % 3], inner: 'rgba(0,0,0,0.06)' }
      // card: perfil fino (1 cm), para o quadro pequeno (lavabo) não parecer de moldura grossa
      drawFrames(ctx, frames, arts, fs, Math.max(2, Math.round(1 * pxCm)), false)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }).catch(() => {})
    return () => { vivo = false; io.disconnect() }
  }, [lista.join('|'), chave, frameColor, aspect])

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
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
export default function MockupCanvas({ imgUrl, kitUrls, ratio = 1, frameColor = 'branco', width = 600, room, interactive = false, slices = 1, tamanhoCm = null, onTamanhoChange = null, inline = false, aspect = null, cortePecas = null, molduraCm = MOLDURA_CM }) {
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
    drawKitOnCanvas(canvas, urls, frameColor, roomCfg, false, slices, tamanhoCm, ratio, cortePecas, molduraCm).catch(() => {})
  }, [imgUrl, kitUrls, ratio, frameColor, W, H, roomCfg, interactive, slices, tamanhoCm?.altura, cortePecas, molduraCm])

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
    const gap = N > 1 ? Math.round(escala ? (GAP_CM + 2 * molduraCm) * escala : W * 0.03) : 0  // a moldura é desenhada por fora da arte

    // tamanho real: altura fixa pelo pedido, sem redimensionar
    let fh = escala ? tamanhoCm.altura * escala : zH * 0.55 * scale
    let fws = ratios.map(r => fh * r)
    const totalW = fws.reduce((s, w) => s + w, 0) + gap * (N - 1)
    if (!escala && totalW > zW * 0.9) {
      const sc = (zW * 0.9) / totalW
      fh *= sc; fws = fws.map(w => w * sc)
    }
    const pad = Math.max(2, Math.round(escala ? molduraCm * escala : fh * PAD_RATIO))

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
      const artImgs = slices > 1 ? expandSlices(loaded, slices) : cortarObra(loaded, ratio, cortePecas)
      loadedRef.current = { roomImg, artImgs, ratios: artImgs.map(artRatio) }
      redraw()
    })
  }, [imgUrl, JSON.stringify(kitUrls), roomCfg.id, interactive, W, H, slices, ratio, cortePecas])

  // Redesenha quando a cor ou a espessura da moldura ou o tamanho do pedido mudam
  useEffect(() => {
    if (!interactive || !loadedRef.current.roomImg) return
    redraw()
  }, [frameColor, tamanhoCm?.altura, molduraCm])

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
