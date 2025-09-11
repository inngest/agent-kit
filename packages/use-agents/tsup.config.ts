import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/components/AgentProvider.tsx',
  ],
  format: ['esm'], // ESM only as requested
  dts: true, // Generate type definitions
  clean: true, // Clean dist before build
  sourcemap: true,
  external: ['react', '@inngest/realtime', 'uuid'], // Don't bundle peer dependencies
  treeshake: false, // Disable to preserve directives
  minify: false, // Keep readable for debugging
  splitting: true, // Enable splitting to preserve directives
  banner: {
    js: '"use client";', // Add "use client" banner to all JS files
  },
})
