import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'
import { callFunction } from '../services/supabase'
import { Spinner, Modal } from '../components/UI'
import BancoImagensPage from './BancoImagensPage'

const STATUS_LABELS = {
  novo: { label: 'Pedido enviado!', color: '#4ade80' },
}

export default function SimuladorPage() {
  const { colors } = useTheme()
  const [catalogoData, setCatalogoData] = useState(null)
  const [loadingData, setLoadingData] = useState(true)
  const [erroData, setErroData] = useState('')

  // Formulário
  const [imagemSelecionada, setImagemSelecionada] = useState(null)
  const [montagemId, setMontagemId] = useState('')
  const [molduraId, setMolduraId] = useState('')
  const [largura, setLargura] = useState('')
  const [altura, setAltura] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [obs, setObs] = useState('')

  // UI state
  const [showBanco, setShowBanco] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { loadCatalogo() }, [])

  const loadCatalogo = async () => {
    try {
      const data = await callFunction('sim-lojista-data')
      setCatalogoData(data)
    } catch (e) {
      setErroData(e.message)
    } finally {
      setLoadingData(false)
    }
  }

  const montagems = catalogoData?.simMontagems ?? []
  const frames = catalogoData?.frames ?? []
  const discount = catalogoData?.discount_pct ?? 0

  // Agrupar molduras por categoria
  const framesPorCat = frames.reduce((acc, f) => {
    const cat = f.categoria ?? 'Outras'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})
  const catOrder = ['A', 'B', 'C', 'Outras']
  const catLabels = { A: 'A — Premium', B: 'B — Intermediária', C: 'C — Baixo Custo', Outras: 'Outras' }

  const handleEnviar = async () => {
    if (!montagemId) { setErro('Selecione um tipo de montagem.'); return }
    if (!largura || !altura) { setErro('Informe o tamanho do quadro.'); return }
    setErro('')
    setEnviando(true)
    try {
      await callFunction('sim-pedido', {
        method: 'POST',
        body: {
          montagem_id: montagemId,
          montagem_nome: montagems.find(m => m.id === montagemId)?.nome ?? '',
          moldura_id: molduraId || null,
          moldura_nome: frames.find(f => f.id === molduraId)?.name ?? '',
          largura_cm: parseFloat(largura),
          altura_cm: parseFloat(altura),
          quantidade: parseInt(quantidade) || 1,
          obs,
          imagem_id: imagemSelecionada?.id ?? null,
          imagem_titulo: imagemSelecionada?.titulo ?? null,
          imagem_url: imagemSelecionada?.img_url ?? null,
        },
      })
      setSucesso(true)
      // Reset
      setImagemSelecionada(null)
      setMontagemId('')
      setMolduraId('')
      setLargura('')
      setAltura('')
      setQuantidade('1')
      setObs('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const S = {
    title: { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: -0.5, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 28 },
    card: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 16 },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 },
    label: { fontSize: 12, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 6 },
    input: { width: '100%', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 14px', color: colors.text, fontSize: 14, outline: 'none' },
    select: { width: '100%', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 14px', color: colors.text, fontSize: 14, outline: 'none', cursor: 'pointer' },
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    btn: { background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
    btnOutline: { background: 'transparent', color: colors.accent, border: `1.5px solid ${colors.accent}`, borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    error: { background: colors.danger + '18', border: `1px solid ${colors.danger}40`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: colors.danger, marginBottom: 12 },
    success: { background: colors.success + '18', border: `1px solid ${colors.success}40`, borderRadius: 10, padding: 20, fontSize: 14, color: colors.success, textAlign: 'center', marginBottom: 16 },
    imagemCard: { display: 'flex', gap: 14, alignItems: 'center', background: colors.surfaceAlt, borderRadius: 8, padding: 12 },
  }

  if (loadingData) return <Spinner />
  if (erroData) return <div style={{ color: colors.danger, padding: 24 }}>{erroData}</div>

  if (showBanco) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button style={S.btnOutline} onClick={() => setShowBanco(false)}>← Voltar ao Simulador</button>
          <span style={{ color: colors.textMuted, fontSize: 13 }}>Clique em uma imagem para usar no pedido</span>
        </div>
        <BancoImagensPage onSelectImagem={(img) => { setImagemSelecionada(img); setShowBanco(false) }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={S.title}>Novo Pedido</div>
      <div style={S.subtitle}>Preencha os dados do quadro desejado</div>

      {sucesso && (
        <div style={S.success}>
          ✅ Pedido enviado com sucesso! O Estúdio ABC entrará em contato.
          <div style={{ marginTop: 10 }}>
            <button style={{ ...S.btn, fontSize: 12, padding: '8px 16px' }} onClick={() => setSucesso(false)}>Novo Pedido</button>
          </div>
        </div>
      )}

      {erro && <div style={S.error}>{erro}</div>}

      {/* Imagem */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Imagem (opcional)</div>
        {imagemSelecionada ? (
          <div style={S.imagemCard}>
            <img src={imagemSelecionada.img_url} alt={imagemSelecionada.titulo} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{imagemSelecionada.titulo}</div>
              {imagemSelecionada.categoria && <div style={{ fontSize: 12, color: colors.textMuted }}>{imagemSelecionada.categoria}</div>}
            </div>
            <button onClick={() => setShowBanco(true)} style={{ ...S.btnOutline, padding: '6px 12px', fontSize: 12 }}>Trocar</button>
            <button onClick={() => setImagemSelecionada(null)} style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        ) : (
          <button style={S.btnOutline} onClick={() => setShowBanco(true)}>
            🖼️ Escolher do banco de imagens
          </button>
        )}
      </div>

      {/* Montagem */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Tipo de Montagem</div>
        <select style={S.select} value={montagemId} onChange={e => setMontagemId(e.target.value)}>
          <option value="">Selecione...</option>
          {montagems.map(m => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </select>
      </div>

      {/* Moldura */}
      {frames.length > 0 && (
        <div style={S.card}>
          <div style={S.sectionTitle}>Moldura</div>
          <select style={S.select} value={molduraId} onChange={e => setMolduraId(e.target.value)}>
            <option value="">Sem preferência</option>
            {catOrder.filter(c => framesPorCat[c]).map(cat => (
              <optgroup key={cat} label={catLabels[cat]}>
                {framesPorCat[cat].map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {/* Tamanho */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Tamanho</div>
        <div style={S.row}>
          <div>
            <label style={S.label}>Largura (cm)</label>
            <input style={S.input} type="number" min="1" placeholder="ex: 60" value={largura} onChange={e => setLargura(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Altura (cm)</label>
            <input style={S.input} type="number" min="1" placeholder="ex: 40" value={altura} onChange={e => setAltura(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={S.label}>Quantidade</label>
          <input style={{ ...S.input, maxWidth: 120 }} type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
        </div>
      </div>

      {/* Observações */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Observações</div>
        <textarea
          style={{ ...S.input, height: 90, resize: 'vertical' }}
          placeholder="Informações adicionais, preferências de acabamento, prazo..."
          value={obs}
          onChange={e => setObs(e.target.value)}
        />
      </div>

      {discount > 0 && (
        <div style={{ fontSize: 12, color: colors.accent, marginBottom: 12, textAlign: 'right' }}>
          Desconto de {discount}% aplicado nos preços
        </div>
      )}

      <button style={{ ...S.btn, width: '100%', padding: '14px', fontSize: 15, opacity: enviando ? 0.7 : 1 }} disabled={enviando} onClick={handleEnviar}>
        {enviando ? 'Enviando...' : 'Enviar Pedido'}
      </button>
    </div>
  )
}
