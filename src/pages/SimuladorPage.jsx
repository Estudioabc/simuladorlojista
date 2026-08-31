import { useState, useEffect, useMemo } from 'react'
import { useTheme, formatCurrency } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { callFunction } from '../services/supabase'
import { Spinner } from '../components/UI'
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
  const [ratio, setRatio] = useState(null)       // largura/altura natural da imagem
  const [travarRatio, setTravarRatio] = useState(true)
  const [largura, setLargura] = useState('')
  const [altura, setAltura] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [montagemId, setMontagemId] = useState('')
  const [substratoId, setSubstratoId] = useState('')
  const [molduraId, setMolduraId] = useState('')
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

  const resetForm = () => {
    setImagem(null); setLargura(''); setAltura(''); setQuantidade('1')
    setMontagemId(''); setSubstratoId(''); setMolduraId(''); setObs('')
    setRatio(null); setTravarRatio(true)
    if (onImagemClear) onImagemClear()
  }

  const handleEnviar = async () => {
    if (!largura || !altura) { setErro('Informe o tamanho do quadro.'); return }
    if (!montagemId) { setErro('Selecione um tipo de montagem.'); return }
    setErro('')
    setEnviando(true)
    try {
      await callFunction('sim-pedido', {
        method: 'POST',
        body: {
          montagem_id: montagemId,
          montagem_nome: montagem?.nome ?? '',
          substrato_id: substratoId || null,
          substrato_nome: substrato?.name ?? null,
          moldura_id: molduraId || null,
          moldura_nome: moldura?.name ?? null,
          largura_cm: parseFloat(largura),
          altura_cm: parseFloat(altura),
          quantidade: parseInt(quantidade) || 1,
          obs,
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
    page: { ...base, maxWidth: 980, margin: '0 auto' },
    heading: { fontSize: 22, fontWeight: 700, color: colors.text, letterSpacing: -0.4, marginBottom: 4 },
    subheading: { fontSize: 13, color: colors.textMuted, marginBottom: 28 },

    layout: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 32, alignItems: 'start' },

    // Steps (left)
    step: (filled) => ({
      borderLeft: `3px solid ${filled ? accent : colors.border}`,
      paddingLeft: 18,
      marginBottom: 28,
      transition: 'border-color 0.2s',
    }),
    stepLabel: { fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
    stepTitle: { fontSize: 15, fontWeight: 600, color: colors.text, marginBottom: 12 },
    input: { width: '100%', boxSizing: 'border-box', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '9px 12px', color: colors.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none' },
    select: { width: '100%', boxSizing: 'border-box', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '9px 12px', color: colors.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', cursor: 'pointer' },
    row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 10 },
    label: { fontSize: 11, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
    btnBanco: { background: 'transparent', color: accent, border: `1.5px solid ${accent}`, borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' },
    imgCard: { display: 'flex', gap: 12, alignItems: 'center', background: colors.surfaceAlt, borderRadius: 8, padding: '10px 12px' },
    removeBtn: { background: 'none', border: 'none', color: colors.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' },

    // Right panel
    panel: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, position: 'sticky', top: 24 },
    panelTitle: { fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${colors.border}` },
    panelImg: { width: '100%', aspectRatio: '3/2', objectFit: 'cover', borderRadius: 8, marginBottom: 16 },
    panelImgEmpty: { width: '100%', aspectRatio: '3/2', background: colors.surfaceAlt, borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, fontSize: 12 },
    optionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12, color: colors.textMuted, marginBottom: 8, gap: 8 },
    optionVal: { color: colors.text, fontWeight: 500, textAlign: 'right', flexShrink: 0 },
    divider: { borderTop: `1px solid ${colors.border}`, margin: '14px 0' },
    priceLine: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: colors.textMuted, marginBottom: 7 },
    priceVal: { color: colors.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
    priceTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 14, borderTop: `2px solid ${colors.border}` },
    priceTotalLabel: { fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    priceTotalVal: { fontFamily: 'Lora, Georgia, serif', fontSize: 26, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' },
    unitLabel: { fontSize: 11, color: colors.textMuted, marginTop: 3, textAlign: 'right' },
    submitBtn: { width: '100%', background: accent, color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 18, fontFamily: 'Inter, system-ui, sans-serif', transition: 'background 0.15s' },
    emptyState: { textAlign: 'center', padding: '16px 0', color: colors.textMuted, fontSize: 12, lineHeight: 1.6 },
    error: { background: colors.danger + '14', border: `1px solid ${colors.danger}30`, borderRadius: 7, padding: '10px 14px', fontSize: 13, color: colors.danger, marginBottom: 14 },
    success: { background: colors.success + '14', border: `1px solid ${colors.success}30`, borderRadius: 10, padding: 20, fontSize: 14, color: colors.success, textAlign: 'center', marginBottom: 20 },
    textarea: { width: '100%', boxSizing: 'border-box', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '9px 12px', color: colors.text, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', resize: 'vertical', minHeight: 72 },
    discountBadge: { display: 'inline-block', background: accent + '18', color: accent, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600, marginTop: 10 },
  }

  if (loadingData) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Carregando simulador..." /></div>
  if (erroData) return <div style={{ color: colors.danger, padding: 24 }}>{erroData}</div>

  if (showBanco) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button style={S.btnBanco} onClick={() => setShowBanco(false)}>← Voltar ao Simulador</button>
          <span style={{ color: colors.textMuted, fontSize: 13 }}>Clique em uma imagem para selecioná-la</span>
        </div>
        <BancoImagensPage onSelectImagem={(img) => { setImagem(img); detectRatio(img); setShowBanco(false) }} />
      </div>
    )
  }

  const hasDims = parseFloat(largura) > 0 && parseFloat(altura) > 0
  const configEmpty = !imagem && !hasDims && !montagemId && !substratoId && !molduraId

  return (
    <div style={S.page}>
      <div style={S.heading}>Simulador de Pedido</div>
      <div style={S.subheading}>Configure o quadro e veja o valor em tempo real</div>

      {sucesso && (
        <div style={S.success}>
          <strong style={{ display: 'block', marginBottom: 4 }}>Pedido enviado!</strong>
          O Estúdio ABC entrará em contato para confirmar.
          <div style={{ marginTop: 12 }}>
            <button style={{ ...S.submitBtn, width: 'auto', padding: '9px 20px', fontSize: 12, marginTop: 0 }} onClick={() => setSucesso(false)}>
              Fazer outro pedido
            </button>
          </div>
        </div>
      )}

      {erro && <div style={S.error}>{erro}</div>}

      <div style={S.layout} className="sim-layout">

        {/* ── Coluna esquerda: passos ── */}
        <div>

          {/* Imagem */}
          <div style={S.step(!!imagem)}>
            <div style={S.stepLabel}>Passo 1</div>
            <div style={S.stepTitle}>Imagem <span style={{ fontWeight: 400, fontSize: 12, color: colors.textMuted }}>— opcional</span></div>
            {imagem ? (
              <div style={S.imgCard}>
                <img src={imagem.img_url} alt={imagem.titulo} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imagem.titulo}</div>
                  {imagem.categoria && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{imagem.categoria}</div>}
                </div>
                <button onClick={() => setShowBanco(true)} style={{ ...S.btnBanco, padding: '6px 10px', fontSize: 11 }}>Trocar</button>
                <button onClick={() => { setImagem(null); setRatio(null); if (onImagemClear) onImagemClear() }} style={S.removeBtn}>×</button>
              </div>
            ) : (
              <button style={S.btnBanco} onClick={() => setShowBanco(true)}>
                Escolher do banco de imagens
              </button>
            )}
          </div>

          {/* Tamanho */}
          <div style={S.step(hasDims)}>
            <div style={S.stepLabel}>Passo 2</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={S.stepTitle}>Tamanho e Quantidade</div>
              {ratio && (
                <button
                  onClick={() => setTravarRatio(t => !t)}
                  style={{ background: travarRatio ? colors.accent + '18' : 'transparent', border: `1px solid ${travarRatio ? colors.accent : colors.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: travarRatio ? colors.accent : colors.textMuted, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  Proporção {travarRatio ? 'travada' : 'livre'}
                </button>
              )}
            </div>
            <div style={S.row3}>
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
                {parseFloat(largura).toFixed(0)} × {parseFloat(altura).toFixed(0)} cm
                &nbsp;·&nbsp; {((parseFloat(largura) * parseFloat(altura)) / 10000).toFixed(4)} m²
              </div>
            )}
          </div>

          {/* Montagem */}
          <div style={S.step(!!montagemId)}>
            <div style={S.stepLabel}>Passo 3</div>
            <div style={S.stepTitle}>Tipo de Montagem</div>
            {montagems.length === 0 ? (
              <div style={{ color: colors.textMuted, fontSize: 13 }}>Nenhuma montagem disponível para sua conta.</div>
            ) : (
              <select style={S.select} value={montagemId} onChange={e => setMontagemId(e.target.value)}>
                <option value="">Selecione...</option>
                {montagems.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            )}
          </div>

          {/* Substrato */}
          {substrates.length > 0 && (
            <div style={S.step(!!substratoId)}>
              <div style={S.stepLabel}>Passo 4</div>
              <div style={S.stepTitle}>Substrato</div>
              <select style={S.select} value={substratoId} onChange={e => setSubstratoId(e.target.value)}>
                <option value="">Sem preferência</option>
                {substrates.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.substrate_type ? ` (${s.substrate_type})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Moldura */}
          {frames.length > 0 && (
            <div style={S.step(!!molduraId)}>
              <div style={S.stepLabel}>Passo {substrates.length > 0 ? '5' : '4'}</div>
              <div style={S.stepTitle}>Moldura <span style={{ fontWeight: 400, fontSize: 12, color: colors.textMuted }}>— opcional</span></div>
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

          {/* Observações */}
          <div style={S.step(!!obs)}>
            <div style={S.stepLabel}>Observações</div>
            <div style={S.stepTitle}>Informações adicionais <span style={{ fontWeight: 400, fontSize: 12, color: colors.textMuted }}>— opcional</span></div>
            <textarea style={S.textarea} placeholder="Prazo, preferências de acabamento, instruções especiais..." value={obs} onChange={e => setObs(e.target.value)} />
          </div>

        </div>

        {/* ── Painel lateral: resumo + preço ── */}
        <div style={S.panel}>
          <div style={S.panelTitle}>Resumo do Pedido</div>

          {/* Imagem */}
          {imagem ? (
            <img src={imagem.img_url} alt={imagem.titulo} style={S.panelImg} />
          ) : (
            <div style={S.panelImgEmpty}>sem imagem selecionada</div>
          )}

          {/* Config summary */}
          {configEmpty ? (
            <div style={S.emptyState}>
              Configure o pedido ao lado<br />para ver o resumo e o valor.
            </div>
          ) : (
            <>
              {hasDims && (
                <div style={S.optionRow}>
                  <span>Tamanho</span>
                  <span style={S.optionVal}>{parseFloat(largura).toFixed(0)} × {parseFloat(altura).toFixed(0)} cm{parseInt(quantidade) > 1 ? ` × ${quantidade} un.` : ''}</span>
                </div>
              )}
              {montagem && (
                <div style={S.optionRow}>
                  <span>Montagem</span>
                  <span style={S.optionVal}>{montagem.nome}</span>
                </div>
              )}
              {substrato && (
                <div style={S.optionRow}>
                  <span>Substrato</span>
                  <span style={S.optionVal}>{substrato.name}</span>
                </div>
              )}
              {moldura && (
                <div style={S.optionRow}>
                  <span>Moldura</span>
                  <span style={S.optionVal}>{moldura.name}</span>
                </div>
              )}

              {/* Preço */}
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
                    <div style={S.priceTotalLabel}>Total</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={S.priceTotalVal}>{formatCurrency(preco.totalGeral)}</div>
                      {preco.qty > 1 && (
                        <div style={S.unitLabel}>{formatCurrency(preco.totalPeca)} / unidade</div>
                      )}
                    </div>
                  </div>

                  {markupPct > 0 && (
                    <div style={S.discountBadge}>Markup de {markupPct}% aplicado</div>
                  )}
                </>
              )}

              {preco && preco.lines.length === 0 && hasDims && (
                <>
                  <div style={S.divider} />
                  <div style={{ ...S.emptyState, padding: '8px 0' }}>
                    Selecione montagem e/ou substrato<br />para calcular o valor.
                  </div>
                </>
              )}
            </>
          )}

          <button
            style={{ ...S.submitBtn, opacity: enviando ? 0.6 : 1 }}
            disabled={enviando}
            onClick={handleEnviar}
          >
            {enviando ? 'Enviando...' : 'Enviar Pedido'}
          </button>
        </div>

      </div>

      {/* Mobile: responsivo */}
      <style>{`
        @media (max-width: 640px) {
          .sim-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
