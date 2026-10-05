import { useState, useEffect, useMemo } from 'react'
import { callFunction } from '../services/supabase'
import { useTheme } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { Spinner, EmptyState, Badge } from '../components/UI'

const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Deriva status de exibição a partir do catalogo_pedido + OS linkada
function resolveStatus(p) {
  if (p.status === 'orcamento') return 'orcamento'
  const osStatus = p.os?.status
  if (osStatus === 'finalizada') return 'finalizado'
  if (osStatus === 'cancelada')  return 'cancelado'
  if (osStatus === 'entrega')    return 'pronto'
  if (osStatus === 'producao')   return 'em_producao'
  if (osStatus === 'aprovada' || osStatus === 'aberta') return 'aprovado'
  if (p.status === 'aprovada')   return 'aprovado'
  return 'novo'
}

const STATUS = {
  orcamento:  { label: 'Orçamento',         color: '#94A3B8' },
  novo:       { label: 'Recebido',          color: '#4F9CF9' },
  aprovado:   { label: 'Aprovado',          color: '#6366F1' },
  em_producao:{ label: 'Em Produção',       color: '#F59E0B' },
  pronto:     { label: 'Pronto p/ Entrega', color: '#A855F7' },
  finalizado: { label: 'Finalizado',        color: '#22C55E' },
  cancelado:  { label: 'Cancelado',         color: '#E05C5C' },
}

const PERIODS = [
  { id: 'mes',  label: 'Este mês' },
  { id: '3m',   label: '3 meses' },
  { id: '6m',   label: '6 meses' },
  { id: 'tudo', label: 'Tudo' },
]

function startOf(period) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (period === 'mes') { d.setDate(1); return d }
  if (period === '3m')  { d.setMonth(d.getMonth() - 3); return d }
  if (period === '6m')  { d.setMonth(d.getMonth() - 6); return d }
  return null
}

export default function PedidosPage() {
  const { colors } = useTheme()
  const { lojista } = useAuth()
  const markupDiv = 1 + (parseFloat(lojista?.markup_pct) || 0) / 100
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [period, setPeriod] = useState('mes')
  const [filterStatus, setFilterStatus] = useState('')
  const [confirmando, setConfirmando] = useState(null) // id do pedido sendo confirmado

  useEffect(() => { loadPedidos() }, [])

  const loadPedidos = async () => {
    try {
      const data = await callFunction('sim-lojista-data', { query: '?pedidos=1' })
      setPedidos(data.pedidos ?? [])
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmar = async (pedidoId) => {
    setConfirmando(pedidoId)
    try {
      await callFunction('sim-pedido', { method: 'PATCH', body: { pedido_id: pedidoId } })
      await loadPedidos()
    } catch (e) {
      setErro(e.message)
    } finally {
      setConfirmando(null)
    }
  }

  // preco_b2b do pedido, com fallback calculado via markup do lojista
  const getB2b = (p) => {
    if (p.preco_b2b) return p.preco_b2b
    if (p.revenda_total && markupDiv > 1) return +(p.revenda_total / markupDiv).toFixed(2)
    return 0
  }

  const filtered = useMemo(() => {
    const cutoff = startOf(period)
    return pedidos.filter(p => {
      if (cutoff && new Date(p.created_at) < cutoff) return false
      if (filterStatus && resolveStatus(p) !== filterStatus) return false
      return true
    })
  }, [pedidos, period, filterStatus])

  // Financeiro — apenas pedidos finalizados ou com OS (excluindo cancelados)
  const financeiro = useMemo(() => {
    const ativos = filtered.filter(p => resolveStatus(p) !== 'cancelado' && resolveStatus(p) !== 'novo')
    const venda = ativos.reduce((s, p) => s + (p.revenda_total || 0), 0)
    const custo = ativos.reduce((s, p) => s + getB2b(p), 0)
    return { qtd: ativos.length, venda, custo, lucro: venda - custo }
  }, [filtered])

  const S = {
    title:    { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: -0.5, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 20 },
    card:     { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
    kpi:      { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 120 },
    pill:     (active) => ({ padding: '5px 14px', fontSize: 13, borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, background: active ? colors.accent : colors.surfaceAlt, color: active ? '#fff' : colors.textMuted }),
    cardHeader: (exp) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', background: exp ? colors.surfaceAlt : 'transparent' }),
    cardBody: { padding: '0 18px 18px', borderTop: `1px solid ${colors.border}` },
    infoLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 4, fontWeight: 700 },
    infoValue: { fontSize: 13, color: colors.text },
    imgThumb: { width: 52, height: 52, objectFit: 'cover', borderRadius: 6, flexShrink: 0 },
    select: { background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '6px 10px', color: colors.text, fontSize: 13, outline: 'none', cursor: 'pointer' },
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (loading) return <Spinner />

  return (
    <div>
      <div style={S.title}>Meus Pedidos</div>
      <div style={S.subtitle}>{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} no total</div>

      {/* Filtros de período */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODS.map(p => (
          <button key={p.id} style={S.pill(period === p.id)} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
        <select style={{ ...S.select, marginLeft: 8 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Painel financeiro */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Pedidos',      value: financeiro.qtd,   fmt: false, color: colors.accent },
          { label: 'Total vendido',value: financeiro.venda,  fmt: true, color: colors.text },
          { label: 'Custo estúdio',value: financeiro.custo,  fmt: true, color: colors.textMuted },
          { label: 'Seu lucro',    value: financeiro.lucro,  fmt: true, color: financeiro.lucro >= 0 ? '#22C55E' : '#EF4444' },
        ].map(c => (
          <div key={c.label} style={S.kpi}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.fmt ? fmt(c.value) : c.value}</div>
          </div>
        ))}
      </div>

      {erro && <div style={{ color: '#E05C5C', fontSize: 13, marginBottom: 16 }}>{erro}</div>}

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum pedido no período" description="Tente ampliar o filtro de período." />
      ) : (
        filtered.map(p => {
          const stKey = resolveStatus(p)
          const st = STATUS[stKey]
          const expanded = expandedId === p.id
          const itens = p.itens ?? []
          const b2b = getB2b(p)
          const lucro = (p.revenda_total || 0) - b2b
          return (
            <div key={p.id} style={S.card}>
              <div style={S.cardHeader(expanded)} onClick={() => setExpandedId(expanded ? null : p.id)}>
                <Badge label={st.label} color={st.color} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
                    {p.os?.number ? `OS #${p.os.number}` : `Pedido #${p.numero ?? p.id.slice(-6).toUpperCase()}`}
                    {itens[0]?.montagem_nome && <span style={{ fontWeight: 400, color: colors.textMuted }}> · {itens[0].montagem_nome}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{formatDate(p.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {p.revenda_total > 0 && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{fmt(p.revenda_total)}</div>
                  )}
                  {b2b > 0 && (
                    <div style={{ fontSize: 11, color: lucro >= 0 ? '#22C55E' : '#EF4444', fontWeight: 600 }}>
                      lucro {fmt(lucro)}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</div>
              </div>

              {expanded && (
                <div style={S.cardBody}>
                  {/* Cabeçalho do pedido */}
                  <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={S.infoLabel}>Data do orçamento</div>
                      <div style={S.infoValue}>{formatDate(p.created_at)}</div>
                    </div>
                    {p.os?.number && (
                      <div>
                        <div style={S.infoLabel}>OS estúdio</div>
                        <div style={{ ...S.infoValue, fontWeight: 700 }}>#{p.os.number}</div>
                      </div>
                    )}
                    {p.cliente_nome && (
                      <div>
                        <div style={S.infoLabel}>Cliente</div>
                        <div style={S.infoValue}>{p.cliente_nome}</div>
                      </div>
                    )}
                    {p.cliente_contato && (
                      <div>
                        <div style={S.infoLabel}>Contato</div>
                        <div style={S.infoValue}>{p.cliente_contato}</div>
                      </div>
                    )}
                    {p.forma_entrega && (
                      <div>
                        <div style={S.infoLabel}>Entrega</div>
                        <div style={S.infoValue}>{p.forma_entrega === 'retirada' ? 'Retirada na loja' : 'Entrega'}</div>
                      </div>
                    )}
                  </div>

                  {/* Itens */}
                  {itens.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: colors.surfaceAlt, borderRadius: 8, padding: '12px 14px', marginTop: 12 }}>
                      {item.imagem_url && <img src={item.imagem_url} alt="" style={S.imgThumb} />}
                      <div style={{ flex: 1 }}>
                        {item.imagem_titulo && <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: colors.text }}>{item.imagem_titulo}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                          {item.montagem_nome && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>Montagem:</strong> {item.montagem_nome}</div>}
                          {item.moldura_nome  && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>Moldura:</strong> {item.moldura_nome}</div>}
                          {item.largura_cm && item.altura_cm && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>Tamanho:</strong> {item.largura_cm}×{item.altura_cm} cm</div>}
                          {item.quantidade > 1 && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>Quantidade:</strong> {item.quantidade}</div>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Financeiro */}
                  <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                    {p.revenda_total > 0 && (
                      <div>
                        <div style={S.infoLabel}>Venda ao consumidor</div>
                        <div style={{ ...S.infoValue, fontWeight: 700 }}>{fmt(p.revenda_total)}</div>
                      </div>
                    )}
                    {b2b > 0 && (
                      <div>
                        <div style={S.infoLabel}>Custo estúdio</div>
                        <div style={{ ...S.infoValue, fontWeight: 700 }}>{fmt(b2b)}</div>
                      </div>
                    )}
                    {b2b > 0 && p.revenda_total > 0 && (
                      <div>
                        <div style={S.infoLabel}>Seu lucro</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: lucro >= 0 ? '#22C55E' : '#EF4444' }}>{fmt(lucro)}</div>
                      </div>
                    )}
                  </div>

                  {p.obs && (
                    <div style={{ marginTop: 12 }}>
                      <div style={S.infoLabel}>Observações</div>
                      <div style={{ ...S.infoValue, color: colors.textMuted, fontStyle: 'italic' }}>{p.obs}</div>
                    </div>
                  )}

                  {stKey === 'orcamento' && (
                    <button
                      onClick={() => handleConfirmar(p.id)}
                      disabled={confirmando === p.id}
                      style={{
                        marginTop: 16, width: '100%',
                        background: confirmando === p.id ? colors.textMuted : '#22C55E',
                        color: '#fff', border: 'none', borderRadius: 8,
                        padding: '12px', fontSize: 14, fontWeight: 700,
                        cursor: confirmando === p.id ? 'default' : 'pointer',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}>
                      {confirmando === p.id ? 'Confirmando…' : '✓ Confirmar Pedido — Enviar ao Estúdio'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
