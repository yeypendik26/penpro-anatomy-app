// Konvensi penamaan node mengikat ROADMAP bagian 4.
// Prefix nama object sekaligus jadi filter layer.
export const LAYERS = [
  { prefix: 'os_', label: 'Ossa' },
  { prefix: 'm_', label: 'Musculi' },
  { prefix: 'lig_', label: 'Ligamenta' },
  { prefix: 'n_', label: 'Nervi' },
  { prefix: 'a_', label: 'Arteriae' },
  { prefix: 'v_', label: 'Venae' },
]

export function layerOf(nodeName) {
  const hit = LAYERS.find((l) => nodeName.startsWith(l.prefix))
  return hit ? hit.prefix : null
}

// m_biceps-brachii-caput-longum -> M. biceps brachii caput longum
const TITLE = { os_: 'Os', m_: 'M.', n_: 'N.', a_: 'A.', v_: 'V.', lig_: 'Lig.' }

// Layer lig_ menampung semua struktur fibrosa, dan tidak semuanya ligamentum.
// Kalau namanya sudah menyebut jenisnya sendiri, jangan dipaksa jadi "Lig."
const JENIS_SENDIRI = ['retinaculum', 'membrana', 'aponeurosis', 'fascia']

export function prettyName(nodeName) {
  const prefix = layerOf(nodeName)
  if (!prefix) return nodeName
  const body = nodeName.slice(prefix.length).replace(/-/g, ' ')
  if (prefix === 'lig_' && JENIS_SENDIRI.some((j) => body.startsWith(j))) {
    return body.charAt(0).toUpperCase() + body.slice(1)
  }
  return `${TITLE[prefix]} ${body}`
}
