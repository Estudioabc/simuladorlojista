import { useState, useEffect, useMemo } from 'react'
import { callFunction } from '../services/supabase'
import { useTheme } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { Spinner, EmptyState } from '../components/UI'

const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const cmFmt = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',')

// Kit ou obra fatiada: várias peças por conjunto
function pecasDe(it) {
  return Array.isArray(it.pecas) && it.pecas.length > 1 && (it.modo === 'kit' || it.modo === 'fatiado') ? it.pecas : null
}

function tamanhoTexto(it) {
  const pecas = pecasDe(it)
  if (!pecas) return it.largura_cm && it.altura_cm ? `${cmFmt(it.largura_cm)} × ${cmFmt(it.altura_cm)} cm` : ''
  if (pecas.every(p => p.largura_cm === pecas[0].largura_cm)) {
    return `${pecas.length} peças de ${cmFmt(pecas[0].largura_cm)} × ${cmFmt(pecas[0].altura_cm)} cm`
  }
  return `${pecas.length} peças: ${pecas.map(p => `${cmFmt(p.largura_cm)} × ${cmFmt(p.altura_cm)}`).join(' + ')} cm`
}

function abrirOrcamentoCliente(p, lojaNome) {
  const w = window.open('', '_blank')
  if (!w) { alert('Permita pop-ups para abrir o orçamento.'); return }
  const hoje = new Date(p.created_at)
  const validade = new Date(hoje); validade.setDate(validade.getDate() + 7)
  const data = (d) => d.toLocaleDateString('pt-BR')
  const itens = (p.itens ?? []).map(it => `
    <div class="item">
      ${it.modo === 'kit' && pecasDe(it)?.every(pc => pc.imagem_url)
        ? `<div class="kit">${pecasDe(it).map(pc => `<img src="${esc(pc.imagem_url)}" alt="">`).join('')}</div>`
        : it.imagem_url ? `<img src="${esc(it.imagem_url)}" alt="">` : ''}
      <div>
        <h2>${esc(it.imagem_titulo || 'Quadro sob medida')}</h2>
        <dl>
          ${tamanhoTexto(it) ? `<dt>Tamanho</dt><dd>${esc(tamanhoTexto(it))}</dd>` : ''}
          ${it.montagem_nome ? `<dt>Acabamento</dt><dd>${esc(it.montagem_nome)}</dd>` : ''}
          ${it.moldura_nome ? `<dt>Moldura</dt><dd>${esc(it.moldura_nome)}</dd>` : ''}
          <dt>${pecasDe(it) ? 'Conjuntos' : 'Quantidade'}</dt><dd>${esc(it.quantidade || 1)}</dd>
        </dl>
      </div>
    </div>`).join('')
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,600&family=Figtree:wght@400;600&display=swap">
<title>Orçamento ${esc(p.numero ?? '')} — ${esc(lojaNome)}</title>
<style>
  body{font-family:Figtree,system-ui,sans-serif;color:#222;max-width:720px;margin:0 auto;padding:32px 20px;background:#fff}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:24px;gap:12px;flex-wrap:wrap}
  h1{font-family:Archivo,Arial,sans-serif;font-size:28px;font-weight:600;letter-spacing:-0.5px;margin:0} .muted{color:#777;font-size:13px}
  .item{display:flex;gap:20px;padding:16px 0;border-bottom:1px solid #eee;flex-wrap:wrap}
  .item img{width:180px;max-width:100%;object-fit:contain;border:6px solid #1a1a1a;box-shadow:0 4px 12px rgba(0,0,0,.15)}
  .kit{display:flex;gap:8px;align-items:center;max-width:100%}
  .kit img{width:auto;height:110px;max-width:none}
  h2{font-family:Archivo,Arial,sans-serif;font-size:19px;font-weight:600;margin:0 0 10px} dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-size:14px} dt{color:#777} dd{margin:0}
  .total{display:flex;justify-content:space-between;align-items:baseline;margin-top:20px;font-size:15px}
  .total strong{font-family:Archivo,Arial,sans-serif;font-size:30px;font-weight:600}
  .acoes{margin-top:28px;display:flex;gap:10px} button{padding:12px 22px;font-size:14px;border-radius:999px;border:1px solid #222;background:#222;color:#fff;cursor:pointer}
  @media print{.acoes{display:none} body{padding:0}}
</style></head><body>
<header>
  <div><h1>${esc(lojaNome)}</h1><div class="muted">Orçamento${p.numero ? ' nº ' + esc(p.numero) : ''}</div></div>
  <div class="muted">Emitido em ${data(hoje)}<br>Válido até ${data(validade)}</div>
</header>
${p.cliente_nome ? `<p><span class="muted">Cliente:</span> ${esc(p.cliente_nome)}</p>` : ''}
${itens}
<div class="total"><span>Total</span><strong>${esc(fmt(p.revenda_total))}</strong></div>
${p.forma_entrega ? `<p class="muted">${p.forma_entrega === 'retirada' ? 'Retirada na loja' : 'Entrega no endereço combinado'}</p>` : ''}
<div class="acoes"><button onclick="window.print()">Salvar PDF / Imprimir</button></div>
</body></html>`)
  w.document.close()
}

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
  orcamento:   { label: 'Orçamento',         color: '#76716A' },
  novo:        { label: 'Recebido',          color: '#2F5D8A' },
  aprovado:    { label: 'Aprovado',          color: '#4F4785' },
  em_producao: { label: 'Em produção',       color: '#9A5B0E' },
  pronto:      { label: 'Pronto p/ entrega', color: '#6E3F7E' },
  finalizado:  { label: 'Entregue',          color: '#2F7A4B' },
  cancelado:   { label: 'Cancelado',         color: '#B4312A' },
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

export default function PedidosPage({ onNovoPedido }) {
  const { colors, fonts } = useTheme()
  const { lojista, profile } = useAuth()
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
    const ativos = filtered.filter(p => !['cancelado', 'novo', 'orcamento'].includes(resolveStatus(p)))
    const venda = ativos.reduce((s, p) => s + (p.revenda_total || 0), 0)
    const custo = ativos.reduce((s, p) => s + getB2b(p), 0)
    return { qtd: ativos.length, venda, custo, lucro: venda - custo }
  }, [filtered])

  const S = {
    eyebrow:  { fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 },
    title:    { fontFamily: fonts.display, fontSize: 'clamp(27px, 3.9vw, 37px)', fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.8, margin: '6px 0 8px' },
    subtitle: { fontSize: 15, color: colors.textMuted },
    novoBtn:  { background: colors.text, color: colors.bg, border: 'none', borderRadius: 999, padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
    card:     { background: colors.surface, border: `1px solid ${colors.border}`, marginBottom: 12 },
    kpiRow:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: `1px solid ${colors.text}`, borderBottom: `1px solid ${colors.border}`, margin: '8px 0 36px' },
    kpi:      { padding: '16px 20px 18px 0' },
    kpiLabel: { fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 6 },
    kpiValue: { fontFamily: fonts.display, fontSize: 25, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
    pill:     (active) => ({ padding: '7px 14px', fontSize: 13, borderRadius: 999, border: `1px solid ${active ? colors.text : colors.border}`, cursor: 'pointer', fontWeight: 600, background: active ? colors.text : colors.surface, color: active ? colors.bg : colors.text }),
    cardHeader: (exp) => ({ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', cursor: 'pointer', background: exp ? colors.surfaceAlt : 'transparent', flexWrap: 'wrap' }),
    cardBody: { padding: '4px 20px 22px', borderTop: `1px solid ${colors.border}` },
    infoLabel: { fontSize: 12, color: colors.textMuted, marginTop: 14, marginBottom: 3, fontWeight: 600 },
    infoValue: { fontSize: 14, color: colors.text },
    imgThumb: { width: 72, height: 72, objectFit: 'contain', background: colors.surfaceAlt, flexShrink: 0 },
    rowThumb: { width: 48, height: 48, objectFit: 'contain', background: colors.surfaceAlt, flexShrink: 0 },
    select: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '7px 14px', color: colors.text, fontSize: 13, outline: 'none', cursor: 'pointer' },
  }

  const ETAPAS = [
    { id: 'novo', label: 'Recebido' },
    { id: 'aprovado', label: 'Aprovado' },
    { id: 'em_producao', label: 'Em produção' },
    { id: 'pronto', label: 'Pronto' },
    { id: 'finalizado', label: 'Entregue' },
  ]

  const LinhaDoTempo = ({ stKey }) => {
    if (stKey === 'orcamento') return (
      <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 18, lineHeight: 1.5 }}>
        Orçamento ainda não enviado ao estúdio. Mande o PDF ao cliente e confirme quando ele fechar.
      </div>
    )
    if (stKey === 'cancelado') return (
      <div style={{ fontSize: 13, color: colors.danger, marginTop: 18 }}>Pedido cancelado.</div>
    )
    const atual = ETAPAS.findIndex(e => e.id === stKey)
    return (
      <ol style={{ listStyle: 'none', display: 'flex', margin: '20px 0 4px', padding: 0 }} aria-label="Andamento do pedido">
        {ETAPAS.map((e, i) => {
          const feito = i <= atual
          return (
            <li key={e.id} style={{ flex: 1, minWidth: 0 }} aria-current={i === atual ? 'step' : undefined}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: feito ? colors.text : colors.surface, border: `1.5px solid ${feito ? colors.text : colors.border}`, boxShadow: i === atual ? `0 0 0 4px ${colors.accent}33` : 'none' }} />
                {i < ETAPAS.length - 1 && <span style={{ flex: 1, height: 1.5, background: i < atual ? colors.text : colors.border }} />}
              </div>
              <div style={{ fontSize: 12, marginTop: 8, paddingRight: 6, color: feito ? colors.text : colors.textMuted, fontWeight: i === atual ? 700 : 500 }}>{e.label}</div>
            </li>
          )
        })}
      </ol>
    )
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <div style={S.eyebrow}>Meus pedidos</div>
          <h1 style={S.title}>Pedidos e orçamentos</h1>
          <div style={S.subtitle}>{pedidos.length} no total. Acompanhe a produção e gere o orçamento para o seu cliente.</div>
        </div>
        {onNovoPedido && <button style={S.novoBtn} onClick={onNovoPedido}>Novo pedido</button>}
      </div>

      {/* Filtros de período */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODS.map(p => (
          <button key={p.id} style={S.pill(period === p.id)} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
        <select style={{ ...S.select, marginLeft: 8 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Painel financeiro */}
      <div style={S.kpiRow}>
        {[
          { label: 'Pedidos aprovados', value: financeiro.qtd,   fmt: false, color: colors.text },
          { label: 'Vendido',           value: financeiro.venda, fmt: true,  color: colors.text },
          { label: 'Custo do estúdio',  value: financeiro.custo, fmt: true,  color: colors.textMuted },
          { label: 'Seu lucro',         value: financeiro.lucro, fmt: true,  color: financeiro.lucro >= 0 ? colors.success : colors.danger },
        ].map(c => (
          <div key={c.label} style={S.kpi}>
            <div style={S.kpiLabel}>{c.label}</div>
            <div style={{ ...S.kpiValue, color: c.color }}>{c.fmt ? fmt(c.value) : c.value}</div>
          </div>
        ))}
      </div>

      {erro && <div style={{ color: '#E05C5C', fontSize: 13, marginBottom: 16 }}>{erro}</div>}

      {filtered.length === 0 ? (
        <EmptyState
          title={pedidos.length === 0 ? 'Você ainda não fez nenhum pedido' : 'Nenhum pedido neste período'}
          description={pedidos.length === 0 ? 'Monte o primeiro quadro no Novo pedido.' : 'Escolha um período maior ou outro status.'}
          action={pedidos.length === 0 && onNovoPedido ? 'Fazer o primeiro pedido' : undefined}
          onAction={onNovoPedido}
        />
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
                {itens[0]?.imagem_url ? <img src={itens[0].imagem_url} alt="" style={S.rowThumb} /> : <div style={S.rowThumb} />}
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 600, color: colors.text, lineHeight: 1.15 }}>
                    {itens[0]?.imagem_titulo || (p.cliente_nome ? `Quadro de ${p.cliente_nome}` : 'Quadro sob medida')}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                    {p.os?.number ? `OS #${p.os.number}` : `Pedido #${p.numero ?? p.id.slice(-6).toUpperCase()}`}
                    {' · '}{formatDate(p.created_at)}
                    {p.cliente_nome && itens[0]?.imagem_titulo ? ` · ${p.cliente_nome}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, border: `1px solid ${st.color}`, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  {p.revenda_total > 0 && (
                    <div style={{ fontFamily: fonts.display, fontSize: 17, fontWeight: 600, color: colors.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.revenda_total)}</div>
                  )}
                  {b2b > 0 && (
                    <div style={{ fontSize: 12, color: lucro >= 0 ? colors.success : colors.danger, fontWeight: 600, marginTop: 4 }}>
                      seu lucro {fmt(lucro)}
                    </div>
                  )}
                </div>
                <span aria-hidden="true" style={{ fontSize: 12, color: colors.textMuted }}>{expanded ? '▲' : '▼'}</span>
              </div>

              {expanded && (
                <div style={S.cardBody}>
                  <LinhaDoTempo stKey={stKey} />
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
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: colors.bg, border: `1px solid ${colors.border}`, padding: 14, marginTop: 16 }}>
                      {item.imagem_url && <img src={item.imagem_url} alt="" style={S.imgThumb} />}
                      <div style={{ flex: 1 }}>
                        {item.imagem_titulo && <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: colors.text }}>{item.imagem_titulo}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                          {item.montagem_nome && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>Montagem:</strong> {item.montagem_nome}</div>}
                          {item.moldura_nome  && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>Moldura:</strong> {item.moldura_nome}</div>}
                          {tamanhoTexto(item) && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>Tamanho:</strong> {tamanhoTexto(item)}{item.modo === 'fatiado' ? ` (obra fatiada, total ${cmFmt(item.largura_cm)} × ${cmFmt(item.altura_cm)} cm)` : ''}</div>}
                          {item.quantidade > 1 && <div style={{ fontSize: 12, color: colors.textMuted }}><strong>{pecasDe(item) ? 'Conjuntos' : 'Quantidade'}:</strong> {item.quantidade}</div>}
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
                        <div style={{ fontSize: 15, fontWeight: 700, color: lucro >= 0 ? colors.success : colors.danger }}>{fmt(lucro)}</div>
                      </div>
                    )}
                  </div>

                  {p.obs && (
                    <div style={{ marginTop: 12 }}>
                      <div style={S.infoLabel}>Observações</div>
                      <div style={{ ...S.infoValue, color: colors.textMuted, fontStyle: 'italic' }}>{p.obs}</div>
                    </div>
                  )}

                  {p.revenda_total > 0 && (
                    <button
                      onClick={() => abrirOrcamentoCliente(p, lojista?.store_name || profile?.name || 'Orçamento')}
                      style={{ marginTop: 20, width: '100%', background: 'transparent', color: colors.text, border: `1px solid ${colors.text}`, borderRadius: 999, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
                    >
                      Orçamento para o cliente (PDF)
                    </button>
                  )}

                  {stKey === 'orcamento' && (
                    <button
                      onClick={() => handleConfirmar(p.id)}
                      disabled={confirmando === p.id}
                      style={{
                        marginTop: 16, width: '100%',
                        background: confirmando === p.id ? colors.textMuted : colors.text,
                        color: colors.bg, border: 'none', borderRadius: 999,
                        padding: '14px', fontSize: 14, fontWeight: 700,
                        cursor: confirmando === p.id ? 'default' : 'pointer',
                        fontFamily: fonts.body,
                      }}>
                      {confirmando === p.id ? 'Enviando…' : 'Cliente fechou: enviar ao estúdio'}
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
