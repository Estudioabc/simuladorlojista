import { useState, useEffect, useMemo } from 'react'
import { supabase, callFunction } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, useIsMobile } from '../styles/theme'
import { Spinner, EmptyState } from '../components/UI'
import ScrollRow from '../components/ScrollRow'
import MockupCanvas, { FramedArtThumb, ROOMS } from '../components/MockupCanvas'

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

// Cores medidas na imagem (coluna catalogo_imagens.cores)
const CORES = [
  { id: 'Preto', bg: '#1a1a1a' },
  { id: 'Branco', bg: '#ffffff' },
  { id: 'Cinza', bg: '#9a9a9a' },
  { id: 'Bege', bg: '#e6d5b8' },
  { id: 'Marrom', bg: '#7a4e2d' },
  { id: 'Laranja', bg: '#e8792b' },
  { id: 'Amarelo', bg: '#f2c230' },
  { id: 'Dourado', bg: 'linear-gradient(135deg,#f7e08a,#b8862b 55%,#f3d77a)' },
  { id: 'Verde', bg: '#3f8f4f' },
  { id: 'Azul', bg: '#2f6db5' },
  { id: 'Roxo', bg: '#7b4bb3' },
  { id: 'Rosa', bg: '#ec8fb5' },
  { id: 'Vermelho', bg: '#d0312d' },
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

// Monta os kits a partir de catalogo_kits/catalogo_kit_pecas.
// kitOf: imagemId da peça → kit; coverOf: imagemId da capa (fica fora do grid)
function buildKitMap(imagens, kits, pecas) {
  const porId = Object.fromEntries(imagens.map(i => [i.id, i]))
  const kitOf = {}
  const coverOf = {}
  kits.forEach(k => {
    const parts = pecas
      .filter(p => p.kit_id === k.id && porId[p.imagem_id])
      .sort((a, b) => a.ordem - b.ordem)
      .map(p => porId[p.imagem_id])
    if (parts.length < 2) return
    const cover = k.capa_imagem_id ? porId[k.capa_imagem_id] ?? null : null
    const info = { kitId: k.id, kitName: k.nome, parts, kitCount: parts.length, cover, emAlta: k.em_alta, categoria: k.categoria }
    parts.forEach(p => { kitOf[p.id] = info })
    if (cover) coverOf[cover.id] = true
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
  const [catPadrao, setCatPadrao] = useState('todas') // abre em "Em alta" quando houver
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)
  const [previewMode, setPreviewMode] = useState('arte')
  const [pecaIdx, setPecaIdx] = useState(0) // composição: 0 = completa, 1..N = quadro a quadro
  const [frameColor, setFrameColor] = useState('preto')
  const [selectedRoom, setSelectedRoom] = useState(ROOMS[0])
  const [hoveredId, setHoveredId] = useState(null)
  const [visiveis, setVisiveis] = useState(PAGE_SIZE)
  const [kitOf, setKitOf] = useState({})
  const [coverOf, setCoverOf] = useState({})
  const [formato, setFormato] = useState('')
  const [cor, setCor] = useState('')
  const [maisPedidas, setMaisPedidas] = useState([]) // [{ imagem_id, pedidos }]
  const [soFavoritos, setSoFavoritos] = useState(false)
  const [tipo, setTipo] = useState('') // '' | 'avulsa' | 'composicao'
  const [painelFiltros, setPainelFiltros] = useState(false)
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
          .select('*')
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
      const [{ data: kits }, { data: pecas }] = await Promise.all([
        supabase.from('catalogo_kits').select('id, nome, categoria, capa_imagem_id, em_alta').eq('tenant_id', profile.tenant_id).eq('ativo', true),
        supabase.from('catalogo_kit_pecas').select('kit_id, imagem_id, ordem').eq('tenant_id', profile.tenant_id),
      ])
      setImagens(all)
      const { kitOf: ko, coverOf: co } = buildKitMap(all, kits || [], pecas || [])
      setKitOf(ko)
      setCoverOf(co)
      setCategorias([...new Set(all.map(i => i.categoria).filter(Boolean))])
      if (all.some(i => i.em_alta) || (kits || []).some(k => k.em_alta)) { setCatAtiva('em_alta'); setCatPadrao('em_alta') }
      setLoading(false)
    }
    fetchAll()
    callFunction('sim-lojista-data?destaques=1').then(d => setMaisPedidas(d?.mais_pedidas ?? [])).catch(() => {})
  }, [])

  useEffect(() => { setVisiveis(PAGE_SIZE) }, [catAtiva, busca, formato, cor, tipo, soFavoritos])

  useEffect(() => {
    if (!preview) return
    const n = preview.kitParts?.length || 0
    const onKey = (e) => {
      if (e.key === 'Escape') setPreview(null)
      if (n > 1 && previewMode === 'arte' && e.key === 'ArrowRight') setPecaIdx(i => (i + 1) % (n + 1))
      if (n > 1 && previewMode === 'arte' && e.key === 'ArrowLeft') setPecaIdx(i => (i + n) % (n + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, previewMode])

  const cardKeyOf = (img) => kitOf[img.id] ? `kit-${kitOf[img.id].kitId}` : img.id
  const emAlta = (img) => kitOf[img.id] ? kitOf[img.id].emAlta : img.em_alta

  const filtradas = imagens.filter(img => {
    if (coverOf[img.id]) return false
    const matchCat = catAtiva === 'todas' || (catAtiva === 'em_alta' ? emAlta(img) : img.categoria === catAtiva)
    const q = busca.trim().toLowerCase()
    const matchBusca = !q || `${kitOf[img.id]?.kitName ?? img.titulo} ${img.categoria || ''}`.toLowerCase().includes(q)
    const matchTipo = !tipo || (tipo === 'composicao' ? !!kitOf[img.id] : !kitOf[img.id])
    const matchFormato = !formato || formatoDe(img.ratio) === formato
    const matchCor = !cor || (img.cores || []).includes(cor)
    const matchFav = !soFavoritos || favoritos.has(cardKeyOf(img))
    return matchCat && matchBusca && matchFormato && matchCor && matchTipo && matchFav
  })

  // Colapsa kits em um único card
  const cards = useMemo(() => {
    const seen = new Set()
    const out = []
    filtradas.forEach(img => {
      const kit = kitOf[img.id]
      if (kit) {
        if (seen.has(kit.kitId)) return
        seen.add(kit.kitId)
        out.push({ key: `kit-${kit.kitId}`, isKit: true, kit, img: kit.parts[0] })
      } else {
        out.push({ key: img.id, isKit: false, img })
      }
    })
    return out
  }, [filtradas, kitOf])

  // Faixas do topo do "Em alta": kits, novidades e mais pedidas (preenchidas sozinhas)
  const faixas = useMemo(() => {
    const porId = Object.fromEntries(imagens.map(i => [i.id, i]))
    const cardDe = (img) => {
      const kit = kitOf[img.id]
      return kit ? { key: `kit-${kit.kitId}`, isKit: true, kit, img: kit.parts[0] } : { key: img.id, isKit: false, img }
    }
    const unicos = (lista) => {
      const vistos = new Set(); const out = []
      for (const img of lista) {
        if (!img || coverOf[img.id]) continue
        const c = cardDe(img)
        if (vistos.has(c.key)) continue
        vistos.add(c.key); out.push(c)
        if (out.length >= 12) break
      }
      return out
    }
    // composições alternando o estilo (primeira palavra depois de "Composição") para a faixa não repetir o mesmo tipo
    const kitsPorEstilo = {}
    imagens.filter(i => kitOf[i.id] && kitOf[i.id].parts[0].id === i.id).forEach(i => {
      const k = kitOf[i.id]
      const estilo = (k.kitName.replace(/^(Kit|Composição)\s+/i, '').split(' ')[0] || '').toLowerCase()
      ;(kitsPorEstilo[estilo] ||= []).push(i)
    })
    const grupos = Object.values(kitsPorEstilo).map(g => g.sort((a, b) => (kitOf[b.id].emAlta ? 1 : 0) - (kitOf[a.id].emAlta ? 1 : 0)))
    const intercalados = []
    for (let r = 0; grupos.some(g => g[r]); r++) grupos.forEach(g => g[r] && intercalados.push(g[r]))
    const kitsLista = unicos(intercalados)
    const novidades = unicos([...imagens].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))))
    const pedidas = unicos(maisPedidas.map(m => porId[m.imagem_id]))
    return [
      { id: 'kits', titulo: 'Composições', nota: 'conjuntos prontos de 2 a 4 quadros', cards: kitsLista },
      { id: 'pedidas', titulo: 'Mais pedidas pelos lojistas', nota: 'últimos 6 meses', cards: pedidas },
      { id: 'novas', titulo: 'Novidades no acervo', nota: 'as últimas obras adicionadas', cards: novidades },
    ].filter(f => f.cards.length >= 4)
  }, [imagens, kitOf, coverOf, maisPedidas])
  const mostrarFaixas = catAtiva === 'em_alta' && !busca && !formato && !cor && !tipo && !soFavoritos

  const exibidos = cards.slice(0, visiveis)
  const temMais = visiveis < cards.length
  const nEmAlta = new Set(imagens.filter(i => !coverOf[i.id] && emAlta(i)).map(cardKeyOf)).size

  async function montarSelecao(img) {
    let ratio = parseFloat(img.ratio)
    if (!ratio || ratio <= 0) {
      ratio = await detectImageRatio(img.img_url)
    }
    const kit = kitOf[img.id]
    const coverImg = kit?.cover ?? null
    // Proporção original de cada peça: no pedido elas têm a mesma altura e largura própria, sem corte
    const kitParts = kit
      ? await Promise.all(kit.parts.map(async p => ({ ...p, ratio: parseFloat(p.ratio) || await detectImageRatio(p.img_url) })))
      : null
    return {
      ...img,
      titulo: kit ? kit.kitName : img.titulo,
      img_url: coverImg ? coverImg.img_url : img.img_url,
      ratio: coverImg ? (parseFloat(coverImg.ratio) || ratio) : ratio,
      categoria: kit ? (kit.categoria ?? img.categoria) : img.categoria,
      kitParts,
      kitCount: kit?.kitCount ?? 1,
    }
  }

  async function openPreview(img) {
    setPreview(await montarSelecao(img))
    setPreviewMode('arte')
    setPecaIdx(0)
  }

  async function usarNoSimulador(img) {
    onSelectImagem(await montarSelecao(img))
  }

  const renderCard = ({ key, img, isKit, kit }) => {
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
            ? <FramedArtThumb srcs={kit.parts.map(p => p.img_url)} alt={title} />
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
          {isKit && <span style={S.kitTag}>Composição · {kit.kitCount} quadros</span>}
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
  }

  const limparFiltros = () => { setBusca(''); setFormato(''); setCor(''); setTipo(''); setSoFavoritos(false); setCatAtiva(catPadrao) }
  const CatsWrap = isMobile ? ScrollRow : ({ children, style, colors: _c, step: _s, ...rest }) => <div style={style} {...rest}>{children}</div>
  const nFiltros = [formato, cor, tipo, soFavoritos].filter(Boolean).length
  const temFiltro = busca || formato || cor || tipo || soFavoritos || catAtiva !== catPadrao

  const S = {
    eyebrow: { fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 },
    title: { fontFamily: fonts.display, fontSize: 'clamp(28px, 3.9vw, 41px)', fontWeight: 600, lineHeight: 1.02, letterSpacing: -1, margin: '6px 0 10px', textWrap: 'balance' },
    lead: { fontSize: 15, color: colors.textMuted, maxWidth: 560, lineHeight: 1.55 },
    toolbar: { margin: '28px 0 0' },
    fixo: { position: 'sticky', top: isMobile ? 0 : 72, zIndex: 20, background: colors.bg, padding: '10px 0', marginBottom: 8, borderBottom: `1px solid ${colors.border}` },
    barra: { display: 'flex', alignItems: 'flex-start', gap: 10 },
    filtroBtn: (on) => ({ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, background: on ? colors.surfaceAlt : colors.surface, border: `1px solid ${on ? colors.text : colors.border}`, color: colors.text, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }),
    badge: { minWidth: 18, height: 18, borderRadius: 999, background: colors.text, color: colors.bg, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' },
    painel: { marginTop: 10, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto', gap: isMobile ? 18 : 32, boxShadow: '0 12px 30px -18px rgba(0,0,0,0.35)' },
    grupoTit: { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textMuted, marginBottom: 10 },
    opcao: (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 8, background: on ? colors.text : 'transparent', color: on ? colors.bg : colors.text, border: `1px solid ${on ? colors.text : colors.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }),
    chipAtivo: { display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.surfaceAlt, border: 'none', color: colors.text, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
    toolRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
    search: { flex: '1 1 320px', minWidth: 0, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '11px 18px', fontSize: 14, outline: 'none' },
    seg: { display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 999, background: colors.surface, padding: 3 },
    segBtn: (on) => ({ background: on ? colors.text : 'transparent', color: on ? colors.bg : colors.textMuted, border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }),
    favToggle: (on) => ({ background: on ? colors.text : colors.surface, color: on ? colors.bg : colors.text, border: `1px solid ${on ? colors.text : colors.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }),
    cats: { display: 'flex', flexWrap: isMobile ? 'nowrap' : 'wrap', gap: '2px 2px', overflowX: isMobile ? 'auto' : 'visible', scrollbarWidth: 'none', padding: 2 },
    catBtn: (on) => ({ flexShrink: 0, background: on ? colors.text : 'transparent', border: 'none', color: on ? colors.bg : colors.text, borderRadius: 999, padding: '6px 12px', fontSize: 14, fontWeight: on ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }),
    catCount: { fontSize: 11, opacity: 0.6, marginLeft: 6, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
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
    overlay: { position: 'fixed', inset: 0, background: 'rgba(14,13,10,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', zIndex: 1000, padding: '20px 16px', overflowY: 'auto' },
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
      <p style={S.lead}>Escolha um tema ou use os filtros de formato e cor. Abra uma obra para vê-la num ambiente, ou leve direto para um novo pedido.</p>

      <div style={S.toolbar}>
        <div style={S.toolRow}>
          <input
            style={S.search}
            type="search"
            placeholder="Buscar por nome, tema ou estilo — ex.: praia, boho, Van Gogh"
            aria-label="Buscar obras"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          <button onClick={() => setSoFavoritos(v => !v)} style={S.favToggle(soFavoritos)} aria-pressed={soFavoritos}>
            ♥ Favoritos{favoritos.size > 0 ? ` (${favoritos.size})` : ''}
          </button>
        </div>
      </div>

      <div style={S.fixo}>
        <div style={S.barra}>
          <button onClick={() => setPainelFiltros(v => !v)} style={S.filtroBtn(painelFiltros || nFiltros > 0)} aria-expanded={painelFiltros} aria-controls="painel-filtros">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            Filtros
            {nFiltros > 0 && <span style={S.badge}>{nFiltros}</span>}
          </button>
          <div style={{ width: 1, alignSelf: 'stretch', background: colors.border, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <CatsWrap style={S.cats} colors={colors} step={0.6} role="tablist" aria-label="Temas">
              {nEmAlta > 0 && (
                <button role="tab" aria-selected={catAtiva === 'em_alta'} style={{ ...S.catBtn(catAtiva === 'em_alta'), ...(catAtiva === 'em_alta' ? {} : { color: colors.accent, fontWeight: 600 }) }} onClick={() => setCatAtiva('em_alta')}>
                  ★ Em alta
                </button>
              )}
              <button role="tab" aria-selected={catAtiva === 'todas'} style={S.catBtn(catAtiva === 'todas')} onClick={() => setCatAtiva('todas')}>
                Todas
              </button>
              {categorias.map(c => (
                <button key={c} role="tab" aria-selected={catAtiva === c} style={S.catBtn(catAtiva === c)} onClick={() => setCatAtiva(c)}>
                  {c}
                </button>
              ))}
            </CatsWrap>
          </div>
        </div>

        {painelFiltros && (
          <div id="painel-filtros" style={S.painel}>
            <div>
              <div style={S.grupoTit}>Formato</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {FORMATOS.filter(f => f.id).map(f => {
                  const on = formato === f.id
                  const [w, h] = f.id === 'vertical' ? [9, 13] : f.id === 'horizontal' ? [14, 9] : [11, 11]
                  return (
                    <button key={f.id} onClick={() => setFormato(on ? '' : f.id)} style={S.opcao(on)} aria-pressed={on}>
                      <span aria-hidden="true" style={{ width: w, height: h, border: '1.5px solid currentColor', borderRadius: 2, display: 'inline-block' }} />
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div style={S.grupoTit}>Cor predominante</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CORES.map(c => {
                  const on = cor === c.id
                  return (
                    <button key={c.id} onClick={() => setCor(on ? '' : c.id)} style={S.opcao(on)} aria-pressed={on}>
                      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: c.bg, border: '1px solid rgba(0,0,0,0.15)', display: 'inline-block' }} />
                      {c.id}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div style={S.grupoTit}>Tipo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[{ id: 'avulsa', label: 'Obra avulsa' }, { id: 'composicao', label: 'Composição' }].map(t => {
                  const on = tipo === t.id
                  return <button key={t.id} onClick={() => setTipo(on ? '' : t.id)} style={S.opcao(on)} aria-pressed={on}>{t.label}</button>
                })}
              </div>
            </div>
          </div>
        )}

        {(nFiltros > 0 || busca) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
            {busca && <button style={S.chipAtivo} onClick={() => setBusca('')}>“{busca}” <span aria-hidden="true">×</span></button>}
            {formato && <button style={S.chipAtivo} onClick={() => setFormato('')}>{FORMATOS.find(f => f.id === formato)?.label} <span aria-hidden="true">×</span></button>}
            {cor && <button style={S.chipAtivo} onClick={() => setCor('')}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: CORES.find(c => c.id === cor)?.bg, display: 'inline-block' }} />{cor} <span aria-hidden="true">×</span></button>}
            {tipo && <button style={S.chipAtivo} onClick={() => setTipo('')}>{tipo === 'composicao' ? 'Composição' : 'Obra avulsa'} <span aria-hidden="true">×</span></button>}
            {soFavoritos && <button style={S.chipAtivo} onClick={() => setSoFavoritos(false)}>♥ Favoritos <span aria-hidden="true">×</span></button>}
            <button style={S.linkBtn} onClick={limparFiltros}>Limpar tudo</button>
          </div>
        )}
      </div>

      {mostrarFaixas && faixas.map(f => (
        <section key={f.id} style={{ margin: '28px 0 8px' }} aria-label={f.titulo}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: fonts.display, fontSize: 19, fontWeight: 600, color: colors.text }}>{f.titulo}</h2>
            <span style={{ fontSize: 12, color: colors.textMuted }}>{f.nota}</span>
          </div>
          <ScrollRow colors={colors} style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: isMobile ? '70%' : 'minmax(220px, 260px)', gap: 24, paddingBottom: 12, scrollSnapType: 'x mandatory' }}>
            {f.cards.map(c => <div key={c.key} style={{ scrollSnapAlign: 'start', minWidth: 0 }}>{renderCard(c)}</div>)}
          </ScrollRow>
        </section>
      ))}
      {mostrarFaixas && faixas.length > 0 && (
        <h2 style={{ margin: '28px 0 0', fontFamily: fonts.display, fontSize: 19, fontWeight: 600, color: colors.text }}>★ Em alta</h2>
      )}

      <div style={S.meta}>
        <span>{cards.length} {cards.length === 1 ? 'obra' : 'obras'}{catAtiva === 'em_alta' ? ' em alta: o que mais está vendendo nas grandes lojas de quadros' : catAtiva !== 'todas' ? ` em ${catAtiva}` : ''}</span>
        {temFiltro && !nFiltros && !busca && <button style={S.linkBtn} onClick={limparFiltros}>Voltar ao Em alta</button>}
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title={soFavoritos && favoritos.size === 0 ? 'Você ainda não favoritou nenhuma obra' : 'Nenhuma obra encontrada'}
          description={soFavoritos && favoritos.size === 0 ? 'Toque no coração de uma obra para guardá-la aqui.' : 'Tente outro nome, cor, formato ou tema.'}
          action="Limpar filtros"
          onAction={limparFiltros}
        />
      ) : (
        <>
          <div style={S.grid}>
            {exibidos.map(renderCard)}
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

            {previewMode === 'arte' && preview.kitParts?.length > 1 ? (() => {
              const partes = preview.kitParts
              const soma = partes.reduce((a, p) => a + (parseFloat(p.ratio) || 1), 0)
              const seta = (lado) => ({
                position: 'absolute', top: '50%', [lado]: 0, transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%',
                border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1,
              })
              const ir = (d) => setPecaIdx(i => (i + d + partes.length + 1) % (partes.length + 1))
              return (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', padding: '0 56px', boxSizing: 'border-box' }}>
                    {pecaIdx === 0 ? (
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', width: '100%', maxWidth: `min(100%, calc((100vh - 330px) * ${soma.toFixed(3)} + ${(partes.length - 1) * 14}px))` }}>
                        {partes.map((p, i) => (
                          <img key={p.id} src={p.img_url} alt={`${preview.titulo}, quadro ${i + 1}`} onClick={() => setPecaIdx(i + 1)}
                            style={{ flex: `${parseFloat(p.ratio) || 1} 1 0`, minWidth: 0, width: 0, height: 'auto', display: 'block', cursor: 'zoom-in', boxShadow: '0 24px 50px -18px rgba(0,0,0,0.6)' }} />
                        ))}
                      </div>
                    ) : (
                      <img src={partes[pecaIdx - 1].img_url} alt={`${preview.titulo}, quadro ${pecaIdx}`} style={{ ...S.previewImg, maxHeight: 'calc(100vh - 300px)' }} />
                    )}
                    <button aria-label="Anterior" style={seta('left')} onClick={() => ir(-1)}>‹</button>
                    <button aria-label="Próximo" style={seta('right')} onClick={() => ir(1)}>›</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }} role="tablist" aria-label="Quadros da composição">
                    {[{ id: 0, label: 'Completa' }, ...partes.map((p, i) => ({ id: i + 1, label: String(i + 1), src: p.img_url }))].map(t => (
                      <button key={t.id} role="tab" aria-selected={pecaIdx === t.id} onClick={() => setPecaIdx(t.id)}
                        style={{ height: 46, minWidth: 46, padding: t.src ? 0 : '0 12px', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontWeight: 600,
                          border: 'none', outline: pecaIdx === t.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)', outlineOffset: pecaIdx === t.id ? 2 : 0, opacity: pecaIdx === t.id ? 1 : 0.65 }}>
                        {t.src ? <img src={t.src} alt={`Quadro ${t.label}`} style={{ height: 46, display: 'block' }} /> : t.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {pecaIdx === 0 ? `Composição de ${partes.length} quadros · clique num quadro para ampliar` : `Quadro ${pecaIdx} de ${partes.length}`}
                  </div>
                </div>
              )
            })() : previewMode === 'arte'
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
                <div style={S.pCat}>{preview.categoria}{preview.kitCount > 1 ? ` · Composição de ${preview.kitCount} quadros` : ''}</div>
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
