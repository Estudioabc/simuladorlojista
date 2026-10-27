// Carrinho do lojista: quadros montados + dados do cliente (um cliente por carrinho).
// Fica salvo neste aparelho (localStorage), separado por lojista.

export const CARRINHO_VAZIO = {
  itens: [],
  // email, pagamento e obsCliente saem no orçamento do cliente; obs é só para o estúdio
  cliente: { nome: '', contato: '', email: '', formaEntrega: '', endereco: '', obs: '', pagamento: '', obsCliente: '' },
}

const chave = (userId) => `carrinho:${userId || 'anon'}`

export function carregarCarrinho(userId) {
  try {
    const salvo = JSON.parse(localStorage.getItem(chave(userId)) || 'null')
    if (!salvo || !Array.isArray(salvo.itens)) return CARRINHO_VAZIO
    return { itens: salvo.itens, cliente: { ...CARRINHO_VAZIO.cliente, ...(salvo.cliente || {}) } }
  } catch {
    return CARRINHO_VAZIO
  }
}

export function salvarCarrinho(userId, carrinho) {
  try { localStorage.setItem(chave(userId), JSON.stringify(carrinho)) } catch { /* aba anônima ou cheia: segue só em memória */ }
}

// Preço de um quadro com outra quantidade (o preço por conjunto não muda)
export function comQuantidade(item, qtd) {
  const q = Math.max(1, Math.min(99, parseInt(qtd) || 1))
  return {
    ...item,
    config: { ...item.config, quantidade: String(q) },
    payload: { ...item.payload, quantidade: q, preco_total: +(item.resumo.precoUnit * q).toFixed(2) },
  }
}
