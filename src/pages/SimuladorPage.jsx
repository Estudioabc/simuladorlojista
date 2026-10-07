import { useState, useEffect, useMemo } from 'react'
import { useTheme, useIsMobile, formatCurrency } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { callFunction } from '../services/supabase'
import { Spinner } from '../components/UI'
import MockupCanvas, { ROOMS } from '../components/MockupCanvas'
import BancoImagensPage from './BancoImagensPage'
import { infoMoldura } from '../utils/molduras'

// Espelhado em sim-pedido (PrintFramePro), que recalcula no servidor — manter os dois iguais
function calcPreco({ montagem, moldura, w, h, qty, materials, substrates, tipoVidro, markupPct }) {
  if (!w || !h || w <= 0 || h <= 0) return null
  const areaM2 = (w * h) / 10000
  const markup = 1 + (parseFloat(markupPct) || 0) / 100
  const molduraW = parseFloat(moldura?.width_cm) || 0
  const perimM = 2 * (w + h) / 100
  const perimComMolduraM = 2 * (w + h + molduraW * 4) / 100
  const lines = []

  if (montagem?.itens?.length) {
    for (const item of montagem.itens) {
      const role = item.role

      if (role === 'substrato') {
        const sub = substrates?.find(s => s.id === item.substrato_id)
        if (!sub) continue
        const base = areaM2 * (parseFloat(sub.sell_price) || 0)
        if (base > 0) lines.push({ label: `Impressão ${sub.name}`, valor: base * markup })

      } else if (role === 'vidro_selecionavel') {
        if (!tipoVidro || tipoVidro === 'sem_vidro') continue
        // vidro_cristal_id → vidro_comum, vidro_museu_id → antirreflexo
        const matId = tipoVidro === 'vidro_comum' ? item.vidro_cristal_id : tipoVidro === 'antirreflexo' ? item.vidro_fosco_id : null
        if (!matId) continue
        const mat = materials?.find(m => m.id === matId)
        if (!mat) continue
        const base = areaM2 * (parseFloat(mat.sell_price) || 0)
        if (base > 0) lines.push({ label: mat.name, valor: base * markup })

      } else if (role === 'verniz_opcional' || role === 'acabamento_fixo') {
        // ignorado no simulador lojista (sem config de valor fixo)
        continue

      } else {
        const matId = item.material_id
        if (!matId) continue
        const mat = materials?.find(m => m.id === matId)
        if (!mat) continue

        let qty_item = 1
        if (role === 'area') qty_item = areaM2
        else if (role === 'area_outer') qty_item = areaM2 * 1.1
        else if (role === 'moldura_perimetro') qty_item = perimComMolduraM
        else if (role === 'chassi_canvas' || role === 'moldura_canvas' || role === 'reforco_perimetro') qty_item = perimM

        const base = qty_item * (parseFloat(mat.sell_price) || 0)
        if (base > 0) lines.push({ label: mat.name, valor: base * markup })
      }
    }
  }

  if (moldura) {
    const base = perimComMolduraM * (parseFloat(moldura.sell_price) || 0)
    if (base > 0) lines.push({ label: `Moldura ${infoMoldura(moldura).rotulo}`, valor: base * markup })
  }

  const totalPeca = lines.reduce((s, l) => s + l.valor, 0)
  const q = parseInt(qty) || 1
  return { lines, totalPeca, totalGeral: totalPeca * q, qty: q }
}

// Soma o preço de cada peça (kit ou obra fatiada). Linhas iguais são agrupadas.
function calcPrecoPecas({ pecas, qty, ...cfg }) {
  if (!pecas.length) return null
  const porPeca = pecas.map(p => calcPreco({ ...cfg, w: p.largura_cm, h: p.altura_cm, qty: 1 }))
  if (porPeca.some(r => !r)) return null
  const porLabel = new Map()
  porPeca.forEach(r => r.lines.forEach(l => porLabel.set(l.label, (porLabel.get(l.label) || 0) + l.valor)))
  const lines = [...porLabel].map(([label, valor]) => ({ label, valor }))
  const totalPeca = porPeca.reduce((s, r) => s + r.totalPeca, 0)
  const q = parseInt(qty) || 1
  return { lines, totalPeca, totalGeral: totalPeca * q, qty: q }
}

// Mesma regra do Anexo (PrintFramePro): categoria libera, `fatiavel` do cadastro decide se preenchido
const CATEGORIAS_FATIAVEIS = ['Abstrato', 'Dourado', 'Paisagens e natureza', 'Pinturas', 'Cidades', 'Cidade']
function maxFatias(img, ratio) {
  if (!img || img.kitCount > 1 || !ratio) return 1
  const permitido = img.fatiavel ?? CATEGORIAS_FATIAVEIS.includes(img.categoria)
  if (!permitido) return 1
  return ratio >= 2 ? 3 : ratio >= 1.5 ? 2 : 1
}

const FRAME_COLORS = [
  { id: 'branco', label: 'Branco', swatch: '#f8f6f3', border: '#ccc' },
  { id: 'preto', label: 'Preto', swatch: '#1a1a1a', border: '#000' },
  { id: 'madeira', label: 'Madeira', swatch: '#8B5E3C', border: '#6b4828' },
]

const um = (v) => Math.round(v * 10) / 10
const cm = (v) => String(um(v)).replace('.', ',')

export default function SimuladorPage({ imagemInicial, onImagemClear, onVerPedidos }) {
  const { colors, fonts } = useTheme()
  const isMobile = useIsMobile()
  const { lojista } = useAuth()

  const [catalogoData, setCatalogoData] = useState(null)
  const [loadingData, setLoadingData] = useState(true)
  const [erroData, setErroData] = useState('')

  const [imagem, setImagem] = useState(imagemInicial ?? null)
  const [ratio, setRatio] = useState(null)
  const [travarRatio, setTravarRatio] = useState(true)
  const [largura, setLargura] = useState('')
  const [altura, setAltura] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [fatias, setFatias] = useState(1)
  const [tipoMontagem, setTipoMontagem] = useState('') // 'canvas' | 'convencional'
  const [montagemId, setMontagemId] = useState('')
  const [tipoVidro, setTipoVidro] = useState('')
  const [substratoId, setSubstratoId] = useState('')
  const [molduraId, setMolduraId] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteContato, setClienteContato] = useState('')
  const [formaEntrega, setFormaEntrega] = useState('') // 'retirada' | 'entrega'
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [obs, setObs] = useState('')

  const [showBanco, setShowBanco] = useState(false)
  const [mockupAberto, setMockupAberto] = useState(false)
  const [mockupRoom, setMockupRoom] = useState(ROOMS[0])
  const [mockupCor, setMockupCor] = useState('preto')
  const [enviando, setEnviando] = useState(null) // null | 'novo' | 'orcamento'
  const [sucesso, setSucesso] = useState(null) // null | 'novo' | 'orcamento'
  const [erro, setErro] = useState('')

  useEffect(() => {
    callFunction('sim-lojista-data')
      .then(d => setCatalogoData(d))
      .catch(e => setErroData(e.message))
      .finally(() => setLoadingData(false))
  }, [])

  const isKit = imagem?.kitCount > 1 && imagem?.kitParts?.length > 1

  useEffect(() => {
    if (!ratio || largura || altura) return
    if (isKit) { setAltura('50'); setLargura(String(um(50 * ratio))) }
    else if (ratio >= 1) { setLargura('60'); setAltura(String(Math.round(60 / ratio))) }
    else { setAltura('60'); setLargura(String(Math.round(60 * ratio))) }
  }, [ratio, imagem])

  useEffect(() => {
    if (imagemInicial) {
      setImagem(imagemInicial)
      detectRatio(imagemInicial)
    }
  }, [imagemInicial])

  const detectRatio = (img) => {
    if (!img?.img_url) return
    // Kit: peças com a mesma altura, cada uma na proporção original → a largura total é altura × Σ proporções
    if (img.kitCount > 1 && img.kitParts?.length > 1) {
      setRatio(img.kitParts.reduce((s, p) => s + (parseFloat(p.ratio) || 1), 0))
      return
    }
    // Usa ratio salvo no banco se disponível
    if (img.ratio && parseFloat(img.ratio) > 0) {
      setRatio(parseFloat(img.ratio))
      return
    }
    // Senão detecta carregando a imagem
    const el = new Image()
    el.onload = () => {
      if (el.naturalWidth && el.naturalHeight) {
        setRatio(el.naturalWidth / el.naturalHeight)
      }
    }
    el.src = img.img_url
  }

  const montagems = catalogoData?.simMontagems ?? []
  const substrates = catalogoData?.substrates ?? []
  const frames = catalogoData?.frames ?? []
  const materials = catalogoData?.materials ?? []
  const discount = catalogoData?.discount_pct ?? 0

  const montagem = montagems.find(m => m.id === montagemId) ?? null
  const substrato = substrates.find(s => s.id === substratoId) ?? null
  const moldura = frames.find(f => f.id === molduraId) ?? null

  const markupPct = lojista?.markup_pct ?? 0

  const fatiasMax = maxFatias(imagem, ratio)
  const nFatias = Math.min(fatias, fatiasMax)

  // Cada peça que vai para produção. Kit: mesma altura, largura pela proporção original (sem corte).
  // Fatiada: a obra inteira dividida em faixas iguais.
  const pecas = useMemo(() => {
    const w = parseFloat(largura), h = parseFloat(altura)
    if (!(w > 0 && h > 0)) return []
    if (isKit) {
      return imagem.kitParts.map(p => ({
        largura_cm: um(h * (parseFloat(p.ratio) || 1)), altura_cm: h,
        imagem_id: p.id, imagem_titulo: p.titulo, imagem_url: p.img_url,
      }))
    }
    if (nFatias > 1) return Array.from({ length: nFatias }, () => ({ largura_cm: um(w / nFatias), altura_cm: h }))
    return [{ largura_cm: w, altura_cm: h }]
  }, [largura, altura, isKit, imagem, nFatias])
  const multiPeca = pecas.length > 1

  const preco = useMemo(() =>
    calcPrecoPecas({ pecas, qty: quantidade, montagem, moldura, materials, substrates, tipoVidro, markupPct }),
    [pecas, montagem, moldura, quantidade, materials, substrates, tipoVidro, markupPct]
  )

  // "40 × 60 + 30 × 60 + 40 × 60 cm" ou "3 peças de 40 × 60 cm"
  const descPecas = (() => {
    if (!pecas.length) return ''
    const iguais = pecas.every(p => p.largura_cm === pecas[0].largura_cm)
    if (iguais) return `${pecas.length > 1 ? `${pecas.length} peças de ` : ''}${cm(pecas[0].largura_cm)} × ${cm(pecas[0].altura_cm)} cm`
    return pecas.map(p => `${cm(p.largura_cm)} × ${cm(p.altura_cm)}`).join(' + ') + ' cm'
  })()

  // Canvas só vê molduras CANVAS, papel só CONVENCIONAL (ver utils/molduras.js)
  const framesDoTipo = frames
    .map(f => ({ ...f, ...infoMoldura(f) }))
    .filter(f => !f.tipo || f.tipo === tipoMontagem)
    .sort((a, b) => (!a.tipo - !b.tipo) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

  const handleLargura = (val) => {
    setLargura(val)
    if ((travarRatio || isKit) && ratio && val) {
      setAltura((parseFloat(val) / ratio).toFixed(1))
    }
  }
  const handleAltura = (val) => {
    setAltura(val)
    if ((travarRatio || isKit) && ratio && val) {
      setLargura((parseFloat(val) * ratio).toFixed(1))
    }
  }

  const GLASS_TYPES = [
    { id: 'sem_vidro', label: 'Sem Vidro' },
    { id: 'vidro_comum', label: 'Vidro Comum' },
    { id: 'antirreflexo', label: 'Antirreflexo' },
  ]

  const canvasMontagens = montagems.filter(m => m.is_canvas)
  const convenMontagens = montagems.filter(m => !m.is_canvas)

  // mount_types disponíveis para o tipo selecionado
  const montagensDoTipo = tipoMontagem === 'canvas' ? canvasMontagens : tipoMontagem === 'convencional' ? convenMontagens : []

  // glass types permitidos para este lojista
  const allowedGlassTypes = lojista?.allowed_glass_types ?? ['sem_vidro', 'vidro_comum', 'antirreflexo']
  const glassOptions = GLASS_TYPES.filter(g => allowedGlassTypes.includes(g.id))

  const handleTipoMontagem = (tipo) => {
    setTipoMontagem(tipo)
    setTipoVidro('')
    setMolduraId('') // categorias de canvas e de papel são molduras diferentes
    // Auto-seleciona o único mount_type do tipo, se houver só 1
    const lista = tipo === 'canvas' ? canvasMontagens : convenMontagens
    setMontagemId(lista.length === 1 ? lista[0].id : '')
  }

  const resetForm = () => {
    setImagem(null); setLargura(''); setAltura(''); setQuantidade('1'); setFatias(1)
    setTipoMontagem(''); setMontagemId(''); setTipoVidro('')
    setSubstratoId(''); setMolduraId(''); setObs('')
    setClienteNome(''); setClienteContato(''); setFormaEntrega(''); setEnderecoEntrega('')
    setRatio(null); setTravarRatio(true)
    if (onImagemClear) onImagemClear()
  }

  const handleEnviar = async (statusEnvio = 'novo') => {
    if (!largura || !altura) { setErro('Informe o tamanho do quadro.'); return }
    if (!tipoMontagem) { setErro('Selecione o tipo de montagem (Canvas ou Quadro Convencional).'); return }
    if (tipoMontagem === 'convencional' && !tipoVidro) { setErro('Selecione o tipo de vidro.'); return }
    if (framesDoTipo.length > 0 && !molduraId) { setErro('Selecione a categoria da moldura.'); return }
    setErro('')
    setEnviando(statusEnvio)
    try {
      await callFunction('sim-pedido', {
        method: 'POST',
        body: {
          status: statusEnvio,
          montagem_id: montagemId || null,
          montagem_nome: montagem?.nome ?? '',
          tipo_montagem: tipoMontagem,
          tipo_vidro: tipoVidro || null,
          substrato_id: montagem?.itens?.find(i => i.role === 'substrato')?.substrato_id ?? null,
          substrato_nome: substrates?.find(s => s.id === montagem?.itens?.find(i => i.role === 'substrato')?.substrato_id)?.name ?? null,
          vidro_material_id: (() => {
            const vi = montagem?.itens?.find(i => i.role === 'vidro_selecionavel')
            if (!vi) return null
            if (tipoVidro === 'vidro_comum') return vi.vidro_cristal_id || null
            if (tipoVidro === 'antirreflexo') return vi.vidro_fosco_id || null
            return null
          })(),
          moldura_id: molduraId || null,
          moldura_nome: moldura?.name ?? null,
          largura_cm: parseFloat(largura),
          altura_cm: parseFloat(altura),
          quantidade: parseInt(quantidade) || 1,
          modo: isKit ? 'kit' : multiPeca ? 'fatiado' : null,
          pecas,
          obs,
          cliente_nome: clienteNome || null,
          cliente_contato: clienteContato || null,
          forma_entrega: formaEntrega || null,
          endereco_entrega: formaEntrega === 'entrega' ? (enderecoEntrega || null) : null,
          imagem_id: imagem?.id ?? null,
          imagem_titulo: imagem?.titulo ?? null,
          imagem_url: imagem?.img_url ?? null,
          preco_unitario: preco?.totalPeca ?? null,
          preco_total: preco?.totalGeral ?? null,
          preco_b2b: preco?.totalGeral != null ? parseFloat((preco.totalGeral / (1 + (parseFloat(markupPct) || 0) / 100)).toFixed(2)) : null,
          linhas: preco?.lines?.map(l => ({ item: l.label, detail: '', cost: 0, sell: parseFloat((l.valor || 0).toFixed(2)) })) ?? [],
        },
      })
      setSucesso(statusEnvio)
      resetForm()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setErro(e.message)
      if (e.message.startsWith('O preço foi atualizado')) {
        callFunction('sim-lojista-data').then(d => setCatalogoData(d)).catch(() => {})
      }
    } finally {
      setEnviando(null)
    }
  }

  const accent = colors.accent
  const base = { fontFamily: fonts.body }

  // ── Design tokens locais (estendem o tema) ──────────────────────────────
  const gold = accent
  const ink = colors.text

  const inp = {
    width: '100%', boxSizing: 'border-box',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: '11px 12px',
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.body,
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  const lbl = {
    fontSize: 12, fontWeight: 600, color: colors.textMuted,
    display: 'block', marginBottom: 6,
  }

  // Cartão de opção (acabamento, moldura): marcador redondo + título + subtítulo
  const opcao = (on) => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px',
    borderRadius: 8,
    border: `1px solid ${on ? ink : colors.border}`,
    boxShadow: on ? `inset 0 0 0 1px ${ink}` : 'none',
    background: on ? colors.surfaceAlt : colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
    textAlign: 'left', lineHeight: 1.3, width: '100%',
  })
  const opcaoBtn = ({ key, on, onClick, titulo, sub }) => (
    <button key={key} type="button" onClick={onClick} style={opcao(on)} aria-pressed={on}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        border: `1.5px solid ${on ? ink : colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: ink }} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: fonts.display, fontSize: 16, fontWeight: 600 }}>{titulo}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{sub}</span>}
      </span>
    </button>
  )
  const gradeOpcoes = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 10 })

  // Botão pequeno: vidro / entrega
  const chipBtn = (on) => ({
    padding: '8px 14px',
    borderRadius: 999,
    border: `1px solid ${on ? ink : colors.border}`,
    background: on ? ink : colors.surface,
    color: on ? colors.bg : colors.text,
    fontWeight: 600, fontSize: 12,
    fontFamily: fonts.body,
    cursor: 'pointer', transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  })

  const sectionLine = {
    fontFamily: fonts.display, fontSize: 19, fontWeight: 600, color: colors.text,
    paddingBottom: 12, marginBottom: 16,
    borderBottom: `1px solid ${colors.border}`,
  }

  const secao = { paddingBottom: 28, marginBottom: 28, borderBottom: `1px solid ${colors.border}` }

  const Passo = ({ n, titulo, nota, children }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <h2 style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: 0, fontFamily: fonts.display, fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>
        <span style={{ fontSize: 15, fontFamily: fonts.body, fontWeight: 600, color: gold, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
        {titulo}
        {nota && <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 500, color: colors.textMuted }}>{nota}</span>}
      </h2>
      {children}
    </div>
  )

  useEffect(() => {
    if (!mockupAberto) return
    const onKey = (e) => { if (e.key === 'Escape') setMockupAberto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mockupAberto])

  if (loadingData) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Carregando..." /></div>
  if (erroData) return <div style={{ color: colors.danger, padding: 24 }}>{erroData}</div>

  if (showBanco) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={() => setShowBanco(false)}
            style={{ background: 'none', border: 'none', color: gold, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Voltar ao simulador
          </button>
        </div>
        <BancoImagensPage onSelectImagem={(img) => {
          setImagem(img)
          setLargura(''); setAltura(''); setFatias(1); setQuantidade('1')
          detectRatio(img)
          setShowBanco(false)
        }} />
      </div>
    )
  }

  const hasDims = parseFloat(largura) > 0 && parseFloat(altura) > 0

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', fontFamily: fonts.body }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 }}>Novo pedido</div>
        <h1 style={{ fontFamily: fonts.display, fontSize: 'clamp(27px, 3.9vw, 37px)', fontWeight: 600, color: colors.text, margin: '6px 0 8px', lineHeight: 1.05, letterSpacing: -0.8, textWrap: 'balance' }}>
          Monte o quadro do seu cliente
        </h1>
        <p style={{ fontSize: 15, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>
          Escolha a obra, o tamanho e o acabamento. O preço aparece ao lado assim que tudo estiver definido.
        </p>
      </div>

      {sucesso && (
        <div style={{ background: colors.success + '12', border: `1px solid ${colors.success}40`, borderRadius: 4, padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontWeight: 700, color: colors.success, fontSize: 15, marginBottom: 2 }}>
              {sucesso === 'orcamento' ? 'Orçamento salvo' : 'Pedido enviado ao estúdio'}
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>
              {sucesso === 'orcamento'
                ? 'Ele fica em Meus pedidos. De lá você gera o PDF para o cliente e confirma quando ele fechar.'
                : 'O Estúdio ABC vai confirmar e iniciar a produção. Acompanhe em Meus pedidos.'}
            </div>
          </div>
          {onVerPedidos && (
            <button onClick={onVerPedidos}
              style={{ background: 'none', color: colors.text, border: `1px solid ${colors.text}`, borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, whiteSpace: 'nowrap' }}>
              Ver meus pedidos
            </button>
          )}
          <button onClick={() => setSucesso(null)}
            style={{ background: colors.text, color: colors.bg, border: 'none', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, whiteSpace: 'nowrap' }}>
            Novo pedido
          </button>
        </div>
      )}


      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 340px', gap: isMobile ? 28 : 56, alignItems: 'start' }} className="sim-layout">

        {/* ─── Coluna esquerda: formulário ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Imagem */}
          <div style={secao}>
            <Passo n="1" titulo="Obra" nota="opcional" />
            {!imagem && (
              <button onClick={() => setShowBanco(true)}
                style={{ width: '100%', background: colors.surface, border: `1px dashed ${colors.textMuted}`, color: colors.text, borderRadius: 4, padding: '22px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
                Escolher uma obra do acervo
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: colors.textMuted, marginTop: 4 }}>ou siga sem obra se o cliente trouxer a própria imagem</span>
              </button>
            )}
            {imagem && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 4, padding: 12 }}>
                <img src={imagem.img_url} alt={imagem.titulo}
                  style={{ width: 64, height: 64, objectFit: 'contain', background: colors.surfaceAlt, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imagem.titulo}</div>
                  {imagem.kitCount > 1 && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Composição de {imagem.kitCount} quadros</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setShowBanco(true)}
                    style={{ background: 'none', border: `1px solid ${colors.border}`, color: colors.textMuted, borderRadius: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
                    Trocar
                  </button>
                  <button onClick={() => { setImagem(null); setRatio(null); setFatias(1); if (onImagemClear) onImagemClear() }}
                    style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '4px 6px' }}>
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tamanho */}
          <div style={secao}>
            <Passo n="2" titulo="Tamanho">
              {ratio && !isKit && (
                <button onClick={() => setTravarRatio(t => !t)}
                  style={{ background: 'none', border: `1px solid ${travarRatio ? ink : colors.border}`, color: travarRatio ? ink : colors.textMuted, borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, transition: 'all 0.15s' }}>
                  {travarRatio ? 'Proporção da obra: travada' : 'Proporção livre'}
                </button>
              )}
            </Passo>
            {fatiasMax > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Vender como</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[1, 2, 3].filter(n => n <= fatiasMax).map(n => (
                    <button key={n} onClick={() => { setFatias(n); setTravarRatio(true); if (ratio && largura) setAltura((parseFloat(largura) / ratio).toFixed(1)) }} style={chipBtn(nFatias === n)}>
                      {n === 1 ? 'Quadro único' : `${n} peças`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 96px', gap: 12 }}>
              <div>
                <label style={lbl}>{multiPeca ? 'Largura total (cm)' : 'Largura (cm)'}</label>
                <input style={inp} type="number" min="1" step="0.5" placeholder="ex.: 60" value={largura} onChange={e => handleLargura(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Altura (cm)</label>
                <input style={inp} type="number" min="1" step="0.5" placeholder="ex.: 40" value={altura} onChange={e => handleAltura(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>{multiPeca ? 'Conjuntos' : 'Quantidade'}</label>
                <input style={inp} type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
              </div>
            </div>
            {hasDims && !multiPeca && (
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, letterSpacing: 0.2 }}>
                {parseFloat(largura).toFixed(0)} × {parseFloat(altura).toFixed(0)} cm &nbsp;·&nbsp; {((parseFloat(largura) * parseFloat(altura)) / 10000).toFixed(4)} m²
              </div>
            )}
            {hasDims && multiPeca && (
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 10, lineHeight: 1.5 }}>
                <span style={{ color: colors.text, fontWeight: 600 }}>{descPecas}</span>
                <br />
                {isKit
                  ? 'Todas com a mesma altura; cada peça mantém a proporção original da obra, sem corte.'
                  : `A obra inteira é dividida em ${pecas.length} faixas iguais, lado a lado.`}
              </div>
            )}
          </div>

          {/* Montagem + Vidro */}
          <div style={tipoMontagem ? { marginBottom: 20 } : secao}>
            <Passo n="3" titulo="Acabamento" />
            {montagems.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>Nenhuma montagem disponível.</p>
            ) : (
              <div style={gradeOpcoes(200)}>
                {canvasMontagens.length > 0 && (
                  opcaoBtn({ on: tipoMontagem === 'canvas', onClick: () => handleTipoMontagem('canvas'), titulo: 'Canvas', sub: 'impressão em canvas' })
                )}
                {convenMontagens.length > 0 && (
                  opcaoBtn({ on: tipoMontagem === 'convencional', onClick: () => handleTipoMontagem('convencional'), titulo: 'Papel', sub: 'impressão em papel' })
                )}
              </div>
            )}

            {tipoMontagem && montagensDoTipo.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <label style={lbl}>Especificação</label>
                <select style={inp} value={montagemId} onChange={e => setMontagemId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {montagensDoTipo.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
            )}

          </div>

          {/* Moldura — antes do vidro */}
          {framesDoTipo.length > 0 && tipoMontagem && (
            <div style={tipoMontagem === 'convencional' && molduraId ? { marginBottom: 20 } : secao}>
              <label style={lbl}>Moldura</label>
              <div style={gradeOpcoes(160)}>
                {framesDoTipo.map(f => opcaoBtn({
                  key: f.id, on: molduraId === f.id, onClick: () => setMolduraId(f.id),
                  titulo: f.rotulo, sub: f.width_cm ? `perfil de ${String(f.width_cm).replace('.', ',')} cm` : null,
                }))}
              </div>
            </div>
          )}

          {/* Vidro — após moldura */}
          {tipoMontagem === 'convencional' && molduraId && glassOptions.length > 0 && (
            <div style={secao}>
              <label style={lbl}>Vidro</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {glassOptions.map(g => (
                  <button key={g.id} onClick={() => setTipoVidro(g.id)} style={chipBtn(tipoVidro === g.id)}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cliente */}
          <div style={secao}>
            <Passo n="4" titulo="Cliente e entrega" nota="opcional" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Nome</label>
                <input style={inp} placeholder="Nome do cliente" value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Contato</label>
                <input style={inp} placeholder="(11) 99999-9999" value={clienteContato} onChange={e => setClienteContato(e.target.value)} />
              </div>
            </div>
            <label style={lbl}>Forma de entrega</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: formaEntrega === 'entrega' ? 12 : 0 }}>
              {[{ id: 'retirada', label: 'Retira na loja' }, { id: 'entrega', label: 'Entrega no endereço' }].map(f => (
                <button key={f.id} onClick={() => setFormaEntrega(f.id)} style={chipBtn(formaEntrega === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {formaEntrega === 'entrega' && (
              <div>
                <label style={lbl}>Endereço de entrega</label>
                <input style={inp} placeholder="Rua, número, bairro, cidade..." value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} />
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <label style={lbl}>Observações para o estúdio (opcional)</label>
            <textarea
              style={{ ...inp, resize: 'vertical', minHeight: 64 }}
              placeholder="Prazo, acabamento especial, instruções de produção..."
              value={obs}
              onChange={e => setObs(e.target.value)}
            />
          </div>

        </div>

        {/* ─── Painel direito: resumo ─── */}
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, padding: 24, position: isMobile ? 'static' : 'sticky', top: 96 }}>

          <div style={sectionLine}>Ficha do quadro</div>

          {/* Mockup */}
          {imagem ? (
            <div style={{ marginBottom: 16 }}>
              <button onClick={() => setMockupAberto(true)} aria-label="Ampliar o quadro no ambiente"
                style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', position: 'relative' }}>
              <MockupCanvas
                imgUrl={isKit ? null : imagem.img_url}
                kitUrls={isKit ? imagem.kitParts.map(p => p.img_url) : null}
                slices={isKit ? 1 : nFatias}
                tamanhoCm={parseFloat(altura) > 0 ? { altura: parseFloat(altura) } : null}
                ratio={ratio || parseFloat(imagem.ratio) || 1} width={250} />
                <span style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(14,13,10,0.75)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 999, fontFamily: fonts.body }}>
                  Ampliar
                </span>
              </button>
            </div>
          ) : (
            <div style={{ aspectRatio: '4/3', background: colors.surfaceAlt, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: colors.textMuted }}>A obra escolhida aparece aqui</span>
            </div>
          )}

          {/* Itens do resumo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
            {hasDims && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Tamanho</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>
                  {multiPeca ? descPecas : `${parseFloat(largura).toFixed(0)} × ${parseFloat(altura).toFixed(0)} cm`}
                  {parseInt(quantidade) > 1 ? ` · ${quantidade} ${multiPeca ? 'conjuntos' : 'un.'}` : ''}
                </span>
              </div>
            )}
            {tipoMontagem && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Montagem</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>
                  {tipoMontagem === 'canvas' ? 'Canvas' : 'Papel'}{montagem ? ` · ${montagem.nome}` : ''}
                </span>
              </div>
            )}
            {tipoVidro && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Vidro</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right' }}>
                  {GLASS_TYPES.find(g => g.id === tipoVidro)?.label}
                </span>
              </div>
            )}
            {moldura && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Moldura</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>
                  {infoMoldura(moldura).rotulo}
                </span>
              </div>
            )}
            {clienteNome && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Cliente</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{clienteNome}</span>
              </div>
            )}
            {formaEntrega && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Entrega</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right' }}>{formaEntrega === 'retirada' ? 'Retira na loja' : 'Entrega'}</span>
              </div>
            )}
          </div>

          {/* Total — só aparece com moldura selecionada */}
          {preco && preco.totalGeral > 0 && molduraId ? (
            <div style={{ borderTop: `1px solid ${colors.text}`, marginTop: 18, paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Preço para o cliente</span>
                <span style={{ fontFamily: fonts.display, fontSize: 30, fontWeight: 600, color: colors.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(preco.totalGeral)}
                </span>
              </div>
              {preco.qty > 1 && (
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(preco.totalPeca)} por {multiPeca ? 'conjunto' : 'unidade'}
                </div>
              )}
              {markupPct > 0 && (
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>Já inclui o seu markup de {markupPct}%.</div>
              )}
            </div>
          ) : (
            <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 18, paddingTop: 16, fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>
              Defina o tamanho, o acabamento e a moldura para ver o preço.
            </div>
          )}

          {erro && (
            <div role="alert" style={{ marginTop: 16, background: colors.danger + '10', borderLeft: `3px solid ${colors.danger}`, padding: '10px 12px', fontSize: 13, color: colors.danger, lineHeight: 1.45 }}>
              {erro}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            <button
              onClick={() => handleEnviar('novo')}
              disabled={!!enviando}
              style={{
                background: enviando === 'novo' ? colors.textMuted : colors.text,
                color: colors.bg, border: 'none', borderRadius: 999,
                padding: '15px', fontSize: 15, fontWeight: 700,
                cursor: enviando ? 'default' : 'pointer',
                fontFamily: fonts.body, transition: 'background 0.15s',
              }}>
              {enviando === 'novo' ? 'Enviando…' : 'Enviar pedido ao estúdio'}
            </button>
            <button
              onClick={() => handleEnviar('orcamento')}
              disabled={!!enviando}
              style={{
                background: 'transparent', color: colors.text,
                border: `1px solid ${colors.text}`, borderRadius: 999,
                padding: '13px', fontSize: 14, fontWeight: 600,
                cursor: enviando ? 'default' : 'pointer',
                fontFamily: fonts.body, opacity: enviando === 'orcamento' ? 0.6 : 1,
              }}>
              {enviando === 'orcamento' ? 'Salvando…' : 'Salvar como orçamento'}
            </button>
            <div style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 1.45 }}>
              O orçamento fica guardado para você mandar ao cliente e confirmar depois.
            </div>
          </div>
        </div>

      </div>

      {mockupAberto && imagem && (
        <div role="dialog" aria-modal="true" aria-label="Quadro no ambiente" onClick={e => { if (e.target === e.currentTarget) setMockupAberto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,13,10,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', zIndex: 1000, padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 1100, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, minWidth: 0 }}>
              {ROOMS.map(room => (
                <button key={room.id} onClick={() => setMockupRoom(room)} title={room.label} aria-label={`Ambiente ${room.label}`} aria-pressed={mockupRoom.id === room.id}
                  style={{ flexShrink: 0, width: 84, height: 54, overflow: 'hidden', border: 'none', outline: mockupRoom.id === room.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)', outlineOffset: mockupRoom.id === room.id ? 2 : 0, opacity: mockupRoom.id === room.id ? 1 : 0.6, cursor: 'pointer', padding: 0, background: '#000' }}>
                  <img src={room.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' }}>Moldura</span>
              {FRAME_COLORS.map(fc => (
                <button key={fc.id} title={fc.label} aria-label={`Moldura ${fc.label}`} aria-pressed={mockupCor === fc.id} onClick={() => setMockupCor(fc.id)}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: fc.swatch, border: `2px solid ${fc.border}`, cursor: 'pointer', outline: mockupCor === fc.id ? '2px solid #fff' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>
          <MockupCanvas
            imgUrl={isKit ? null : imagem.img_url}
            kitUrls={isKit ? imagem.kitParts.map(p => p.img_url) : [imagem.img_url]}
            slices={isKit ? 1 : nFatias}
            ratio={ratio || parseFloat(imagem.ratio) || 1}
            frameColor={mockupCor}
            width={1100}
            room={mockupRoom}
            interactive
            tamanhoCm={parseFloat(altura) > 0 ? { altura: parseFloat(altura) } : null}
            onTamanhoChange={(alt) => {
              // mantém a proporção escolhida no pedido, mesmo com a proporção livre
              const f = alt / (parseFloat(altura) || alt)
              setAltura(String(alt))
              setLargura(String(um((parseFloat(largura) || 0) * f)))
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, width: '100%', maxWidth: 1100, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              {parseFloat(altura) > 0
                ? `Tamanho real: ${multiPeca ? descPecas : `${cm(parseFloat(largura) || 0)} × ${cm(parseFloat(altura))} cm`}${preco?.totalGeral > 0 && molduraId ? ` · ${formatCurrency(preco.totalGeral)}` : ''} · arraste para posicionar, puxe um canto para mudar o tamanho`
                : 'Arraste o quadro para posicionar · puxe um canto para redimensionar'}
            </span>
            <button onClick={() => setMockupAberto(false)}
              style={{ background: '#fff', color: '#14130f', border: 'none', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body }}>
              Voltar ao pedido
            </button>
          </div>
        </div>
      )}

      <style>{`
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        select option { background: #fff; color: #1a1814; }
      `}</style>
    </div>
  )
}
