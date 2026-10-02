import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
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

// Pasang kamera dari KOTAK model, bukan bounding sphere. Lengan itu bentuk
// sangat memanjang: radius sphere ditentukan sumbu terpanjang, jadi kalau
// dipakai untuk memuat lebar layar sempit (HP portrait) modelnya jadi mungil
// dan layar kebuang. Half-extent kotak di ruang kamera memberi jarak yang pas.
//
// Dihitung ulang kalau ukuran canvas berubah (rotasi layar HP), TAPI berhenti
// begitu user menggerakkan kamera sendiri — jangan rampas kontrol dari user.
function FitCamera({ box }) {
  const { camera, controls, size } = useThree()
  const touched = useRef(false)

  useEffect(() => {
    if (!controls) return
    const mark = () => {
      touched.current = true
    }
    controls.addEventListener('start', mark)
    return () => controls.removeEventListener('start', mark)
  }, [controls])

  useEffect(() => {
    if (!box || touched.current) return
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), VIEW_DIR).normalize()
    const up = new THREE.Vector3().crossVectors(VIEW_DIR, right).normalize()

    // Model sudah dipusatkan di nol, jadi |proyeksi sudut| = half-extent.
    let hx = 0
    let hy = 0
    let hz = 0
    const v = new THREE.Vector3()
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          v.set(x, y, z)
          hx = Math.max(hx, Math.abs(v.dot(right)))
          hy = Math.max(hy, Math.abs(v.dot(up)))
          hz = Math.max(hz, Math.abs(v.dot(VIEW_DIR)))
        }
      }
    }

    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const aspect = size.width / size.height
    const dist = Math.max(hy / tan, hx / (tan * aspect)) * 1.12 + hz

    camera.position.copy(VIEW_DIR).multiplyScalar(dist)
    camera.near = Math.max(dist / 1000, 0.001)
    camera.far = dist * 10
    camera.updateProjectionMatrix()
    camera.lookAt(0, 0, 0)
    if (controls) {
      controls.target.set(0, 0, 0)
      controls.update()
    }
  }, [box, camera, controls, size])
  return null
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
      <FitCamera box={box} />
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

// quiz: null = mode atlas; { visible, marks } = mode quiz (visible null = tanpa pembatasan).
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

useGLTF.preload(MODEL_URL)
