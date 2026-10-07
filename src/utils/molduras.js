// Molduras do lojista são cadastradas como "TIPO - CATEGORIA" (ex.: "CANVAS - A", "CONVENCIONAL - B").
// No padrão: aparecem só no acabamento do tipo, como "Categoria A". Fora do padrão: nos dois, pelo nome.
export function infoMoldura(f) {
  const nome = typeof f === 'string' ? f : (f?.name ?? '')
  const m = nome.match(/^\s*(canvas|convencional|papel)\s*[-–]\s*(.+?)\s*$/i)
  if (!m) return { tipo: null, rotulo: nome }
  return { tipo: m[1].toLowerCase() === 'canvas' ? 'canvas' : 'convencional', rotulo: `Categoria ${m[2]}` }
}
