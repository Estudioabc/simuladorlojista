import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../styles/theme'
import BancoImagensPage from './BancoImagensPage'
import SimuladorPage from './SimuladorPage'
import PedidosPage from './PedidosPage'

const NAV = [
  { id: 'banco',     label: 'Banco de Imagens', icon: '🖼️' },
  { id: 'simulador', label: 'Novo Pedido',       icon: '✏️' },
  { id: 'pedidos',   label: 'Meus Pedidos',      icon: '📋' },
]

export default function AppShell() {
  const { profile, lojista, signOut } = useAuth()
  const { colors, dark, setDark } = useTheme()
  const [tab, setTab] = useState('banco')
  const [menuOpen, setMenuOpen] = useState(false)
  const [imagemParaSimulador, setImagemParaSimulador] = useState(null)

  const handleSelectImagem = (img) => {
    setImagemParaSimulador(img)
    setTab('simulador')
  }

  const S = {
    shell: { minHeight: '100vh', background: colors.bg, display: 'flex', flexDirection: 'column' },
    header: { background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', height: 60, gap: 16, position: 'sticky', top: 0, zIndex: 100 },
    logo: { fontSize: 15, fontWeight: 800, color: colors.text, letterSpacing: -0.3, whiteSpace: 'nowrap' },
    logoSub: { fontSize: 11, color: colors.textMuted, fontWeight: 400 },
    nav: { display: 'flex', gap: 4, flex: 1, justifyContent: 'center' },
    navBtn: (active) => ({ background: active ? colors.accent + '18' : 'transparent', color: active ? colors.accent : colors.textMuted, border: `1px solid ${active ? colors.accent + '40' : 'transparent'}`, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s', whiteSpace: 'nowrap' }),
    userArea: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
    avatar: { width: 32, height: 32, borderRadius: '50%', background: colors.accent + '30', color: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 },
    userName: { fontSize: 13, fontWeight: 600, color: colors.text },
    storeName: { fontSize: 11, color: colors.textMuted },
    signOutBtn: { background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, color: colors.textMuted, cursor: 'pointer' },
    content: { flex: 1, padding: '32px 24px', maxWidth: 900, margin: '0 auto', width: '100%' },
    // mobile nav
    mobileNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: colors.surface, borderTop: `1px solid ${colors.border}`, display: 'flex', zIndex: 100 },
    mobileBtn: (active) => ({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', color: active ? colors.accent : colors.textMuted, fontSize: 10, fontWeight: active ? 700 : 400 }),
  }

  const initials = (profile?.name ?? 'L').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div style={S.shell}>
      {/* Header desktop */}
      <header style={S.header}>
        <div>
          <div style={S.logo}>Estúdio ABC</div>
          <div style={S.logoSub}>Portal do Lojista</div>
        </div>

        {/* Nav desktop */}
        <nav style={S.nav}>
          {NAV.map(n => (
            <button key={n.id} style={S.navBtn(tab === n.id)} onClick={() => setTab(n.id)}>
              <span>{n.icon}</span>
              <span style={{ '@media(max-width:600px)': { display: 'none' } }}>{n.label}</span>
            </button>
          ))}
        </nav>

        <div style={S.userArea}>
          <button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: colors.textMuted }} title={dark ? 'Modo claro' : 'Modo escuro'}>
            {dark ? '☀️' : '🌙'}
          </button>
          <div style={S.avatar}>{initials}</div>
          <div style={{ display: 'none' }}>
            <div style={S.userName}>{lojista?.store_name ?? profile?.name}</div>
            <div style={S.storeName}>{profile?.email}</div>
          </div>
          <button style={S.signOutBtn} onClick={signOut}>Sair</button>
        </div>
      </header>

      {/* Content */}
      <main style={S.content}>
        {tab === 'banco'     && <BancoImagensPage onSelectImagem={handleSelectImagem} />}
        {tab === 'simulador' && <SimuladorPage imagemInicial={imagemParaSimulador} onImagemClear={() => setImagemParaSimulador(null)} />}
        {tab === 'pedidos'   && <PedidosPage />}
      </main>

      {/* Nav mobile */}
      <nav style={{ ...S.mobileNav, '@media(min-width:768px)': { display: 'none' } }}>
        {NAV.map(n => (
          <button key={n.id} style={S.mobileBtn(tab === n.id)} onClick={() => setTab(n.id)}>
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
