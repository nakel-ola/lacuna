// Turns the client build into a fully rendered static page: fills dist/index.html with the
// React markup and head tags, then writes sitemap.xml and robots.txt.
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const server = `${root}dist-server`;

const { renderApp, renderHead, SITE } = await import(`${server}/entry-server.js`);

const template = await readFile(`${dist}/index.html`, 'utf8');
if (!template.includes('<!--head-->') || !template.includes('<!--app-->')) {
  throw new Error('dist/index.html is missing the <!--head--> or <!--app--> placeholder');
}
const html = template.replace('<!--head-->', renderHead()).replace('<!--app-->', renderApp());
await writeFile(`${dist}/index.html`, html);

const home = new URL('/', SITE.url).href;
const today = new Date().toISOString().slice(0, 10);
await writeFile(
  `${dist}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${home}</loc><lastmod>${today}</lastmod></url>
</urlset>
`,
);
await writeFile(`${dist}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', SITE.url).href}\n`);

await rm(server, { recursive: true, force: true });
console.log(`prerendered dist/index.html (${(html.length / 1024).toFixed(1)} kB), sitemap.xml, robots.txt`);
