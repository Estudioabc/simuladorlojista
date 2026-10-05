import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'
import { Spinner, EmptyState, Tag } from '../components/UI'
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
  const { colors } = useTheme()
  const [imagens, setImagens] = useState([])
  const [categorias, setCategorias] = useState([])
  const [catThumb, setCatThumb] = useState({}) // categoria → url de imagem aleatória
  const [catAtiva, setCatAtiva] = useState('todas')
  const [catSelecionada, setCatSelecionada] = useState(null) // null = tela de categorias
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)
  const [previewMode, setPreviewMode] = useState('arte')
  const [frameColor, setFrameColor] = useState('branco')
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
      const cats = [...new Set(all.map(i => i.categoria).filter(Boolean))]
      setCategorias(cats)
      // thumbnail aleatório por categoria
      const thumbs = {}
      cats.forEach(cat => {
        const pool = all.filter(i => i.categoria === cat && i.img_url)
        if (pool.length) thumbs[cat] = pool[Math.floor(Math.random() * pool.length)].img_url
      })
      setCatThumb(thumbs)
      setLoading(false)
    }
    fetchAll()
  }, [])

  useEffect(() => { setVisiveis(PAGE_SIZE) }, [catAtiva, busca, formato, soFavoritos])

  const cardKeyOf = (img) => kitOf[img.id] ? `kit-${kitOf[img.id].kitName}` : img.id

  const filtradas = imagens.filter(img => {
    const matchCat = catAtiva === 'todas' || img.categoria === catAtiva
    const matchBusca = !busca || img.titulo.toLowerCase().includes(busca.toLowerCase())
    const matchFormato = !formato || formatoDe(img.ratio) === formato
    const matchFav = !soFavoritos || favoritos.has(cardKeyOf(img))
    return matchCat && matchBusca && matchFormato && matchFav
  })

  const exibidas = filtradas.slice(0, visiveis)
  const temMais = visiveis < filtradas.length

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

  const S = {
    header: { marginBottom: 24 },
    title: { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: -0.5, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.textMuted },
    toolbar: { display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 },
    search: { flex: 1, minWidth: 200, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 14px', color: colors.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' },
    tags: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, max(240px, calc((100% - 32px) / 3))), 1fr))', gap: 16 },
    card: (hovered) => ({ background: colors.surface, border: `1px solid ${hovered ? colors.accent : colors.border}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s', transform: hovered ? 'translateY(-2px)' : 'none', boxShadow: hovered ? `0 6px 20px rgba(0,0,0,0.18)` : 'none' }),
    cardBody: { padding: '10px 12px' },
    chip: (active) => ({ background: active ? colors.accent : 'transparent', color: active ? '#fff' : colors.textMuted, border: `1px solid ${active ? colors.accent : colors.border}`, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }),
    favBtn: (on) => ({ position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.92)', color: on ? '#d64545' : '#555', fontSize: 18, lineHeight: 1, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }),
    usarBtn: { marginTop: 8, width: '100%', background: 'transparent', color: colors.accent, border: `1px solid ${colors.accent}`, borderRadius: 6, padding: '6px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
    cardTitle: { fontSize: 12, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cardCat: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    maisBtn: { display: 'block', margin: '28px auto 0', background: 'transparent', border: `1.5px solid ${colors.border}`, borderRadius: 8, padding: '10px 28px', fontSize: 13, fontWeight: 600, color: colors.textMuted, cursor: 'pointer', fontFamily: 'inherit' },
    previewOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px 24px' },
    previewImg: { maxWidth: '100%', maxHeight: 'calc(100vh - 140px)', objectFit: 'contain', display: 'block', borderRadius: 6 },
    previewCaption: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16, width: '100%', maxWidth: 700 },
    previewTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: 600 },
    previewCat: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
    btnRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
    btnPrimary: { background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
    btnSecondary: { background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  }

  if (loading) return <Spinner />

  // ── Tela inicial: grade de categorias ──────────────────────────────────────
  if (!catSelecionada) {
    return (
      <div>
        <div style={S.header}>
          <div style={S.title}>Banco de Imagens</div>
          <div style={S.subtitle}>{categorias.length} categorias · {imagens.length} imagens</div>
        </div>
        {favoritos.size > 0 && (
          <button
            onClick={() => { setSoFavoritos(true); setCatAtiva('todas'); setCatSelecionada('Meus favoritos') }}
            style={{ ...S.chip(false), marginBottom: 16 }}
          >
            ♥ Meus favoritos ({favoritos.size})
          </button>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          {categorias.map(cat => (
            <div
              key={cat}
              onClick={() => { setCatSelecionada(cat); setCatAtiva(cat) }}
              onMouseEnter={() => setHoveredId(cat)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ borderRadius: 12, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${hoveredId === cat ? colors.accent : colors.border}`, transform: hoveredId === cat ? 'translateY(-2px)' : 'none', transition: 'all 0.15s', background: colors.surface }}
            >
              <div style={{ position: 'relative', aspectRatio: '4/3', background: colors.surfaceAlt }}>
                {catThumb[cat]
                  ? <img src={catThumb[cat]} alt={cat} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🖼</div>
                }
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 50%)' }} />
                <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{cat}</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 }}>
                    {imagens.filter(i => i.categoria === cat).length} imagens
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Tela de imagens da categoria ───────────────────────────────────────────
  return (
    <div>
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => { setCatSelecionada(null); setCatAtiva('todas'); setSoFavoritos(false) }} style={{ background: 'none', border: 'none', color: colors.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>← Categorias</button>
          <span style={{ color: colors.textMuted, fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{catSelecionada}</span>
        </div>
        <div style={S.subtitle}>{filtradas.length} imagens</div>
      </div>

      <div style={S.toolbar}>
        <input
          style={S.search}
          placeholder="Buscar por título..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div style={S.tags}>
          <Tag label="Todas as categorias" active={!soFavoritos && catAtiva === 'todas'} onClick={() => { setCatSelecionada('Todas as categorias'); setCatAtiva('todas'); setSoFavoritos(false) }} />
          {categorias.map(c => (
            <Tag key={c} label={c} active={!soFavoritos && catAtiva === c} onClick={() => { setSoFavoritos(false); setCatAtiva(c); setCatSelecionada(c) }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%' }}>
          {FORMATOS.map(f => (
            <button key={f.id} onClick={() => setFormato(f.id)} style={S.chip(formato === f.id)}>{f.label}</button>
          ))}
          <button onClick={() => setSoFavoritos(v => !v)} style={S.chip(soFavoritos)}>♥ Favoritos</button>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState title="Nenhuma imagem encontrada" description="Tente outro filtro ou termo de busca." />
      ) : (
        <>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14 }}>
            Exibindo {exibidas.length} de {filtradas.length}
          </div>
          <div style={S.grid}>
            {(() => {
              // Colapsa kits em um único card; oculta capas (0) do grid
              const seen = new Set()
              const display = []
              exibidas.forEach(img => {
                if (coverOf[img.id]) return  // capa de kit: oculta do grid
                const kit = kitOf[img.id]
                if (kit) {
                  const key = kit.kitName
                  if (seen.has(key)) return
                  seen.add(key)
                  display.push({ isKit: true, kit, img: kit.parts[0] })
                } else {
                  display.push({ isKit: false, img })
                }
              })
              return display.map(entry => {
                const { img, isKit, kit } = entry
                const cardKey = isKit ? `kit-${kit.kitName}` : img.id
                const title = isKit ? kit.kitName : img.titulo
                return (
                  <div
                    key={cardKey}
                    style={S.card(hoveredId === cardKey)}
                    onMouseEnter={() => setHoveredId(cardKey)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openPreview(img)}
                  >
                    <div style={{ position: 'relative' }}>
                      {isKit
                        ? <KitThumb kitUrls={kit.parts.map(p => p.img_url)} frameColor="branco" cardWidth={320} />
                        : <FramedArtThumb src={img.img_url} alt={title} />
                      }
                      <button
                        onClick={e => { e.stopPropagation(); toggleFavorito(cardKey) }}
                        title={favoritos.has(cardKey) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        aria-pressed={favoritos.has(cardKey)}
                        style={S.favBtn(favoritos.has(cardKey))}
                      >
                        {favoritos.has(cardKey) ? '♥' : '♡'}
                      </button>
                      {isKit && (
                        <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', letterSpacing: 0.3 }}>
                          Kit {kit.kitCount}x
                        </span>
                      )}
                    </div>
                    <div style={S.cardBody}>
                      <div style={S.cardTitle}>{title}</div>
                      {img.categoria && <div style={S.cardCat}>{img.categoria}</div>}
                      {onSelectImagem && (
                        <button style={S.usarBtn} onClick={e => { e.stopPropagation(); usarNoSimulador(img) }}>
                          Usar no simulador
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
          {temMais && (
            <button style={S.maisBtn} onClick={() => setVisiveis(v => v + PAGE_SIZE)}>
              Carregar mais ({filtradas.length - visiveis} restantes)
            </button>
          )}
        </>
      )}

      {preview && (
        <div style={S.previewOverlay} onClick={() => setPreview(null)}>
          <div style={{ width: '100%', maxWidth: previewMode === 'ambiente' ? 1100 : 960, display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>

            {/* Barra de controles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              {/* Toggle Arte / Ambiente */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 3, gap: 2 }}>
                {['arte', 'ambiente'].map(mode => (
                  <button key={mode} onClick={() => setPreviewMode(mode)} style={{ background: previewMode === mode ? 'rgba(255,255,255,0.9)' : 'transparent', color: previewMode === mode ? '#1a1a1a' : 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 6, padding: '6px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 0.15s' }}>
                    {mode === 'arte' ? 'Arte' : 'Ambiente'}
                  </button>
                ))}
              </div>

              {/* Seletor de moldura (só no modo ambiente) */}
              {previewMode === 'ambiente' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 0.5 }}>MOLDURA</span>
                  {FRAME_COLORS.map(fc => (
                    <button
                      key={fc.id}
                      title={fc.label}
                      onClick={() => setFrameColor(fc.id)}
                      style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: fc.swatch,
                        border: frameColor === fc.id ? '2px solid #fff' : `2px solid ${fc.border}`,
                        cursor: 'pointer',
                        outline: frameColor === fc.id ? '2px solid rgba(255,255,255,0.5)' : 'none',
                        outlineOffset: 2,
                        transition: 'outline 0.15s',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Seletor de ambiente — thumbnails horizontais */}
            {previewMode === 'ambiente' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', width: '100%', paddingBottom: 4 }}>
                {ROOMS.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    title={room.label}
                    style={{
                      flexShrink: 0,
                      width: 80, height: 50,
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: selectedRoom.id === room.id ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      padding: 0,
                      background: '#000',
                      outline: selectedRoom.id === room.id ? '2px solid rgba(255,255,255,0.4)' : 'none',
                      outlineOffset: 2,
                      transition: 'border 0.15s, outline 0.15s',
                    }}
                  >
                    <img
                      src={room.src}
                      alt={room.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            )}

            {previewMode === 'arte'
              ? <img src={preview.img_url} alt={preview.titulo} style={S.previewImg} />
              : <MockupCanvas
                  imgUrl={preview.kitParts ? null : preview.img_url}
                  kitUrls={preview.kitParts ? preview.kitParts.map(p => p.img_url) : [preview.img_url]}
                  ratio={preview.ratio || 1}
                  frameColor={frameColor}
                  width={1100}
                  room={selectedRoom}
                  interactive
                />
            }

            <div style={S.previewCaption}>
              <div>
                <div style={S.previewTitle}>{preview.titulo}</div>
                {preview.categoria && <div style={S.previewCat}>{preview.categoria}</div>}
              </div>
              <div style={S.btnRow}>
                {onSelectImagem && (
                  <button style={S.btnPrimary} onClick={() => {
                    onSelectImagem({ ...preview, kitCount: preview.kitCount ?? 1 })
                    setPreview(null)
                  }}>
                    Usar no Simulador{preview.kitCount > 1 ? ` (${preview.kitCount} quadros)` : ''}
                  </button>
                )}
                <button style={S.btnSecondary} onClick={() => setPreview(null)}>Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
