import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

const COLORS = {
  bg:         '#FAF9F6',
  surface:    '#FFFFFF',
  surfaceAlt: '#F2EFE9',
  border:     '#E6E2DA',
  text:       '#17150F',
  textMuted:  '#76716A',
  accent:     '#8F6D37',
  accentHover:'#76592B',
  danger:     '#B4312A',
  success:    '#2F7A4B',
  warning:    '#B26B12',
  overlay:    'rgba(23,21,15,0.45)',
}

export const FONTS = {
  display: "Archivo, 'Helvetica Neue', Arial, sans-serif",
  body: "Figtree, system-ui, -apple-system, sans-serif",
}

export function ThemeProvider({ children }) {
  return (
    <ThemeContext.Provider value={{ colors: COLORS, fonts: FONTS }}>
      {children}
    </ThemeContext.Provider>
  )
}

const MOBILE_QUERY = '(max-width: 760px)'

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function formatCurrency(v) {
  if (v == null || v === '') return ''
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v
  if (isNaN(n)) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
