import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'
import { supabase } from '../services/supabase'

export default function ConfigPage() {
  const { colors } = useTheme()
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

  const base = { fontFamily: 'Inter, system-ui, sans-serif' }
  const S = {
    page: { ...base, maxWidth: 520 },
    heading: { fontSize: 22, fontWeight: 700, color: colors.text, letterSpacing: -0.4, marginBottom: 4 },
    sub: { fontSize: 13, color: colors.textMuted, marginBottom: 36 },
    section: { marginBottom: 32 },
    sectionTitle: { fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` },
    field: { marginBottom: 20 },
    label: { fontSize: 12, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
    hint: { fontSize: 11, color: colors.textMuted, marginTop: 5, lineHeight: 1.5 },
    inputWrap: { display: 'flex', alignItems: 'center', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 7, overflow: 'hidden' },
    input: { flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '10px 12px', color: colors.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif' },
    inputSuffix: { padding: '0 12px', color: colors.textMuted, fontSize: 13, fontWeight: 500, borderLeft: `1px solid ${colors.border}`, height: '100%', display: 'flex', alignItems: 'center', background: colors.surfaceAlt },
    previewBox: { background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '14px 16px', marginTop: 8 },
    previewLabel: { fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
    previewVal: { fontSize: 15, fontWeight: 700, color: colors.text },
    infoRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textMuted, marginBottom: 6 },
    infoVal: { color: colors.text, fontWeight: 500 },
    btn: { background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' },
    ok: { background: colors.success + '14', border: `1px solid ${colors.success}30`, borderRadius: 7, padding: '10px 14px', fontSize: 13, color: colors.success, marginBottom: 16 },
    err: { background: colors.danger + '14', border: `1px solid ${colors.danger}30`, borderRadius: 7, padding: '10px 14px', fontSize: 13, color: colors.danger, marginBottom: 16 },
  }

  const exampleCost = 250
  const markup = parseFloat(markupPct) || 0
  const exampleSell = exampleCost * (1 + markup / 100)

  return (
    <div style={S.page}>
      <div style={S.heading}>Configurações</div>
      <div style={S.sub}>Personalize como sua loja aparece e como os preços são calculados</div>

      {msg && <div style={msg.type === 'ok' ? S.ok : S.err}>{msg.text}</div>}

      {/* Identidade */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Identidade da Loja</div>

        <div style={S.field}>
          <label style={S.label}>Nome da empresa</label>
          <div style={S.inputWrap}>
            <input style={S.input} value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nome que aparece no portal" maxLength={80} />
          </div>
          <div style={S.hint}>Substitui "Estúdio ABC" no cabeçalho do seu portal.</div>
          {storeName.trim() && (
            <div style={S.previewBox}>
              <div style={S.previewLabel}>Aparência no portal</div>
              <div style={S.previewVal}>{storeName.trim()}</div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Portal do Lojista</div>
            </div>
          )}
        </div>
      </div>

      {/* Precificação */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Precificação</div>

        <div style={S.field}>
          <label style={S.label}>Markup sobre o custo</label>
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
            Aplicado sobre o valor base do Estúdio ABC para definir seu preço de venda ao cliente final.
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
                <span style={{ color: colors.accent }}>R$ {exampleSell.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ ...S.field, background: colors.surfaceAlt, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 6 }}>Desconto concedido pelo Estúdio ABC</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{lojista?.discount_pct ?? 0}%</div>
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }}>Configurado pelo Estúdio ABC. Não pode ser alterado aqui.</div>
        </div>
      </div>

      {/* Conta */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Conta</div>
        <div style={S.infoRow}><span>E-mail</span><span style={S.infoVal}>{profile?.email}</span></div>
        <div style={S.infoRow}><span>Nome</span><span style={S.infoVal}>{profile?.name}</span></div>
      </div>

      <button style={S.btn} onClick={handleSalvar} disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar configurações'}
      </button>
    </div>
  )
}
