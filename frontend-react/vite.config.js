import os from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const lanUrlPlugin = () => ({
  name: 'lan-url',
  configureServer(server) {
    server.middlewares.use('/__lan_url', (_request, response) => {
      const address = server.httpServer?.address()
      const port = typeof address === 'object' && address ? address.port : 5173
      const lanAddress = Object.values(os.networkInterfaces())
        .flat()
        .find((item) => item?.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))

      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ url: lanAddress ? `http://${lanAddress.address}:${port}` : '' }))
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), lanUrlPlugin()],
})
