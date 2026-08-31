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
    setPreview({ ...img, ratio })
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
            {exibidas.map(img => (
              <div
                key={img.id}
                style={S.card(hoveredId === img.id)}
                onMouseEnter={() => setHoveredId(img.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => openPreview(img)}
              >
                <img src={img.img_url} alt={img.titulo} style={S.img} loading="lazy" />
                <div style={S.cardBody}>
                  <div style={S.cardTitle}>{img.titulo}</div>
                  {img.categoria && <div style={S.cardCat}>{img.categoria}</div>}
                </div>
              </div>
            ))}
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
              : <MockupCanvas imgUrl={preview.img_url} ratio={preview.ratio || 1} frameColor={frameColor} width={700} />
            }

            <div style={S.previewCaption}>
              <div>
                <div style={S.previewTitle}>{preview.titulo}</div>
                {preview.categoria && <div style={S.previewCat}>{preview.categoria}</div>}
              </div>
              <div style={S.btnRow}>
                {onSelectImagem && (
                  <button style={S.btnPrimary} onClick={() => { onSelectImagem(preview); setPreview(null) }}>
                    Usar no Simulador
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
