import { useState, useEffect, createContext, useContext } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(true)
  const colors = dark ? DARK : LIGHT
  return (
    <ThemeContext.Provider value={{ dark, setDark, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

const DARK = {
  bg:         '#0f1117',
  surface:    '#1a1d27',
  surfaceAlt: '#12141c',
  border:     '#2a2d3a',
  text:       '#f0f0f4',
  textMuted:  '#8b8fa8',
  accent:     '#c8a96e',
  accentHover:'#d4b880',
  danger:     '#e05c5c',
  success:    '#4ade80',
  warning:    '#f59e0b',
  overlay:    'rgba(0,0,0,0.6)',
}

const LIGHT = {
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

export function formatCurrency(v) {
  if (v == null || v === '') return ''
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v
  if (isNaN(n)) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
