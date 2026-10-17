import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../styles/theme'
import { Modal } from './UI'

// PIN de 4 números. criando = pede duas vezes (criar e confirmar). onConfirmar(pin) pode lançar erro (mensagem aparece).
export default function PinModal({ open, titulo, descricao, criando = false, extra, onConfirmar, onClose }) {
  const { colors, fonts } = useTheme()
  const [pin, setPin] = useState('')
  const [primeiro, setPrimeiro] = useState(null) // ao criar: o 1º PIN digitado, aguardando a confirmação
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    setPin(''); setPrimeiro(null); setErro(''); setEnviando(false)
    setTimeout(() => ref.current?.focus(), 50)
  }, [open])

  const enviar = async (valor) => {
    if (valor.length !== 4) return
    if (criando && primeiro == null) { setPrimeiro(valor); setPin(''); setErro(''); ref.current?.focus(); return }
    if (criando && primeiro !== valor) { setErro('Os PINs não conferem. Digite de novo.'); setPrimeiro(null); setPin(''); ref.current?.focus(); return }
    setEnviando(true); setErro('')
    try {
      await onConfirmar(valor)
    } catch (e) {
      setErro(e.message); setPin(''); setPrimeiro(null)
      setTimeout(() => ref.current?.focus(), 50)
    }
    setEnviando(false)
  }

  const passo = criando ? (primeiro == null ? 'Crie um PIN de 4 números' : 'Digite o PIN de novo para confirmar') : 'Digite o PIN'

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <div style={{ fontFamily: fonts.body }}>
        {descricao && <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 14px', lineHeight: 1.5 }}>{descricao}</p>}
        <label htmlFor="pin-campo" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>{passo}</label>
        <input id="pin-campo" ref={ref} value={pin} disabled={enviando}
          onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setPin(v); if (v.length === 4) enviar(v) }}
          inputMode="numeric" autoComplete="one-time-code" maxLength={4} type="password" aria-describedby={erro ? 'pin-erro' : undefined}
          style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', letterSpacing: '0.6em', fontSize: 30, padding: '12px', border: `1px solid ${erro ? colors.danger : colors.border}`, borderRadius: 2, background: colors.surface, color: colors.text, fontFamily: fonts.body, outline: 'none' }} />
        {erro && <div id="pin-erro" role="alert" style={{ color: colors.danger, fontSize: 13, marginTop: 10 }}>{erro}</div>}
        {enviando && <div style={{ color: colors.textMuted, fontSize: 13, marginTop: 10 }}>Conferindo…</div>}
        {extra}
      </div>
    </Modal>
  )
}
