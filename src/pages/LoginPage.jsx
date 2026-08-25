import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'

export default function LoginPage() {
  const { signIn, error, setError } = useAuth()
  const { colors } = useTheme()
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
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, padding: 24 },
    card: { width: '100%', maxWidth: 400, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 40 },
    logo: { textAlign: 'center', marginBottom: 32 },
    title: { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    label: { display: 'block', fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { width: '100%', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '11px 14px', color: colors.text, fontSize: 14, outline: 'none' },
    btn: { width: '100%', background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8, letterSpacing: 0.3 },
    error: { background: colors.danger + '18', border: `1px solid ${colors.danger}40`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: colors.danger, marginBottom: 16 },
    divider: { borderBottom: `1px solid ${colors.border}`, marginBottom: 28, paddingBottom: 28 },
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.title}>Estúdio ABC</div>
          <div style={S.subtitle}>Portal do Lojista</div>
        </div>

        {error && (
          <div style={S.error}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={S.label}>E-mail</label>
            <input
              style={S.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label style={S.label}>Senha</label>
            <input
              style={S.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} disabled={loading} type="submit">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: colors.textMuted, marginTop: 24 }}>
          Problemas para acessar? Fale com o Estúdio ABC.
        </p>
      </div>
    </div>
  )
}
