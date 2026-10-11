import { DownloadPage } from './components/DownloadPage';
import { Features } from './components/Features';
import { Hero } from './components/Hero';
import { Faq, Footer, Nav, OpenSource, Stats, Steps } from './components/Sections';

/** Every page the site has; scripts/prerender.mjs writes one HTML file for each. */
export const ROUTES = ['/', '/download/'] as const;
export type Route = (typeof ROUTES)[number];

export const routeFor = (pathname: string): Route => (pathname.replace(/\/?$/, '/') === '/download/' ? '/download/' : '/');

export function App({ route }: { route: Route }) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        {route === '/download/' ? (
          <DownloadPage />
        ) : (
          <>
            <Hero />
            <Stats />
            <Features />
            <Steps />
            <OpenSource />
            <Faq />
          </>
        )}
      </main>
      <Footer cta={route !== '/download/'} />
    </>
  );
}
