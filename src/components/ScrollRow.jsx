import { useEffect, useRef, useState } from 'react'

// Linha com rolagem lateral + setas (no Mac o trackpad rola, nos outros a seta deixa claro que há mais)
export default function ScrollRow({ children, style, colors, step = 0.8, ...rest }) {
  const ref = useRef()
  const [pode, setPode] = useState({ esq: false, dir: false })

  const medir = () => {
    const el = ref.current
    if (!el) return
    setPode({ esq: el.scrollLeft > 4, dir: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', medir); ro.disconnect() }
  }, [])

  const rolar = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * step, behavior: 'smooth' })
  const seta = (lado) => ({
    position: 'absolute', top: '50%', [lado]: -6, transform: 'translateY(-50%)', zIndex: 2,
    width: 34, height: 34, borderRadius: '50%', border: `1px solid ${colors.border}`, background: colors.surface,
    color: colors.text, fontSize: 18, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  })
  const fade = (lado) => ({
    position: 'absolute', top: 0, bottom: 0, [lado]: 0, width: 48, pointerEvents: 'none', zIndex: 1,
    background: `linear-gradient(to ${lado === 'left' ? 'right' : 'left'}, ${colors.bg}, transparent)`,
  })

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ ...style, overflowX: 'auto', scrollbarWidth: 'none' }} {...rest}>{children}</div>
      {pode.esq && <><div style={fade('left')} /><button aria-label="Ver anteriores" style={seta('left')} onClick={() => rolar(-1)}>‹</button></>}
      {pode.dir && <><div style={fade('right')} /><button aria-label="Ver mais" style={seta('right')} onClick={() => rolar(1)}>›</button></>}
    </div>
  )
}
