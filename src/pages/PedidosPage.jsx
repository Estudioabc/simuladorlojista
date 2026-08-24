import { useState, useEffect } from 'react'
import { callFunction } from '../services/supabase'
import { useTheme } from '../styles/theme'
import { Spinner, EmptyState, Badge } from '../components/UI'

const STATUS = {
  novo:        { label: 'Recebido',     color: '#4F9CF9' },
  em_producao: { label: 'Em Produção',  color: '#f59e0b' },
  pronto:      { label: 'Pronto',       color: '#a855f7' },
  entregue:    { label: 'Entregue',     color: '#4ade80' },
  cancelado:   { label: 'Cancelado',    color: '#e05c5c' },
}

export default function PedidosPage() {
  const { colors } = useTheme()
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [expandedId, setExpandedId] = useState(null)

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

  const S = {
    title: { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: -0.5, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 28 },
    card: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
    cardHeader: (expanded) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer', background: expanded ? colors.surfaceAlt : 'transparent' }),
    date: { fontSize: 12, color: colors.textMuted },
    cardBody: { padding: '0 20px 20px', borderTop: `1px solid ${colors.border}` },
    row: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 },
    infoLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4, fontWeight: 700 },
    infoValue: { fontSize: 13, color: colors.text },
    item: { background: colors.surfaceAlt, borderRadius: 8, padding: '10px 14px', marginTop: 8, fontSize: 13 },
    imgThumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 },
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  if (loading) return <Spinner />

  return (
    <div>
      <div style={S.title}>Meus Pedidos</div>
      <div style={S.subtitle}>{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} no histórico</div>

      {erro && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 16 }}>{erro}</div>}

      {pedidos.length === 0 ? (
        <EmptyState icon="📋" title="Nenhum pedido ainda" description="Seus pedidos enviados aparecerão aqui." />
      ) : (
        pedidos.map(p => {
          const st = STATUS[p.status] ?? STATUS.novo
          const expanded = expandedId === p.id
          const itens = p.itens ?? []
          return (
            <div key={p.id} style={S.card}>
              <div style={S.cardHeader(expanded)} onClick={() => setExpandedId(expanded ? null : p.id)}>
                <Badge label={st.label} color={st.color} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
                    Pedido #{p.id.slice(-6).toUpperCase()}
                  </div>
                  <div style={S.date}>{formatDate(p.created_at)}</div>
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted }}>{expanded ? '▲' : '▼'}</div>
              </div>

              {expanded && (
                <div style={S.cardBody}>
                  {itens.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', ...S.item }}>
                      {item.imagem_url && <img src={item.imagem_url} alt="" style={S.imgThumb} />}
                      <div style={{ flex: 1 }}>
                        {item.imagem_titulo && <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.imagem_titulo}</div>}
                        <div style={{ color: colors.textMuted, fontSize: 12, lineHeight: 1.6 }}>
                          {item.montagem_nome && <span>Montagem: {item.montagem_nome} · </span>}
                          {item.moldura_nome && <span>Moldura: {item.moldura_nome} · </span>}
                          {item.largura_cm && item.altura_cm && <span>Tamanho: {item.largura_cm}×{item.altura_cm}cm · </span>}
                          {item.quantidade > 1 && <span>Qtd: {item.quantidade}</span>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {p.obs && (
                    <>
                      <div style={S.infoLabel}>Observações</div>
                      <div style={{ ...S.infoValue, color: colors.textMuted, fontStyle: 'italic' }}>{p.obs}</div>
                    </>
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
