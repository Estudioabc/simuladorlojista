import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, useIsMobile } from '../styles/theme'
import BancoImagensPage from './BancoImagensPage'
import SimuladorPage from './SimuladorPage'
import PedidosPage from './PedidosPage'
import ConfigPage from './ConfigPage'
import CarrinhoPage from './CarrinhoPage'
import RepLojasPage from './RepLojasPage'
import RepComissoesPage from './RepComissoesPage'
import EquipePage from './EquipePage'
import BalcaoPage from './BalcaoPage'
import PinModal from '../components/PinModal'
import { useEquipe } from '../contexts/EquipeContext'
import { carregarCarrinho, salvarCarrinho, CARRINHO_VAZIO } from '../utils/carrinho'

const NAV_LOJISTA = [
  { id: 'banco',     label: 'Acervo' },
  { id: 'simulador', label: 'Novo pedido' },
  { id: 'pedidos',   label: 'Meus pedidos' },
  { id: 'config',    label: 'Ajustes' },
]
// Representante (vendedor do estúdio): vende direto pela loja própria e acompanha a carteira e as comissões
const NAV_REPRESENTANTE = [
  { id: 'banco',     label: 'Acervo' },
  { id: 'simulador', label: 'Novo pedido' },
  { id: 'pedidos',   label: 'Pedidos' },
  { id: 'lojas',     label: 'Minhas lojas' },
  { id: 'comissoes', label: 'Comissões' },
  { id: 'config',    label: 'Ajustes' },
]
const ROTULO_CELULAR = { simulador: 'Novo pedido', pedidos: 'Pedidos', lojas: 'Lojas' }

export default function AppShell() {
  const { profile, lojista, signOut } = useAuth()
  const { colors, fonts } = useTheme()
  const [tab, setTab] = useState('banco')
  const isMobile = useIsMobile()
  const [imagemParaSimulador, setImagemParaSimulador] = useState(null)
  const [carrinho, setCarrinho] = useState(() => carregarCarrinho(profile?.id))
  const [editando, setEditando] = useState(null) // quadro do carrinho aberto no Novo pedido
  const { status: equipeStatus, temEquipe, balcao, dono, entrarDono, sairDono } = useEquipe()
  const [pinDonoAberto, setPinDonoAberto] = useState(false)
  // ao entrar/sair da Área do dono as telas recarregam (preços com ou sem margem, custo visível ou não)
  const modo = balcao ? 'balcao' : 'dono'

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
  const isRep = profile?.role === 'representante'
  const NAV = isRep ? NAV_REPRESENTANTE : NAV_LOJISTA
  // celular: no máximo 5 botões embaixo; o Ajustes do representante vai para o topo
  const navCelular = isRep ? NAV.filter(n => n.id !== 'config') : NAV

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
            <div style={S.sub}>{isRep ? 'Representante' : 'Portal do lojista'} · Estúdio ABC</div>
          </div>

          {!isMobile && (
            <nav style={S.nav} aria-label="Seções">
              {NAV.map(n => (
                <button key={n.id} style={S.navBtn(tab === n.id)} onClick={() => irPara(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
                  {n.label}
                </button>
              ))}
            </nav>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 22 }}>
            <button onClick={() => irPara('carrinho')} aria-label={`Carrinho, ${nCarrinho} ${nCarrinho === 1 ? 'quadro' : 'quadros'}`}
              aria-current={tab === 'carrinho' ? 'page' : undefined}
              style={{ position: 'relative', background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: colors.text, display: 'flex' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
                <path d="M9 10V7a3 3 0 0 1 6 0v3" />
              </svg>
              {nCarrinho > 0 && (
                <span style={{ position: 'absolute', top: 0, right: -2, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: colors.text, color: colors.bg, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                  {nCarrinho}
                </span>
              )}
            </button>
            {temEquipe && (
              <button style={{ ...S.sair, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onClick={() => (dono ? sairDono() : setPinDonoAberto(true))} aria-label={dono ? 'Sair da área do dono' : 'Entrar na área do dono'}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="10" rx="1.5" />
                  <path d={dono ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
                </svg>
                {isMobile ? (dono ? 'Sair' : 'Dono') : (dono ? 'Sair da área do dono' : 'Área do dono')}
              </button>
            )}
            {isRep && isMobile && <button style={S.sair} onClick={() => irPara('config')}>Ajustes</button>}
            <button style={S.sair} onClick={signOut}>Sair</button>
          </div>
        </div>
      </header>

      <main style={S.content}>
        {tab === 'banco'     && <BancoImagensPage onSelectImagem={handleSelectImagem} />}
        {tab === 'simulador' && (
          <SimuladorPage
            key={`${editando?.id ?? 'novo'}-${modo}`}
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
            key={modo}
            carrinho={carrinho}
            onAlterar={setCarrinho}
            onEditar={(item) => { setEditando(item); irPara('simulador') }}
            onLimpar={() => setCarrinho(CARRINHO_VAZIO)}
            onMontar={() => { setEditando(null); irPara('simulador') }}
            onVerPedidos={() => irPara('pedidos')}
          />
        )}
        {tab === 'pedidos'   && <PedidosPage key={modo} onNovoPedido={() => irPara('simulador')} />}
        {tab === 'config'    && (balcao ? <BalcaoPage /> : <><ConfigPage /><EquipePage /></>)}
        {tab === 'lojas'     && isRep && <RepLojasPage />}
        {tab === 'comissoes' && isRep && <RepComissoesPage />}
      </main>

      <PinModal open={pinDonoAberto} criando={!equipeStatus?.dono_pin_criado} titulo="Área do dono"
        descricao="Custo, lucro, margem, equipe e comissões."
        onConfirmar={async (pin) => { await entrarDono(pin); setPinDonoAberto(false) }} onClose={() => setPinDonoAberto(false)} />

      {isMobile && (
        <nav style={S.mobileNav} aria-label="Seções">
          {navCelular.map(n => (
            <button key={n.id} style={S.mobileBtn(tab === n.id)} onClick={() => irPara(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
              {ROTULO_CELULAR[n.id] ?? n.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
