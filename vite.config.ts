import { defineConfig } from 'vite';

// Two separate builds, chosen by --mode, because a script-tag (iife) bundle
// can only have one entry.
const entries = {
  graph: { entry: 'src/index.ts', name: 'DriftField', base: 'driftfield' },
  bubbles: { entry: 'src/overlay/index.ts', name: 'DriftFieldBubbles', base: 'driftfield-bubbles' },
} as const;

export default defineConfig(({ mode }) => {
  const target = entries[mode as keyof typeof entries] ?? entries.graph;
  return {
    build: {
      emptyOutDir: false,
      lib: {
        entry: target.entry,
        name: target.name,
        formats: ['es', 'iife'],
        fileName: (format) => (format === 'es' ? `${target.base}.js` : `${target.base}.iife.js`),
      },
    },
  };
});
