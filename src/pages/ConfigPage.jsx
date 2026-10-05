import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'
import { supabase } from '../services/supabase'

export default function ConfigPage() {
  const { colors, fonts } = useTheme()
  const { lojista, profile, reloadLojista } = useAuth()

  const [storeName, setStoreName] = useState('')
  const [markupPct, setMarkupPct] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok'|'err', text }

  useEffect(() => {
    if (lojista) {
      setStoreName(lojista.store_name ?? '')
      setMarkupPct(lojista.markup_pct != null ? String(lojista.markup_pct) : '')
    }
  }, [lojista])

  const handleSalvar = async () => {
    if (!storeName.trim()) { setMsg({ type: 'err', text: 'Nome da empresa é obrigatório.' }); return }
    const markup = parseFloat(markupPct)
    if (markupPct !== '' && (isNaN(markup) || markup < 0 || markup > 1000)) {
      setMsg({ type: 'err', text: 'Markup inválido (0–1000%).' }); return
    }
    setSalvando(true)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('lojistas')
        .update({
          store_name: storeName.trim(),
          markup_pct: markupPct === '' ? null : markup,
        })
        .eq('id', lojista.id)
      if (error) throw error
      await reloadLojista()
      setMsg({ type: 'ok', text: 'Configurações salvas.' })
    } catch (e) {
      setMsg({ type: 'err', text: e.message ?? 'Erro ao salvar.' })
    } finally {
      setSalvando(false)
    }
  }

  const S = {
    page: { fontFamily: fonts.body, maxWidth: 640 },
    eyebrow: { fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 },
    heading: { fontFamily: fonts.display, fontSize: 'clamp(34px, 5vw, 48px)', fontWeight: 500, lineHeight: 1.05, letterSpacing: -0.4, margin: '6px 0 8px' },
    sub: { fontSize: 15, color: colors.textMuted, marginBottom: 40 },
    section: { marginBottom: 40 },
    sectionTitle: { fontFamily: fonts.display, fontSize: 26, fontWeight: 600, marginBottom: 18, paddingBottom: 10, borderBottom: `1px solid ${colors.text}` },
    field: { marginBottom: 22 },
    label: { fontSize: 13, fontWeight: 600, color: colors.text, display: 'block', marginBottom: 6 },
    hint: { fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 1.5 },
    inputWrap: { display: 'flex', alignItems: 'stretch', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 4, overflow: 'hidden' },
    input: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: '12px 14px', color: colors.text, fontSize: 15 },
    inputSuffix: { padding: '0 14px', color: colors.textMuted, fontSize: 14, fontWeight: 600, borderLeft: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', background: colors.surfaceAlt },
    previewBox: { background: colors.surface, border: `1px solid ${colors.border}`, padding: '16px 18px', marginTop: 10 },
    previewLabel: { fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 6 },
    previewVal: { fontFamily: fonts.display, fontSize: 24, fontWeight: 600, color: colors.text, lineHeight: 1.1 },
    infoRow: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: colors.textMuted, marginBottom: 8, fontVariantNumeric: 'tabular-nums' },
    infoVal: { color: colors.text, fontWeight: 500 },
    btn: { background: colors.text, color: colors.bg, border: 'none', borderRadius: 999, padding: '14px 30px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
    ok: { background: colors.success + '10', borderLeft: `3px solid ${colors.success}`, padding: '10px 14px', fontSize: 14, color: colors.success, marginBottom: 20 },
    err: { background: colors.danger + '10', borderLeft: `3px solid ${colors.danger}`, padding: '10px 14px', fontSize: 14, color: colors.danger, marginBottom: 20 },
  }

  const exampleCost = 250
  const markup = parseFloat(markupPct) || 0
  const exampleSell = exampleCost * (1 + markup / 100)

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>Ajustes</div>
      <h1 style={S.heading}>Sua loja no portal</h1>
      <div style={S.sub}>Defina o nome que aparece para você e nos orçamentos, e a sua margem de revenda.</div>

      {msg && <div role="status" style={msg.type === 'ok' ? S.ok : S.err}>{msg.text}</div>}

      {/* Identidade */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Identidade</div>

        <div style={S.field}>
          <label style={S.label}>Nome da loja</label>
          <div style={S.inputWrap}>
            <input style={S.input} value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nome que aparece no portal" maxLength={80} />
          </div>
          <div style={S.hint}>Aparece no topo do portal e no orçamento em PDF que você manda ao cliente.</div>
          {storeName.trim() && (
            <div style={S.previewBox}>
              <div style={S.previewLabel}>Como fica no topo do portal</div>
              <div style={S.previewVal}>{storeName.trim()}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: colors.textMuted, marginTop: 5, letterSpacing: 1.6, textTransform: 'uppercase' }}>Portal do lojista · Estúdio ABC</div>
            </div>
          )}
        </div>
      </div>

      {/* Precificação */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Preço de revenda</div>

        <div style={S.field}>
          <label style={S.label}>Seu markup sobre o preço do estúdio</label>
          <div style={S.inputWrap}>
            <input
              style={S.input}
              type="number"
              min="0"
              max="1000"
              step="0.5"
              value={markupPct}
              onChange={e => setMarkupPct(e.target.value)}
              placeholder="ex: 30"
            />
            <div style={S.inputSuffix}>%</div>
          </div>
          <div style={S.hint}>
            É somado ao preço do Estúdio ABC para chegar no preço que o seu cliente paga. Vale para os próximos pedidos.
          </div>
          {markup > 0 && (
            <div style={S.previewBox}>
              <div style={S.previewLabel}>Exemplo de cálculo</div>
              <div style={{ ...S.infoRow, marginTop: 6 }}>
                <span>Custo base (Estúdio ABC)</span>
                <span style={S.infoVal}>R$ {exampleCost.toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={S.infoRow}>
                <span>+ Markup {markup}%</span>
                <span style={S.infoVal}>R$ {(exampleCost * markup / 100).toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={{ ...S.infoRow, fontWeight: 700, color: colors.text, borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 4, marginBottom: 0 }}>
                <span>Seu preço de venda</span>
                <span style={{ color: colors.text }}>R$ {exampleSell.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ ...S.field, ...S.previewBox }}>
          <div style={S.previewLabel}>Seu desconto no Estúdio ABC</div>
          <div style={S.previewVal}>{lojista?.discount_pct ?? 0}%</div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>Definido pelo Estúdio ABC. Para mudar, fale com eles.</div>
        </div>
      </div>

      {/* Conta */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Conta</div>
        <div style={S.infoRow}><span>E-mail</span><span style={S.infoVal}>{profile?.email}</span></div>
        <div style={S.infoRow}><span>Nome</span><span style={S.infoVal}>{profile?.name}</span></div>
      </div>

      <button style={S.btn} onClick={handleSalvar} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar ajustes'}
      </button>
    </div>
  )
}
