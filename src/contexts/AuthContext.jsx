import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)
  const [lojista, setLojista] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLojista(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId) => {
    const { data: p } = await supabase
      .from('profiles')
      .select('id, role, name, email, tenant_id')
      .eq('id', userId)
      .single()

    if (!p || p.role !== 'lojista') {
      setError('Acesso restrito a lojistas cadastrados.')
      await supabase.auth.signOut()
      return
    }
    setProfile(p)

    const { data: l } = await supabase
      .from('lojistas')
      .select('id, store_name, discount_pct, markup_pct, allowed_mount_types, allowed_frames, allowed_substrates')
      .eq('user_id', userId)
      .eq('tenant_id', p.tenant_id)
      .maybeSingle()
    setLojista(l)
  }

  const signIn = async (email, password) => {
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('E-mail ou senha incorretos.')
    return !error
  }

  const reloadLojista = async () => {
    if (!profile) return
    const { data: l } = await supabase
      .from('lojistas')
      .select('id, store_name, discount_pct, markup_pct, allowed_mount_types, allowed_frames, allowed_substrates')
      .eq('user_id', session.user.id)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle()
    setLojista(l)
  }

  const signOut = () => supabase.auth.signOut()

  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, lojista, loading, error, setError, signIn, signOut, reloadLojista }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
