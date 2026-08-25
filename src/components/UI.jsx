import { useTheme } from '../styles/theme'

export function Spinner({ label = 'Carregando...' }) {
  const { colors } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 48, color: colors.textMuted, fontSize: 13 }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${colors.border}`, borderTopColor: colors.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {label}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }) {
  const { colors } = useTheme()
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: colors.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: wide ? 760 : 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.text }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, description, action, onAction }) {
  const { colors } = useTheme()
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px', color: colors.textMuted }}>
      {icon && <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>}
      <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 6 }}>{title}</div>
      {description && <div style={{ fontSize: 13, marginBottom: 20 }}>{description}</div>}
      {action && <button onClick={onAction} style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{action}</button>}
    </div>
  )
}

export function Badge({ label, color }) {
  const { colors } = useTheme()
  const c = color ?? colors.accent
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c + '22', color: c, letterSpacing: 0.3 }}>
      {label}
    </span>
  )
}

export function Tag({ label, onClick, active, color }) {
  const { colors } = useTheme()
  const c = color ?? colors.accent
  return (
    <button
      onClick={onClick}
      style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: onClick ? 'pointer' : 'default', border: active ? `1.5px solid ${c}` : `1.5px solid ${colors.border}`, background: active ? c + '18' : 'transparent', color: active ? c : colors.textMuted, transition: 'all 0.15s' }}
    >
      {label}
    </button>
  )
}
