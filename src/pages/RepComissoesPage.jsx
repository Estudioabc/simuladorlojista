import { useState, useEffect } from 'react'
import { useTheme, formatCurrency } from '../styles/theme'
import { callFunction } from '../services/supabase'
import { Spinner, EmptyState } from '../components/UI'

// Comissões do representante: % único do estúdio sobre o valor que o estúdio recebe.
// Prevista = OS aberta, loja ainda não pagou · A receber = OS paga · Recebida = estúdio já pagou.
const SITUACAO = {
  prevista:  { label: 'Prevista',  dica: 'aguardando a loja pagar' },
  a_receber: { label: 'A receber', dica: 'a loja já pagou' },
  paga:      { label: 'Recebida',  dica: 'o estúdio já pagou' },
  cancelada: { label: 'Cancelada', dica: 'pedido cancelado' },
}

export default function RepComissoesPage() {
  const { colors, fonts } = useTheme()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => { callFunction('sim-representante').then(setDados).catch(e => setErro(e.message)) }, [])

  if (erro) return <div style={{ color: colors.danger, padding: 24 }}>{erro}</div>
  if (!dados) return <Spinner label="Carregando comissões..." />

  const lista = dados.comissoes
  const soma = (sit) => lista.filter(c => c.situacao === sit).reduce((s, c) => s + (Number(c.comissao) || 0), 0)
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const recebidaMes = lista.filter(c => c.situacao === 'paga' && new Date(c.created_at) >= inicioMes).reduce((s, c) => s + (Number(c.comissao) || 0), 0)
  const cor = { prevista: colors.textMuted, a_receber: colors.success, paga: colors.text, cancelada: colors.danger }
  const pct = dados.representante?.comissao_pct

  return (
    <div style={{ fontFamily: fonts.body }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 }}>Comissões</div>
      <h1 style={{ fontFamily: fonts.display, fontSize: 'clamp(27px, 3.9vw, 37px)', fontWeight: 600, lineHeight: 1.05, margin: '6px 0 8px' }}>Suas comissões</h1>
      <div style={{ fontSize: 15, color: colors.textMuted, marginBottom: 24 }}>
        {pct != null ? `${String(pct).replace('.', ',')}% sobre o valor que o estúdio recebe de cada pedido.` : 'Sobre o valor que o estúdio recebe de cada pedido.'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', borderTop: `1px solid ${colors.text}`, borderBottom: `1px solid ${colors.border}`, marginBottom: 28 }}>
        {[
          { label: 'A receber', valor: soma('a_receber'), dica: 'lojas já pagaram', cor: colors.success },
          { label: 'Prevista', valor: soma('prevista'), dica: 'aguardando pagamento', cor: colors.text },
          { label: 'Recebida no mês', valor: recebidaMes, dica: 'já paga pelo estúdio', cor: colors.textMuted },
        ].map(k => (
          <div key={k.label} style={{ padding: '14px 12px 16px 0', minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontFamily: fonts.display, fontSize: 'clamp(18px, 4.6vw, 24px)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: k.cor }}>{formatCurrency(k.valor)}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{k.dica}</div>
          </div>
        ))}
      </div>

      {lista.length === 0 ? (
        <EmptyState title="Nenhuma comissão ainda" description="Quando o estúdio aceitar um pedido de uma loja sua, a comissão aparece aqui como prevista." />
      ) : lista.map((c, i) => (
        <div key={`${c.os}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderTop: i ? `1px solid ${colors.border}` : 'none', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.loja || 'Loja'}</div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              OS #{c.os} · {new Date(c.created_at).toLocaleDateString('pt-BR')} · pedido de {formatCurrency(c.valor_estudio)}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: c.situacao === 'cancelada' ? colors.textMuted : colors.text, textDecoration: c.situacao === 'cancelada' ? 'line-through' : 'none' }}>
              {formatCurrency(c.comissao)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: cor[c.situacao] }}>{SITUACAO[c.situacao]?.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
