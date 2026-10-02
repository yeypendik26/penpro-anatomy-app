import STRUKTUR from './struktur.json'
import { prettyName } from './layers.js'
import InfoPanel from './InfoPanel.jsx'

const namaLatin = (node) => STRUKTUR[node]?.nama_latin ?? prettyName(node)

// soal undefined = sesi selesai. picked null = soal belum dijawab.
export default function QuizPanel({ soal, nomor, total, picked, benar, dijawab, onNext, onRestart }) {
  if (!soal) {
    return (
      <div className="readout quiz">
        <div className="quiz-meta">Sesi selesai</div>
        <div className="quiz-prompt">
          Skor {benar}/{total}
        </div>
        <button type="button" className="quiz-btn" onClick={onRestart}>
          Ulangi
        </button>
      </div>
    )
  }

  const answered = picked !== null
  const ok = answered && soal.answer.includes(picked)

  return (
    <div className="readout quiz">
      <div className="quiz-meta">
        Soal {nomor}/{total} · Skor {benar}/{dijawab}
      </div>
      <div className="quiz-prompt">{soal.prompt}</div>
      {answered ? (
        <>
          <div className="quiz-result">
            <span className={ok ? 'quiz-ok' : 'quiz-no'}>{ok ? 'Benar.' : 'Salah.'}</span>
            {!ok && <> Jawaban: {soal.answer.map(namaLatin).join(', ')}</>}
          </div>
          <button type="button" className="quiz-btn" onClick={onNext}>
            {nomor < total ? 'Soal berikutnya' : 'Lihat skor'}
          </button>
          {soal.explain && <p className="quiz-explain">{soal.explain}</p>}
          {/* Panel info baru tampil setelah dijawab: nama latin di panel membocorkan jawaban. */}
          <InfoPanel selected={picked} />
        </>
      ) : (
        <div className="readout-empty">Klik struktur pada model. Satu klik = jawaban final.</div>
      )}
    </div>
  )
}
