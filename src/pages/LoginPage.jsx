import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'

export default function LoginPage() {
  const { signIn, error, setError } = useAuth()
  const { colors, fonts } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    await signIn(email, password)
    setLoading(false)
  }

  const S = {
    page: { minHeight: '100vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', background: colors.bg, fontFamily: fonts.body, color: colors.text },
    side: { background: colors.text, color: colors.bg, padding: 'clamp(32px, 6vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 40, minHeight: 280 },
    sideBrand: { fontSize: 11, fontWeight: 600, letterSpacing: 1.8, textTransform: 'uppercase', opacity: 0.7 },
    sideTitle: { fontFamily: fonts.display, fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 500, lineHeight: 1, letterSpacing: -0.5, textWrap: 'balance' },
    sideText: { fontSize: 15, lineHeight: 1.55, opacity: 0.75, maxWidth: 380, marginTop: 18 },
    main: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(32px, 6vw, 72px) 24px' },
    form: { width: '100%', maxWidth: 360 },
    title: { fontFamily: fonts.display, fontSize: 34, fontWeight: 600, lineHeight: 1.1 },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 6, marginBottom: 28 },
    label: { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 },
    input: { width: '100%', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 4, padding: '13px 14px', color: colors.text, fontSize: 15, outline: 'none' },
    btn: { width: '100%', background: colors.text, color: colors.bg, border: 'none', borderRadius: 999, padding: '15px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
    error: { background: colors.danger + '10', borderLeft: `3px solid ${colors.danger}`, padding: '10px 12px', fontSize: 13, color: colors.danger, marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 12 },
  }

  return (
    <div style={S.page}>
      <aside style={S.side}>
        <div style={S.sideBrand}>Estúdio ABC · Portal do lojista</div>
        <div>
          <div style={S.sideTitle}>Arte emoldurada para vender na sua loja.</div>
          <p style={S.sideText}>Escolha obras do acervo, veja o quadro na parede do cliente e envie o pedido direto para a produção.</p>
        </div>
      </aside>

      <main style={S.main}>
        <form onSubmit={handleSubmit} style={S.form}>
          <h1 style={S.title}>Entrar</h1>
          <p style={S.subtitle}>Use o e-mail e a senha que o Estúdio ABC cadastrou para você.</p>

          {error && (
            <div style={S.error} role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} aria-label="Fechar aviso" style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={S.label} htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                style={S.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="voce@sualoja.com.br"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label style={S.label} htmlFor="login-senha">Senha</label>
              <input
                id="login-senha"
                style={S.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} disabled={loading} type="submit">
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </div>

          <p style={{ fontSize: 13, color: colors.textMuted, marginTop: 24, lineHeight: 1.5 }}>
            Esqueceu a senha ou ainda não tem acesso? Fale com o Estúdio ABC.
          </p>
        </form>
      </main>
    </div>
  )
}
