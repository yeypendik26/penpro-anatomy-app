import { useCallback, useState } from 'react'
import Viewer from './Viewer.jsx'
import InfoPanel from './InfoPanel.jsx'

export default function App() {
  const [selected, setSelected] = useState(null)
  const [nodeCount, setNodeCount] = useState(0)

  const handleNodes = useCallback((names) => setNodeCount(names.length), [])

  return (
    <div className="app">
      <header className="topbar">
        <h1>Atlas Anatomi</h1>
        <span className="region">Ekstremitas superior dextra</span>
        <span className="spacer" />
        <span className="meta">{nodeCount} struktur</span>
      </header>

      <Viewer selected={selected} onPick={setSelected} onNodes={handleNodes} />

      <InfoPanel selected={selected} />

      <footer className="attribution">
        Model anatomi berbasis BodyParts3D © Database Center for Life Science (DBCLS), CC BY-SA
      </footer>
    </div>
  )
}
