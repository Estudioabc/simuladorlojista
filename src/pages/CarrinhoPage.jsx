import { useState } from 'react'
import { useTheme, useIsMobile, formatCurrency } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { callFunction } from '../services/supabase'
import { EmptyState } from '../components/UI'
import { FramedArtThumb } from '../components/MockupCanvas'
import { comQuantidade } from '../utils/carrinho'

// Carrinho: vários quadros para o mesmo cliente → um pedido só (uma OS no estúdio)
export default function CarrinhoPage({ carrinho, onAlterar, onEditar, onLimpar, onMontar, onVerPedidos }) {
  const { colors, fonts } = useTheme()
  const isMobile = useIsMobile()
  const { lojista } = useAuth()
  const [enviando, setEnviando] = useState(null) // null | 'novo' | 'orcamento'
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(null) // null | 'novo' | 'orcamento'
  const [verCusto, setVerCusto] = useState(false)
  const [obsAberta, setObsAberta] = useState(!!carrinho.cliente.obs)
  const [tentou, setTentou] = useState(false) // depois da 1ª tentativa, o que falta fica vermelho

  const { itens, cliente } = carrinho
  const total = itens.reduce((s, it) => s + (it.payload.preco_total || 0), 0)
  const markup = 1 + (parseFloat(lojista?.markup_pct) || 0) / 100
  const custo = total / markup

  const setCliente = (campo, valor) => onAlterar({ ...carrinho, cliente: { ...cliente, [campo]: valor } })
  const setItens = (novos) => onAlterar({ ...carrinho, itens: novos })
  const mudarQtd = (idx, qtd) => setItens(itens.map((it, i) => i === idx ? comQuantidade(it, qtd) : it))
  const remover = (idx) => setItens(itens.filter((_, i) => i !== idx))

  const enviar = async (status) => {
    if (!itens.length) return
    setTentou(true)
    if (!cliente.nome.trim() || !cliente.contato.trim()) { setErro('Informe o nome e o contato do cliente.'); return }
    if (!cliente.formaEntrega) { setErro('Escolha a forma de entrega.'); return }
    if (cliente.formaEntrega === 'entrega' && !cliente.endereco.trim()) { setErro('Informe o endereço de entrega.'); return }
    setErro('')
    setEnviando(status)
    try {
      await callFunction('sim-pedido', {
        method: 'POST',
        body: {
          status,
          itens: itens.map(it => it.payload),
          cliente_nome: cliente.nome.trim(),
          cliente_contato: cliente.contato.trim(),
          forma_entrega: cliente.formaEntrega,
          endereco_entrega: cliente.formaEntrega === 'entrega' ? cliente.endereco.trim() : null,
          obs: cliente.obs.trim() || null,
        },
      })
      onLimpar()
      setSucesso(status)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(null)
    }
  }

  const inp = { width: '100%', boxSizing: 'border-box', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: '10px 12px', color: colors.text, fontSize: 14, fontFamily: fonts.body, outline: 'none' }
  const lbl = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted, marginBottom: 8 }
  const rotulo = { fontSize: 12, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: 5 }
  const ast = <span style={{ color: colors.danger }} aria-hidden="true"> *</span>
  const falta = {
    nome: !cliente.nome.trim(),
    contato: !cliente.contato.trim(),
    entrega: !cliente.formaEntrega,
    endereco: cliente.formaEntrega === 'entrega' && !cliente.endereco.trim(),
  }
  const marca = (k) => (tentou && falta[k] ? { borderColor: colors.danger, boxShadow: `inset 0 0 0 1px ${colors.danger}` } : {})
  const chip = (on) => ({ padding: on ? '8px 15px' : '9px 16px', borderRadius: 2, border: `${on ? 2 : 1}px solid ${on ? colors.text : colors.border}`, background: colors.surface, color: colors.text, fontWeight: on ? 600 : 500, fontSize: 13, fontFamily: fonts.body, cursor: 'pointer', whiteSpace: 'nowrap' })
  const linkBtn = { background: 'none', border: 'none', padding: 0, color: colors.text, fontSize: 13, fontFamily: fonts.body, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }
  const qtdBtn = { width: 30, height: 30, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, fontSize: 16, cursor: 'pointer', borderRadius: 2, fontFamily: fonts.body, lineHeight: 1 }

  if (sucesso) {
    return (
      <div style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center', fontFamily: fonts.body }}>
        <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 600, lineHeight: 1.15 }}>
          {sucesso === 'orcamento' ? 'Orçamento salvo' : 'Pedido enviado ao estúdio'}
        </div>
        <p style={{ fontSize: 15, color: colors.textMuted, lineHeight: 1.55, margin: '10px 0 26px' }}>
          {sucesso === 'orcamento'
            ? 'Ele fica em Meus pedidos. De lá você gera o PDF para o cliente e confirma quando ele fechar.'
            : 'O Estúdio ABC vai confirmar e iniciar a produção. Acompanhe em Meus pedidos.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onVerPedidos} style={{ ...chip(false), padding: '12px 20px' }}>Ver meus pedidos</button>
          <button onClick={() => { setSucesso(null); onMontar() }} style={{ background: colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
            Novo pedido
          </button>
        </div>
      </div>
    )
  }

  if (!itens.length) {
    return (
      <EmptyState
        title="Seu carrinho está vazio"
        description="Monte um quadro no Novo pedido e adicione ao carrinho. Dá para juntar vários quadros do mesmo cliente num pedido só."
        action="Montar um quadro"
        onAction={onMontar}
      />
    )
  }

  return (
    <div style={{ fontFamily: fonts.body }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.8 }}>Carrinho</div>
        <h1 style={{ fontFamily: fonts.display, fontSize: 'clamp(27px, 3.9vw, 37px)', fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.8, margin: '6px 0 8px' }}>
          {itens.length === 1 ? '1 quadro' : `${itens.length} quadros`}
        </h1>
        <div style={{ fontSize: 15, color: colors.textMuted }}>Tudo vai para o estúdio como um pedido só, para o mesmo cliente.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 360px', gap: isMobile ? 28 : 56, alignItems: 'start' }}>

        {/* ─── Quadros ─── */}
        <div>
          {itens.map((it, idx) => {
            const r = it.resumo
            const detalhes = [r.tamanho, r.acabamento, r.cor && `moldura ${r.cor.toLowerCase()}`, r.vidro && r.vidro.toLowerCase()].filter(Boolean).join(' · ')
            return (
              <div key={it.id} style={{ display: 'flex', gap: 16, padding: '18px 0', borderTop: idx ? `1px solid ${colors.border}` : 'none', alignItems: 'flex-start' }}>
                <div style={{ width: isMobile ? 84 : 110, flexShrink: 0, background: colors.surfaceAlt }}>
                  {r.kitUrls || r.imagemUrl
                    ? <FramedArtThumb src={r.imagemUrl} srcs={r.kitUrls} />
                    : <div style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: colors.textMuted, textAlign: 'center', padding: 6 }}>sem obra</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>{r.titulo}</div>
                    <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCurrency(it.payload.preco_total)}</div>
                  </div>
                  <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 1.45 }}>{detalhes}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="Quantidade">
                      <button style={qtdBtn} onClick={() => mudarQtd(idx, it.payload.quantidade - 1)} disabled={it.payload.quantidade <= 1} aria-label="Diminuir quantidade">−</button>
                      <span style={{ minWidth: 26, textAlign: 'center', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{it.payload.quantidade}</span>
                      <button style={qtdBtn} onClick={() => mudarQtd(idx, it.payload.quantidade + 1)} aria-label="Aumentar quantidade">+</button>
                      {it.payload.quantidade > 1 && (
                        <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 4 }}>{formatCurrency(r.precoUnit)} {r.conjunto ? 'o conjunto' : 'cada'}</span>
                      )}
                    </div>
                    <button style={{ ...linkBtn, color: colors.textMuted }} onClick={() => onEditar(it)}>Editar</button>
                    <button style={{ ...linkBtn, color: colors.textMuted }} onClick={() => remover(idx)}>Remover</button>
                  </div>
                </div>
              </div>
            )
          })}
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 16 }}>
            <button style={linkBtn} onClick={onMontar}>+ Adicionar outro quadro</button>
          </div>
        </div>

        {/* ─── Cliente e finalizar ─── */}
        <div style={{ position: isMobile ? 'static' : 'sticky', top: 96 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={lbl}>Cliente</div>
            <span style={{ fontSize: 11, color: colors.textMuted }}><span style={{ color: colors.danger }}>*</span> obrigatório</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <label style={rotulo} htmlFor="cli-nome">Nome{ast}</label>
              <input id="cli-nome" style={{ ...inp, ...marca('nome') }} placeholder="Nome do cliente" aria-required value={cliente.nome} onChange={e => setCliente('nome', e.target.value)} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={rotulo} htmlFor="cli-contato">Telefone ou e-mail{ast}</label>
              <input id="cli-contato" style={{ ...inp, ...marca('contato') }} inputMode="tel" placeholder="(11) 99999-9999" aria-required value={cliente.contato} onChange={e => setCliente('contato', e.target.value)} />
            </div>
          </div>
          <span style={{ ...rotulo, color: tentou && falta.entrega ? colors.danger : colors.textMuted }}>Entrega{ast}</span>
          <div role="group" aria-label="Forma de entrega" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: cliente.formaEntrega === 'entrega' ? 12 : 0 }}>
            {[{ id: 'retirada', label: 'Retira na loja' }, { id: 'entrega', label: 'Entrega no endereço' }].map(f => (
              <button key={f.id} onClick={() => setCliente('formaEntrega', f.id)} style={{ ...chip(cliente.formaEntrega === f.id), ...(tentou && falta.entrega ? { borderColor: colors.danger } : {}) }} aria-pressed={cliente.formaEntrega === f.id}>{f.label}</button>
            ))}
          </div>
          {cliente.formaEntrega === 'entrega' && (
            <div>
              <label style={rotulo} htmlFor="cli-endereco">Endereço de entrega{ast}</label>
              <input id="cli-endereco" style={{ ...inp, ...marca('endereco') }} placeholder="Rua, número, bairro, cidade..." aria-required value={cliente.endereco} onChange={e => setCliente('endereco', e.target.value)} />
            </div>
          )}
          {obsAberta ? (
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 64, marginTop: 14 }} aria-label="Observações para o estúdio"
              placeholder="Observações para o estúdio: prazo, acabamento especial..."
              value={cliente.obs} onChange={e => setCliente('obs', e.target.value)} />
          ) : (
            <button onClick={() => setObsAberta(true)} style={{ ...linkBtn, fontSize: 12, color: colors.textMuted, marginTop: 12 }}>+ Observações para o estúdio</button>
          )}

          <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 26, paddingTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 13, color: colors.textMuted }}>Total</span>
              <span style={{ fontFamily: fonts.display, fontSize: 30, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => setVerCusto(v => !v)} style={{ ...linkBtn, fontSize: 12, color: colors.textMuted }}>
                {verCusto ? 'ocultar custo e lucro' : 'ver custo e lucro'}
              </button>
            </div>
            {verCusto && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: colors.textMuted }}>Custo do estúdio {formatCurrency(custo)}</span>
                <span style={{ color: colors.success, fontWeight: 600 }}>Seu lucro {formatCurrency(total - custo)}</span>
              </div>
            )}
          </div>

          {erro && (
            <div role="alert" style={{ marginTop: 16, background: colors.danger + '10', borderLeft: `3px solid ${colors.danger}`, padding: '10px 12px', fontSize: 13, color: colors.danger, lineHeight: 1.45 }}>
              {erro}
            </div>
          )}

          <button onClick={() => enviar('novo')} disabled={!!enviando}
            style={{ marginTop: 18, width: '100%', background: enviando === 'novo' ? colors.textMuted : colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: 15, fontSize: 15, fontWeight: 600, cursor: enviando ? 'default' : 'pointer', fontFamily: fonts.body }}>
            {enviando === 'novo' ? 'Enviando…' : 'Enviar pedido ao estúdio'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => enviar('orcamento')} disabled={!!enviando} title="Fica em Meus pedidos para você mandar ao cliente e confirmar depois" style={{ ...linkBtn, opacity: enviando === 'orcamento' ? 0.6 : 1 }}>
              {enviando === 'orcamento' ? 'Salvando…' : 'Salvar como orçamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
