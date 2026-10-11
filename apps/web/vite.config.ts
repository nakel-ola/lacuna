import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { imagetools } from 'vite-imagetools';

// `pnpm build` also renders the page to static HTML (scripts/prerender.mjs) so search engines and
// link previews get the full content without running JavaScript.
export default defineConfig({
  plugins: [react(), imagetools()],
  server: { port: 4321 },
});
