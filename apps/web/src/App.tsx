import { Features } from './components/Features';
import { Hero } from './components/Hero';
import { Faq, Footer, Nav, OpenSource, Stats, Steps } from './components/Sections';

export function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Stats />
        <Features />
        <Steps />
        <OpenSource />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
