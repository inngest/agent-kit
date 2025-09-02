import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/hooks/use-agent.ts',
    'src/hooks/use-chat.ts', 
    'src/hooks/use-threads.ts',
    'src/hooks/use-ephemeral-threads.ts',
    'src/hooks/use-conversation-branching.ts',
    'src/hooks/use-edit-message.ts',
    'src/hooks/use-message-actions.ts',
    'src/hooks/use-mobile.ts',
    'src/hooks/use-sidebar.ts',
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
