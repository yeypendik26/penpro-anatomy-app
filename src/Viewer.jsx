import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { LAYERS, layerOf } from './layers.js'

const MODEL_URL = `${import.meta.env.BASE_URL}models/ekstremitas-superior-v4.glb`
const HIGHLIGHT = new THREE.Color(0x22d3ee)
// Warna feedback mode quiz, dipakai lewat jalur emissive yang sama dengan highlight atlas.
const MARK = { benar: new THREE.Color(0x22c55e), salah: new THREE.Color(0xef4444) }
const NO_RAYCAST = () => {}

// Daftar `visible` soal: entri berakhiran "_" = prefix (mis. "os_"), selain itu nama node persis.
const inVisible = (name, list) => list.some((v) => (v.endsWith('_') ? name.startsWith(v) : name === v))

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="loader">
        <div className="loader-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="loader-text">Memuat model… {Math.round(progress)}%</div>
      </div>
    </Html>
  )
}

const VIEW_DIR = new THREE.Vector3(0.45, 0.15, 1).normalize()
const UP = new THREE.Vector3(0, 1, 0)
const FOCUS_MS = 600
const FOCUS_SAMPLES = 16

// Pose kamera yang memuat `box` dilihat dari arah `dir`. Dari KOTAK, bukan
// bounding sphere: radius sphere ditentukan sumbu terpanjang, jadi untuk bentuk
// memanjang (lengan, otot panjang) di layar portrait HP targetnya jadi mungil.
// Half-extent sudut kotak di ruang kamera, fov vertikal dan horizontal terpisah.
function fitPose(box, dir, fov, aspect, margin) {
  const center = box.getCenter(new THREE.Vector3())
  const right = new THREE.Vector3().crossVectors(UP, dir).normalize()
  const up = new THREE.Vector3().crossVectors(dir, right).normalize()
  let hx = 0
  let hy = 0
  let hz = 0
  const v = new THREE.Vector3()
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).sub(center)
        hx = Math.max(hx, Math.abs(v.dot(right)))
        hy = Math.max(hy, Math.abs(v.dot(up)))
        hz = Math.max(hz, Math.abs(v.dot(dir)))
      }
    }
  }
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2)
  const dist = Math.max(hy / tan, hx / (tan * aspect)) * margin + hz
  return { position: center.clone().addScaledVector(dir, dist), target: center, dist }
}

// Arah pandang untuk struktur jawaban: VIEW_DIR diputar 0/90/180/270 derajat
// di sumbu vertikal, dipilih yang paling banyak titik targetnya kena sinar
// PERTAMA (tidak tertutup struktur lain yang sedang tampil). Arah yang hampir
// sejajar sumbu panjang target dibuang — dari ujung, struktur panjang tampak
// seperti titik. Seri: arah netral menang, supaya hasilnya stabil.
function focusDir(scene, targets, box, poseFor) {
  const names = new Set(targets.map((o) => o.name))
  const size = box.getSize(new THREE.Vector3())
  const longAxis = new THREE.Vector3(
    size.x >= size.y && size.x >= size.z ? 1 : 0,
    size.y > size.x && size.y >= size.z ? 1 : 0,
    size.z > size.x && size.z > size.y ? 1 : 0,
  )
  const points = []
  const per = Math.ceil(FOCUS_SAMPLES / targets.length)
  for (const o of targets) {
    const pos = o.geometry.attributes.position
    const stride = Math.max(1, Math.floor(pos.count / per))
    for (let i = 0; i < pos.count && points.length < FOCUS_SAMPLES * 2; i += stride) {
      points.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld))
    }
  }
  const ray = new THREE.Raycaster()
  const toPoint = new THREE.Vector3()
  let best = null
  for (const deg of [0, 90, 180, 270]) {
    const dir = VIEW_DIR.clone().applyAxisAngle(UP, THREE.MathUtils.degToRad(deg))
    if (Math.abs(dir.dot(longAxis)) > 0.9) continue
    const pose = poseFor(dir)
    let seen = 0
    for (const p of points) {
      ray.set(pose.position, toPoint.subVectors(p, pose.position).normalize())
      const hit = ray.intersectObject(scene, true)[0]
      if (hit && names.has(hit.object.name)) seen++
    }
    if (!best || seen > best.seen) best = { dir, seen }
  }
  return best ? best.dir : VIEW_DIR
}

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

// Animasi kamera pendek. Hanya di-mount selama animasi berjalan, jadi tidak ada
// callback per-frame yang tersisa setelah selesai.
function CameraTween({ from, to, onDone }) {
  const { camera, controls } = useThree()
  const start = useRef(null)
  useFrame(() => {
    const now = performance.now()
    if (start.current === null) start.current = now
    const k = Math.min((now - start.current) / FOCUS_MS, 1)
    const e = easeInOut(k)
    camera.position.lerpVectors(from.position, to.position, e)
    const target = new THREE.Vector3().lerpVectors(from.target, to.target, e)
    if (controls) {
      controls.target.copy(target)
      controls.update()
    } else {
      camera.lookAt(target)
    }
    if (k === 1) onDone()
  })
  return null
}

// Satu pemilik kamera untuk dua mode.
// - Netral: memuat seluruh model dari VIEW_DIR. Dipasang ulang kalau ukuran canvas
//   berubah (rotasi layar HP), TAPI berhenti begitu user menggerakkan kamera —
//   jangan rampas kontrol dari user.
// - Ganti soal / ganti mode (`stage` berubah): kembali ke pose netral yang SAMA
//   untuk semua soal, supaya posisi kamera tidak memberi petunjuk.
// - Setelah dijawab (`focus` = node answer): animasi ke kotak gabungan SEMUA node
//   answer. Sebelum dijawab kamera tidak boleh tahu letak jawaban.
function CameraRig({ scene, box, stage, focus }) {
  const { camera, controls, size } = useThree()
  const touched = useRef(false)
  const [tween, setTween] = useState(null)

  const aspect = size.width / size.height
  const apply = (pose, near) => {
    // Buang sisa inersia damping OrbitControls dulu: tanpa ini, putaran user yang
    // belum habis terus menggeser kamera beberapa frame setelah pose dipasang,
    // jadi pose "netral" soal berikutnya berbeda-beda. Update dengan damping mati
    // mengosongkan delta yang tersisa; baru setelah itu pose dipasang.
    const damping = controls?.enableDamping
    if (controls) {
      controls.enableDamping = false
      controls.update()
    }
    camera.position.copy(pose.position)
    camera.near = near
    camera.updateProjectionMatrix()
    camera.lookAt(pose.target)
    if (controls) {
      controls.target.copy(pose.target)
      controls.update()
      controls.enableDamping = damping
    }
  }
  const neutral = () => {
    const pose = fitPose(box, VIEW_DIR, camera.fov, aspect, 1.12)
    camera.far = pose.dist * 10
    apply(pose, Math.max(pose.dist / 1000, 0.001))
  }

  useEffect(() => {
    if (!controls) return
    const mark = () => {
      touched.current = true
      setTween(null)
    }
    controls.addEventListener('start', mark)
    return () => controls.removeEventListener('start', mark)
  }, [controls])

  useEffect(() => {
    if (!box || touched.current) return
    neutral()
  }, [box, camera, controls, size]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!box) return
    touched.current = false
    setTween(null)
    neutral()
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus || !box) return
    const targets = []
    scene.traverse((o) => {
      if (o.isMesh && focus.includes(o.name)) targets.push(o)
    })
    if (!targets.length) return
    const tbox = new THREE.Box3()
    for (const o of targets) tbox.expandByObject(o)
    const poseFor = (dir) => fitPose(tbox, dir, camera.fov, aspect, 1.25)
    const to = poseFor(focusDir(scene, targets, tbox, poseFor))
    camera.near = Math.min(camera.near, Math.max(to.dist / 100, 0.0005))
    camera.updateProjectionMatrix()
    const from = { position: camera.position.clone(), target: controls ? controls.target.clone() : to.target }
    setTween({ from, to })
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  return tween ? <CameraTween from={tween.from} to={tween.to} onDone={() => setTween(null)} /> : null
}

function Model({ selected, hiddenLayers, quiz, onPick, onReady }) {
  const { scene } = useGLTF(MODEL_URL)

  // Siapkan sekali. Dijaga flag karena StrictMode render dua kali di dev —
  // tanpa ini model kegeser dua kali dan keluar frame.
  const { box, names } = useMemo(() => {
    if (!scene.userData.__prepared) {
      scene.traverse((o) => {
        if (!o.isMesh) return
        // material sendiri per mesh: ini inti highlight per-mesh
        o.material = o.material.clone()
        o.userData.baseEmissive = o.material.emissive.clone()
        o.userData.baseEmissiveIntensity = o.material.emissiveIntensity
        o.userData.baseRaycast = o.raycast
      })
      // Sumbu panjang model (proksimal->distal) ada di Z pada file GLB.
      // Putar supaya jadi tegak di layar: clavicula di atas, phalanges di bawah.
      scene.rotation.x = -Math.PI / 2
      scene.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(scene)
      scene.position.sub(box.getCenter(new THREE.Vector3()))
      scene.updateMatrixWorld(true)
      scene.userData.__prepared = true
    }
    const list = []
    scene.traverse((o) => {
      if (o.isMesh) list.push(o.name)
    })
    return {
      box: new THREE.Box3().setFromObject(scene),
      names: list.sort(),
    }
  }, [scene])

  useEffect(() => {
    onReady(names)
  }, [names, onReady])

  // Mode quiz: panggung = daftar `visible` soal. Mode atlas (quiz null): toggle layer.
  const stage = quiz?.visible
  useEffect(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return
      const show = stage ? inVisible(o.name, stage) : !hiddenLayers.includes(layerOf(o.name))
      o.visible = show
      // Raycaster three.js TIDAK peduli flag `visible` — mesh yang
      // disembunyikan tetap menangkap klik dan memblokir struktur di
      // belakangnya. Matikan raycast-nya, jangan cuma visible-nya.
      o.raycast = show ? o.userData.baseRaycast : NO_RAYCAST
    })
  }, [scene, hiddenLayers, stage])

  // Mode quiz: warna dari marks ({ node: 'benar' | 'salah' }). Mode atlas: struktur terpilih.
  const marks = quiz?.marks
  useEffect(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return
      const color = marks ? MARK[marks[o.name]] : o.name === selected ? HIGHLIGHT : null
      o.material.emissive.copy(color ?? o.userData.baseEmissive)
      o.material.emissiveIntensity = color ? 0.85 : o.userData.baseEmissiveIntensity
    })
  }, [scene, selected, marks])

  // Bedakan tap dari drag OrbitControls. Ambangnya 10 px, bukan 6: jari di
  // layar sentuh selalu bergeser beberapa piksel saat mengetuk, dan ambang
  // ketat bikin tap di HP sering tidak terbaca.
  const down = useRef(null)

  return (
    <>
      <CameraRig scene={scene} box={box} stage={stage} focus={quiz?.focus ?? null} />
      {/* Handler dipasang di <group> pembungkus, bukan langsung di
          <primitive>. Pola ini yang terbukti jalan: event dari mesh anak
          naik ke group, dan e.object tetap mesh yang kena klik. */}
      <group
        onPointerDown={(e) => {
          // WAJIB: tanpa stopPropagation, r3f memanggil handler untuk SETIAP
          // mesh yang ditembus sinar, jadi yang tercatat justru struktur
          // paling belakang. Ini yang bikin klik otot "tidak berefek".
          e.stopPropagation()
          down.current = { x: e.clientX, y: e.clientY, name: e.object.name }
        }}
        onPointerUp={(e) => {
          const d = down.current
          down.current = null
          if (!d || d.name !== e.object.name) return
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return
          e.stopPropagation()
          onPick(e.object.name)
        }}
      >
        <primitive object={scene} />
      </group>
    </>
  )
}

// quiz: null = mode atlas; { visible, marks, focus } = mode quiz (visible null = tanpa
// pembatasan; focus = node answer setelah dijawab, null sebelumnya).
export default function Viewer({ selected, quiz = null, onPick, onNodes }) {
  const [hiddenLayers, setHiddenLayers] = useState([])
  const [counts, setCounts] = useState({})

  const handleReady = useMemo(
    () => (names) => {
      const c = {}
      for (const n of names) {
        const l = layerOf(n)
        c[l] = (c[l] || 0) + 1
      }
      setCounts(c)
      onNodes?.(names)
    },
    [onNodes],
  )

  const toggle = (prefix) =>
    setHiddenLayers((prev) =>
      prev.includes(prefix) ? prev.filter((p) => p !== prefix) : [...prev, prefix],
    )

  return (
    <div className="viewer">
      <Canvas
        flat
        dpr={[1, 2]}
        camera={{ fov: 45, position: [0, 0, 1] }}
        onPointerMissed={() => onPick(null)}
      >
        <color attach="background" args={['#0d1117']} />
        <hemisphereLight args={['#ffffff', '#3a3f4b', 1.1]} />
        <directionalLight position={[2, 3, 2]} intensity={1.8} />
        <directionalLight position={[-2, -1, -2]} intensity={0.7} />
        <Suspense fallback={<Loader />}>
          <Model
            selected={selected}
            hiddenLayers={hiddenLayers}
            quiz={quiz}
            onPick={onPick}
            onReady={handleReady}
          />
        </Suspense>
        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        {import.meta.env.DEV && <DevTestHook />}
      </Canvas>

      {/* Mode quiz: yang tampil ditentukan soal, bukan user. Toggle layer disembunyikan. */}
      {!quiz && (
        <div className="layers">
          <div className="layers-title">Layer</div>
          {LAYERS.map((l) => (
            <label key={l.prefix} className="layer-row">
              <input
                type="checkbox"
                checked={!hiddenLayers.includes(l.prefix)}
                onChange={() => toggle(l.prefix)}
              />
              <span className="layer-label">{l.label}</span>
              <span className="layer-count">{counts[l.prefix] ?? 0}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// Kait uji — HANYA dev. Dirender lewat `import.meta.env.DEV && ...`, jadi ikut
// ter-tree-shake dari build production (cek: grep `__anatomyTest` di dist/assets).
// Untuk skrip uji klik headless (CDP): di mode quiz satu klik = jawaban final,
// jadi skrip perlu tahu letak node TANPA mengkliknya. Klik tetap dikirim skrip
// sebagai event mouse asli. Dari konsol / Runtime.evaluate:
//   __anatomyTest.pixelOf('m_supraspinatus') -> [x, y] piksel viewport tempat node
//       itu struktur PERTAMA yang kena sinar (klik di sana memilihnya), atau null
//       kalau tersembunyi / tertutup penuh.
//   __anatomyTest.cameraPose() -> { position: [x, y, z], target: [x, y, z] }
//   __anatomyTest.three() -> state r3f mentah (scene, camera, ...) untuk cek lain.
function DevTestHook() {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const ray = new THREE.Raycaster()
    const pixelOf = (name) => {
      const { scene, camera, gl } = get()
      let mesh = null
      scene.traverse((o) => {
        if (o.isMesh && o.name === name) mesh = o
      })
      if (!mesh || !mesh.visible) return null
      const r = gl.domElement.getBoundingClientRect()
      const hits = (x, y) => {
        ray.setFromCamera(
          new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1),
          camera,
        )
        return ray.intersectObject(scene, true)[0]?.object.name === name
      }
      // Kotak layar node, dari 8 sudut bbox-nya yang diproyeksikan.
      const b = new THREE.Box3().setFromObject(mesh)
      const xs = []
      const ys = []
      const v = new THREE.Vector3()
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) {
            v.set(x, y, z).project(camera)
            xs.push(r.left + ((v.x + 1) / 2) * r.width)
            ys.push(r.top + ((1 - v.y) / 2) * r.height)
          }
        }
      }
      const x0 = Math.ceil(Math.max(Math.min(...xs), r.left + 2))
      const y0 = Math.ceil(Math.max(Math.min(...ys), r.top + 2))
      const x1 = Math.min(Math.max(...xs), r.right - 2)
      const y1 = Math.min(Math.max(...ys), r.bottom - 2)
      // Grid piksel BULAT (CDP mengklik di piksel bulat). Utamakan titik yang
      // tetangga ±2 px-nya juga kena, supaya struktur tipis tidak meleset.
      for (const step of [8, 4, 2]) {
        const pts = []
        for (let y = y0; y <= y1; y += step) {
          for (let x = x0; x <= x1; x += step) if (hits(x, y)) pts.push([x, y])
        }
        if (!pts.length) continue
        const solid = pts.filter(([x, y]) => hits(x + 2, y) && hits(x - 2, y) && hits(x, y + 2) && hits(x, y - 2))
        const pool = solid.length ? solid : pts
        const cx = pool.reduce((s, p) => s + p[0], 0) / pool.length
        const cy = pool.reduce((s, p) => s + p[1], 0) / pool.length
        return pool.reduce((a, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(a[0] - cx, a[1] - cy) ? p : a))
      }
      return null
    }
    const cameraPose = () => {
      const { camera, controls } = get()
      return { position: camera.position.toArray(), target: controls ? controls.target.toArray() : null }
    }
    window.__anatomyTest = { pixelOf, cameraPose, three: get }
    return () => {
      delete window.__anatomyTest
    }
  }, [get])
  return null
}

useGLTF.preload(MODEL_URL)
