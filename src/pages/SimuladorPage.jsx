import { useState, useEffect, useMemo } from 'react'
import { useTheme, formatCurrency } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { callFunction } from '../services/supabase'
import { Spinner } from '../components/UI'
import MockupCanvas from '../components/MockupCanvas'
import BancoImagensPage from './BancoImagensPage'

function calcPreco({ montagem, substrato, moldura, w, h, qty, materials, tipoVidro, markupPct }) {
  if (!w || !h || w <= 0 || h <= 0) return null
  const areaM2 = (w * h) / 10000
  const markup = 1 + (parseFloat(markupPct) || 0) / 100
  const molduraW = parseFloat(moldura?.width_cm) || 0
  const perimM = 2 * (w + h) / 100
  const perimComMolduraM = 2 * (w + h + molduraW * 4) / 100
  const lines = []

  if (substrato) {
    const base = areaM2 * (parseFloat(substrato.sell_price) || 0)
    if (base > 0) lines.push({ label: `Impressão ${substrato.name}`, valor: base * markup })
  }

  if (montagem?.itens?.length) {
    for (const item of montagem.itens) {
      const role = item.role

      if (role === 'vidro_selecionavel') {
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
    if (base > 0) lines.push({ label: `Moldura ${moldura.name}`, valor: base * markup })
  }

  const totalPeca = lines.reduce((s, l) => s + l.valor, 0)
  const q = parseInt(qty) || 1
  return { lines, totalPeca, totalGeral: totalPeca * q, qty: q }
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap'

function injectFonts() {
  if (document.querySelector('[data-sim-fonts]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = FONTS
  link.setAttribute('data-sim-fonts', '1')
  document.head.appendChild(link)
}

export default function SimuladorPage({ imagemInicial, onImagemClear }) {
  const { colors } = useTheme()
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
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { injectFonts() }, [])

  useEffect(() => {
    callFunction('sim-lojista-data')
      .then(d => setCatalogoData(d))
      .catch(e => setErroData(e.message))
      .finally(() => setLoadingData(false))
  }, [])

  useEffect(() => {
    if (imagemInicial) {
      setImagem(imagemInicial)
      detectRatio(imagemInicial)
    }
  }, [imagemInicial])

  const detectRatio = (img) => {
    if (!img?.img_url) return
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

  const preco = useMemo(() =>
    calcPreco({ montagem, substrato, moldura, w: parseFloat(largura), h: parseFloat(altura), qty: quantidade, materials, tipoVidro, markupPct }),
    [montagem, substrato, moldura, largura, altura, quantidade, materials, tipoVidro, markupPct]
  )

  const framesPorCat = frames.reduce((acc, f) => {
    const cat = f.categoria ?? 'Outras'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})
  const catOrder = ['A', 'B', 'C', 'Outras']
  const catLabels = { A: 'Premium', B: 'Intermediária', C: 'Econômica', Outras: 'Outras' }

  const handleLargura = (val) => {
    setLargura(val)
    if (travarRatio && ratio && val) {
      setAltura((parseFloat(val) / ratio).toFixed(1))
    }
  }
  const handleAltura = (val) => {
    setAltura(val)
    if (travarRatio && ratio && val) {
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
    // Auto-seleciona o único mount_type do tipo, se houver só 1
    const lista = tipo === 'canvas' ? canvasMontagens : convenMontagens
    setMontagemId(lista.length === 1 ? lista[0].id : '')
  }

  const resetForm = () => {
    setImagem(null); setLargura(''); setAltura(''); setQuantidade('1')
    setTipoMontagem(''); setMontagemId(''); setTipoVidro('')
    setSubstratoId(''); setMolduraId(''); setObs('')
    setClienteNome(''); setClienteContato(''); setFormaEntrega(''); setEnderecoEntrega('')
    setRatio(null); setTravarRatio(true)
    if (onImagemClear) onImagemClear()
  }

  const handleEnviar = async () => {
    if (!largura || !altura) { setErro('Informe o tamanho do quadro.'); return }
    if (!tipoMontagem) { setErro('Selecione o tipo de montagem (Canvas ou Quadro Convencional).'); return }
    if (tipoMontagem === 'convencional' && !tipoVidro) { setErro('Selecione o tipo de vidro.'); return }
    if (frames.length > 0 && !molduraId) { setErro('Selecione uma moldura.'); return }
    setErro('')
    setEnviando(true)
    try {
      await callFunction('sim-pedido', {
        method: 'POST',
        body: {
          montagem_id: montagemId || null,
          montagem_nome: montagem?.nome ?? '',
          tipo_montagem: tipoMontagem,
          tipo_vidro: tipoVidro || null,
          substrato_id: substratoId || null,
          substrato_nome: substrato?.name ?? null,
          moldura_id: molduraId || null,
          moldura_nome: moldura?.name ?? null,
          largura_cm: parseFloat(largura),
          altura_cm: parseFloat(altura),
          quantidade: parseInt(quantidade) || 1,
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
        },
      })
      setSucesso(true)
      resetForm()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const accent = colors.accent
  const base = { fontFamily: 'Inter, system-ui, sans-serif' }

  // ── Design tokens locais (estendem o tema) ──────────────────────────────
  const gold = accent  // #b08a4e
  const goldLight = accent + '20'
  const goldBorder = accent + '60'

  const inp = {
    width: '100%', boxSizing: 'border-box',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: '10px 12px',
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  const lbl = {
    fontSize: 10, fontWeight: 700, color: colors.textMuted,
    display: 'block', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 1.2,
  }

  // Botão tipo toggle: canvas / convencional
  const typeBtn = (on) => ({
    flex: 1, minWidth: 120,
    padding: '14px 12px',
    borderRadius: 6,
    border: `1.5px solid ${on ? gold : colors.border}`,
    background: on ? goldLight : colors.surfaceAlt,
    color: on ? gold : colors.text,
    fontWeight: 600, fontSize: 13,
    fontFamily: 'Inter, system-ui, sans-serif',
    cursor: 'pointer', transition: 'all 0.15s',
    textAlign: 'center', lineHeight: 1.3,
  })

  // Botão pequeno: vidro / entrega
  const chipBtn = (on) => ({
    padding: '8px 14px',
    borderRadius: 20,
    border: `1.5px solid ${on ? gold : colors.border}`,
    background: on ? goldLight : 'transparent',
    color: on ? gold : colors.textMuted,
    fontWeight: 600, fontSize: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
    cursor: 'pointer', transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  })

  const sectionLine = {
    fontSize: 10, fontWeight: 700, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.4,
    paddingBottom: 10, marginBottom: 16,
    borderBottom: `1px solid ${colors.border}`,
  }

  if (loadingData) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Carregando..." /></div>
  if (erroData) return <div style={{ color: colors.danger, padding: 24 }}>{erroData}</div>

  if (showBanco) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={() => setShowBanco(false)}
            style={{ background: 'none', border: 'none', color: gold, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Voltar ao simulador
          </button>
        </div>
        <BancoImagensPage onSelectImagem={(img) => {
          setImagem(img)
          detectRatio(img)
          if (img.kitCount > 1) setQuantidade(String(img.kitCount))
          setShowBanco(false)
        }} />
      </div>
    )
  }

  const hasDims = parseFloat(largura) > 0 && parseFloat(altura) > 0

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.text, margin: 0, letterSpacing: -0.5 }}>
          Novo Pedido
        </h1>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '4px 0 0' }}>
          {lojista?.store_name ?? 'Simulador'}
        </p>
      </div>

      {sucesso && (
        <div style={{ background: colors.success + '12', border: `1px solid ${colors.success}40`, borderRadius: 8, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, color: colors.success, fontSize: 14, marginBottom: 2 }}>Pedido enviado com sucesso</div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>O Estúdio ABC entrará em contato para confirmar.</div>
          </div>
          <button onClick={() => setSucesso(false)}
            style={{ background: colors.success, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap' }}>
            Novo pedido
          </button>
        </div>
      )}

      {erro && (
        <div style={{ background: colors.danger + '12', border: `1px solid ${colors.danger}40`, borderRadius: 6, padding: '10px 14px', fontSize: 13, color: colors.danger, marginBottom: 16 }}>
          {erro}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 24, alignItems: 'start' }} className="sim-layout">

        {/* ─── Coluna esquerda: formulário ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Imagem */}
          <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: imagem ? 12 : 0 }}>
              <span style={lbl}>Imagem — opcional</span>
              {!imagem && (
                <button onClick={() => setShowBanco(true)}
                  style={{ background: 'none', border: `1.5px solid ${gold}`, color: gold, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Escolher imagem
                </button>
              )}
            </div>
            {imagem && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: colors.surfaceAlt, borderRadius: 8, padding: '10px 12px' }}>
                <img src={imagem.img_url} alt={imagem.titulo}
                  style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 5, flexShrink: 0, border: `1px solid ${colors.border}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imagem.titulo}</div>
                  {imagem.kitCount > 1 && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Kit {imagem.kitCount} quadros</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setShowBanco(true)}
                    style={{ background: 'none', border: `1px solid ${colors.border}`, color: colors.textMuted, borderRadius: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Trocar
                  </button>
                  <button onClick={() => { setImagem(null); setRatio(null); if (onImagemClear) onImagemClear() }}
                    style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '4px 6px' }}>
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tamanho */}
          <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={lbl}>Tamanho</span>
              {ratio && (
                <button onClick={() => setTravarRatio(t => !t)}
                  style={{ background: 'none', border: `1px solid ${travarRatio ? gold : colors.border}`, color: travarRatio ? gold : colors.textMuted, borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 0.15s' }}>
                  {travarRatio ? 'Proporção travada' : 'Proporção livre'}
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
              <div>
                <label style={lbl}>Largura (cm)</label>
                <input style={inp} type="number" min="1" step="0.5" placeholder="60" value={largura} onChange={e => handleLargura(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Altura (cm)</label>
                <input style={inp} type="number" min="1" step="0.5" placeholder="40" value={altura} onChange={e => handleAltura(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Qtd.</label>
                <input style={inp} type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
              </div>
            </div>
            {hasDims && (
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, letterSpacing: 0.2 }}>
                {parseFloat(largura).toFixed(0)} × {parseFloat(altura).toFixed(0)} cm &nbsp;·&nbsp; {((parseFloat(largura) * parseFloat(altura)) / 10000).toFixed(4)} m²
              </div>
            )}
          </div>

          {/* Montagem + Vidro */}
          <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
            <div style={lbl}>Montagem</div>
            {montagems.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>Nenhuma montagem disponível.</p>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {canvasMontagens.length > 0 && (
                  <button onClick={() => handleTipoMontagem('canvas')} style={typeBtn(tipoMontagem === 'canvas')}>
                    <span style={{ display: 'block', fontSize: 15, marginBottom: 2 }}>Canvas</span>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: tipoMontagem === 'canvas' ? gold : colors.textMuted, letterSpacing: 0 }}>impressão em tela</span>
                  </button>
                )}
                {convenMontagens.length > 0 && (
                  <button onClick={() => handleTipoMontagem('convencional')} style={typeBtn(tipoMontagem === 'convencional')}>
                    <span style={{ display: 'block', fontSize: 15, marginBottom: 2 }}>Quadro</span>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: tipoMontagem === 'convencional' ? gold : colors.textMuted, letterSpacing: 0 }}>com vidro e moldura</span>
                  </button>
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

            {tipoMontagem === 'convencional' && glassOptions.length > 0 && (
              <div style={{ marginTop: 16 }}>
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
          </div>

          {/* Moldura */}
          {frames.length > 0 && (
            <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
              <label style={lbl}>Moldura *</label>
              <select style={inp} value={molduraId} onChange={e => setMolduraId(e.target.value)}>
                <option value="">— selecione a moldura —</option>
                {catOrder.filter(c => framesPorCat[c]).map(cat => (
                  <optgroup key={cat} label={catLabels[cat]}>
                    {framesPorCat[cat].map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {/* Cliente */}
          <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
            <div style={lbl}>Dados do cliente — opcional</div>
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
            <label style={lbl}>Observações — opcional</label>
            <textarea
              style={{ ...inp, resize: 'vertical', minHeight: 64 }}
              placeholder="Prazo, acabamento especial, instruções de produção..."
              value={obs}
              onChange={e => setObs(e.target.value)}
            />
          </div>

        </div>

        {/* ─── Painel direito: resumo ─── */}
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20, position: 'sticky', top: 24 }}>

          <div style={sectionLine}>Resumo do pedido</div>

          {/* Mockup */}
          {imagem ? (
            <div style={{ marginBottom: 16 }}>
              <MockupCanvas imgUrl={imagem.img_url} ratio={ratio || parseFloat(imagem.ratio) || 1} width={250} />
            </div>
          ) : (
            <div style={{ aspectRatio: '4/3', background: colors.surfaceAlt, borderRadius: 6, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: colors.textMuted }}>sem imagem</span>
            </div>
          )}

          {/* Itens do resumo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
            {hasDims && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Tamanho</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>
                  {parseFloat(largura).toFixed(0)} × {parseFloat(altura).toFixed(0)} cm{parseInt(quantidade) > 1 ? ` · ${quantidade} un.` : ''}
                </span>
              </div>
            )}
            {tipoMontagem && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span style={{ color: colors.textMuted, flexShrink: 0 }}>Montagem</span>
                <span style={{ color: colors.text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>
                  {tipoMontagem === 'canvas' ? 'Canvas' : 'Quadro'}{montagem ? ` · ${montagem.nome}` : ''}
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
                  {moldura.name}
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

          {/* Total */}
          {preco && preco.totalGeral > 0 && (
            <>
              <div style={{ borderTop: `2px solid ${colors.border}`, marginTop: 14, paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>Total</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 28, fontWeight: 600, color: gold, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(preco.totalGeral)}
                    </div>
                    {preco.qty > 1 && (
                      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(preco.totalPeca)} / unidade
                      </div>
                    )}
                  </div>
                </div>
                {markupPct > 0 && (
                  <div style={{ fontSize: 11, color: gold, marginTop: 8, opacity: 0.8 }}>Markup de {markupPct}% aplicado</div>
                )}
              </div>
            </>
          )}

          <button
            onClick={handleEnviar}
            disabled={enviando}
            style={{
              width: '100%', marginTop: 18,
              background: enviando ? colors.textMuted : gold,
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '13px', fontSize: 14, fontWeight: 600,
              cursor: enviando ? 'default' : 'pointer',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: 0.3, transition: 'background 0.15s',
            }}>
            {enviando ? 'Enviando…' : 'Enviar Pedido'}
          </button>
        </div>

      </div>

      <style>{`
        @media (max-width: 660px) {
          .sim-layout { grid-template-columns: 1fr !important; }
        }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        select option { background: #fff; color: #1a1814; }
      `}</style>
    </div>
  )
}
