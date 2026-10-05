import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, useIsMobile } from '../styles/theme'
import { Spinner, EmptyState } from '../components/UI'
import MockupCanvas, { KitThumb, FramedArtThumb, ROOMS } from '../components/MockupCanvas'

const PAGE_SIZE = 48

const FRAME_COLORS = [
  { id: 'branco', label: 'Branco', swatch: '#f8f6f3', border: '#ccc' },
  { id: 'preto', label: 'Preto', swatch: '#1a1a1a', border: '#000' },
  { id: 'madeira', label: 'Madeira', swatch: '#8B5E3C', border: '#6b4828' },
]

function detectImageRatio(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight)
    img.onerror = () => resolve(1)
    img.src = url
  })
}

const FORMATOS = [
  { id: '', label: 'Todos' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'quadrado', label: 'Quadrado' },
]

function formatoDe(ratio) {
  const r = parseFloat(ratio)
  if (!r || r <= 0) return null
  if (r < 0.9) return 'vertical'
  if (r > 1.1) return 'horizontal'
  return 'quadrado'
}

function lerFavoritos(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
}

function extractKitParte(titulo) {
  // Retorna { kitName, parte } para qualquer parte >= 0
  let m = titulo.match(/^(.+?)\s+Parte\s+(\d+)$/i)
  if (m) return { kitName: m[1].trim(), parte: parseInt(m[2]) }
  m = titulo.match(/^(.+?)\s*\((\d+)\)$/)
  if (m) return { kitName: m[1].trim(), parte: parseInt(m[2]) }
  return null
}

// Detecta kits: agrupa imagens com "Parte N" ou "(N)" no título
// (0) = capa do kit; (1+) = partes reais
// Retorna { kitOf, coverOf }
function buildKitMap(imagens) {
  const groups = {}  // kitName → { cover: img|null, parts: [] }
  imagens.forEach(img => {
    const info = extractKitParte(img.titulo)
    if (!info) return
    if (!groups[info.kitName]) groups[info.kitName] = { cover: null, parts: [] }
    if (info.parte === 0) groups[info.kitName].cover = img
    else groups[info.kitName].parts.push({ ...img, _parteNum: info.parte })
  })
  const kitOf = {}   // imageId (parte>=1) → { kitName, parts, kitCount, cover }
  const coverOf = {} // imageId (parte=0)  → kitName (para ocultar do grid)
  Object.entries(groups).forEach(([kitName, { cover, parts }]) => {
    if (parts.length < 2) return
    const sorted = [...parts].sort((a, b) => a._parteNum - b._parteNum)
    const kitInfo = { kitName, parts: sorted, kitCount: sorted.length, cover: cover ?? null }
    sorted.forEach(p => { kitOf[p.id] = kitInfo })
    if (cover) coverOf[cover.id] = kitName
  })
  return { kitOf, coverOf }
}

export default function BancoImagensPage({ onSelectImagem }) {
  const { profile } = useAuth()
  const { colors, fonts } = useTheme()
  const isMobile = useIsMobile()
  const [imagens, setImagens] = useState([])
  const [categorias, setCategorias] = useState([])
  const [catAtiva, setCatAtiva] = useState('todas')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)
  const [previewMode, setPreviewMode] = useState('arte')
  const [frameColor, setFrameColor] = useState('preto')
  const [selectedRoom, setSelectedRoom] = useState(ROOMS[0])
  const [hoveredId, setHoveredId] = useState(null)
  const [visiveis, setVisiveis] = useState(PAGE_SIZE)
  const [kitOf, setKitOf] = useState({})
  const [coverOf, setCoverOf] = useState({})
  const [formato, setFormato] = useState('')
  const [soFavoritos, setSoFavoritos] = useState(false)
  const favKey = `favoritos:${profile?.id}`
  const [favoritos, setFavoritos] = useState(() => lerFavoritos(favKey))

  const toggleFavorito = (key) => {
    setFavoritos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      try { localStorage.setItem(favKey, JSON.stringify([...next])) } catch { /* sem storage */ }
      return next
    })
  }

  useEffect(() => {
    const fetchAll = async () => {
      const PAGE = 1000
      let all = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('catalogo_imagens')
          .select('id, titulo, categoria, img_url, sizes, ratio')
          .eq('tenant_id', profile.tenant_id)
          .eq('ativo', true)
          .order('categoria')
          .order('titulo')
          .range(from, from + PAGE - 1)
        if (error || !data?.length) break
        all = all.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }
      setImagens(all)
      const { kitOf: ko, coverOf: co } = buildKitMap(all)
      setKitOf(ko)
      setCoverOf(co)
      setCategorias([...new Set(all.map(i => i.categoria).filter(Boolean))])
      setLoading(false)
    }
    fetchAll()
  }, [])

  useEffect(() => { setVisiveis(PAGE_SIZE) }, [catAtiva, busca, formato, soFavoritos])

  useEffect(() => {
    if (!preview) return
    const onKey = (e) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  const cardKeyOf = (img) => kitOf[img.id] ? `kit-${kitOf[img.id].kitName}` : img.id

  const filtradas = imagens.filter(img => {
    if (coverOf[img.id]) return false
    const matchCat = catAtiva === 'todas' || img.categoria === catAtiva
    const matchBusca = !busca || img.titulo.toLowerCase().includes(busca.toLowerCase())
    const matchFormato = !formato || formatoDe(img.ratio) === formato
    const matchFav = !soFavoritos || favoritos.has(cardKeyOf(img))
    return matchCat && matchBusca && matchFormato && matchFav
  })

  // Colapsa kits em um único card
  const cards = useMemo(() => {
    const seen = new Set()
    const out = []
    filtradas.forEach(img => {
      const kit = kitOf[img.id]
      if (kit) {
        if (seen.has(kit.kitName)) return
        seen.add(kit.kitName)
        out.push({ key: `kit-${kit.kitName}`, isKit: true, kit, img: kit.parts[0] })
      } else {
        out.push({ key: img.id, isKit: false, img })
      }
    })
    return out
  }, [filtradas, kitOf])

  const exibidos = cards.slice(0, visiveis)
  const temMais = visiveis < cards.length
  const contaCat = (cat) => imagens.filter(i => !coverOf[i.id] && i.categoria === cat).length

  async function montarSelecao(img) {
    let ratio = parseFloat(img.ratio)
    if (!ratio || ratio <= 0) {
      ratio = await detectImageRatio(img.img_url)
    }
    const kit = kitOf[img.id]
    const coverImg = kit?.cover ?? null
    return {
      ...img,
      titulo: kit ? kit.kitName : img.titulo,
      img_url: coverImg ? coverImg.img_url : img.img_url,
      ratio: coverImg ? (parseFloat(coverImg.ratio) || ratio) : ratio,
      kitParts: kit?.parts ?? null,
      kitCount: kit?.kitCount ?? 1,
    }
  }

  async function openPreview(img) {
    setPreview(await montarSelecao(img))
    setPreviewMode('arte')
  }

  async function usarNoSimulador(img) {
    onSelectImagem(await montarSelecao(img))
  }

  const limparFiltros = () => { setBusca(''); setFormato(''); setSoFavoritos(false); setCatAtiva('todas') }
  const temFiltro = busca || formato || soFavoritos || catAtiva !== 'todas'

  const S = {
    eyebrow: { fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 },
    title: { fontFamily: fonts.display, fontSize: 'clamp(28px, 3.9vw, 41px)', fontWeight: 600, lineHeight: 1.02, letterSpacing: -1, margin: '6px 0 10px', textWrap: 'balance' },
    lead: { fontSize: 15, color: colors.textMuted, maxWidth: 560, lineHeight: 1.55 },
    toolbar: { position: isMobile ? 'static' : 'sticky', top: 72, zIndex: 20, background: colors.bg, padding: '14px 0 0', margin: '28px 0 8px', borderBottom: `1px solid ${colors.border}` },
    toolRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
    search: { flex: '1 1 240px', minWidth: 0, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '11px 18px', fontSize: 14, outline: 'none' },
    seg: { display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 999, background: colors.surface, padding: 3 },
    segBtn: (on) => ({ background: on ? colors.text : 'transparent', color: on ? colors.bg : colors.textMuted, border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }),
    favToggle: (on) => ({ background: on ? colors.text : colors.surface, color: on ? colors.bg : colors.text, border: `1px solid ${on ? colors.text : colors.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }),
    cats: { display: 'flex', gap: 24, overflowX: 'auto', scrollbarWidth: 'none' },
    catBtn: (on) => ({ flexShrink: 0, background: 'none', border: 'none', borderBottom: `2px solid ${on ? colors.text : 'transparent'}`, color: on ? colors.text : colors.textMuted, padding: '8px 0 10px', fontSize: 14, fontWeight: on ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -1 }),
    catCount: { fontSize: 11, color: colors.textMuted, marginLeft: 5, fontVariantNumeric: 'tabular-nums' },
    meta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13, color: colors.textMuted, margin: '18px 0 22px' },
    linkBtn: { background: 'none', border: 'none', color: colors.text, fontSize: 13, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', padding: 0 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, max(240px, calc((100% - 64px) / 3))), 1fr))', gap: '40px 32px' },
    card: { cursor: 'pointer', position: 'relative' },
    wall: (hovered) => ({ position: 'relative', background: '#F7F5F2', transition: 'box-shadow 0.25s', boxShadow: hovered ? '0 18px 40px -24px rgba(23,21,15,0.35)' : 'none' }),
    cardTitle: { fontFamily: fonts.display, fontSize: 16, fontWeight: 600, lineHeight: 1.15, marginTop: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cardMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 },
    cardCat: { fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 },
    usar: { background: 'none', border: 'none', color: colors.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', whiteSpace: 'nowrap' },
    fav: (on, show) => ({ position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.94)', color: on ? '#B4312A' : colors.text, fontSize: 17, lineHeight: 1, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', opacity: on || show ? 1 : 0, transition: 'opacity 0.2s' }),
    kitTag: { position: 'absolute', top: 12, left: 12, background: colors.text, color: colors.bg, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '4px 8px' },
    mais: { display: 'block', margin: '48px auto 0', background: 'transparent', border: `1px solid ${colors.text}`, borderRadius: 999, padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    // preview — "sala de exibição"
    overlay: { position: 'fixed', inset: 0, background: 'rgba(14,13,10,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px 16px', overflowY: 'auto' },
    pTabs: { display: 'flex', gap: 24, borderBottom: '1px solid rgba(255,255,255,0.15)' },
    pTab: (on) => ({ background: 'none', border: 'none', borderBottom: `2px solid ${on ? '#fff' : 'transparent'}`, color: on ? '#fff' : 'rgba(255,255,255,0.55)', padding: '8px 2px 10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: -1 }),
    pLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' },
    previewImg: { maxWidth: '100%', maxHeight: 'calc(100vh - 220px)', objectFit: 'contain', display: 'block', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6)' },
    caption: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginTop: 20, width: '100%', maxWidth: 900 },
    pTitle: { fontFamily: fonts.display, color: '#fff', fontSize: 23, fontWeight: 600, lineHeight: 1.1 },
    pCat: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 6 },
    btnPrimary: { background: '#fff', color: colors.text, border: 'none', borderRadius: 999, padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
    btnGhost: { background: 'transparent', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  }

  if (loading) return <Spinner label="Abrindo o acervo..." />

  return (
    <div>
      <div style={S.eyebrow}>Acervo</div>
      <h1 style={S.title}>Obras para a parede do seu cliente</h1>
      <p style={S.lead}>Busque por tema, formato ou nome. Abra uma obra para vê-la num ambiente, ou leve direto para um novo pedido.</p>

      <div style={S.toolbar}>
        <div style={S.toolRow}>
          <input
            style={S.search}
            type="search"
            placeholder="Buscar obra pelo nome"
            aria-label="Buscar obra pelo nome"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          <div style={S.seg} role="group" aria-label="Formato">
            {FORMATOS.map(f => (
              <button key={f.id} onClick={() => setFormato(f.id)} style={S.segBtn(formato === f.id)} aria-pressed={formato === f.id}>{f.label}</button>
            ))}
          </div>
          <button onClick={() => setSoFavoritos(v => !v)} style={S.favToggle(soFavoritos)} aria-pressed={soFavoritos}>
            ♥ Favoritos{favoritos.size > 0 ? ` (${favoritos.size})` : ''}
          </button>
        </div>
        <div style={S.cats} role="tablist" aria-label="Temas">
          <button role="tab" aria-selected={catAtiva === 'todas'} style={S.catBtn(catAtiva === 'todas')} onClick={() => setCatAtiva('todas')}>
            Todas
          </button>
          {categorias.map(c => (
            <button key={c} role="tab" aria-selected={catAtiva === c} style={S.catBtn(catAtiva === c)} onClick={() => setCatAtiva(c)}>
              {c}<span style={S.catCount}>{contaCat(c)}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={S.meta}>
        <span>{cards.length} {cards.length === 1 ? 'obra' : 'obras'}{catAtiva !== 'todas' ? ` em ${catAtiva}` : ''}</span>
        {temFiltro && <button style={S.linkBtn} onClick={limparFiltros}>Limpar filtros</button>}
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title={soFavoritos && favoritos.size === 0 ? 'Você ainda não favoritou nenhuma obra' : 'Nenhuma obra encontrada'}
          description={soFavoritos && favoritos.size === 0 ? 'Toque no coração de uma obra para guardá-la aqui.' : 'Tente outro nome, formato ou tema.'}
          action="Limpar filtros"
          onAction={limparFiltros}
        />
      ) : (
        <>
          <div style={S.grid}>
            {exibidos.map(({ key, img, isKit, kit }) => {
              const title = isKit ? kit.kitName : img.titulo
              const hovered = hoveredId === key
              const fav = favoritos.has(key)
              return (
                <article
                  key={key}
                  style={S.card}
                  onMouseEnter={() => setHoveredId(key)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => openPreview(img)}
                >
                  <div style={S.wall(hovered)}>
                    {isKit
                      ? <KitThumb kitUrls={kit.parts.map(p => p.img_url)} frameColor="preto" cardWidth={360} />
                      : <FramedArtThumb src={img.img_url} alt={title} />
                    }
                    <button
                      onClick={e => { e.stopPropagation(); toggleFavorito(key) }}
                      aria-label={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      aria-pressed={fav}
                      style={S.fav(fav, hovered)}
                    >
                      {fav ? '♥' : '♡'}
                    </button>
                    {isKit && <span style={S.kitTag}>Kit · {kit.kitCount} peças</span>}
                  </div>
                  <div style={S.cardTitle} title={title}>{title}</div>
                  <div style={S.cardMeta}>
                    <span style={S.cardCat}>{img.categoria}</span>
                    {onSelectImagem && (
                      <button style={S.usar} onClick={e => { e.stopPropagation(); usarNoSimulador(img) }}>
                        Usar no pedido →
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
          {temMais && (
            <button style={S.mais} onClick={() => setVisiveis(v => v + PAGE_SIZE)}>
              Ver mais obras ({cards.length - visiveis})
            </button>
          )}
        </>
      )}

      {preview && (
        <div style={S.overlay} onClick={() => setPreview(null)} role="dialog" aria-modal="true" aria-label={preview.titulo}>
          <div style={{ width: '100%', maxWidth: previewMode === 'ambiente' ? 1100 : 960, display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, width: '100%', marginBottom: 18 }}>
              <div style={S.pTabs} role="tablist">
                {[{ id: 'arte', label: 'Obra' }, { id: 'ambiente', label: 'No ambiente' }].map(m => (
                  <button key={m.id} role="tab" aria-selected={previewMode === m.id} onClick={() => setPreviewMode(m.id)} style={S.pTab(previewMode === m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              {previewMode === 'ambiente' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={S.pLabel}>Moldura</span>
                  {FRAME_COLORS.map(fc => (
                    <button
                      key={fc.id}
                      title={fc.label}
                      aria-label={`Moldura ${fc.label}`}
                      aria-pressed={frameColor === fc.id}
                      onClick={() => setFrameColor(fc.id)}
                      style={{ width: 26, height: 26, borderRadius: '50%', background: fc.swatch, border: `2px solid ${fc.border}`, cursor: 'pointer', outline: frameColor === fc.id ? '2px solid #fff' : 'none', outlineOffset: 2 }}
                    />
                  ))}
                </div>
              )}
            </div>

            {previewMode === 'ambiente' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', width: '100%', paddingBottom: 4 }}>
                {ROOMS.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    title={room.label}
                    aria-label={`Ambiente ${room.label}`}
                    aria-pressed={selectedRoom.id === room.id}
                    style={{ flexShrink: 0, width: 84, height: 54, overflow: 'hidden', border: 'none', outline: selectedRoom.id === room.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)', outlineOffset: selectedRoom.id === room.id ? 2 : 0, opacity: selectedRoom.id === room.id ? 1 : 0.6, cursor: 'pointer', padding: 0, background: '#000', transition: 'opacity 0.15s' }}
                  >
                    <img src={room.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}

            {previewMode === 'arte'
              ? <img src={preview.img_url} alt={preview.titulo} style={S.previewImg} />
              : <>
                  <MockupCanvas
                    imgUrl={preview.kitParts ? null : preview.img_url}
                    kitUrls={preview.kitParts ? preview.kitParts.map(p => p.img_url) : [preview.img_url]}
                    ratio={preview.ratio || 1}
                    frameColor={frameColor}
                    width={1100}
                    room={selectedRoom}
                    interactive
                  />
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 10 }}>Arraste o quadro para posicionar · puxe um canto para redimensionar</div>
                </>
            }

            <div style={S.caption}>
              <div>
                <div style={S.pTitle}>{preview.titulo}</div>
                <div style={S.pCat}>{preview.categoria}{preview.kitCount > 1 ? ` · Kit com ${preview.kitCount} peças` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button style={S.btnGhost} onClick={() => setPreview(null)}>Fechar</button>
                {onSelectImagem && (
                  <button style={S.btnPrimary} onClick={() => {
                    onSelectImagem({ ...preview, kitCount: preview.kitCount ?? 1 })
                    setPreview(null)
                  }}>
                    Usar no pedido{preview.kitCount > 1 ? ` (${preview.kitCount} quadros)` : ''}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
