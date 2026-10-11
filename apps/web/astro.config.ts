import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { SITE } from './src/site';

export default defineConfig({
  site: SITE.url,
  integrations: [sitemap()],
});
