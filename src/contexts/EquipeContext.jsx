import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { callFunction, passeDono } from '../services/supabase'

// Equipe da loja (Fase 2).
// - Loja sem equipe: vê tudo, como antes (balcao = false).
// - Loja com equipe: abre no modo balcão (sem custo/lucro); o dono entra na Área do dono com PIN (passe de 30 min).
// - Vendedor: assina a venda com o PIN dele; o passe (12 h) pode ficar lembrado neste aparelho.
const EquipeContext = createContext(null)

const expDoPasse = (token) => {
  try {
    const corpo = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(corpo + '==='.slice((corpo.length + 3) % 4))).exp || 0
  } catch { return 0 }
}
const CHAVE_VEND = 'pfp:vendedor'

export function EquipeProvider({ children }) {
  const [status, setStatus] = useState(null) // { tem_equipe, dono_pin_criado, dono, balcao, equipe }
  const [erro, setErro] = useState('')

  const atualizar = useCallback(async () => {
    try {
      setStatus(await callFunction('sim-equipe'))
      setErro('')
    } catch (e) {
      setErro(e.message)
      setStatus({ tem_equipe: false, dono_pin_criado: false, dono: false, balcao: false, equipe: [] })
    }
  }, [])

  useEffect(() => { atualizar() }, [atualizar])

  // passe do dono vence sozinho em 30 min: volta para o balcão
  useEffect(() => {
    if (!status?.dono) return
    const t = setInterval(() => { if (!passeDono()) atualizar() }, 30_000)
    return () => clearInterval(t)
  }, [status?.dono, atualizar])

  const guardarDono = (token) => {
    try { sessionStorage.setItem('pfp:dono', JSON.stringify({ token, exp: expDoPasse(token) })) } catch { /* sem storage: só nesta tela */ }
  }

  const entrarDono = async (pin) => {
    const acao = status?.dono_pin_criado ? 'dono_entrar' : 'dono_criar_pin'
    const r = await callFunction('sim-equipe', { method: 'POST', body: { acao, pin } })
    guardarDono(r.token)
    await atualizar()
  }

  const sairDono = async () => {
    try { sessionStorage.removeItem('pfp:dono') } catch { /* ok */ }
    await atualizar()
  }

  // ── vendedor ──
  const vendedorLembrado = () => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_VEND) || 'null')
      return v && v.exp > Date.now() ? v : null
    } catch { return null }
  }
  const assinarVendedor = async (vendedor, pin, lembrar) => {
    const acao = vendedor.tem_pin ? 'vendedor_entrar' : 'vendedor_criar_pin'
    const r = await callFunction('sim-equipe', { method: 'POST', body: { acao, id: vendedor.id, pin } })
    const assinatura = { id: r.vendedor.id, nome: r.vendedor.nome, token: r.token, exp: expDoPasse(r.token) }
    try {
      if (lembrar) localStorage.setItem(CHAVE_VEND, JSON.stringify(assinatura))
      else localStorage.removeItem(CHAVE_VEND)
    } catch { /* ok */ }
    if (!vendedor.tem_pin) atualizar()
    return assinatura
  }
  const esquecerVendedor = () => { try { localStorage.removeItem(CHAVE_VEND) } catch { /* ok */ } }

  return (
    <EquipeContext.Provider value={{
      status, erro, atualizar,
      temEquipe: !!status?.tem_equipe, balcao: !!status?.balcao, dono: !!status?.dono,
      entrarDono, sairDono, vendedorLembrado, assinarVendedor, esquecerVendedor,
    }}>
      {children}
    </EquipeContext.Provider>
  )
}

export const useEquipe = () => useContext(EquipeContext)
