import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'

  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@hivelearn/core": path.resolve(__dirname, '../core/src'),
      },
    },
    server: {
      port: 5173,
      host: true,
      strictPort: false,
      hmr: {
        clientPort: 5173,
      },
      cors: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
        },
        "/health": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
        },
        "/status": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
        },
        "/ws": {
          target: "ws://127.0.0.1:8787",
          ws: true,
        },
        "/hivelearn-onboarding": {
          target: "ws://127.0.0.1:8787",
          ws: true,
        },
        "/hivelearn-lesson": {
          target: "ws://127.0.0.1:8787",
          ws: true,
        },
        "/hivelearn-events": {
          target: "ws://127.0.0.1:8787",
          ws: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
        },
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "zustand"],
    },
  }
})
