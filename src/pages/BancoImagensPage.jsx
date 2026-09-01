import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'
import { Spinner, EmptyState, Tag } from '../components/UI'
import MockupCanvas from '../components/MockupCanvas'

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
  const [catAtiva, setCatAtiva] = useState('todas')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)
  const [previewMode, setPreviewMode] = useState('arte')
  const [frameColor, setFrameColor] = useState('branco')
  const [hoveredId, setHoveredId] = useState(null)
  const [visiveis, setVisiveis] = useState(PAGE_SIZE)
  const [kitOf, setKitOf] = useState({})
  const [coverOf, setCoverOf] = useState({})

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
      setLoading(false)
    }
    fetchAll()
  }, [])

  useEffect(() => { setVisiveis(PAGE_SIZE) }, [catAtiva, busca])

  const filtradas = imagens.filter(img => {
    const matchCat = catAtiva === 'todas' || img.categoria === catAtiva
    const matchBusca = !busca || img.titulo.toLowerCase().includes(busca.toLowerCase())
    return matchCat && matchBusca
  })

  const exibidas = filtradas.slice(0, visiveis)
  const temMais = visiveis < filtradas.length

  async function openPreview(img) {
    let ratio = parseFloat(img.ratio)
    if (!ratio || ratio <= 0) {
      ratio = await detectImageRatio(img.img_url)
    }
    const kit = kitOf[img.id]
    const coverImg = kit?.cover ?? null
    setPreview({
      ...img,
      titulo: kit ? kit.kitName : img.titulo,
      img_url: coverImg ? coverImg.img_url : img.img_url,
      ratio: coverImg ? (parseFloat(coverImg.ratio) || ratio) : ratio,
      kitParts: kit?.parts ?? null,
      kitCount: kit?.kitCount ?? 1,
    })
    setPreviewMode('arte')
  }

  const S = {
    header: { marginBottom: 24 },
    title: { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: -0.5, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.textMuted },
    toolbar: { display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 },
    search: { flex: 1, minWidth: 200, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 14px', color: colors.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' },
    tags: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
    card: (hovered) => ({ background: colors.surface, border: `1px solid ${hovered ? colors.accent : colors.border}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s', transform: hovered ? 'translateY(-2px)' : 'none' }),
    img: { width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', background: colors.surfaceAlt },
    cardBody: { padding: '10px 12px' },
    cardTitle: { fontSize: 12, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cardCat: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    maisBtn: { display: 'block', margin: '28px auto 0', background: 'transparent', border: `1.5px solid ${colors.border}`, borderRadius: 8, padding: '10px 28px', fontSize: 13, fontWeight: 600, color: colors.textMuted, cursor: 'pointer', fontFamily: 'inherit' },
    previewOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px 24px' },
    previewImg: { maxWidth: '100%', maxHeight: 'calc(100vh - 140px)', objectFit: 'contain', display: 'block', borderRadius: 6 },
    previewCaption: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, width: '100%', maxWidth: 700 },
    previewTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: 600 },
    previewCat: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
    btnRow: { display: 'flex', gap: 10 },
    btnPrimary: { background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
    btnSecondary: { background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div style={S.header}>
        <div style={S.title}>Banco de Imagens</div>
        <div style={S.subtitle}>{imagens.length} imagens disponíveis</div>
      </div>

      <div style={S.toolbar}>
        <input
          style={S.search}
          placeholder="Buscar por título..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div style={S.tags}>
          <Tag label="Todas" active={catAtiva === 'todas'} onClick={() => setCatAtiva('todas')} />
          {categorias.map(c => (
            <Tag key={c} label={c} active={catAtiva === c} onClick={() => setCatAtiva(c)} />
          ))}
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
                const thumbUrl = isKit && kit.cover ? kit.cover.img_url : img.img_url
                return (
                  <div
                    key={cardKey}
                    style={S.card(hoveredId === cardKey)}
                    onMouseEnter={() => setHoveredId(cardKey)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openPreview(img)}
                  >
                    <div style={{ position: 'relative' }}>
                      <img src={thumbUrl} alt={title} style={S.img} loading="lazy" />
                      {isKit && (
                        <span style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', letterSpacing: 0.3 }}>
                          Kit {kit.kitCount}x
                        </span>
                      )}
                    </div>
                    <div style={S.cardBody}>
                      <div style={S.cardTitle}>{title}</div>
                      {img.categoria && <div style={S.cardCat}>{img.categoria}</div>}
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
          <div style={{ width: '100%', maxWidth: previewMode === 'ambiente' ? 700 : 860, display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>

            {/* Barra de controles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
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

            {previewMode === 'arte'
              ? <img src={preview.img_url} alt={preview.titulo} style={S.previewImg} />
              : <MockupCanvas
                  imgUrl={preview.kitParts ? null : preview.img_url}
                  kitUrls={preview.kitParts ? preview.kitParts.map(p => p.img_url) : null}
                  ratio={preview.ratio || 1}
                  frameColor={frameColor}
                  width={700}
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
