import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// a recarga do React precisa de script inline; a politica de seguranca so e
// removida no servidor de desenvolvimento, nunca no app compilado
const devOnlyNoCsp: Plugin = {
  name: 'dev-no-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), devOnlyNoCsp],
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
})
