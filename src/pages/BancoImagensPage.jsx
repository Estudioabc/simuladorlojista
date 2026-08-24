import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'
import { Spinner, EmptyState, Tag } from '../components/UI'

export default function BancoImagensPage({ onSelectImagem }) {
  const { profile } = useAuth()
  const { colors } = useTheme()
  const [imagens, setImagens] = useState([])
  const [categorias, setCategorias] = useState([])
  const [catAtiva, setCatAtiva] = useState('todas')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)

  useEffect(() => { loadImagens() }, [])

  const loadImagens = async () => {
    const { data } = await supabase
      .from('catalogo_imagens')
      .select('id, titulo, categoria, img_url, sizes, ratio')
      .eq('tenant_id', profile.tenant_id)
      .eq('ativo', true)
      .order('categoria')
      .order('titulo')
    setImagens(data || [])
    const cats = [...new Set((data || []).map(i => i.categoria).filter(Boolean))]
    setCategorias(cats)
    setLoading(false)
  }

  const filtradas = imagens.filter(img => {
    const matchCat = catAtiva === 'todas' || img.categoria === catAtiva
    const matchBusca = !busca || img.titulo.toLowerCase().includes(busca.toLowerCase())
    return matchCat && matchBusca
  })

  const S = {
    header: { marginBottom: 24 },
    title: { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: -0.5, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.textMuted },
    toolbar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 },
    search: { flex: 1, minWidth: 200, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 14px', color: colors.text, fontSize: 13, outline: 'none' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
    card: (hovered) => ({ background: colors.surface, border: `1px solid ${hovered ? colors.accent : colors.border}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s', transform: hovered ? 'translateY(-2px)' : 'none' }),
    img: { width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', background: colors.surfaceAlt },
    cardBody: { padding: '10px 12px' },
    cardTitle: { fontSize: 12, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cardCat: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    previewOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 },
    previewBox: { background: colors.surface, borderRadius: 16, overflow: 'hidden', maxWidth: 640, width: '100%', border: `1px solid ${colors.border}` },
    previewImg: { width: '100%', maxHeight: 420, objectFit: 'contain', background: colors.surfaceAlt, display: 'block' },
    previewBody: { padding: 20 },
    btnRow: { display: 'flex', gap: 10, marginTop: 16 },
    btnPrimary: { flex: 1, background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
    btnSecondary: { flex: 1, background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  }

  const [hoveredId, setHoveredId] = useState(null)

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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag label="Todas" active={catAtiva === 'todas'} onClick={() => setCatAtiva('todas')} />
          {categorias.map(c => (
            <Tag key={c} label={c} active={catAtiva === c} onClick={() => setCatAtiva(c)} />
          ))}
        </div>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState icon="🖼️" title="Nenhuma imagem encontrada" description="Tente outro filtro ou termo de busca." />
      ) : (
        <div style={S.grid}>
          {filtradas.map(img => (
            <div
              key={img.id}
              style={S.card(hoveredId === img.id)}
              onMouseEnter={() => setHoveredId(img.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => setPreview(img)}
            >
              <img src={img.img_url} alt={img.titulo} style={S.img} loading="lazy" />
              <div style={S.cardBody}>
                <div style={S.cardTitle}>{img.titulo}</div>
                {img.categoria && <div style={S.cardCat}>{img.categoria}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div style={S.previewOverlay} onClick={() => setPreview(null)}>
          <div style={S.previewBox} onClick={e => e.stopPropagation()}>
            <img src={preview.img_url} alt={preview.titulo} style={S.previewImg} />
            <div style={S.previewBody}>
              <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>{preview.titulo}</div>
              {preview.categoria && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>{preview.categoria}</div>}
              {preview.sizes?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: colors.textMuted }}>
                  Tamanhos disponíveis: {preview.sizes.map(s => `${s.l}×${s.a}cm`).join(' · ')}
                </div>
              )}
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
