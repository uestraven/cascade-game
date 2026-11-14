/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev and preview servers bind to loopback only. This is a local, static,
// single-player app: there is no backend and nothing to authenticate, so the
// correct posture is simply not to be reachable off this machine. If someone
// else needs to see it, use an SSH local port-forward rather than widening
// the bind.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: { globals: true, include: ['test/**/*.test.ts'] },
});
