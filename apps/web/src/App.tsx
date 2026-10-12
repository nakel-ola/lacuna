import { DownloadPage } from './components/DownloadPage';
import { Features } from './components/Features';
import { GuidePage } from './components/GuidePage';
import { Hero } from './components/Hero';
import { Demo, Faq, Footer, Nav, OpenSource, Stats, Steps } from './components/Sections';

/** Every page the site has; scripts/prerender.mjs writes one HTML file for each. */
export const ROUTES = ['/', '/download/', '/guides/free-up-space-on-mac/'] as const;
export type Route = (typeof ROUTES)[number];

export const routeFor = (pathname: string): Route => {
  const path = pathname.replace(/\/?$/, '/');
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : '/';
};

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
        ) : route === '/guides/free-up-space-on-mac/' ? (
          <GuidePage />
        ) : (
          <>
            <Hero />
            <Stats />
            <Features />
            <Steps />
            <Demo />
            <OpenSource />
            <Faq />
          </>
        )}
      </main>
      <Footer cta={route !== '/download/'} />
    </>
  );
}
