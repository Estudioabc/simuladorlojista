import { useEffect, useRef, useState } from 'react'

// Foto da parede do cliente como ambiente do simulador. A foto fica só no aparelho (não sobe para o servidor).
// O lojista arrasta as pontas de uma régua sobre algo de medida conhecida (sofá, porta, azulejo) e digita a medida:
// daí sai a escala (px por cm) e o quadro aparece no tamanho real.

const LADO_MAX = 1600   // reduz a foto do celular para o canvas não pesar

// Lê o arquivo, corrige a orientação (createImageBitmap respeita o EXIF) e reduz
export async function lerFoto(arquivo) {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return { src: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height }
}

// Ambiente no formato de PEDIDO_ROOMS: a zona livre é o miolo da foto; paredeCm = largura real dessa zona
function salaDaFoto(foto, pxPorCm) {
  const zone = { top: 0.12, bottom: 0.7, left: 0.1, right: 0.9 }
  return {
    id: 'foto-' + Date.now(), label: 'Foto do cliente', foto: true,
    src: foto.src, w: foto.w, h: foto.h, zone,
    paredeCm: Math.round((zone.right - zone.left) * foto.w / pxPorCm),
    thumb: { top: 0, bottom: 1, left: 0, right: 1 },
  }
}

export default function FotoParede({ foto, onPronto, onCancelar, colors, fonts }) {
  // pontas da régua em fração da foto
  const [pts, setPts] = useState([{ x: 0.3, y: 0.62 }, { x: 0.7, y: 0.62 }])
  const [medida, setMedida] = useState('')
  const boxRef = useRef()
  const arrasto = useRef(null)

  useEffect(() => {
    const mover = (e) => {
      if (arrasto.current == null || !boxRef.current) return
      const p = e.touches ? e.touches[0] : e
      const r = boxRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (p.clientX - r.left) / r.width))
      const y = Math.max(0, Math.min(1, (p.clientY - r.top) / r.height))
      setPts(ps => ps.map((q, i) => i === arrasto.current ? { x, y } : q))
      if (e.cancelable) e.preventDefault()
    }
    const soltar = () => { arrasto.current = null }
    window.addEventListener('mousemove', mover)
    window.addEventListener('touchmove', mover, { passive: false })
    window.addEventListener('mouseup', soltar)
    window.addEventListener('touchend', soltar)
    return () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('touchmove', mover)
      window.removeEventListener('mouseup', soltar)
      window.removeEventListener('touchend', soltar)
    }
  }, [])

  const cm = parseFloat(String(medida).replace(',', '.'))
  const px = Math.hypot((pts[1].x - pts[0].x) * foto.w, (pts[1].y - pts[0].y) * foto.h)
  const ok = cm >= 5 && cm <= 2000 && px >= 20
  const usar = () => ok && onPronto(salaDaFoto(foto, px / cm))

  const ponta = (i) => ({
    position: 'absolute', left: `${pts[i].x * 100}%`, top: `${pts[i].y * 100}%`, width: 28, height: 28, marginLeft: -14, marginTop: -14,
    borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
    cursor: 'grab', touchAction: 'none',
  })

  return (
    <div role="dialog" aria-modal="true" aria-label="Medir a foto do cliente"
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,13,10,0.94)', zIndex: 1100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', padding: '20px 16px', overflowY: 'auto', color: '#fff', fontFamily: fonts.body }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        <div style={{ fontSize: 18, fontWeight: 600, fontFamily: fonts.display }}>Marque uma medida na foto</div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '6px 0 14px', lineHeight: 1.5 }}>
          Arraste as duas pontas da linha até as pontas de algo que você sabe quanto mede (a largura do sofá, uma porta, o aparador)
          e digite a medida. Assim o quadro aparece no tamanho real. A foto fica só neste aparelho.
        </p>
        <div ref={boxRef} style={{ position: 'relative', width: '100%', maxHeight: 'calc(100vh - 260px)', aspectRatio: `${foto.w} / ${foto.h}`, margin: '0 auto', maxWidth: `calc((100vh - 260px) * ${foto.w / foto.h})` }}>
          <img src={foto.src} alt="Foto da parede do cliente" style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} draggable={false} />
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#000" strokeOpacity="0.5" strokeWidth="4" vectorEffect="non-scaling-stroke" />
            <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          {[0, 1].map(i => (
            <div key={i} aria-label={`Ponta ${i + 1} da medida`} style={ponta(i)}
              onMouseDown={e => { e.preventDefault(); arrasto.current = i }} onTouchStart={() => { arrasto.current = i }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            A linha mede
            <input inputMode="decimal" value={medida} onChange={e => setMedida(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="ex.: 200" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') usar() }}
              style={{ width: 90, padding: '9px 10px', fontSize: 15, borderRadius: 2, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: fonts.body }} />
            cm
          </label>
          <div style={{ flex: 1 }} />
          <button onClick={onCancelar}
            style={{ background: 'none', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
            Cancelar
          </button>
          <button onClick={usar} disabled={!ok}
            style={{ background: ok ? '#fff' : 'rgba(255,255,255,0.3)', color: '#14130f', border: 'none', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: ok ? 'pointer' : 'default', fontFamily: fonts.body }}>
            Usar a foto
          </button>
        </div>
      </div>
    </div>
  )
}
