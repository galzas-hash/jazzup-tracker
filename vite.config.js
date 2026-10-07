import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Each build gets an id; the app compares it with /version.json to know when
// a newer version has been published and offers a "Reload" button.
const buildId = String(Date.now())

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: 'version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) })
      },
    },
  ],
})
