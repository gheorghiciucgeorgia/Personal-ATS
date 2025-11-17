import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        host: '0.0.0.0',
        port: 3000,
        strictPort: true,
        watch: {
            usePolling: true,
            interval: 1000 // Check la fiecare secundă
        },
        hmr: {
            host: 'localhost',
            port: 3000
        }
    }
});
