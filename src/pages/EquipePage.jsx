import { useState, useEffect } from 'react'
import { useTheme, useIsMobile, formatCurrency } from '../styles/theme'
import { callFunction } from '../services/supabase'
import { useEquipe } from '../contexts/EquipeContext'
import PinModal from '../components/PinModal'

// Área do dono › Equipe e comissões da equipe (Fase 2).
// Só funciona com o passe do dono; sem PIN criado, pede para criar antes de cadastrar a equipe.
const mesAtual = () => new Date().toISOString().slice(0, 7)
const mesAnterior = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) }
const nomeMes = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

export default function EquipePage() {
  const { colors, fonts } = useTheme()
  const isMobile = useIsMobile()
  const { status, dono, entrarDono, atualizar } = useEquipe()
  const [pinAberto, setPinAberto] = useState(false)
  const [equipe, setEquipe] = useState([])
  const [form, setForm] = useState(null) // { id?, nome, comissao_pct, ativo }
  const [erro, setErro] = useState('')
  const [mes, setMes] = useState(mesAtual())
  const [comissoes, setComissoes] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const carregarComissoes = async (m = mes) => {
    try {
      const r = await callFunction('sim-equipe', { method: 'POST', body: { acao: 'comissoes', mes: m } })
      setComissoes(r.pedidos); setEquipe(r.equipe)
    } catch (e) { setErro(e.message) }
  }
  useEffect(() => { if (dono) carregarComissoes() }, [dono])

  const inp = { width: '100%', boxSizing: 'border-box', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: '11px 12px', color: colors.text, fontSize: 16, fontFamily: fonts.body, outline: 'none' }
  const btn = { background: colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: '12px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }
  const btn2 = { ...btn, background: 'transparent', color: colors.text, border: `1px solid ${colors.border}` }
  const link = { background: 'none', border: 'none', padding: 0, color: colors.textMuted, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: fonts.body }
  const sec = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted, margin: '0 0 12px' }

  if (!dono) {
    const criar = !status?.dono_pin_criado
    return (
      <div style={{ fontFamily: fonts.body, borderTop: `1px solid ${colors.border}`, paddingTop: 24, marginTop: 32 }}>
        <div style={sec}>Equipe</div>
        <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.55, maxWidth: 560, margin: '0 0 14px' }}>
          Cadastre os vendedores da loja para saber quem fez cada venda e calcular a comissão de cada um.
          Com equipe cadastrada, o portal abre no <strong style={{ color: colors.text }}>modo balcão</strong>: os vendedores veem só o preço ao cliente,
          e custo, lucro e ajustes ficam na Área do dono, protegida pelo seu PIN.
        </p>
        <button style={btn} onClick={() => setPinAberto(true)}>{criar ? 'Criar PIN do dono' : 'Entrar na Área do dono'}</button>
        <PinModal open={pinAberto} criando={criar} titulo={criar ? 'PIN do dono' : 'Área do dono'}
          descricao={criar ? 'Só você deve saber este PIN. Se esquecer, o Casa Quadro Trade ou o seu representante zeram.' : null}
          onConfirmar={async (pin) => { await entrarDono(pin); setPinAberto(false) }} onClose={() => setPinAberto(false)} />
      </div>
    )
  }

  const salvar = async () => {
    setErro(''); setSalvando(true)
    try {
      const r = await callFunction('sim-equipe', { method: 'POST', body: { acao: 'equipe_salvar', ...form } })
      setEquipe(r.equipe); setForm(null); atualizar()
    } catch (e) { setErro(e.message) }
    setSalvando(false)
  }
  const zerarPin = async (v) => {
    if (!confirm(`Zerar o PIN de ${v.nome}? Na próxima venda ele cria um novo.`)) return
    try { const r = await callFunction('sim-equipe', { method: 'POST', body: { acao: 'equipe_zerar_pin', id: v.id } }); setEquipe(r.equipe) } catch (e) { setErro(e.message) }
  }
  const marcarPagas = async (ids, desfazer = false) => {
    try { await callFunction('sim-equipe', { method: 'POST', body: { acao: 'comissao_marcar_paga', pedido_ids: ids, desfazer } }); carregarComissoes() } catch (e) { setErro(e.message) }
  }

  const porVendedor = equipe.map(v => {
    const vendas = (comissoes || []).filter(p => p.vendedor_id === v.id)
    return {
      ...v, vendas,
      vendido: vendas.reduce((s, p) => s + (Number(p.revenda_total) || 0), 0),
      aPagar: vendas.filter(p => !p.vendedor_comissao_paga_em).reduce((s, p) => s + (Number(p.vendedor_comissao) || 0), 0),
      pago: vendas.filter(p => p.vendedor_comissao_paga_em).reduce((s, p) => s + (Number(p.vendedor_comissao) || 0), 0),
    }
  })

  return (
    <div style={{ fontFamily: fonts.body, borderTop: `1px solid ${colors.border}`, paddingTop: 24, marginTop: 32 }}>
      {erro && <div role="alert" style={{ marginBottom: 14, background: colors.danger + '10', borderLeft: `3px solid ${colors.danger}`, padding: '10px 12px', fontSize: 14, color: colors.danger }}>{erro}</div>}

      {/* ── Equipe ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div style={sec}>Equipe</div>
        {!form && <button style={link} onClick={() => setForm({ nome: '', comissao_pct: '5', ativo: true })}>+ Adicionar vendedor</button>}
      </div>
      {equipe.length === 0 && !form && (
        <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 12px' }}>Nenhum vendedor ainda. Enquanto não houver equipe, a loja vê tudo, como hoje.</p>
      )}
      {equipe.map(v => (
        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: `1px solid ${colors.border}`, opacity: v.ativo ? 1 : 0.5, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{v.nome}{!v.ativo && <span style={{ fontWeight: 400, color: colors.textMuted }}> · desativado</span>}</div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>{String(v.comissao_pct ?? 0).replace('.', ',')}% de comissão · {v.tem_pin ? 'PIN criado' : 'cria o PIN na 1ª venda'}</div>
          </div>
          <button style={link} onClick={() => setForm({ id: v.id, nome: v.nome, comissao_pct: String(v.comissao_pct ?? 0).replace('.', ','), ativo: v.ativo })}>Editar</button>
          {v.tem_pin && <button style={link} onClick={() => zerarPin(v)}>Zerar PIN</button>}
        </div>
      ))}
      {form && (
        <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, padding: 16, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 140px', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 6 }}>Nome<span style={{ color: colors.danger }}> *</span></label>
              <input style={inp} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do vendedor" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 6 }}>Comissão (%)</label>
              <input style={inp} inputMode="decimal" value={form.comissao_pct} onChange={e => setForm(f => ({ ...f, comissao_pct: e.target.value }))} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: colors.textMuted, margin: '8px 0 12px' }}>Sobre o valor de venda ao cliente. Vale para as vendas a partir de agora.</p>
          {form.id && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12 }}>
              <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} /> Ativo (desmarque se o vendedor saiu da loja)
            </label>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ ...btn, opacity: salvando ? 0.7 : 1 }} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            <button style={btn2} onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Comissões da equipe ── */}
      {equipe.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div style={sec}>Comissões da equipe · {nomeMes(mes)}</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {[mesAtual(), mesAnterior()].map(m => (
                <button key={m} style={{ ...link, color: m === mes ? colors.text : colors.textMuted, fontWeight: m === mes ? 600 : 400 }} onClick={() => { setMes(m); carregarComissoes(m) }}>
                  {m === mesAtual() ? 'Este mês' : 'Mês passado'}
                </button>
              ))}
            </div>
          </div>
          {comissoes == null ? <div style={{ fontSize: 13, color: colors.textMuted }}>Carregando…</div> : porVendedor.filter(v => v.vendas.length).length === 0 ? (
            <p style={{ fontSize: 14, color: colors.textMuted }}>Nenhuma venda com vendedor neste mês.</p>
          ) : porVendedor.filter(v => v.vendas.length).map(v => (
            <div key={v.id} style={{ padding: '14px 0', borderTop: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{v.nome}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{v.vendas.length} venda(s) · {formatCurrency(v.vendido)} vendido</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(v.aPagar)} <span style={{ fontSize: 12, fontWeight: 400, color: colors.textMuted }}>a pagar</span></div>
                  {v.pago > 0 && <div style={{ fontSize: 12, color: colors.success }}>{formatCurrency(v.pago)} já pago</div>}
                </div>
              </div>
              {v.aPagar > 0 && (
                <button style={{ ...link, color: colors.text, marginTop: 8 }} onClick={() => marcarPagas(v.vendas.filter(p => !p.vendedor_comissao_paga_em).map(p => p.id))}>
                  Marcar {formatCurrency(v.aPagar)} como pago
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
