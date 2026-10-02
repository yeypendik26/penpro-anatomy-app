import { useCallback, useMemo, useState } from 'react'
import Viewer from './Viewer.jsx'
import InfoPanel from './InfoPanel.jsx'
import QuizPanel from './QuizPanel.jsx'
import QUESTIONS from './questions.json'

// Skor hanya hidup di state React selama sesi. Sengaja tanpa persistensi (Fase 3b).
const QUIZ_AWAL = { idx: 0, picked: null, benar: 0, dijawab: 0 }

export default function App() {
  const [selected, setSelected] = useState(null)
  const [nodeCount, setNodeCount] = useState(0)
  const [mode, setMode] = useState('atlas')
  const [quiz, setQuiz] = useState(QUIZ_AWAL)

  const handleNodes = useCallback((names) => setNodeCount(names.length), [])

  const soal = QUESTIONS[quiz.idx] // undefined = sesi selesai
  const answered = quiz.picked !== null

  // Setelah dijawab: semua node `answer` hijau; kalau salah, node yang diklik merah.
  const marks = useMemo(() => {
    if (!soal || !answered) return {}
    const m = Object.fromEntries(soal.answer.map((n) => [n, 'benar']))
    if (!soal.answer.includes(quiz.picked)) m[quiz.picked] = 'salah'
    return m
  }, [soal, answered, quiz.picked])

  // focus hanya setelah dijawab: kamera yang mendekat ke jawaban sebelum itu membocorkannya.
  const viewerQuiz = useMemo(
    () =>
      mode === 'quiz'
        ? { visible: soal?.visible ?? null, marks, focus: answered ? soal.answer : null }
        : null,
    [mode, soal, marks, answered],
  )

  const handlePick = (name) => {
    if (mode === 'atlas') {
      setSelected(name)
      return
    }
    // Satu klik = jawaban final. Klik ruang kosong (null) tidak dihitung.
    // Benar kalau node yang diklik ada di `answer` (any-of): array itu caput/pars
    // dari satu jawaban anatomis, bukan daftar yang harus diklik semua.
    if (!name || !soal || answered) return
    setQuiz((q) => ({
      ...q,
      picked: name,
      dijawab: q.dijawab + 1,
      benar: q.benar + (soal.answer.includes(name) ? 1 : 0),
    }))
  }

  return (
    <div className={mode === 'quiz' ? 'app mode-quiz' : 'app'}>
      <header className="topbar">
        <h1>Atlas Anatomi</h1>
        <span className="region">Ekstremitas superior dextra</span>
        <span className="spacer" />
        <div className="mode" role="group" aria-label="Mode">
          {[
            ['atlas', 'Atlas'],
            ['quiz', 'Quiz'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              className={mode === key ? 'on' : ''}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="meta">{nodeCount} struktur</span>
      </header>

      <Viewer selected={selected} quiz={viewerQuiz} onPick={handlePick} onNodes={handleNodes} />

      {mode === 'atlas' ? (
        <InfoPanel selected={selected} />
      ) : (
        <QuizPanel
          soal={soal}
          nomor={quiz.idx + 1}
          total={QUESTIONS.length}
          picked={quiz.picked}
          benar={quiz.benar}
          dijawab={quiz.dijawab}
          onNext={() => setQuiz((q) => ({ ...q, idx: q.idx + 1, picked: null }))}
          onRestart={() => setQuiz(QUIZ_AWAL)}
        />
      )}

      <footer className="attribution">
        Model anatomi berbasis BodyParts3D © Database Center for Life Science (DBCLS), CC BY-SA
      </footer>
    </div>
  )
}
