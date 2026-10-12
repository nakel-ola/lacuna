import { StrictMode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { App, ROUTES, type Route } from './App';
import { FAQ } from './content';
import { AUTHOR, DOWNLOAD_URL, SITE, VIDEO } from './site';

// Used at build time by scripts/prerender.mjs.

export { ROUTES, SITE };

export function renderApp(route: Route): string {
  return renderToString(
    <StrictMode>
      <App route={route} />
    </StrictMode>,
  );
}

const json = (value: object) => JSON.stringify(value).replace(/</g, '\\u003c');

const PAGES: Record<Route, { title: string; description: string }> = {
  '/': { title: SITE.title, description: SITE.description },
  '/download/': {
    title: 'Download Lacuna for Mac',
    description:
      'Download Lacuna, the free and open-source disk space analyzer for Mac. One app for Apple silicon and Intel, macOS 10.15 or later.',
  },
  '/guides/free-up-space-on-mac/': {
    title: 'What’s taking up space on my Mac? How to find and free it',
    description:
      'Find what’s really using your Mac’s storage, from System Data to Xcode caches, node_modules and old backups, and how to clear it safely.',
  },
};

const GUIDE_PUBLISHED = '2026-10-12';

/** Title, description, canonical URL, social cards and structured data for the page head. */
export function renderHead(route: Route): string {
  const { title, description } = PAGES[route];
  const home = new URL('/', SITE.url).href;
  const canonical = new URL(route, SITE.url).href;
  const ogImage = new URL('/og.png', SITE.url).href;
  const author = { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url };

  const schema: object[] = [];
  if (route === '/') {
    schema.push(
      // Tells Google the site's name ("Lacuna") for the name shown above search results.
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE.name,
        alternateName: ['Lacuna for Mac', 'Lacuna disk space analyzer'],
        url: home,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: SITE.name,
        description: SITE.description,
        url: home,
        image: ogImage,
        screenshot: ogImage,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: `macOS ${SITE.minimumMacOS} or later`,
        softwareVersion: SITE.version,
        downloadUrl: new URL(DOWNLOAD_URL, SITE.url).href,
        license: 'https://opensource.org/licenses/MIT',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author,
        codeRepository: SITE.github,
        sameAs: [SITE.github, VIDEO.youtube],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: 'Lacuna: see what’s filling your Mac',
        description: 'A 30-second tour of Lacuna, the free, open-source disk space analyzer for Mac.',
        thumbnailUrl: new URL(VIDEO.poster, SITE.url).href,
        uploadDate: VIDEO.uploadDate,
        duration: VIDEO.duration,
        contentUrl: new URL(VIDEO.file, SITE.url).href,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    );
  }
  if (route === '/guides/free-up-space-on-mac/') {
    schema.push(
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description,
        image: ogImage,
        author,
        publisher: { '@type': 'Organization', name: SITE.name, url: home },
        datePublished: GUIDE_PUBLISHED,
        dateModified: GUIDE_PUBLISHED,
        mainEntityOfPage: canonical,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE.name, item: home },
          { '@type': 'ListItem', position: 2, name: 'Free up space on a Mac', item: canonical },
        ],
      },
    );
  }

  return renderToStaticMarkup(
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content="index, follow" />
      <meta property="og:type" content={route === '/guides/free-up-space-on-mac/' ? 'article' : 'website'} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Lacuna showing which folders fill a Mac's disk" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {schema.map((s, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(s) }} />
      ))}
    </>,
  );
}
