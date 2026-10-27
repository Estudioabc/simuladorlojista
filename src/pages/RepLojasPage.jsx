import { useState, useEffect } from 'react'
import { useTheme, useIsMobile, formatCurrency } from '../styles/theme'
import { callFunction } from '../services/supabase'
import { Spinner, EmptyState } from '../components/UI'

// Representante: carteira de lojas, pedidos de cada loja (valor do estúdio) e cadastro de loja nova.
const LOJA_VAZIA = {
  cnpj: '', razao_social: '', nome_fantasia: '', ie: '',
  responsavel: '', whatsapp: '', email: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
}
const USUARIO_RE = /^[a-z0-9](?:[a-z0-9.-]{1,28}[a-z0-9])$/
const digitos = (v) => (v || '').replace(/\D/g, '')
const dataBr = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
// sugestão de usuário a partir do nome fantasia: "Casa & Arte Decor" → "casaartedecor"
const sugerirUsuario = (nome) => (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)

function situacaoPedido(p) {
  if (p.status === 'orcamento') return 'Orçamento'
  if (p.status === 'cancelada' || p.os?.status === 'cancelada') return 'Cancelado'
  if (p.os?.status === 'finalizada') return 'Entregue'
  if (p.os?.status === 'entrega') return 'Pronto'
  if (p.os?.status === 'producao') return 'Em produção'
  if (p.os) return 'Aprovado'
  return 'Recebido'
}

export default function RepLojasPage() {
  const { colors, fonts } = useTheme()
  const isMobile = useIsMobile()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState(null)
  const [cadastrando, setCadastrando] = useState(false)

  const carregar = () => callFunction('sim-representante').then(setDados).catch(e => setErro(e.message))
  useEffect(() => { carregar() }, [])

  const inp = { width: '100%', boxSizing: 'border-box', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: '12px', color: colors.text, fontSize: 16, fontFamily: fonts.body, outline: 'none' }
  const lbl = { fontSize: 12, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 6 }
  const sec = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted, margin: '26px 0 12px' }
  const btn = { background: colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: '14px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }

  if (cadastrando) {
    return <CadastroLoja colors={colors} fonts={fonts} isMobile={isMobile} inp={inp} lbl={lbl} sec={sec} btn={btn}
      onVoltar={() => setCadastrando(false)} onCadastrou={() => carregar()} />
  }
  if (erro) return <div style={{ color: colors.danger, padding: 24 }}>{erro}</div>
  if (!dados) return <Spinner label="Carregando suas lojas..." />

  const lojas = dados.lojas.filter(l => !l.propria)
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const pedidosDe = (l) => dados.pedidos.filter(p => p.lojista_id === l.user_id)

  return (
    <div style={{ fontFamily: fonts.body }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 }}>Minhas lojas</div>
          <h1 style={{ fontFamily: fonts.display, fontSize: 'clamp(27px, 3.9vw, 37px)', fontWeight: 600, lineHeight: 1.05, margin: '6px 0 0' }}>
            {lojas.length === 1 ? '1 loja' : `${lojas.length} lojas`}
          </h1>
        </div>
        <button style={btn} onClick={() => setCadastrando(true)}>+ Cadastrar loja</button>
      </div>

      {lojas.length === 0 ? (
        <EmptyState title="Nenhuma loja ainda" description="Cadastre a primeira loja. Ela recebe usuário e senha para usar o portal, e os pedidos dela contam para a sua comissão."
          action="Cadastrar loja" onAction={() => setCadastrando(true)} />
      ) : lojas.map(l => {
        const peds = pedidosDe(l)
        const doMes = peds.filter(p => new Date(p.created_at) >= inicioMes && p.status !== 'orcamento' && p.status !== 'cancelada')
        const totalMes = doMes.reduce((s, p) => s + (Number(p.valor_estudio) || 0), 0)
        const aberto = aberta === l.id
        const wa = digitos(l.whatsapp)
        return (
          <div key={l.id} style={{ borderTop: `1px solid ${colors.border}` }}>
            <button onClick={() => setAberta(aberto ? null : l.id)} aria-expanded={aberto}
              style={{ width: '100%', background: 'none', border: 'none', padding: '16px 0', textAlign: 'left', cursor: 'pointer', color: colors.text, fontFamily: fonts.body, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: fonts.display, fontSize: 17, fontWeight: 600 }}>{l.store_name}</div>
                <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                  {[l.city && `${l.city}/${l.state}`, peds[0] ? `último pedido ${dataBr(peds[0].created_at)}` : 'sem pedidos ainda'].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalMes)}</div>
                <div style={{ fontSize: 11, color: colors.textMuted }}>neste mês</div>
              </div>
            </button>
            {aberto && (
              <div style={{ paddingBottom: 18 }}>
                {wa && (
                  <a href={`https://wa.me/55${wa.replace(/^55/, '')}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', fontSize: 13, color: colors.text, marginBottom: 12, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    Chamar no WhatsApp
                  </a>
                )}
                <button style={{ display: 'block', background: 'none', border: 'none', padding: 0, color: colors.textMuted, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: fonts.body, marginBottom: 12 }}
                  onClick={async () => {
                    if (!confirm(`Zerar o PIN do dono da ${l.store_name}? No próximo acesso o dono cria outro.`)) return
                    try { await callFunction('sim-representante', { method: 'POST', body: { acao: 'zerar_pin_dono', lojista_id: l.id } }); alert('PIN do dono zerado.') }
                    catch (e) { alert(e.message) }
                  }}>
                  Zerar PIN do dono (esqueceu o PIN)
                </button>
                {peds.length === 0 ? (
                  <div style={{ fontSize: 13, color: colors.textMuted }}>A loja ainda não fez pedidos.</div>
                ) : peds.slice(0, 20).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px dashed ${colors.border}`, fontSize: 13 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{p.quadros > 1 ? `${p.quadros} quadros` : (p.titulo || 'Quadro')}</div>
                      <div style={{ color: colors.textMuted }}>Pedido nº {p.numero ?? '—'}{p.os?.number ? ` · OS #${p.os.number}` : ''} · {dataBr(p.created_at)} · {situacaoPedido(p)}</div>
                    </div>
                    <div style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p.valor_estudio ? formatCurrency(p.valor_estudio) : '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {lojas.length > 0 && <div style={{ borderTop: `1px solid ${colors.border}` }} />}
      <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 16, lineHeight: 1.5 }}>Valores = o que a loja paga ao estúdio (base da sua comissão).</p>
    </div>
  )
}

function CadastroLoja({ colors, fonts, isMobile, inp, lbl, sec, btn, onVoltar, onCadastrou }) {
  const [f, setF] = useState(LOJA_VAZIA)
  const [usuario, setUsuario] = useState('')
  const [usuarioMexido, setUsuarioMexido] = useState(false)
  const [senha, setSenha] = useState('')
  const [buscando, setBuscando] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [pronto, setPronto] = useState(null) // { usuario, senha, nome, whatsapp }
  const [tentou, setTentou] = useState(false) // depois da 1ª tentativa, campos obrigatórios vazios ficam vermelhos

  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const setNome = (v) => { set('nome_fantasia', v); if (!usuarioMexido) setUsuario(sugerirUsuario(v)) }

  // CNPJ → razão social, nome fantasia e endereço (BrasilAPI); só completa o que estiver vazio
  const buscarCnpj = async () => {
    const c = digitos(f.cnpj)
    if (c.length !== 14) return
    setBuscando('cnpj')
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`)
      if (r.ok) {
        const d = await r.json()
        setF(x => ({
          ...x,
          razao_social: x.razao_social || d.razao_social || '',
          nome_fantasia: x.nome_fantasia || d.nome_fantasia || '',
          cep: x.cep || (d.cep || '').toString(),
          endereco: x.endereco || [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '),
          numero: x.numero || d.numero || '',
          complemento: x.complemento || d.complemento || '',
          bairro: x.bairro || d.bairro || '',
          cidade: x.cidade || d.municipio || '',
          uf: x.uf || d.uf || '',
          email: x.email || (d.email || '').toLowerCase(),
        }))
        if (!usuarioMexido && !f.nome_fantasia && d.nome_fantasia) setUsuario(sugerirUsuario(d.nome_fantasia))
      }
    } catch { /* sem internet ou CNPJ não encontrado: preenche à mão */ }
    setBuscando('')
  }

  const buscarCep = async () => {
    const c = digitos(f.cep)
    if (c.length !== 8) return
    setBuscando('cep')
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${c}`)
      if (r.ok) {
        const d = await r.json()
        setF(x => ({ ...x, endereco: d.street || x.endereco, bairro: d.neighborhood || x.bairro, cidade: d.city || x.cidade, uf: d.state || x.uf }))
      }
    } catch { /* preenche à mão */ }
    setBuscando('')
  }

  const invalido = {
    cnpj: ![11, 14].includes(digitos(f.cnpj).length),
    razao_social: !f.razao_social.trim(),
    nome_fantasia: !f.nome_fantasia.trim(),
    whatsapp: digitos(f.whatsapp).length < 10,
    endereco: !f.endereco.trim(),
    numero: !f.numero.trim(),
    cidade: !f.cidade.trim(),
    uf: f.uf.trim().length !== 2,
    usuario: !USUARIO_RE.test(usuario),
    senha: senha.length < 10,
  }
  const marca = (k) => (tentou && invalido[k] ? { borderColor: colors.danger, boxShadow: `inset 0 0 0 1px ${colors.danger}` } : {})
  const ast = <span style={{ color: colors.danger }} aria-hidden="true"> *</span>

  const enviar = async () => {
    setTentou(true)
    const faltando = []
    if (![11, 14].includes(digitos(f.cnpj).length)) faltando.push('CNPJ')
    if (!f.razao_social.trim()) faltando.push('razão social')
    if (!f.nome_fantasia.trim()) faltando.push('nome da loja')
    if (digitos(f.whatsapp).length < 10) faltando.push('WhatsApp')
    if (!f.endereco.trim() || !f.numero.trim() || !f.cidade.trim() || f.uf.trim().length !== 2) faltando.push('endereço')
    if (!USUARIO_RE.test(usuario)) faltando.push('usuário')
    if (senha.length < 10) faltando.push('senha (mínimo 10)')
    if (faltando.length) { setErro(`Confira: ${faltando.join(', ')}.`); return }
    setErro(''); setSalvando(true)
    try {
      await callFunction('sim-representante', { method: 'POST', body: { loja: f, usuario, senha } })
      setPronto({ usuario, senha, nome: f.nome_fantasia, whatsapp: f.whatsapp })
      onCadastrou()
    } catch (e) {
      setErro(e.message)
    }
    setSalvando(false)
  }

  const campo = (k, label, extra = {}) => {
    const obrigatorio = k in invalido
    const { style: estiloExtra, ...resto } = extra
    return (
      <div style={{ minWidth: 0 }}>
        <label style={lbl} htmlFor={`cad-${k}`}>{label}{obrigatorio && ast}</label>
        <input id={`cad-${k}`} style={{ ...inp, ...estiloExtra, ...marca(k) }} value={f[k]} onChange={e => set(k, e.target.value)}
          aria-required={obrigatorio || undefined} aria-invalid={(tentou && invalido[k]) || undefined} {...resto} />
      </div>
    )
  }
  const grade = (cols) => ({ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : cols, gap: 12, marginBottom: 12 })

  if (pronto) {
    // link que a loja vai usar: o do site publicado (testando localmente, o endereço seria localhost)
    const link = /localhost|127\.0\.0\.1/.test(window.location.hostname) ? 'https://simuladorlojista.netlify.app' : window.location.origin
    const msg = `Olá! Seu acesso ao portal da Casa Quadro Trade está pronto.\n\nEntre em ${link}\nUsuário: ${pronto.usuario}\nSenha: ${pronto.senha}\n\nLá você escolhe as obras, vê o quadro na parede do cliente e faz o pedido.`
    const wa = digitos(pronto.whatsapp)
    return (
      <div style={{ maxWidth: 520, margin: '24px auto', fontFamily: fonts.body }}>
        <div style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: 600 }}>Loja cadastrada</div>
        <p style={{ fontSize: 15, color: colors.textMuted, lineHeight: 1.55 }}>
          <strong style={{ color: colors.text }}>{pronto.nome}</strong> já pode entrar no portal. Mande o acesso para a loja:
        </p>
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, padding: 16, fontSize: 15, lineHeight: 1.7 }}>
          <div>Link: <strong>{link}</strong></div>
          <div>Usuário: <strong>{pronto.usuario}</strong></div>
          <div>Senha: <strong>{pronto.senha}</strong></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {wa && (
            <a href={`https://wa.me/55${wa.replace(/^55/, '')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"
              style={{ ...btn, textAlign: 'center', textDecoration: 'none' }}>
              Enviar acesso pelo WhatsApp
            </a>
          )}
          <button style={{ ...btn, background: 'transparent', color: colors.text, border: `1px solid ${colors.border}` }} onClick={onVoltar}>Voltar para minhas lojas</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, fontFamily: fonts.body }}>
      <button onClick={onVoltar} style={{ background: 'none', border: 'none', padding: 0, color: colors.textMuted, fontSize: 14, cursor: 'pointer', fontFamily: fonts.body }}>← Minhas lojas</button>
      <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 600, margin: '10px 0 4px' }}>Cadastrar loja</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>Comece pelo CNPJ: o resto se preenche sozinho.</p>
      <p style={{ fontSize: 12, color: colors.textMuted, margin: '6px 0 0' }}><span style={{ color: colors.danger }}>*</span> campos obrigatórios</p>

      <div style={sec}>Empresa</div>
      <div style={grade('1fr 1fr')}>
        {campo('cnpj', buscando === 'cnpj' ? 'CNPJ (buscando…)' : 'CNPJ', { inputMode: 'numeric', placeholder: '00.000.000/0000-00', onBlur: buscarCnpj })}
        {campo('ie', 'Inscrição estadual', { placeholder: 'ou Isento' })}
      </div>
      <div style={grade('1fr 1fr')}>
        {campo('razao_social', 'Razão social')}
        <div style={{ minWidth: 0 }}>
          <label style={lbl} htmlFor="cad-nome">Nome da loja{ast}</label>
          <input id="cad-nome" style={{ ...inp, ...marca('nome_fantasia') }} aria-required value={f.nome_fantasia} onChange={e => setNome(e.target.value)} placeholder="Como a loja é conhecida" />
        </div>
      </div>

      <div style={sec}>Contato</div>
      <div style={grade('1fr 1fr 1fr')}>
        {campo('responsavel', 'Responsável')}
        {campo('whatsapp', 'WhatsApp', { inputMode: 'tel', placeholder: '(11) 99999-9999' })}
        {campo('email', 'E-mail', { type: 'email', inputMode: 'email' })}
      </div>

      <div style={sec}>Endereço</div>
      <div style={grade('160px 1fr')}>
        {campo('cep', buscando === 'cep' ? 'CEP (buscando…)' : 'CEP', { inputMode: 'numeric', placeholder: '00000-000', onBlur: buscarCep })}
        {campo('endereco', 'Rua')}
      </div>
      <div style={grade('120px 1fr 1fr')}>
        {campo('numero', 'Número', { inputMode: 'numeric' })}
        {campo('complemento', 'Complemento')}
        {campo('bairro', 'Bairro')}
      </div>
      <div style={grade('1fr 90px')}>
        {campo('cidade', 'Cidade')}
        {campo('uf', 'UF', { maxLength: 2, style: { ...inp, textTransform: 'uppercase' } })}
      </div>

      <div style={sec}>Acesso da loja ao portal</div>
      <div style={grade('1fr 1fr')}>
        <div style={{ minWidth: 0 }}>
          <label style={lbl} htmlFor="cad-usuario">Usuário{ast}</label>
          <input id="cad-usuario" style={{ ...inp, ...marca('usuario') }} aria-required autoCapitalize="none" autoCorrect="off" spellCheck={false} value={usuario}
            onChange={e => { setUsuarioMexido(true); setUsuario(e.target.value.toLowerCase().replace(/\s/g, '')) }} placeholder="ex.: casadecor" />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={lbl} htmlFor="cad-senha">Senha{ast}</label>
          <input id="cad-senha" style={{ ...inp, ...marca('senha') }} aria-required value={senha} onChange={e => setSenha(e.target.value)} placeholder="Mínimo 10 caracteres" autoComplete="new-password" />
        </div>
      </div>
      <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 8px', lineHeight: 1.5 }}>
        Depois de cadastrar, você manda o acesso para a loja pelo WhatsApp. A Casa Quadro Trade define os produtos liberados para ela.
      </p>

      {erro && <div role="alert" style={{ margin: '14px 0', background: colors.danger + '10', borderLeft: `3px solid ${colors.danger}`, padding: '10px 12px', fontSize: 14, color: colors.danger }}>{erro}</div>}

      <button style={{ ...btn, width: '100%', marginTop: 12, opacity: salvando ? 0.7 : 1 }} disabled={salvando} onClick={enviar}>
        {salvando ? 'Cadastrando…' : 'Cadastrar loja'}
      </button>
    </div>
  )
}
