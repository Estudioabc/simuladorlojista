import { useState } from 'react'
import { useTheme, formatCurrency } from '../styles/theme'
import { callFunction } from '../services/supabase'
import { useEquipe } from '../contexts/EquipeContext'
import PinModal from '../components/PinModal'

// Ajustes no modo balcão (loja com equipe, dono fora): o vendedor vê as próprias vendas; o dono entra com o PIN.
export default function BalcaoPage() {
  const { colors, fonts } = useTheme()
  const { status, entrarDono, assinarVendedor } = useEquipe()
  const [pinDono, setPinDono] = useState(false)
  const [vendedor, setVendedor] = useState(null) // escolhido para digitar o PIN
  const [vendas, setVendas] = useState(null) // { vendedor, pedidos }

  const btn = { background: colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: '13px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }
  const chip = { padding: '10px 16px', borderRadius: 2, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: fonts.body }
  const sec = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted, margin: '0 0 12px' }

  const abrirVendas = async (v, pin) => {
    const assinatura = await assinarVendedor(v, pin, false)
    setVendas(await callFunction('sim-equipe', { method: 'POST', body: { acao: 'minhas_vendas' }, headers: { 'x-vendedor-token': assinatura.token } }))
    setVendedor(null)
  }

  if (vendas) {
    const total = vendas.pedidos.reduce((s, p) => s + (Number(p.vendedor_comissao) || 0), 0)
    const vendido = vendas.pedidos.reduce((s, p) => s + (Number(p.revenda_total) || 0), 0)
    return (
      <div style={{ fontFamily: fonts.body, maxWidth: 640 }}>
        <button onClick={() => setVendas(null)} style={{ background: 'none', border: 'none', padding: 0, color: colors.textMuted, fontSize: 14, cursor: 'pointer', fontFamily: fonts.body }}>← Voltar</button>
        <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 600, margin: '10px 0 4px' }}>Vendas de {vendas.vendedor?.nome}</h1>
        <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 20 }}>Neste mês · {String(vendas.vendedor?.comissao_pct ?? 0).replace('.', ',')}% de comissão sobre o valor de venda</div>
        <div style={{ display: 'flex', gap: 28, borderTop: `1px solid ${colors.text}`, borderBottom: `1px solid ${colors.border}`, padding: '14px 0', marginBottom: 16 }}>
          <div><div style={{ fontSize: 12, color: colors.textMuted }}>Vendido</div><div style={{ fontSize: 22, fontWeight: 600, fontFamily: fonts.display }}>{formatCurrency(vendido)}</div></div>
          <div><div style={{ fontSize: 12, color: colors.textMuted }}>Sua comissão</div><div style={{ fontSize: 22, fontWeight: 600, fontFamily: fonts.display, color: colors.success }}>{formatCurrency(total)}</div></div>
        </div>
        {vendas.pedidos.length === 0 ? <p style={{ color: colors.textMuted, fontSize: 14 }}>Nenhuma venda sua neste mês ainda.</p> : vendas.pedidos.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: `1px solid ${colors.border}`, fontSize: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{p.cliente_nome || 'Cliente'}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>Pedido nº {p.numero} · {new Date(p.created_at).toLocaleDateString('pt-BR')}{p.status === 'orcamento' ? ' · orçamento' : ''}</div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.revenda_total)}</div>
              <div style={{ fontSize: 12, color: p.vendedor_comissao_paga_em ? colors.success : colors.textMuted }}>
                {formatCurrency(p.vendedor_comissao)} {p.vendedor_comissao_paga_em ? '· paga' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const equipe = (status?.equipe || []).filter(v => v.ativo)
  return (
    <div style={{ fontFamily: fonts.body, maxWidth: 640 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 }}>Ajustes</div>
      <h1 style={{ fontFamily: fonts.display, fontSize: 'clamp(27px, 3.9vw, 37px)', fontWeight: 600, lineHeight: 1.05, margin: '6px 0 24px' }}>Modo balcão</h1>

      <div style={sec}>Minhas vendas</div>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 12px' }}>Toque no seu nome e digite o seu PIN para ver suas vendas e sua comissão do mês.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
        {equipe.map(v => <button key={v.id} style={chip} onClick={() => setVendedor(v)}>{v.nome}</button>)}
      </div>

      <div style={sec}>Área do dono</div>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 12px' }}>Custo, lucro, margem, equipe e comissões. Só com o PIN do dono.</p>
      <button style={btn} onClick={() => setPinDono(true)}>Entrar na Área do dono</button>

      <PinModal open={!!vendedor} criando={vendedor && !vendedor.tem_pin} titulo={vendedor ? vendedor.nome : ''}
        descricao={vendedor && !vendedor.tem_pin ? 'Primeira vez: crie o seu PIN. Só você deve saber.' : null}
        onConfirmar={(pin) => abrirVendas(vendedor, pin)} onClose={() => setVendedor(null)} />
      <PinModal open={pinDono} criando={!status?.dono_pin_criado} titulo="Área do dono"
        onConfirmar={async (pin) => { await entrarDono(pin); setPinDono(false) }} onClose={() => setPinDono(false)} />
    </div>
  )
}
