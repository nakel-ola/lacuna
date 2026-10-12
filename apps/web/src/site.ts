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

/** The 30-second promo, hosted on the site and on YouTube. */
export const VIDEO = {
  file: '/video/lacuna-promo.mp4',
  poster: '/video/lacuna-promo-poster.jpg',
  youtube: 'https://youtu.be/i05RICUVkk4',
  uploadDate: '2026-10-11',
  duration: 'PT30S',
};

export const AUTHOR = { name: 'Olamilekan Nunu', url: 'https://github.com/nakel-ola' };

/** Our own download page: starts the download and shows install steps. */
export const DOWNLOAD_URL = '/download/';
/** The latest release's DMG. The release workflow always uploads it under this name. */
export const DOWNLOAD_FILE = `${SITE.github}/releases/latest/download/Lacuna.dmg`;
