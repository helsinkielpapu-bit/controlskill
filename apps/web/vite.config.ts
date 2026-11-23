import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Solo local: la web y la API comparten origen gracias al proxy, así la cookie de sesión es SameSite=Strict.
// WEB_PORT y API_TARGET permiten levantar una instancia aislada para las pruebas de extremo a extremo.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:4100' }
  }
});
