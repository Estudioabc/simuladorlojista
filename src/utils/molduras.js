// Molduras do lojista são cadastradas como "TIPO - CATEGORIA" (ex.: "CANVAS - A", "CONVENCIONAL - B").
// No padrão: aparecem só no acabamento do tipo, como "Categoria A". Fora do padrão: nos dois, pelo nome.
export function infoMoldura(f) {
  const nome = typeof f === 'string' ? f : (f?.name ?? '')
  const m = nome.match(/^\s*(canvas|convencional|papel)\s*[-–]\s*(.+?)\s*$/i)
  if (!m) return { tipo: null, rotulo: nome }
  return { tipo: m[1].toLowerCase() === 'canvas' ? 'canvas' : 'convencional', rotulo: `Categoria ${m[2]}` }
}

// Cores da moldura (mesmo preço). id = estilo do mockup e nome do arquivo em public/molduras/{canvas|papel}-{id}.jpg
export const CORES_MOLDURA = [
  { id: 'escura', label: 'Madeira escura', hex: '#4b2c20' },
  { id: 'clara',  label: 'Madeira clara',  hex: '#d8bd8f' },
  { id: 'mel',    label: 'Madeira mel',    hex: '#a4602b' },
  { id: 'branca', label: 'Branca',         hex: '#f1f0ec' },
  { id: 'preta',  label: 'Preta',          hex: '#1c1c1e' },
]
