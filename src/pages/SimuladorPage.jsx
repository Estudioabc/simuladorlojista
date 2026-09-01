import { useState, useEffect, useMemo } from 'react'
import { useTheme, formatCurrency } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { callFunction } from '../services/supabase'
import { Spinner } from '../components/UI'
import MockupCanvas from '../components/MockupCanvas'
import BancoImagensPage from './BancoImagensPage'

function calcPreco({ montagem, substrato, moldura, w, h, qty, materialsByCategory, markupPct }) {
  if (!w || !h || w <= 0 || h <= 0) return null
  const areaM2 = (w * h) / 10000
  const markup = 1 + (parseFloat(markupPct) || 0) / 100
  const lines = []

  if (substrato) {
    const base = areaM2 * (parseFloat(substrato.sell_price) || 0)
    lines.push({ label: `Impressão ${substrato.name}`, valor: base * markup })
  }

  if (montagem?.items?.length) {
    const allMats = Object.values(materialsByCategory).flat()
    for (const item of montagem.items) {
      const iN = typeof item === 'string' ? item : item.name
      if (iN === 'moldura' || iN === 'reforco' || iN === 'reforço') continue
      const matId = typeof item === 'object' ? item.default_material_id : null
      if (!matId) continue
      const mat = allMats.find(m => m.id === matId)
      if (!mat) continue
      const base = areaM2 * (parseFloat(mat.sell_price) || 0)
      lines.push({ label: mat.name, valor: base * markup })
    }
  }

  if (moldura) {
    const fw = parseFloat(moldura.width_cm) || 0
    const perimeterM = 2 * (w + h + fw * 4) / 100
    const base = perimeterM * (parseFloat(moldura.sell_price) || 0)
    lines.push({ label: `Moldura ${moldura.name}`, valor: base * markup })
  }

  const totalPeca = lines.reduce((s, l) => s + l.valor, 0)
  const q = parseInt(qty) || 1
  return { lines, totalPeca, totalGeral: totalPeca * q, qty: q }
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'

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
  const materialsByCategory = catalogoData?.materialsByCategory ?? {}
  const discount = catalogoData?.discount_pct ?? 0

  const montagem = montagems.find(m => m.id === montagemId) ?? null
  const substrato = substrates.find(s => s.id === substratoId) ?? null
  const moldura = frames.find(f => f.id === molduraId) ?? null

  const markupPct = lojista?.markup_pct ?? 0

  const preco = useMemo(() =>
    calcPreco({ montagem, substrato, moldura, w: parseFloat(largura), h: parseFloat(altura), qty: quantidade, materialsByCategory, markupPct }),
    [montagem, substrato, moldura, largura, altura, quantidade, materialsByCategory, markupPct]
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

  const isCanvasMontagem = (nome) => nome?.toLowerCase().includes('canvas')

  const canvasMontagens = montagems.filter(m => isCanvasMontagem(m.nome))
  const convenMontagens = montagems.filter(m => !isCanvasMontagem(m.nome))

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

  const S = {
    page: { ...base, maxWidth: 900, margin: '0 auto' },
    input: { width: '100%', boxSizing: 'border-box', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '10px 12px', color: colors.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none' },
    select: { width: '100%', boxSizing: 'border-box', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '10px 12px', color: colors.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', cursor: 'pointer' },
    label: { fontSize: 11, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
    card: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '16px 18px', marginBottom: 12 },
    cardTitle: { fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
    toggleBtn: (on) => ({ flex: 1, padding: '11px 14px', borderRadius: 8, border: `2px solid ${on ? accent : colors.border}`, background: on ? accent + '15' : colors.surfaceAlt, color: on ? accent : colors.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 0.15s', textAlign: 'center' }),
    glassBtn: (on) => ({ padding: '9px 14px', borderRadius: 7, border: `1.5px solid ${on ? accent : colors.border}`, background: on ? accent + '15' : colors.surfaceAlt, color: on ? accent : colors.text, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 0.15s' }),
    btnBanco: { background: 'transparent', color: accent, border: `1.5px solid ${accent}`, borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' },
    removeBtn: { background: 'none', border: 'none', color: colors.textMuted, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' },
    panel: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 18, position: 'sticky', top: 24 },
    panelTitle: { fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` },
    panelImgEmpty: { aspectRatio: '4/3', background: colors.surfaceAlt, borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, fontSize: 12 },
    optionRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: colors.textMuted, marginBottom: 6, gap: 8 },
    optionVal: { color: colors.text, fontWeight: 500, textAlign: 'right', flexShrink: 0 },
    divider: { borderTop: `1px solid ${colors.border}`, margin: '12px 0' },
    priceLine: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: colors.textMuted, marginBottom: 6 },
    priceVal: { color: colors.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
    priceTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, paddingTop: 12, borderTop: `2px solid ${colors.border}` },
    priceTotalVal: { fontFamily: 'Lora, Georgia, serif', fontSize: 24, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' },
    unitLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'right' },
    submitBtn: { width: '100%', background: accent, color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 16, fontFamily: 'Inter, system-ui, sans-serif' },
    error: { background: colors.danger + '14', border: `1px solid ${colors.danger}30`, borderRadius: 7, padding: '10px 14px', fontSize: 13, color: colors.danger, marginBottom: 12 },
    success: { background: colors.success + '14', border: `1px solid ${colors.success}30`, borderRadius: 10, padding: 20, fontSize: 14, color: colors.success, textAlign: 'center', marginBottom: 16 },
    textarea: { width: '100%', boxSizing: 'border-box', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '9px 12px', color: colors.text, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', resize: 'vertical', minHeight: 60 },
  }

  if (loadingData) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Carregando..." /></div>
  if (erroData) return <div style={{ color: colors.danger, padding: 24 }}>{erroData}</div>

  if (showBanco) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button style={S.btnBanco} onClick={() => setShowBanco(false)}>← Voltar</button>
          <span style={{ color: colors.textMuted, fontSize: 13 }}>Clique em uma imagem para selecioná-la</span>
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
    <div style={S.page}>
      {sucesso && (
        <div style={S.success}>
          <strong style={{ display: 'block', marginBottom: 4 }}>Pedido enviado!</strong>
          O Estúdio ABC entrará em contato para confirmar.
          <div style={{ marginTop: 10 }}>
            <button style={{ ...S.submitBtn, width: 'auto', padding: '8px 20px', fontSize: 12, marginTop: 0 }} onClick={() => setSucesso(false)}>
              Novo pedido
            </button>
          </div>
        </div>
      )}

      {erro && <div style={S.error}>{erro}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 20, alignItems: 'start' }} className="sim-layout">

        {/* ── Coluna esquerda ── */}
        <div>

          {/* Imagem */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={S.cardTitle}>Imagem <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— opcional</span></span>
              {!imagem && <button style={S.btnBanco} onClick={() => setShowBanco(true)}>Escolher imagem</button>}
            </div>
            {imagem && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, background: colors.surfaceAlt, borderRadius: 7, padding: '8px 10px' }}>
                <img src={imagem.img_url} alt={imagem.titulo} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imagem.titulo}</div>
                  {imagem.categoria && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{imagem.categoria}{imagem.kitCount > 1 ? ` · Kit ${imagem.kitCount}x` : ''}</div>}
                </div>
                <button onClick={() => setShowBanco(true)} style={{ ...S.btnBanco, padding: '5px 10px', fontSize: 11 }}>Trocar</button>
                <button onClick={() => { setImagem(null); setRatio(null); if (onImagemClear) onImagemClear() }} style={S.removeBtn}>×</button>
              </div>
            )}
          </div>

          {/* Tamanho */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={S.cardTitle}>Tamanho</span>
              {ratio && (
                <button onClick={() => setTravarRatio(t => !t)}
                  style={{ background: travarRatio ? accent + '18' : 'transparent', border: `1px solid ${travarRatio ? accent : colors.border}`, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: travarRatio ? accent : colors.textMuted, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {travarRatio ? '🔒 Proporção travada' : '🔓 Livre'}
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
              <div>
                <label style={S.label}>Largura (cm)</label>
                <input style={S.input} type="number" min="1" step="0.5" placeholder="60" value={largura} onChange={e => handleLargura(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Altura (cm)</label>
                <input style={S.input} type="number" min="1" step="0.5" placeholder="40" value={altura} onChange={e => handleAltura(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Qtd.</label>
                <input style={S.input} type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
              </div>
            </div>
            {hasDims && (
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
                {parseFloat(largura).toFixed(0)} × {parseFloat(altura).toFixed(0)} cm · {((parseFloat(largura) * parseFloat(altura)) / 10000).toFixed(4)} m²
              </div>
            )}
          </div>

          {/* Montagem + Vidro (um card só) */}
          <div style={S.card}>
            <div style={S.cardTitle}>Montagem</div>
            {montagems.length === 0 ? (
              <div style={{ color: colors.textMuted, fontSize: 13 }}>Nenhuma montagem disponível.</div>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {canvasMontagens.length > 0 && (
                  <button onClick={() => handleTipoMontagem('canvas')} style={S.toggleBtn(tipoMontagem === 'canvas')}>
                    Canvas
                  </button>
                )}
                {convenMontagens.length > 0 && (
                  <button onClick={() => handleTipoMontagem('convencional')} style={S.toggleBtn(tipoMontagem === 'convencional')}>
                    Quadro Convencional
                  </button>
                )}
              </div>
            )}
            {tipoMontagem && montagensDoTipo.length > 1 && (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Especificação</label>
                <select style={S.select} value={montagemId} onChange={e => setMontagemId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {montagensDoTipo.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
            )}
            {/* Vidro aparece inline no mesmo card */}
            {tipoMontagem === 'convencional' && glassOptions.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                <label style={S.label}>Vidro</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {glassOptions.map(g => (
                    <button key={g.id} onClick={() => setTipoVidro(g.id)} style={S.glassBtn(tipoVidro === g.id)}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Moldura */}
          {frames.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>Moldura <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— opcional</span></div>
              <select style={S.select} value={molduraId} onChange={e => setMolduraId(e.target.value)}>
                <option value="">Sem moldura</option>
                {catOrder.filter(c => framesPorCat[c]).map(cat => (
                  <optgroup key={cat} label={catLabels[cat]}>
                    {framesPorCat[cat].map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {/* Cliente */}
          <div style={S.card}>
            <div style={S.cardTitle}>Cliente <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— opcional</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={S.label}>Nome</label>
                <input style={S.input} placeholder="Nome do cliente" value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Contato</label>
                <input style={S.input} placeholder="Tel / e-mail" value={clienteContato} onChange={e => setClienteContato(e.target.value)} />
              </div>
            </div>
            <label style={S.label}>Entrega</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: formaEntrega === 'entrega' ? 10 : 0 }}>
              {[{ id: 'retirada', label: 'Retira na loja' }, { id: 'entrega', label: 'Entrega no cliente' }].map(f => (
                <button key={f.id} onClick={() => setFormaEntrega(f.id)} style={S.glassBtn(formaEntrega === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {formaEntrega === 'entrega' && (
              <div>
                <label style={S.label}>Endereço</label>
                <input style={S.input} placeholder="Rua, número, bairro, cidade..." value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} />
              </div>
            )}
          </div>

          {/* Observações */}
          <div style={S.card}>
            <label style={S.label}>Observações <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— opcional</span></label>
            <textarea style={S.textarea} placeholder="Prazo, acabamento, instruções especiais..." value={obs} onChange={e => setObs(e.target.value)} />
          </div>

        </div>

        {/* ── Painel lateral: resumo + preço ── */}
        <div style={S.panel}>
          <div style={S.panelTitle}>Resumo</div>

          {imagem ? (
            <MockupCanvas imgUrl={imagem.img_url} ratio={ratio || parseFloat(imagem.ratio) || 1} width={270} />
          ) : (
            <div style={S.panelImgEmpty}>sem imagem</div>
          )}

          <div style={{ marginTop: 12 }}>
            {hasDims && (
              <div style={S.optionRow}>
                <span>Tamanho</span>
                <span style={S.optionVal}>{parseFloat(largura).toFixed(0)} × {parseFloat(altura).toFixed(0)} cm{parseInt(quantidade) > 1 ? ` × ${quantidade}` : ''}</span>
              </div>
            )}
            {tipoMontagem && (
              <div style={S.optionRow}>
                <span>Montagem</span>
                <span style={S.optionVal}>{tipoMontagem === 'canvas' ? 'Canvas' : 'Convencional'}{montagem ? ` · ${montagem.nome}` : ''}</span>
              </div>
            )}
            {tipoVidro && (
              <div style={S.optionRow}>
                <span>Vidro</span>
                <span style={S.optionVal}>{GLASS_TYPES.find(g => g.id === tipoVidro)?.label}</span>
              </div>
            )}
            {moldura && (
              <div style={S.optionRow}>
                <span>Moldura</span>
                <span style={S.optionVal}>{moldura.name}</span>
              </div>
            )}
            {clienteNome && (
              <div style={S.optionRow}>
                <span>Cliente</span>
                <span style={S.optionVal}>{clienteNome}</span>
              </div>
            )}
            {formaEntrega && (
              <div style={S.optionRow}>
                <span>Entrega</span>
                <span style={S.optionVal}>{formaEntrega === 'retirada' ? 'Retira' : 'Entrega'}</span>
              </div>
            )}

            {preco && preco.lines.length > 0 && (
              <>
                <div style={S.divider} />
                {preco.lines.map((l, i) => (
                  <div key={i} style={S.priceLine}>
                    <span style={{ flex: 1, paddingRight: 8 }}>{l.label}</span>
                    <span style={S.priceVal}>{formatCurrency(l.valor)}</span>
                  </div>
                ))}
                <div style={S.priceTotal}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Total</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={S.priceTotalVal}>{formatCurrency(preco.totalGeral)}</div>
                    {preco.qty > 1 && <div style={S.unitLabel}>{formatCurrency(preco.totalPeca)} / un.</div>}
                  </div>
                </div>
                {markupPct > 0 && (
                  <div style={{ fontSize: 11, color: accent, marginTop: 8 }}>Markup {markupPct}% aplicado</div>
                )}
              </>
            )}
          </div>

          <button style={{ ...S.submitBtn, opacity: enviando ? 0.6 : 1 }} disabled={enviando} onClick={handleEnviar}>
            {enviando ? 'Enviando...' : 'Enviar Pedido'}
          </button>
        </div>

      </div>

      <style>{`
        @media (max-width: 640px) {
          .sim-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
