// Everything the site links to, in one place. `url` is the production domain:
// canonical links, the sitemap and social cards are built from it.
export const SITE = {
  name: 'Lacuna',
  url: 'https://lacuna.nakel.app',
  github: 'https://github.com/nakel-ola/lacuna',
  title: 'Lacuna: free, open-source disk space analyzer for Mac',
  description:
    'Lacuna is a free, open-source disk space analyzer for Mac. Scan millions of files in seconds, see where your storage went, and clear it safely.',
  version: '0.1.0',
  minimumMacOS: '10.15',
};

export const DOWNLOAD_URL = `${SITE.github}/releases/latest`;
