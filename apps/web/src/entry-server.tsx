import { StrictMode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { App, ROUTES, type Route } from './App';
import { FAQ } from './content';
import { DOWNLOAD_URL, SITE } from './site';

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
};

/** Title, description, canonical URL, social cards and (on the home page) JSON-LD for the page head. */
export function renderHead(route: Route): string {
  const { title, description } = PAGES[route];
  const canonical = new URL(route, SITE.url).href;
  const ogImage = new URL('/og.png', SITE.url).href;
  const schema = [
    // Tells Google the site's name ("Lacuna") for the name shown above search results.
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      alternateName: ['Lacuna for Mac', 'Lacuna disk space analyzer'],
      url: new URL('/', SITE.url).href,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE.name,
      description: SITE.description,
      url: canonical,
      image: ogImage,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: `macOS ${SITE.minimumMacOS} or later`,
      softwareVersion: SITE.version,
      downloadUrl: new URL(DOWNLOAD_URL, SITE.url).href,
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      codeRepository: SITE.github,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];

  return renderToStaticMarkup(
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content="index, follow" />
      <meta property="og:type" content="website" />
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
      {(route === '/' ? schema : []).map((s, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(s) }} />
      ))}
    </>,
  );
}
