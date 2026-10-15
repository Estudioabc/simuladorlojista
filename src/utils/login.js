// Login por usuário (sem e-mail): a conta do lojista usa um endereço interno que nunca recebe mensagem.
// Mesmo domínio do cadastro no PrintFramePro (LojistasView) e da função create-lojista.
export const DOMINIO_LOGIN = 'lojista.printframepro.app'

// "edcasa" → "edcasa@lojista.printframepro.app"; quem digitar um e-mail (contas antigas) entra com ele
export function emailDoLogin(usuario) {
  const v = (usuario || '').trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${DOMINIO_LOGIN}`
}
