// Tipo da moldura: pelo nome ("CANVAS", "CONVENCIONAL", "PAPEL", com ou sem " - A") e, se o nome não disser,
// pelo campo is_canvas do cadastro. Canvas só vê molduras de canvas; papel só as convencionais.
// O nome salvo no pedido pode trazer a cor no fim ("CANVAS · Preta").
const TIPO_RE = /^\s*(canvas|convencional|papel)\s*(?:[-–]\s*(.+?))?\s*$/i

export function infoMoldura(f) {
  const nomeCompleto = typeof f === 'string' ? f : (f?.name ?? '')
  const [base, cor] = nomeCompleto.split(' · ')
  const m = base.match(TIPO_RE)
  const tipo = m
    ? (m[1].toLowerCase() === 'canvas' ? 'canvas' : 'convencional')
    : (f?.is_canvas === true ? 'canvas' : f?.is_canvas === false ? 'convencional' : null)
  const categoria = m?.[2] ? `Categoria ${m[2]}` : null
  const rotulo = [categoria, cor].filter(Boolean).join(' · ') || (m ? (tipo === 'canvas' ? 'Moldura canaleta' : 'Moldura caixa') : base)
  return { tipo, rotulo }
}

// Cores da moldura (mesmo preço). id = estilo do mockup e nome do arquivo em public/molduras/{canvas|papel}-{id}.jpg
export const CORES_MOLDURA = [
  { id: 'escura', label: 'Madeira escura', hex: '#4b2c20' },
  { id: 'clara',  label: 'Madeira clara',  hex: '#d8bd8f' },
  { id: 'mel',    label: 'Madeira mel',    hex: '#a4602b' },
  { id: 'branca', label: 'Branca',         hex: '#f1f0ec' },
  { id: 'preta',  label: 'Preta',          hex: '#1c1c1e' },
]
