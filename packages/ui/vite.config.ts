import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import path from "path"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"
import { nodePolyfills } from "vite-plugin-node-polyfills"

export default defineConfig({
  // Load .env from monorepo root (two directories up from packages/ui)
  envDir: path.resolve(__dirname, "../../"),

  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      // Enable polyfills for Node.js globals and modules needed by N3.js
      globals: {
        Buffer: true,
        global: true,
        process: true
      }
      // Use default polyfills which includes stream, buffer, util, events, and readable-stream
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Don't alias n3 - let it use the package.json "browser" field
      // Stub out tokenizer packages for browser (not needed in UI-only mode)
      "@anthropic-ai/tokenizer": path.resolve(__dirname, "./src/stubs/tokenizer-stub.ts"),
      "tiktoken": path.resolve(__dirname, "./src/stubs/tiktoken-stub.ts")
    }
  },
  optimizeDeps: {
    exclude: [
      "@anthropic-ai/tokenizer",
      "tiktoken",
      "@effect/ai",
      "@effect/ai-anthropic",
      "@effect/ai-openai",
      "@effect/ai-google"
    ],
    esbuildOptions: {
      target: "esnext",
      supported: {
        "top-level-await": true
      }
    }
  },
  build: {
    target: "esnext"
  },
  server: {
    port: 5173
  }
})
