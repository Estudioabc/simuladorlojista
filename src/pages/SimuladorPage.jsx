import { useState, useEffect, useMemo, useRef } from 'react'
import { useTheme, useIsMobile, formatCurrency } from '../styles/theme'
import { useAuth } from '../contexts/AuthContext'
import { callFunction } from '../services/supabase'
import { Spinner } from '../components/UI'
import MockupCanvas, { PEDIDO_ROOMS, orientacaoDe, salaDaObra, cabeNaSala, GAP_CM, MOLDURA_CM, MOLDURA_CM_ACABAMENTO } from '../components/MockupCanvas'
import FotoParede, { lerFoto } from '../components/FotoParede'
import BancoImagensPage from './BancoImagensPage'
import { infoMoldura, CORES_MOLDURA } from '../utils/molduras'

// Espelhado em sim-pedido (PrintFramePro), que recalcula no servidor — manter os dois iguais
function calcPreco({ montagem, moldura, w, h, qty, materials, substrates, tipoVidro, markupPct }) {
  if (!w || !h || w <= 0 || h <= 0) return null
  const areaM2 = (w * h) / 10000
  const markup = 1 + (parseFloat(markupPct) || 0) / 100
  const molduraW = parseFloat(moldura?.width_cm) || 0
  const perimM = 2 * (w + h) / 100
  const perimComMolduraM = 2 * (w + h + molduraW * 4) / 100
  const lines = []

  if (montagem?.itens?.length) {
    for (const item of montagem.itens) {
      const role = item.role

      if (role === 'substrato') {
        const sub = substrates?.find(s => s.id === item.substrato_id)
        if (!sub) continue
        const base = areaM2 * (parseFloat(sub.sell_price) || 0)
        if (base > 0) lines.push({ label: `Impressão ${sub.name}`, valor: base * markup })

      } else if (role === 'vidro_selecionavel') {
        if (!tipoVidro || tipoVidro === 'sem_vidro') continue
        // vidro_cristal_id → vidro_comum, vidro_museu_id → antirreflexo
        const matId = tipoVidro === 'vidro_comum' ? item.vidro_cristal_id : tipoVidro === 'antirreflexo' ? item.vidro_fosco_id : null
        if (!matId) continue
        const mat = materials?.find(m => m.id === matId)
        if (!mat) continue
        const base = areaM2 * (parseFloat(mat.sell_price) || 0)
        if (base > 0) lines.push({ label: mat.name, valor: base * markup })

      } else if (role === 'custo_fixo') {
        // valor próprio da montagem: por unidade, metro linear (perímetro externo) ou m² (área da arte)
        const q = item.unidade === 'metro_linear' ? perimComMolduraM : item.unidade === 'm2' ? areaM2 : 1
        const base = q * (parseFloat(item.valor) || 0)
        if (base > 0) lines.push({ label: item.descricao || 'Custo fixo', valor: base * markup })

      } else if (role === 'verniz_opcional' || role === 'acabamento_fixo') {
        // ignorado no simulador lojista (sem config de valor fixo)
        continue

      } else {
        const matId = item.material_id
        if (!matId) continue
        const mat = materials?.find(m => m.id === matId)
        if (!mat) continue

        let qty_item = 1
        if (role === 'area') qty_item = areaM2
        else if (role === 'area_outer') qty_item = areaM2 * 1.1
        else if (role === 'moldura_perimetro') qty_item = perimComMolduraM
        else if (role === 'chassi_canvas' || role === 'moldura_canvas' || role === 'reforco_perimetro') qty_item = perimM

        const base = qty_item * (parseFloat(mat.sell_price) || 0)
        if (base > 0) lines.push({ label: mat.name, valor: base * markup })
      }
    }
  }

  if (moldura) {
    const base = perimComMolduraM * (parseFloat(moldura.sell_price) || 0)
    if (base > 0) lines.push({ label: `Moldura ${infoMoldura(moldura).rotulo}`, valor: base * markup })
  }

  const totalPeca = lines.reduce((s, l) => s + l.valor, 0)
  const q = parseInt(qty) || 1
  return { lines, totalPeca, totalGeral: totalPeca * q, qty: q }
}

// Tabela dos tamanhos padrão (out/2026): preço B2B fechado por quadro (custo com perda + 7% de NF × 3; 60×90 × 2,5).
// O preço da fórmula é ajustado para o da tabela, diluído nas linhas (o custo de cada linha não muda).
// Chave = lados em ordem crescente; acabamento = canvas, ou o vidro no papel. Espelhado em sim-pedido — manter iguais.
export const PRECO_TAMANHO_PADRAO = {
  '60x90': { canvas: 406, vidro_comum: 406, sem_vidro: 309 },
  '80x120': { canvas: 741, vidro_comum: 797, sem_vidro: 558 },
  '100x150': { canvas: 892, vidro_comum: 1211, sem_vidro: 972 },
  '130x200': { canvas: 1451 },
}
// Fora da tabela (personalizado, composição, obra fatiada): +15% no preço de venda, para o personalizado nunca
// sair mais barato que o tamanho padrão. Só o preço; o custo de cada linha não muda. Espelho do sim-pedido.
const ACRESCIMO_PERSONALIZADO = 0.15

// Várias peças iguais num tamanho da tabela (ex.: obra em 3 peças de 60 × 90) = preço da tabela × peças (Pedro, 27/10)
export function precoTabela(pecas, tipoMontagem, tipoVidro) {
  if (!pecas?.length || pecas.some(p => p.largura_cm !== pecas[0].largura_cm || p.altura_cm !== pecas[0].altura_cm)) return null
  const [a, b] = [pecas[0].largura_cm, pecas[0].altura_cm].map(Number).sort((x, y) => x - y)
  const acab = tipoMontagem === 'canvas' ? 'canvas' : tipoMontagem === 'convencional' ? tipoVidro : null
  const preco = PRECO_TAMANHO_PADRAO[`${a}x${b}`]?.[acab]
  return preco ? preco * pecas.length : null
}

// Soma o preço de cada peça (kit ou obra fatiada). Linhas iguais são agrupadas.
function calcPrecoPecas({ pecas, qty, tipoMontagem, descontoPct, ...cfg }) {
  if (!pecas.length) return null
  const porPeca = pecas.map(p => calcPreco({ ...cfg, w: p.largura_cm, h: p.altura_cm, qty: 1 }))
  if (porPeca.some(r => !r)) return null
  // tamanho padrão: preço da tabela (com o desconto da loja e a margem dela), diluído nas linhas
  const tab = precoTabela(pecas, tipoMontagem, cfg.tipoVidro)
  const markup = 1 + (parseFloat(cfg.markupPct) || 0) / 100
  const somaFormula = porPeca.reduce((s, r) => s + r.totalPeca, 0)
  const fator = tab && somaFormula > 0 ? (tab * (1 - (parseFloat(descontoPct) || 0) / 100) * markup) / somaFormula : 1 + ACRESCIMO_PERSONALIZADO
  const porLabel = new Map()
  porPeca.forEach(r => r.lines.forEach(l => porLabel.set(l.label, (porLabel.get(l.label) || 0) + l.valor * fator)))
  const lines = [...porLabel].map(([label, valor]) => ({ label, valor }))
  const totalPeca = porPeca.reduce((s, r) => s + r.totalPeca, 0) * fator
  const q = parseInt(qty) || 1
  return { lines, totalPeca, totalGeral: totalPeca * q, qty: q }
}

// Mesma regra do Anexo (PrintFramePro): categoria libera, `fatiavel` do cadastro decide se preenchido
const CATEGORIAS_FATIAVEIS = ['Abstrato', 'Dourado', 'Paisagens e natureza', 'Pinturas', 'Cidades', 'Cidade']
function maxFatias(img, ratio) {
  if (!img || img.kitCount > 1 || !ratio) return 1
  const permitido = img.fatiavel ?? CATEGORIAS_FATIAVEIS.includes(img.categoria)
  if (!permitido) return 1
  return ratio >= 2 ? 3 : ratio >= 1.5 ? 2 : 1
}


const um = (v) => Math.round(v * 10) / 10
const cm = (v) => String(um(v)).replace('.', ',')

// Tamanhos padrão das obras 2:3 / 3:2 (estudo de aproveitamento de barra, chassi e rolo — out/2026).
// 130×200: a arte é ajustada com um corte imperceptível para o tamanho ficar redondo. Com vidro, o máximo é 100×150 (chapa 110×160).
const TAMANHOS_23 = [[60, 90], [80, 120], [100, 150], [130, 200]]
const VIDRO_MAX = [110, 160]
// Limites de produção por peça (espelhado em sim-pedido): o menor lado cabe na largura do rolo
// (canvas: rolo 160 cm com 5 cm de dobra por lado → arte até 150; papel: rolo 150 → até 150, já com o refile)
// e o maior lado cabe na barra de moldura/chassi (270 cm).
const LIMITE_ROLO = { canvas: 150, convencional: 150 }
const LIMITE_BARRA = 270
export function foraDoLimite(pecas, tipoMontagem) {
  const rolo = LIMITE_ROLO[tipoMontagem]
  for (const p of pecas || []) {
    const [a, b] = [Number(p.largura_cm), Number(p.altura_cm)].sort((x, y) => x - y)
    if (!(a > 0)) continue
    if (rolo && a > rolo) return `Em ${tipoMontagem === 'canvas' ? 'canvas' : 'papel'}, o lado menor vai até ${rolo} cm (largura do rolo).`
    if (b > LIMITE_BARRA) return `O lado maior vai até ${LIMITE_BARRA} cm (tamanho da barra de moldura).`
  }
  return null
}
// Fração da obra que sai (corte central) para caber no quadro w/h. Os tamanhos padrão valem para obras 2:3
// e para as próximas de 2:3 que precisam de até 12% de corte; o resto fica só no personalizado.
const fracaoCorte = (r, alvo) => (r > 0 && alvo > 0 ? 1 - Math.min(r, alvo) / Math.max(r, alvo) : 1)
const CORTE_MAX_PADRAO = 0.12
const ehDoisTres = (r) => fracaoCorte(r, r >= 1 ? 1.5 : 2 / 3) <= CORTE_MAX_PADRAO
// Tamanhos padrão para toda obra que não é quadrada (Pedro, 27/10): fora de 2:3 o quadro sai com corte central,
// que o mockup mostra. Obra quadrada só em tamanho personalizado quadrado, sem corte.
const ehQuadrada = (r) => fracaoCorte(r, 1) <= 0.05
const temTamanhoPadrao = (r) => r > 0 && !ehQuadrada(r)

export default function SimuladorPage({ imagemInicial, onImagemClear, onAdicionar, itemEditando, onCancelarEdicao, onVerCarrinho, nCarrinho = 0 }) {
  const { colors, fonts } = useTheme()
  const isMobile = useIsMobile()
  const { lojista } = useAuth()

  const [catalogoData, setCatalogoData] = useState(null)
  const [loadingData, setLoadingData] = useState(true)
  const [erroData, setErroData] = useState('')

  const [imagem, setImagem] = useState(imagemInicial ?? null)
  const [ratio, setRatio] = useState(null)
  const [travarRatio, setTravarRatio] = useState(true)
  const [tamPersonalizado, setTamPersonalizado] = useState(false)
  const [largura, setLargura] = useState('')
  const [altura, setAltura] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [fatias, setFatias] = useState(1)
  const [tamPorPeca, setTamPorPeca] = useState(false) // obra dividida: medidas digitadas por peça (senão, do conjunto)
  const [tipoMontagem, setTipoMontagem] = useState('') // 'canvas' | 'convencional'
  const [montagemId, setMontagemId] = useState('')
  const [tipoVidro, setTipoVidro] = useState('')
  const [substratoId, setSubstratoId] = useState('')
  const [molduraId, setMolduraId] = useState('')

  const [showBanco, setShowBanco] = useState(false)
  const [mockupAberto, setMockupAberto] = useState(false)
  const [mockupRoom, setMockupRoom] = useState(PEDIDO_ROOMS.vertical[0])
  const [molduraCor, setMolduraCor] = useState('') // id em CORES_MOLDURA; vai no pedido e pinta o mockup
  const [fotoSala, setFotoSala] = useState(null)   // ambiente feito com a foto do cliente (fica só no aparelho)
  const [fotoMedir, setFotoMedir] = useState(null) // foto lida, esperando a medida de referência
  const fotoInput = useRef()
  const [adicionado, setAdicionado] = useState(false) // aviso "quadro no carrinho"
  const [erro, setErro] = useState('')
  const [falta, setFalta] = useState({}) // grupos obrigatórios que faltaram na última tentativa
  const [verCusto, setVerCusto] = useState(false)

  useEffect(() => {
    callFunction('sim-lojista-data')
      .then(d => setCatalogoData(d))
      .catch(e => setErroData(e.message))
      .finally(() => setLoadingData(false))
  }, [])

  const isKit = imagem?.kitCount > 1 && imagem?.kitParts?.length > 1
  // Composição no tamanho padrão: todas as peças na mesma orientação e nenhuma quadrada; cada peça vira o tamanho
  // padrão (cortada no centro se precisar), preço da tabela × peças. Abre no padrão se todas forem quase 2:3.
  const ratiosKit = isKit ? imagem.kitParts.map(p => parseFloat(p.ratio) || 1) : []
  const kitHoriz = isKit && ratiosKit.every(r => r >= 1)
  const kitTemPadrao = isKit && (kitHoriz || ratiosKit.every(r => r < 1)) && ratiosKit.every(temTamanhoPadrao)
  // Ambientes do pedido = os do card do acervo (mesma sala e calibração); a lista acompanha a orientação da obra
  const orientacao = imagem ? orientacaoDe(isKit ? imagem.kitParts.map(p => parseFloat(p.ratio) || 1) : [parseFloat(ratio) || parseFloat(imagem.ratio) || 1]) : 'vertical'
  // só as salas em que o quadro cabe no tamanho real (130 × 200 não passa do teto); se nenhuma couber, mostra todas
  const larguraNaParede = parseFloat(largura) + (isKit ? 0 : (Math.min(fatias, maxFatias(imagem, ratio)) - 1) * (GAP_CM + 2 * (MOLDURA_CM_ACABAMENTO[tipoMontagem] ?? MOLDURA_CM)))
  const salasQueCabem = PEDIDO_ROOMS[orientacao].filter(r => cabeNaSala(r, parseFloat(altura), larguraNaParede))
  // a foto do cliente entra sempre na lista (o lojista posiciona o quadro nela)
  const salas = [...(salasQueCabem.length ? salasQueCabem : PEDIDO_ROOMS[orientacao]), ...(fotoSala ? [fotoSala] : [])]
  useEffect(() => {
    if (imagem && !mockupRoom.foto) setMockupRoom(salaDaObra(imagem.cardChave || imagem.id || imagem.img_url, orientacao))
  }, [imagem?.img_url, imagem?.cardChave, orientacao])
  const escolherFoto = async (e) => {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    try { setFotoMedir(await lerFoto(arq)) } catch { setErro('Não consegui abrir essa foto. Tente uma imagem JPG ou PNG.') }
  }
  // tamanho mudou e o quadro não cabe mais na sala escolhida: troca para a primeira em que cabe
  useEffect(() => {
    if (imagem && !salas.some(r => r.id === mockupRoom.id)) setMockupRoom(salas[0])
  }, [salas.map(r => r.id).join(), mockupRoom.id])

  useEffect(() => {
    if (!ratio || largura || altura) return
    // tamanho inicial de quadro de sala (o pedido abre com a obra bem visível na parede): horizontal 120 cm de largura,
    // vertical 90 cm de altura, composição 60 cm de altura por peça
    if (!isKit && ehDoisTres(ratio)) { const [a, b] = TAMANHOS_23[0]; setLargura(String(ratio >= 1 ? b : a)); setAltura(String(ratio >= 1 ? a : b)); return }
    // fora de 2:3 abre no personalizado, na proporção original (sem corte); o tamanho padrão fica a um clique
    if (isKit && kitTemPadrao && ratiosKit.every(ehDoisTres)) {
      const [a, b] = TAMANHOS_23[0]; const [w, h] = kitHoriz ? [b, a] : [a, b]
      setAltura(String(h)); setLargura(String(w * ratiosKit.length)); return
    }
    setTamPersonalizado(true)
    if (isKit) { setAltura('60'); setLargura(String(um(60 * ratio))) }
    else if (ratio >= 1) { setLargura('120'); setAltura(String(Math.round(120 / ratio))) }
    else { setAltura('90'); setLargura(String(Math.round(90 * ratio))) }
  }, [ratio, imagem])

  // Editar um quadro do carrinho: volta para a montagem com tudo preenchido
  useEffect(() => {
    if (!itemEditando) return
    const c = itemEditando.config
    setImagem(c.imagem ?? null); setRatio(c.ratio ?? null); setTravarRatio(c.travarRatio ?? true)
    setLargura(c.largura ?? ''); setAltura(c.altura ?? ''); setQuantidade(c.quantidade ?? '1'); setFatias(c.fatias ?? 1)
    setTipoMontagem(c.tipoMontagem ?? ''); setMontagemId(c.montagemId ?? ''); setTipoVidro(c.tipoVidro ?? '')
    setMolduraId(c.molduraId ?? ''); setMolduraCor(c.molduraCor ?? ''); setTamPersonalizado(!c.tamanhoPadrao)
    setErro(''); setAdicionado(false)
  }, [itemEditando?.id])

  useEffect(() => {
    if (imagemInicial) {
      setImagem(imagemInicial)
      // obra nova vinda do acervo: recomeça tamanho e peças (senão herdava os da obra anterior)
      setLargura(''); setAltura(''); setFatias(1); setTamPersonalizado(false)
      detectRatio(imagemInicial)
    }
  }, [imagemInicial])

  const detectRatio = (img) => {
    if (!img?.img_url) return
    // Kit: peças com a mesma altura, cada uma na proporção original → a largura total é altura × Σ proporções
    if (img.kitCount > 1 && img.kitParts?.length > 1) {
      setRatio(img.kitParts.reduce((s, p) => s + (parseFloat(p.ratio) || 1), 0))
      return
    }
    // Usa ratio salvo no banco se disponível
    if (img.ratio && parseFloat(img.ratio) > 0) {
      setRatio(parseFloat(img.ratio))
      return
    }
    // Senão detecta carregando a imagem
    const el = new Image()
    el.onload = () => {
      if (el.naturalWidth && el.naturalHeight) {
        setRatio(el.naturalWidth / el.naturalHeight)
      }
    }
    el.src = img.img_url
  }

  const montagems = catalogoData?.simMontagems ?? []
  const substrates = catalogoData?.substrates ?? []
  const frames = catalogoData?.frames ?? []
  const materials = catalogoData?.materials ?? []
  const discount = catalogoData?.discount_pct ?? 0

  const montagem = montagems.find(m => m.id === montagemId) ?? null
  const substrato = substrates.find(s => s.id === substratoId) ?? null
  const moldura = frames.find(f => f.id === molduraId) ?? null

  // modo balcão: o servidor já manda o preço ao cliente (com a margem) — não aplicar de novo
  const balcao = !!catalogoData?.balcao
  const markupPct = balcao ? 0 : (lojista?.markup_pct ?? 0)

  const fatiasMax = maxFatias(imagem, ratio)
  const nFatias = Math.min(fatias, fatiasMax)

  // tamanhos padrão (quadro único de obra não quadrada, ou cada peça da composição); cada um na orientação da obra.
  // Composição: até 100 × 150 por peça. largura = soma das peças, altura = de cada peça.
  const temPadrao = isKit ? kitTemPadrao : nFatias === 1 && temTamanhoPadrao(parseFloat(ratio))
  const opcoesPadrao = !temPadrao ? [] : (isKit ? TAMANHOS_23.filter(([, b]) => b <= 150) : TAMANHOS_23)
    .map(([a, b]) => ((isKit ? kitHoriz : parseFloat(ratio) >= 1) ? [b, a] : [a, b]))
  const nKit = ratiosKit.length || 1
  const padraoAtual = opcoesPadrao.find(([w, h]) => parseFloat(largura) === w * nKit && parseFloat(altura) === h) || null
  const modoPadrao = temPadrao && !tamPersonalizado
  // no tamanho padrão o quadro tem a proporção do tamanho escolhido; a obra é cortada no centro se precisar
  const ratioQuadro = modoPadrao && padraoAtual ? padraoAtual[0] / padraoAtual[1] : null
  const corteAtual = !ratioQuadro ? 0 : isKit ? Math.max(...ratiosKit.map(r => fracaoCorte(r, ratioQuadro))) : fracaoCorte(parseFloat(ratio), ratioQuadro)
  const eixoCorte = ratioQuadro && !isKit && ratioQuadro > parseFloat(ratio) ? 'altura' : 'largura'

  // Cada peça que vai para produção. Kit: mesma altura, largura pela proporção original (sem corte), ou o tamanho
  // padrão em todas (com a proporção original da peça cortada, para a OS). Fatiada: a obra inteira em faixas iguais.
  const pecas = useMemo(() => {
    const w = parseFloat(largura), h = parseFloat(altura)
    if (!(w > 0 && h > 0)) return []
    if (isKit) {
      return imagem.kitParts.map(p => {
        const r = parseFloat(p.ratio) || 1
        const corte = ratioQuadro && fracaoCorte(r, ratioQuadro) > 0.01
        return {
          largura_cm: ratioQuadro ? padraoAtual[0] : um(h * r), altura_cm: h,
          imagem_id: p.id, imagem_titulo: p.titulo, imagem_url: p.img_url,
          ...(corte ? { proporcao_original: +r.toFixed(4) } : {}),
        }
      })
    }
    if (nFatias > 1) return Array.from({ length: nFatias }, () => ({ largura_cm: um(w / nFatias), altura_cm: h }))
    return [{ largura_cm: w, altura_cm: h }]
  }, [largura, altura, isKit, imagem, nFatias, ratioQuadro])
  const multiPeca = pecas.length > 1
  const fatiado = !isKit && nFatias > 1
  const molduraCm = MOLDURA_CM_ACABAMENTO[tipoMontagem] ?? MOLDURA_CM   // espessura real da moldura no mockup
  const porPeca = fatiado && tamPorPeca
  const cabeVidro = (w, h) => Math.min(w, h) <= VIDRO_MAX[0] && Math.max(w, h) <= VIDRO_MAX[1]

  const preco = useMemo(() =>
    calcPrecoPecas({ pecas, qty: quantidade, tipoMontagem, descontoPct: discount, montagem, moldura, materials, substrates, tipoVidro, markupPct }),
    [pecas, montagem, moldura, quantidade, materials, substrates, tipoVidro, markupPct, tipoMontagem, discount]
  )

  // "40 × 60 + 30 × 60 + 40 × 60 cm" ou "3 peças de 40 × 60 cm"
  const descPecas = (() => {
    if (!pecas.length) return ''
    const iguais = pecas.every(p => p.largura_cm === pecas[0].largura_cm)
    if (iguais) return `${pecas.length > 1 ? `${pecas.length} peças de ` : ''}${cm(pecas[0].largura_cm)} × ${cm(pecas[0].altura_cm)} cm`
    return pecas.map(p => `${cm(p.largura_cm)} × ${cm(p.altura_cm)}`).join(' + ') + ' cm'
  })()

  // Canvas só vê molduras CANVAS, papel só CONVENCIONAL (ver utils/molduras.js)
  const framesDoTipo = frames
    .map(f => ({ ...f, ...infoMoldura(f) }))
    .filter(f => !f.tipo || f.tipo === tipoMontagem)
    .sort((a, b) => (!a.tipo - !b.tipo) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

  // Uma moldura por tipo: o lojista não escolhe categoria, vai direto para a cor.
  // Se houver mais de uma liberada, usa a primeira da lista (Categoria A).
  useEffect(() => {
    if (!tipoMontagem || !framesDoTipo.length) return
    if (!framesDoTipo.some(f => f.id === molduraId)) setMolduraId(framesDoTipo[0].id)
  }, [tipoMontagem, framesDoTipo.map(f => f.id).join(), molduraId])

  // Nenhuma peça passa do rolo (lado menor até 150 cm) nem da barra (lado maior até 270 cm): o número digitado
  // para no máximo possível. Proporção travada: os dois lados encolhem juntos; destravada, só o lado digitado.
  const cabeProducao = (w, h) => {
    const r = parseFloat(ratio) || 1
    const pecasWH = isKit ? imagem.kitParts.map(p => [h * (parseFloat(p.ratio) || 1), h]) : [[w / Math.max(1, nFatias), h]]
    return r > 0 && pecasWH.every(([a, b]) => Math.min(a, b) <= LIMITE_ROLO.canvas && Math.max(a, b) <= LIMITE_BARRA)
  }
  const maiorQueCabe = (f) => {  // maior fator t (0..1) com f(t) ainda cabendo
    if (f(1)) return 1
    let lo = 0, hi = 1
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m }
    return lo
  }
  const travado = () => (travarRatio || isKit) && ratio
  const noLimite = (v) => Math.floor(v * 2 + 0.01) / 2   // arredonda para baixo em 0,5 cm (a busca para um fio abaixo do limite)
  const handleLargura = (val) => {
    let w = parseFloat(val)
    if (!(w > 0)) { setLargura(val); return }
    if (travado()) {
      const t = maiorQueCabe(k => cabeProducao(w * k, (w * k) / ratio))
      if (t < 1) w = noLimite(w * t)
      setLargura(t < 1 ? String(w) : val); setAltura(String(um(w / ratio)))
    } else {
      const h = parseFloat(altura) || 0
      const t = maiorQueCabe(k => cabeProducao(w * k, h))
      setLargura(t < 1 && t > 0 ? String(noLimite(w * t)) : val)
    }
  }
  const handleAltura = (val) => {
    let h = parseFloat(val)
    if (!(h > 0)) { setAltura(val); return }
    if (travado()) {
      const t = maiorQueCabe(k => cabeProducao((h * k) * ratio, h * k))
      if (t < 1) h = noLimite(h * t)
      setAltura(t < 1 ? String(h) : val); setLargura(String(um(h * ratio)))
    } else {
      const w = parseFloat(largura) || 0
      const t = maiorQueCabe(k => cabeProducao(w, h * k))
      setAltura(t < 1 && t > 0 ? String(noLimite(h * t)) : val)
    }
  }

  // Papel: sem vidro ou com vidro (vidro comum). Antirreflexo saiu do portal.
  const GLASS_TYPES = [
    { id: 'sem_vidro', label: 'Sem vidro' },
    { id: 'vidro_comum', label: 'Com vidro' },
  ]

  const canvasMontagens = montagems.filter(m => m.is_canvas)
  const convenMontagens = montagems.filter(m => !m.is_canvas)

  // mount_types disponíveis para o tipo selecionado
  const montagensDoTipo = tipoMontagem === 'canvas' ? canvasMontagens : tipoMontagem === 'convencional' ? convenMontagens : []

  // glass types permitidos para este lojista
  const allowedGlassTypes = lojista?.allowed_glass_types ?? ['sem_vidro', 'vidro_comum', 'antirreflexo']
  const glassOptions = GLASS_TYPES.filter(g => allowedGlassTypes.includes(g.id))

  const handleTipoMontagem = (tipo) => {
    setFalta(f => ({ ...f, acabamento: false }))
    setTipoMontagem(tipo)
    setTipoVidro('')
    setMolduraId('') // a moldura do tipo é escolhida sozinha (efeito abaixo)
    // Auto-seleciona o único mount_type do tipo, se houver só 1
    const lista = tipo === 'canvas' ? canvasMontagens : convenMontagens
    setMontagemId(lista.length === 1 ? lista[0].id : '')
  }

  const resetForm = () => {
    setImagem(null); setLargura(''); setAltura(''); setQuantidade('1'); setFatias(1)
    setTipoMontagem(''); setMontagemId(''); setTipoVidro('')
    setSubstratoId(''); setMolduraId(''); setMolduraCor('')
    setRatio(null); setTravarRatio(true)
    if (onImagemClear) onImagemClear()
  }

  // Monta o quadro para o carrinho: config (para editar depois), payload (vai ao sim-pedido) e resumo (exibição)
  const handleAdicionar = () => {
    const faltas = {
      tamanho: !(parseFloat(largura) > 0 && parseFloat(altura) > 0),
      acabamento: !tipoMontagem,
      cor: !!tipoMontagem && framesDoTipo.length > 0 && (!molduraId || !molduraCor),
      vidro: tipoMontagem === 'convencional' && !tipoVidro,
    }
    setFalta(faltas)
    if (faltas.tamanho) { setErro('Informe o tamanho do quadro.'); return }
    if (faltas.acabamento) { setErro('Escolha o acabamento: Canvas ou Papel.'); return }
    if (faltas.cor) { setErro('Escolha a cor da moldura.'); return }
    if (faltas.vidro) { setErro('Escolha com ou sem vidro.'); return }
    if (foraDoLimite(pecas, tipoMontagem)) { setErro(foraDoLimite(pecas, tipoMontagem)); return }
    if (tipoMontagem === 'convencional' && modoPadrao && padraoAtual && !cabeVidro(...padraoAtual)) { setErro('Em papel, o maior tamanho é 100 × 150. Escolha outro tamanho ou canvas.'); return }
    if (!precoPronto) { setErro('Não foi possível calcular o preço deste quadro.'); return }
    setErro('')
    const vi = montagem?.itens?.find(i => i.role === 'vidro_selecionavel')
    const substratoIdMont = montagem?.itens?.find(i => i.role === 'substrato')?.substrato_id ?? null
    const cor = CORES_MOLDURA.find(c => c.id === molduraCor)
    const qtd = parseInt(quantidade) || 1
    const item = {
      id: itemEditando?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      config: { imagem, ratio, travarRatio, largura, altura, tamanhoPadrao: !!(modoPadrao && padraoAtual), quantidade: String(qtd), fatias, tipoMontagem, montagemId, tipoVidro, molduraId, molduraCor },
      payload: {
        montagem_id: montagemId || null,
        tipo_montagem: tipoMontagem,
        tipo_vidro: tipoVidro || null,
        substrato_id: substratoIdMont,
        vidro_material_id: !vi ? null : tipoVidro === 'vidro_comum' ? (vi.vidro_cristal_id || null) : tipoVidro === 'antirreflexo' ? (vi.vidro_fosco_id || null) : null,
        moldura_id: molduraId || null,
        moldura_cor: cor?.label ?? null,
        largura_cm: parseFloat(largura),
        altura_cm: parseFloat(altura),
        quantidade: qtd,
        modo: isKit ? 'kit' : multiPeca ? 'fatiado' : null,
        pecas,
        imagem_id: imagem?.id ?? null,
        imagem_titulo: imagem?.titulo ?? null,
        imagem_url: imagem?.img_url ?? null,
        // proporção da obra: o servidor calcula o corte do tamanho padrão e manda a instrução para a OS
        proporcao_original: !isKit && ratioQuadro && corteAtual > 0.01 ? +parseFloat(ratio).toFixed(4) : null,
        preco_total: +preco.totalGeral.toFixed(2),
      },
      resumo: {
        titulo: imagem?.titulo || 'Quadro sem obra do acervo',
        imagemUrl: imagem?.img_url ?? null,
        kitUrls: isKit ? imagem.kitParts.map(p => p.img_url) : null,
        tamanho: multiPeca ? descPecas : `${cm(parseFloat(largura))} × ${cm(parseFloat(altura))} cm`,
        acabamento: tipoMontagem === 'canvas' ? 'Canvas' : 'Papel',
        cor: cor?.label ?? null,
        vidro: tipoMontagem === 'convencional' ? (GLASS_TYPES.find(g => g.id === tipoVidro)?.label ?? null) : null,
        conjunto: multiPeca,
        precoUnit: preco.totalPeca,
      },
    }
    onAdicionar?.(item)
    resetForm()
    setAdicionado(!itemEditando)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const accent = colors.accent
  const base = { fontFamily: fonts.body }

  // ── Design tokens locais (estendem o tema) ──────────────────────────────
  const gold = accent
  const ink = colors.text

  const inp = {
    width: '100%', boxSizing: 'border-box',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: '11px 12px',
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.body,
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  const gradeOpcoes = { display: 'flex', flexWrap: 'wrap', gap: 8 }
  const dica = { fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 1.5 }
  // Controle segmentado (peças; medida total/por peça): botões colados, o escolhido preenchido
  const segGrupo = { display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden' }
  // Rótulo de grupo no estilo de loja (caixa alta pequena)
  // obrig: mostra o asterisco; falta: fica vermelho (depois de tentar adicionar sem escolher)
  const grupoLbl = (texto, valor, { obrig = false, falta = false } = {}) => (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: falta ? colors.danger : colors.textMuted, marginBottom: 8 }}>
      {texto}{obrig && <span style={{ color: colors.danger }} aria-hidden="true"> *</span>}
      {falta && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 12, marginLeft: 8 }}>escolha uma opção</span>}
      {valor && <span style={{ textTransform: 'none', letterSpacing: 0, color: colors.text, fontWeight: 500, fontSize: 12, marginLeft: 8 }}>{valor}</span>}
    </div>
  )

  // Opção (acabamento, moldura, vidro, peças, entrega): retângulo compacto, escolhida = borda preta.
  // A borda de 2px é compensada no padding para o botão não "pular" ao selecionar.
  const chipBtn = (on) => ({
    padding: on ? '8px 15px' : '9px 16px',
    borderRadius: 2,
    border: `${on ? 2 : 1}px solid ${on ? ink : colors.border}`,
    background: colors.surface,
    color: colors.text,
    fontWeight: on ? 600 : 500, fontSize: 13,
    fontFamily: fonts.body,
    cursor: 'pointer', transition: 'border-color 0.15s',
    whiteSpace: 'nowrap',
  })

  const segBtn = (on, mini = false) => ({
    padding: mini ? '6px 10px' : '9px 16px', border: 'none', borderRadius: 0,
    background: on ? ink : colors.surface, color: on ? '#fff' : colors.text,
    fontWeight: on ? 600 : 500, fontSize: mini ? 12 : 13, fontFamily: fonts.body, cursor: 'pointer', whiteSpace: 'nowrap',
  })

  useEffect(() => {
    if (!mockupAberto) return
    const onKey = (e) => { if (e.key === 'Escape') setMockupAberto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mockupAberto])

  if (loadingData) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Carregando..." /></div>
  if (erroData) return <div style={{ color: colors.danger, padding: 24 }}>{erroData}</div>

  if (showBanco) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={() => setShowBanco(false)}
            style={{ background: 'none', border: 'none', color: gold, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Voltar ao simulador
          </button>
        </div>
        <BancoImagensPage onSelectImagem={(img) => {
          setImagem(img)
          setLargura(''); setAltura(''); setFatias(1); setQuantidade('1')
          detectRatio(img)
          setShowBanco(false)
        }} />
      </div>
    )
  }

  const hasDims = parseFloat(largura) > 0 && parseFloat(altura) > 0
  const precoPronto = preco && preco.totalGeral > 0 && (molduraId || framesDoTipo.length === 0) && tipoMontagem
  const precoB2b = precoPronto ? preco.totalGeral / (1 + (parseFloat(markupPct) || 0) / 100) : 0

  const grupo = { marginTop: 26 }
  const linkBtn = { background: 'none', border: 'none', padding: 0, color: colors.text, fontSize: 13, fontFamily: fonts.body, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }
  const inpTam = { ...inp, width: 76, padding: '9px 8px', textAlign: 'center', fontSize: 14 }

  return (
    <div style={{ fontFamily: fonts.body }}>

      {adicionado && (
        <div role="status" style={{ background: colors.success + '12', border: `1px solid ${colors.success}40`, borderRadius: 2, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ fontWeight: 700, color: colors.success, fontSize: 15 }}>Quadro adicionado ao carrinho</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
              {nCarrinho === 1 ? 'Você tem 1 quadro no carrinho.' : `Você tem ${nCarrinho} quadros no carrinho.`} Monte o próximo ou finalize o pedido.
            </div>
          </div>
          <button onClick={() => setAdicionado(false)} style={{ background: 'none', color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 2, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, whiteSpace: 'nowrap' }}>
            Montar outro quadro
          </button>
          {onVerCarrinho && (
            <button onClick={onVerCarrinho} style={{ background: colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, whiteSpace: 'nowrap' }}>
              Ver carrinho
            </button>
          )}
        </div>
      )}

      {itemEditando && (
        <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 2, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 14 }}>
          <span style={{ flex: '1 1 200px' }}>Editando um quadro do carrinho.</span>
          <button onClick={onCancelarEdicao} style={{ background: 'none', border: 'none', padding: 0, color: colors.text, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: fonts.body }}>Cancelar edição</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 360px', gap: isMobile ? 24 : 56, alignItems: 'start' }} className="sim-layout">

        {/* ─── Esquerda: o quadro na parede ─── */}
        <div style={{ position: isMobile ? 'static' : 'sticky', top: 96, minWidth: 0 }}>
          {imagem ? (
            <div style={{ position: 'relative' }}>
              {isMobile ? (
                <button onClick={() => setMockupAberto(true)} aria-label="Ampliar o quadro no ambiente"
                  style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
                  <MockupCanvas inline
                    imgUrl={isKit ? null : imagem.img_url}
                    kitUrls={isKit ? imagem.kitParts.map(p => p.img_url) : null}
                    slices={isKit ? 1 : nFatias} cortePecas={isKit ? ratioQuadro : null} molduraCm={molduraCm}
                    ratio={ratioQuadro || ratio || parseFloat(imagem.ratio) || 1}
                    frameColor={molduraCor || 'preta'} room={mockupRoom} width={900}
                    tamanhoCm={parseFloat(altura) > 0 ? { altura: parseFloat(altura) } : null} />
                </button>
              ) : (
                <MockupCanvas inline interactive
                  imgUrl={isKit ? null : imagem.img_url}
                  kitUrls={isKit ? imagem.kitParts.map(p => p.img_url) : [imagem.img_url]}
                  slices={isKit ? 1 : nFatias} cortePecas={isKit ? ratioQuadro : null} molduraCm={molduraCm}
                  ratio={ratioQuadro || ratio || parseFloat(imagem.ratio) || 1}
                  frameColor={molduraCor || 'preta'} room={mockupRoom} width={1200}
                  tamanhoCm={parseFloat(altura) > 0 ? { altura: parseFloat(altura) } : null}
                  onTamanhoChange={(alt) => {
                    const f = alt / (parseFloat(altura) || alt)
                    setAltura(String(alt))
                    setLargura(String(um((parseFloat(largura) || 0) * f)))
                  }} />
              )}
              <button onClick={() => setMockupAberto(true)}
                style={{ position: 'absolute', right: 10, bottom: 10, background: 'rgba(14,13,10,0.72)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 2, fontFamily: fonts.body, cursor: 'pointer' }}>
                Ampliar
              </button>
            </div>
          ) : (
            <div style={{ aspectRatio: '1088 / 1024', background: colors.surfaceAlt, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center' }}>
              <button onClick={() => setShowBanco(true)}
                style={{ background: colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: '13px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
                Escolher obra no acervo
              </button>
              <span style={{ fontSize: 12, color: colors.textMuted }}>ou siga sem obra, se o cliente trouxer a própria imagem</span>
            </div>
          )}

          {imagem && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {salas.map(room => (
                  <button key={room.id} onClick={() => setMockupRoom(room)} aria-pressed={mockupRoom.id === room.id}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontFamily: fonts.body, cursor: 'pointer', color: mockupRoom.id === room.id ? colors.text : colors.textMuted, fontWeight: mockupRoom.id === room.id ? 600 : 400 }}>
                    {room.label}
                  </button>
                ))}
                <button onClick={() => fotoInput.current?.click()}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontFamily: fonts.body, cursor: 'pointer', color: colors.text, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  {fotoSala ? 'Trocar foto do cliente' : '+ Foto do cliente'}
                </button>
              </div>
            </div>
          )}
          {imagem && mockupRoom.foto && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {mockupRoom.foto ? (
                <span style={{ fontSize: 12, color: colors.textMuted }}>Arraste o quadro para a parede do cliente. A foto fica só neste aparelho.</span>
              ) : null}
            </div>
          )}
          <input ref={fotoInput} type="file" accept="image/*" onChange={escolherFoto} style={{ display: 'none' }} />
        </div>

        {/* ─── Direita: as escolhas ─── */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.textMuted }}>
            {imagem ? (isKit ? `Composição de ${imagem.kitCount} quadros` : (imagem.categoria || 'Obra do acervo')) : 'Novo pedido'}
          </div>
          <h1 style={{ fontFamily: fonts.display, fontSize: 24, fontWeight: 600, lineHeight: 1.2, margin: '6px 0 6px', textWrap: 'balance' }}>
            {imagem ? imagem.titulo : 'Quadro sem obra do acervo'}
          </h1>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => setShowBanco(true)} style={{ ...linkBtn, color: colors.textMuted }}>{imagem ? 'Trocar obra' : 'Escolher obra'}</button>
            {imagem && (
              <button onClick={() => { setImagem(null); setRatio(null); setFatias(1); if (onImagemClear) onImagemClear() }} style={{ ...linkBtn, color: colors.textMuted }}>Remover</button>
            )}
          </div>

          {/* Tamanho */}
          <div style={grupo}>
            {fatiasMax > 1 && (
              <div style={{ marginBottom: 16 }}>
                {grupoLbl('Peças')}
                <div style={segGrupo}>
                  {[1, 2, 3].filter(n => n <= fatiasMax).map(n => (
                    <button key={n} onClick={() => { setFatias(n); setTravarRatio(true); if (n === 1) setTamPorPeca(false); if (ratio && largura) setAltura(String(um(parseFloat(largura) / ratio))) }}
                      style={segBtn(nFatias === n)} aria-pressed={nFatias === n}>
                      {n === 1 ? 'Quadro único' : `${n} peças`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              {grupoLbl('Tamanho (cm)', null, { obrig: true, falta: falta.tamanho && !(parseFloat(largura) > 0 && parseFloat(altura) > 0) })}
              {ratio && !isKit && !modoPadrao && (
                <button onClick={() => setTravarRatio(t => !t)} style={{ ...linkBtn, fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                  {travarRatio ? 'Destravar proporção' : 'Travar proporção'}
                </button>
              )}
            </div>
            {temPadrao && (
              <div style={{ ...gradeOpcoes, marginBottom: 12 }}>
                {opcoesPadrao.map(([w, h]) => {
                  const on = modoPadrao && padraoAtual?.[0] === w && padraoAtual?.[1] === h
                  const semVidro = tipoMontagem === 'convencional' && !cabeVidro(w, h)
                  return (
                    <button key={`${w}x${h}`} disabled={semVidro} title={semVidro ? 'Em papel, o maior tamanho é 100 × 150' : undefined}
                      onClick={() => { setTamPersonalizado(false); setLargura(String(w * nKit)); setAltura(String(h)) }}
                      style={{ ...chipBtn(on), ...(semVidro ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} aria-pressed={on}>
                      {w} × {h}
                    </button>
                  )
                })}
                <button onClick={() => { setTamPersonalizado(true); if (travarRatio && parseFloat(ratio) > 0 && parseFloat(altura) > 0) handleAltura(altura) }} style={chipBtn(tamPersonalizado)} aria-pressed={tamPersonalizado}>Personalizado</button>
              </div>
            )}
            {modoPadrao && padraoAtual && (isKit || corteAtual > 0.01 || Math.max(...padraoAtual) === 200) && (
              <div style={dica}>
                {isKit && `Cada peça em ${padraoAtual[0]} × ${padraoAtual[1]} cm. `}
                {corteAtual > 0.01 && (isKit ? `Corte central de até ${Math.round(corteAtual * 100) || 1}% (veja no ambiente). ` : `Corte central de ${Math.round(corteAtual * 100) || 1}% na ${eixoCorte} (veja no ambiente). `)}
                {corteAtual > CORTE_MAX_PADRAO && 'Para a obra inteira, use Personalizado. '}
                {Math.max(...padraoAtual) === 200 && 'Só em canvas.'}
              </div>
            )}
            {modoPadrao && tipoMontagem === 'convencional' && padraoAtual && !cabeVidro(...padraoAtual) && (
              <div style={{ ...dica, color: '#B4312A' }}>Em papel, o maior tamanho é 100 × 150. Escolha outro tamanho ou canvas.</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: colors.textMuted, flexWrap: 'wrap' }}>
              {!modoPadrao && (<>
                <input style={inpTam} type="number" min="1" step="0.5" placeholder="larg." aria-label={porPeca ? 'Largura de cada peça em cm' : 'Largura em cm'}
                  value={porPeca && largura ? String(um(parseFloat(largura) / nFatias)) : largura}
                  onChange={e => handleLargura(porPeca && e.target.value ? String(um(parseFloat(e.target.value) * nFatias)) : e.target.value)} />
                ×
                <input style={inpTam} type="number" min="1" step="0.5" placeholder="alt." aria-label="Altura em cm" value={altura} onChange={e => handleAltura(e.target.value)} />
              </>)}
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>Qtd.</span>
              <input style={{ ...inpTam, width: 56 }} type="number" min="1" aria-label="Quantidade" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
            </div>
            {hasDims && tipoMontagem && foraDoLimite(pecas, tipoMontagem) && (
              <div style={{ fontSize: 12, color: '#B4312A', marginTop: 8 }}>{foraDoLimite(pecas, tipoMontagem)}</div>
            )}
            {fatiado && !modoPadrao && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <div style={segGrupo} role="group" aria-label="A medida digitada é">
                  <button onClick={() => setTamPorPeca(false)} style={segBtn(!tamPorPeca, true)} aria-pressed={!tamPorPeca}>Medida total</button>
                  <button onClick={() => setTamPorPeca(true)} style={segBtn(tamPorPeca, true)} aria-pressed={tamPorPeca}>Por peça</button>
                </div>
                {hasDims && <span style={{ fontSize: 12, color: colors.textMuted }}>
                  {porPeca ? `Conjunto: ${cm(parseFloat(largura))} × ${cm(parseFloat(altura))} cm` : `${pecas.length} peças de ${cm(pecas[0].largura_cm)} × ${cm(pecas[0].altura_cm)} cm`}
                  {PRECO_TAMANHO_PADRAO[[pecas[0].largura_cm, pecas[0].altura_cm].sort((x, y) => x - y).join('x')] && ' · preço de tamanho padrão'}
                </span>}
              </div>
            )}
            {hasDims && isKit && multiPeca && !modoPadrao && <div style={{ ...dica, marginTop: 8, marginBottom: 0 }}>{descPecas}, mesma altura</div>}
          </div>

          {/* Acabamento */}
          <div style={grupo}>
            {grupoLbl('Acabamento', null, { obrig: true, falta: falta.acabamento && !tipoMontagem })}
            {montagems.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>Nenhuma montagem disponível.</p>
            ) : (
              <div style={gradeOpcoes}>
                {canvasMontagens.length > 0 && (
                  <button onClick={() => handleTipoMontagem('canvas')} style={chipBtn(tipoMontagem === 'canvas')} aria-pressed={tipoMontagem === 'canvas'}>Canvas</button>
                )}
                {convenMontagens.length > 0 && (
                  <button onClick={() => handleTipoMontagem('convencional')} style={chipBtn(tipoMontagem === 'convencional')} aria-pressed={tipoMontagem === 'convencional'}>Papel</button>
                )}
              </div>
            )}
            {tipoMontagem && montagensDoTipo.length > 1 && (
              <div style={{ ...gradeOpcoes, marginTop: 8 }}>
                {montagensDoTipo.map(m => (
                  <button key={m.id} onClick={() => setMontagemId(m.id)} style={chipBtn(montagemId === m.id)} aria-pressed={montagemId === m.id}>{m.nome}</button>
                ))}
              </div>
            )}
          </div>

          {/* Cor da moldura — mesmo preço; vai no pedido e pinta o mockup */}
          {framesDoTipo.length > 0 && tipoMontagem && (
            <div style={grupo}>
              {grupoLbl('Cor da moldura', null, { obrig: true, falta: falta.cor && !molduraCor })}
              <div style={gradeOpcoes}>
                {CORES_MOLDURA.map(c => (
                  <button key={c.id} onClick={() => setMolduraCor(c.id)} style={{ ...chipBtn(molduraCor === c.id), display: 'inline-flex', alignItems: 'center', gap: 8 }} aria-pressed={molduraCor === c.id}>
                    <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: c.hex, border: '1px solid rgba(0,0,0,0.18)', flexShrink: 0 }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vidro */}
          {tipoMontagem === 'convencional' && molduraId && glassOptions.length > 0 && (
            <div style={grupo}>
              {grupoLbl('Vidro', null, { obrig: true, falta: falta.vidro && !tipoVidro })}
              <div style={gradeOpcoes}>
                {glassOptions.map(g => (
                  <button key={g.id} onClick={() => setTipoVidro(g.id)} style={chipBtn(tipoVidro === g.id)} aria-pressed={tipoVidro === g.id}>{g.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 30, paddingTop: 18 }}>
            {precoPronto ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: 13, color: colors.textMuted }}>Total</span>
                  <span style={{ fontFamily: fonts.display, fontSize: 30, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(preco.totalGeral)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6, fontSize: 12, color: colors.textMuted }}>
                  <span>{preco.qty > 1 ? `${formatCurrency(preco.totalPeca)} por ${multiPeca ? 'conjunto' : 'unidade'}` : ''}</span>
                  {!balcao && (
                    <button onClick={() => setVerCusto(v => !v)} style={{ ...linkBtn, fontSize: 12, color: colors.textMuted }}>
                      {verCusto ? 'ocultar custo e lucro' : 'ver custo e lucro'}
                    </button>
                  )}
                </div>
                {verCusto && !balcao && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: colors.textMuted }}>Custo do estúdio {formatCurrency(precoB2b)}</span>
                    <span style={{ color: colors.success, fontWeight: 600 }}>Seu lucro {formatCurrency(preco.totalGeral - precoB2b)}</span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>
                Defina o tamanho, o acabamento e a moldura para ver o preço.
              </div>
            )}
          </div>

          {erro && (
            <div role="alert" style={{ marginTop: 16, background: colors.danger + '10', borderLeft: `3px solid ${colors.danger}`, padding: '10px 12px', fontSize: 13, color: colors.danger, lineHeight: 1.45 }}>
              {erro}
            </div>
          )}

          <button onClick={handleAdicionar}
            style={{ marginTop: 18, width: '100%', background: colors.text, color: colors.bg, border: 'none', borderRadius: 2, padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
            {itemEditando ? 'Salvar alterações' : 'Adicionar ao carrinho'}
          </button>
          {!itemEditando && nCarrinho > 0 && onVerCarrinho && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <button onClick={onVerCarrinho} style={linkBtn}>
                Ver carrinho ({nCarrinho} {nCarrinho === 1 ? 'quadro' : 'quadros'})
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Materiais de impressão (fotos reais) */}
      <section aria-label="Materiais de impressão" style={{ borderTop: `1px solid ${colors.border}`, marginTop: 56, paddingTop: 28 }}>
        {grupoLbl('Materiais de impressão')}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 24 : 32, marginTop: 14 }}>
          {[
            { img: 'material-canvas', titulo: 'Canvas algodão 360 gsm', texto: 'Tela de algodão encorpada, com a trama aparente que dá textura de pintura. Esticada no chassi e acabada com moldura canaleta, que deixa um respiro entre a tela e a moldura.' },
            { img: 'material-papel', titulo: 'Papel fotográfico fosco 180 gsm', texto: 'Acabamento fosco, sem brilho, que reproduz detalhes finos e cores fiéis. Vai em moldura caixa, com ou sem vidro.' },
          ].map(m => (
            <figure key={m.img} style={{ margin: 0 }}>
              <img src={`/molduras/${m.img}.jpg`} alt={m.titulo} loading="lazy"
                style={{ width: '100%', aspectRatio: '3 / 2', objectFit: 'cover', display: 'block', background: colors.surfaceAlt }} />
              <figcaption style={{ marginTop: 12 }}>
                <div style={{ fontFamily: fonts.display, fontSize: 17, fontWeight: 600 }}>{m.titulo}</div>
                <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.55, margin: '6px 0 0', maxWidth: 460 }}>{m.texto}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Referência das molduras (fotos reais do canto) */}
      <section aria-label="Conheça as molduras" style={{ marginTop: 40 }}>
        {grupoLbl('Conheça as molduras')}
        {[{ tipo: 'canvas', titulo: 'Canvas', sub: 'moldura canaleta' }, { tipo: 'papel', titulo: 'Papel', sub: 'moldura caixa' }].map(g => (
          <div key={g.tipo} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong style={{ fontWeight: 600 }}>{g.titulo}</strong> <span style={{ color: colors.textMuted }}>· {g.sub}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 3 : 5}, minmax(0, 1fr))`, gap: 10 }}>
              {CORES_MOLDURA.map(c => (
                <figure key={c.id} style={{ margin: 0 }}>
                  <img src={`/molduras/${g.tipo}-${c.id}.jpg`} alt={`Moldura ${g.sub} ${c.label.toLowerCase()}`} loading="lazy"
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', background: colors.surfaceAlt }} />
                  <figcaption style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>{c.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </section>

      {fotoMedir && (
        <FotoParede foto={fotoMedir} colors={colors} fonts={fonts} onCancelar={() => setFotoMedir(null)}
          onPronto={(sala) => { setFotoSala(sala); setMockupRoom(sala); setFotoMedir(null) }} />
      )}

      {mockupAberto && imagem && (
        <div role="dialog" aria-modal="true" aria-label="Quadro no ambiente" onClick={e => { if (e.target === e.currentTarget) setMockupAberto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,13,10,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', zIndex: 1000, padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 1100, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, minWidth: 0 }}>
              {salas.map(room => (
                <button key={room.id} onClick={() => setMockupRoom(room)} title={room.label} aria-label={`Ambiente ${room.label}`} aria-pressed={mockupRoom.id === room.id}
                  style={{ flexShrink: 0, width: 84, height: 54, overflow: 'hidden', border: 'none', outline: mockupRoom.id === room.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)', outlineOffset: mockupRoom.id === room.id ? 2 : 0, opacity: mockupRoom.id === room.id ? 1 : 0.6, cursor: 'pointer', padding: 0, background: '#000' }}>
                  <img src={room.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' }}>Moldura</span>
              {CORES_MOLDURA.map(fc => (
                <button key={fc.id} title={fc.label} aria-label={`Moldura ${fc.label}`} aria-pressed={(molduraCor || 'preta') === fc.id} onClick={() => setMolduraCor(fc.id)}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: fc.hex, border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer', outline: (molduraCor || 'preta') === fc.id ? '2px solid #fff' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>
          <MockupCanvas
            imgUrl={isKit ? null : imagem.img_url}
            kitUrls={isKit ? imagem.kitParts.map(p => p.img_url) : [imagem.img_url]}
            slices={isKit ? 1 : nFatias} cortePecas={isKit ? ratioQuadro : null} molduraCm={molduraCm}
            ratio={ratioQuadro || ratio || parseFloat(imagem.ratio) || 1}
            frameColor={molduraCor || 'preta'}
            width={1100}
            room={mockupRoom}
            interactive
            tamanhoCm={parseFloat(altura) > 0 ? { altura: parseFloat(altura) } : null}
            onTamanhoChange={(alt) => {
              // mantém a proporção escolhida no pedido, mesmo com a proporção livre
              const f = alt / (parseFloat(altura) || alt)
              setAltura(String(alt))
              setLargura(String(um((parseFloat(largura) || 0) * f)))
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, width: '100%', maxWidth: 1100, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              {parseFloat(altura) > 0
                ? `Tamanho real: ${multiPeca ? descPecas : `${cm(parseFloat(largura) || 0)} × ${cm(parseFloat(altura))} cm`}${preco?.totalGeral > 0 && molduraId ? ` · ${formatCurrency(preco.totalGeral)}` : ''} · arraste para posicionar, puxe um canto para mudar o tamanho`
                : 'Arraste o quadro para posicionar · puxe um canto para redimensionar'}
            </span>
            <button onClick={() => setMockupAberto(false)}
              style={{ background: '#fff', color: '#14130f', border: 'none', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body }}>
              Voltar ao pedido
            </button>
          </div>
        </div>
      )}

      <style>{`
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        select option { background: #fff; color: #1a1814; }
      `}</style>
    </div>
  )
}
