// Konvensi penamaan node mengikat ROADMAP bagian 4.
// Prefix nama object sekaligus jadi filter layer.
export const LAYERS = [
  { prefix: 'os_', label: 'Ossa' },
  { prefix: 'm_', label: 'Musculi' },
  { prefix: 'n_', label: 'Nervi' },
  { prefix: 'a_', label: 'Arteriae' },
  { prefix: 'v_', label: 'Venae' },
]

export function layerOf(nodeName) {
  const hit = LAYERS.find((l) => nodeName.startsWith(l.prefix))
  return hit ? hit.prefix : null
}

// m_biceps-brachii-caput-longum -> M. biceps brachii caput longum
const TITLE = { os_: 'Os', m_: 'M.', n_: 'N.', a_: 'A.', v_: 'V.' }

export function prettyName(nodeName) {
  const prefix = layerOf(nodeName)
  if (!prefix) return nodeName
  const body = nodeName.slice(prefix.length).replace(/-/g, ' ')
  return `${TITLE[prefix]} ${body}`
}
