import STRUKTUR from './struktur.json'
import { prettyName } from './layers.js'

// Field yang ditampilkan per kategori. Origo s.d. vaskularisasi hanya
// bermakna untuk otot; kategori lain cukup nama + catatan klinis.
const FIELDS_OTOT = [
  ['origo', 'Origo'],
  ['insersio', 'Insersio'],
  ['inervasi', 'Inervasi'],
  ['vaskularisasi', 'Vaskularisasi'],
  ['catatan_klinis', 'Catatan klinis'],
]
const FIELDS_LAIN = [['catatan_klinis', 'Catatan klinis']]

export default function InfoPanel({ selected }) {
  if (!selected) {
    return (
      <div className="readout">
        <div className="readout-empty">
          Klik sebuah struktur. Drag untuk memutar, scroll untuk zoom.
        </div>
      </div>
    )
  }

  const data = STRUKTUR[selected]
  // Pilih field dari prefix nama node, bukan dari `kategori`: prefix sudah ada
  // di nama node, membacanya dari dua tempat bisa desync. `kategori` = label saja.
  const fields = selected.startsWith('m_') ? FIELDS_OTOT : FIELDS_LAIN

  return (
    <div className="readout">
      <div className="readout-name">{data?.nama_latin ?? prettyName(selected)}</div>
      <code className="readout-code">{selected}</code>
      {data ? (
        // Field kosong tetap tampil sebagai "belum diisi": yang bolong harus kelihatan.
        <dl className="info">
          {fields.map(([key, label]) => (
            <div key={key} className="info-row">
              <dt>{label}</dt>
              {data[key] ? <dd>{data[key]}</dd> : <dd className="info-empty">belum diisi</dd>}
            </div>
          ))}
        </dl>
      ) : (
        <div className="readout-empty">Tidak ada entri di struktur.json</div>
      )}
    </div>
  )
}
