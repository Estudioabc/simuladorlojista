import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const functionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || `${supabaseUrl}/functions/v1`

export async function callFunction(name, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch(`${functionsUrl}/${name}${options.query ?? ''}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  // sessão perdida (expirou ou saiu em outra aba): volta para o login em vez de mostrar "Não autorizado"
  if (res.status === 401) {
    await supabase.auth.signOut()
    throw new Error('Sua sessão expirou. Entre de novo.')
  }
  const json = await res.json()
  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : (json.error?.message ?? json.msg ?? 'Erro desconhecido')
    throw new Error(msg)
  }
  return json
}
