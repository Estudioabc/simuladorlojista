import { createContext, useContext } from 'react'

const ThemeContext = createContext()

const COLORS = {
  bg:         '#f5f5f0',
  surface:    '#ffffff',
  surfaceAlt: '#f0ede8',
  border:     '#e0ddd8',
  text:       '#1a1814',
  textMuted:  '#6b6860',
  accent:     '#b08a4e',
  accentHover:'#9a7640',
  danger:     '#cc3333',
  success:    '#16a34a',
  warning:    '#d97706',
  overlay:    'rgba(0,0,0,0.4)',
}

export function ThemeProvider({ children }) {
  return (
    <ThemeContext.Provider value={{ colors: COLORS }}>
      {children}
    </ThemeContext.Provider>
  )
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
