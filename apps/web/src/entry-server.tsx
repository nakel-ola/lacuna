import { StrictMode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { App } from './App';
import { FAQ } from './content';
import { DOWNLOAD_URL, SITE } from './site';

// Used at build time by scripts/prerender.mjs.

export { SITE };

export function renderApp(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

const json = (value: object) => JSON.stringify(value).replace(/</g, '\\u003c');

/** Title, description, canonical URL, social cards and JSON-LD for the page head. */
export function renderHead(): string {
  const canonical = new URL('/', SITE.url).href;
  const ogImage = new URL('/og.png', SITE.url).href;
  const schema = [
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
      downloadUrl: DOWNLOAD_URL,
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
      <title>{SITE.title}</title>
      <meta name="description" content={SITE.description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content="index, follow" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:title" content={SITE.title} />
      <meta property="og:description" content={SITE.description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Lacuna showing which folders fill a Mac's disk" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={SITE.title} />
      <meta name="twitter:description" content={SITE.description} />
      <meta name="twitter:image" content={ogImage} />
      {schema.map((s, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(s) }} />
      ))}
    </>,
  );
}
