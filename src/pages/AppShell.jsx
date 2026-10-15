import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, useIsMobile } from '../styles/theme'
import BancoImagensPage from './BancoImagensPage'
import SimuladorPage from './SimuladorPage'
import PedidosPage from './PedidosPage'
import ConfigPage from './ConfigPage'
import CarrinhoPage from './CarrinhoPage'
import { carregarCarrinho, salvarCarrinho, CARRINHO_VAZIO } from '../utils/carrinho'

const NAV = [
  { id: 'banco',     label: 'Acervo' },
  { id: 'simulador', label: 'Novo pedido' },
  { id: 'carrinho',  label: 'Carrinho' },
  { id: 'pedidos',   label: 'Meus pedidos' },
  { id: 'config',    label: 'Ajustes' },
]

export default function AppShell() {
  const { profile, lojista, signOut } = useAuth()
  const { colors, fonts } = useTheme()
  const [tab, setTab] = useState('banco')
  const isMobile = useIsMobile()
  const [imagemParaSimulador, setImagemParaSimulador] = useState(null)
  const [carrinho, setCarrinho] = useState(() => carregarCarrinho(profile?.id))
  const [editando, setEditando] = useState(null) // quadro do carrinho aberto no Novo pedido

  useEffect(() => { setCarrinho(carregarCarrinho(profile?.id)) }, [profile?.id])
  useEffect(() => { salvarCarrinho(profile?.id, carrinho) }, [carrinho, profile?.id])

  // novo quadro entra no fim; quadro editado volta para o mesmo lugar
  const adicionarAoCarrinho = (item) => {
    setCarrinho(c => {
      const i = c.itens.findIndex(x => x.id === item.id)
      return { ...c, itens: i >= 0 ? c.itens.map((x, j) => j === i ? item : x) : [...c.itens, item] }
    })
    if (editando) { setEditando(null); irPara('carrinho') }
  }
  const nCarrinho = carrinho.itens.length

  const irPara = (id) => { setTab(id); window.scrollTo({ top: 0 }) }

  const handleSelectImagem = (img) => {
    setEditando(null)
    setImagemParaSimulador(img)
    irPara('simulador')
  }

  const loja = lojista?.store_name ?? profile?.name ?? 'Portal do Lojista'

  const S = {
    shell: { minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: fonts.body, display: 'flex', flexDirection: 'column' },
    header: { background: colors.bg + 'F2', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${colors.border}`, position: 'sticky', top: 0, zIndex: 100 },
    headerInner: { maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 16px' : '0 32px', height: isMobile ? 60 : 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 },
    brand: { display: 'flex', flexDirection: 'column', minWidth: 0 },
    loja: { fontFamily: fonts.display, fontSize: isMobile ? 22 : 26, fontWeight: 600, lineHeight: 1, letterSpacing: -0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    sub: { fontSize: 10, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.6, marginTop: 5 },
    nav: { display: 'flex', gap: 28, alignItems: 'stretch', height: '100%' },
    navBtn: (active) => ({ background: 'none', border: 'none', borderBottom: `2px solid ${active ? colors.text : 'transparent'}`, color: active ? colors.text : colors.textMuted, fontSize: 14, fontWeight: active ? 600 : 500, cursor: 'pointer', padding: '0 2px', marginBottom: -1, transition: 'color 0.15s, border-color 0.15s' }),
    sair: { background: 'none', border: 'none', color: colors.textMuted, fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 4 },
    content: { flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: isMobile ? '24px 16px 96px' : '44px 32px 72px', boxSizing: 'border-box' },
    mobileNav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: colors.surface, borderTop: `1px solid ${colors.border}`, display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)' },
    mobileBtn: (active) => ({ flex: 1, minHeight: 58, background: 'none', border: 'none', borderTop: `2px solid ${active ? colors.text : 'transparent'}`, color: active ? colors.text : colors.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer' }),
  }

  return (
    <div style={S.shell}>
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.brand}>
            <div style={S.loja}>{loja}</div>
            <div style={S.sub}>Portal do lojista · Estúdio ABC</div>
          </div>

          {!isMobile && (
            <nav style={S.nav} aria-label="Seções">
              {NAV.map(n => (
                <button key={n.id} style={S.navBtn(tab === n.id)} onClick={() => irPara(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
                  {n.label}{n.id === 'carrinho' && nCarrinho > 0 ? ` (${nCarrinho})` : ''}
                </button>
              ))}
            </nav>
          )}

          <button style={S.sair} onClick={signOut}>Sair</button>
        </div>
      </header>

      <main style={S.content}>
        {tab === 'banco'     && <BancoImagensPage onSelectImagem={handleSelectImagem} />}
        {tab === 'simulador' && (
          <SimuladorPage
            key={editando?.id ?? 'novo'}
            imagemInicial={editando ? null : imagemParaSimulador}
            onImagemClear={() => setImagemParaSimulador(null)}
            onAdicionar={adicionarAoCarrinho}
            itemEditando={editando}
            onCancelarEdicao={() => { setEditando(null); irPara('carrinho') }}
            onVerCarrinho={() => irPara('carrinho')}
            nCarrinho={nCarrinho}
          />
        )}
        {tab === 'carrinho' && (
          <CarrinhoPage
            carrinho={carrinho}
            onAlterar={setCarrinho}
            onEditar={(item) => { setEditando(item); irPara('simulador') }}
            onLimpar={() => setCarrinho(CARRINHO_VAZIO)}
            onMontar={() => { setEditando(null); irPara('simulador') }}
            onVerPedidos={() => irPara('pedidos')}
          />
        )}
        {tab === 'pedidos'   && <PedidosPage onNovoPedido={() => irPara('simulador')} />}
        {tab === 'config'    && <ConfigPage />}
      </main>

      {isMobile && (
        <nav style={S.mobileNav} aria-label="Seções">
          {NAV.map(n => (
            <button key={n.id} style={S.mobileBtn(tab === n.id)} onClick={() => irPara(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
              {n.id === 'simulador' ? 'Novo' : n.id === 'pedidos' ? 'Pedidos' : n.label}{n.id === 'carrinho' && nCarrinho > 0 ? ` (${nCarrinho})` : ''}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
