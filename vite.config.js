import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'

// One build id per build, compiled into the bundle (__BUILD_ID__) AND written
// to public/version.json. UpdateBanner compares the two and prompts a reload
// when a newer deploy is live — so streamers never run stale code on a stock
// system. (V1 parity.)
const BUILD_ID = Date.now().toString()

function versionFile() {
  return {
    name: 'write-version-json',
    buildStart() {
      try { writeFileSync('public/version.json', JSON.stringify({ build: BUILD_ID })) } catch { /* ignore */ }
    },
  }
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
