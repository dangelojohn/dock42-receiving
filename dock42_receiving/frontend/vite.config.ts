import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The built bundle is served from Odoo's module-namespaced static path,
  // not from the domain root — the app shell itself is served at /dock42
  // by the controller, but its JS/CSS live under the addon's static
  // folder. Without this, the emitted <script>/<link> tags reference
  // root-absolute /assets/... paths that 404 under Odoo's static routing
  // (module assets are only served at /<module>/static/<path>).
  base: '/dock42_receiving/static/src/pwa/',
  build: {
    outDir: '../static/src/pwa',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/dock42/api': {
        target: 'http://localhost:8269',
        changeOrigin: true,
      },
    },
  },
});
