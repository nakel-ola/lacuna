// Turns the client build into fully rendered static pages: one HTML file per route with the
// React markup and head tags, plus sitemap.xml and robots.txt.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const server = `${root}dist-server`;

const { renderApp, renderHead, ROUTES, SITE } = await import(`${server}/entry-server.js`);

const template = await readFile(`${dist}/index.html`, 'utf8');
if (!template.includes('<!--head-->') || !template.includes('<!--app-->')) {
  throw new Error('dist/index.html is missing the <!--head--> or <!--app--> placeholder');
}

for (const route of ROUTES) {
  const html = template.replace('<!--head-->', renderHead(route)).replace('<!--app-->', renderApp(route));
  const dir = `${dist}${route}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}index.html`, html);
  console.log(`prerendered ${route} (${(html.length / 1024).toFixed(1)} kB)`);
}

const today = new Date().toISOString().slice(0, 10);
const urls = ROUTES.map((route) => `  <url><loc>${new URL(route, SITE.url).href}</loc><lastmod>${today}</lastmod></url>`);
await writeFile(
  `${dist}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
await writeFile(`${dist}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', SITE.url).href}\n`);

await rm(server, { recursive: true, force: true });
console.log('wrote sitemap.xml and robots.txt');
