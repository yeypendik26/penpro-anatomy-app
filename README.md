# penpro-anatomy-app

Atlas anatomi 3D untuk mahasiswa FK UNS angkatan 2026, divisi Penpro.
Viewer three.js dengan highlight per-struktur, filter layer, dan model
ekstremitas superior dextra berisi 94 struktur bernama.

Live: https://yeypendik26.github.io/penpro-anatomy-app/

## Jalankan lokal

```
npm install
npm run dev
```

`.npmrc` berisi `include=dev` — jangan dihapus. Mesin dev utama punya
`NODE_ENV=production` di environment, yang membuat `npm install` membuang
devDependencies (termasuk vite) tanpa pesan error.

## Build

```
npm run build
```

`base` di `vite.config.js` disetel ke `/penpro-anatomy-app/` supaya cocok
dengan subpath GitHub Pages. Kalau repo di-rename, ubah juga nilai itu.

## Konvensi penamaan node

Nama object di GLB adalah kunci data, bukan sekadar label. Prefix sekaligus
jadi filter layer.

| Prefix | Kategori | Contoh |
|---|---|---|
| `os_` | tulang | `os_humerus` |
| `m_` | musculus | `m_biceps-brachii-caput-longum` |
| `n_` | nervus | `n_medianus` |
| `a_` | arteri | `a_brachialis` |
| `v_` | vena | `v_cephalica` |

Huruf kecil semua, spasi jadi `-`, tanpa karakter khusus.

## Atribusi dan lisensi

Model anatomi berbasis **BodyParts3D** © Database Center for Life Science
(DBCLS), dilisensikan **CC BY-SA 2.1 JP**.

Karena model sumbernya CC BY-SA, karya turunan di repo ini — termasuk file
GLB hasil pipeline — mengikuti lisensi yang sama: **CC BY-SA**. Atribusi
wajib ikut di setiap penggunaan ulang.
