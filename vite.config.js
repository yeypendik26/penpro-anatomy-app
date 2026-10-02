import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base harus cocok dengan nama repo: GitHub Pages menyajikan dari subpath
// https://yeypendik26.github.io/penpro-anatomy-app/ — bukan root domain.
// MODEL_URL di Viewer.jsx memakai import.meta.env.BASE_URL, jadi path GLB
// ikut menyesuaikan sendiri.
export default defineConfig({
  base: '/penpro-anatomy-app/',
  plugins: [react()],
  server: { host: true },
})
