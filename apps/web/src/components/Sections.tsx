import { useState } from 'react';
import { FAQ, STATS, STEPS } from '../content';
import { DOWNLOAD_URL, SITE } from '../site';
import { Icon, Logo } from './Icon';

export function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a className="brand" href="/" aria-label="Lacuna home">
          <Logo />
          <span>Lacuna</span>
        </a>
        <nav aria-label="Main">
          <ul className="nav-links">
            <li>
              <a href="/#features">Features</a>
            </li>
            <li>
              <a href="/#how-it-works">How it works</a>
            </li>
            <li>
              <a href="/#faq">FAQ</a>
            </li>
            <li>
              <a href={SITE.github} rel="noopener">
                <Icon name="github" size={16} />
                GitHub
              </a>
            </li>
          </ul>
        </nav>
        <a className="btn btn-soft nav-cta" href={DOWNLOAD_URL}>
          <Icon name="apple" size={17} />
          Download for Mac
        </a>
      </div>
    </header>
  );
}

export function Stats() {
  return (
    <section className="stats" aria-label="Lacuna in numbers">
      <dl className="container stats-row">
        {STATS.map((s) => (
          <div className="stat" key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Steps() {
  return (
    <section className="section" id="how-it-works" aria-labelledby="how-title">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">Three steps. About a minute.</h2>
        </header>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li className="step" key={s.title}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const COMMANDS = [`git clone ${SITE.github}.git`, 'cd lacuna && pnpm install', 'pnpm build'];

export function OpenSource() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMANDS.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <section className="section" id="open-source" aria-labelledby="oss-title">
      <div className="container oss">
        <div className="oss-copy">
          <p className="eyebrow">Open source</p>
          <h2 id="oss-title">Built in the open. Yours to read, fork and improve.</h2>
          <p>
            Lacuna is MIT licensed. The scanner is Rust, the interface is React and TypeScript, and the app is a 6.6 MB
            Tauri bundle. No black boxes: you can read exactly what it does with your files.
          </p>
          <ul className="checks">
            <li>
              <Icon name="check" size={16} />
              Rust scanner using <code>getattrlistbulk</code> and 16 threads
            </li>
            <li>
              <Icon name="check" size={16} />
              Sizes match <code>du</code>; hard links counted once
            </li>
            <li>
              <Icon name="check" size={16} />
              Deletion re-checked in Rust before anything moves
            </li>
          </ul>
          <a className="btn btn-ink" href={SITE.github} rel="noopener">
            <Icon name="github" size={18} />
            Star on GitHub
          </a>
        </div>

        <div className="terminal" role="region" aria-label="Build Lacuna from source">
          <div className="terminal-bar">
            <span className="lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Terminal</span>
            <button
              className={`copy${copied ? ' copied' : ''}`}
              type="button"
              aria-label="Copy commands"
              onClick={copy}
            >
              <Icon name={copied ? 'check' : 'copy'} size={15} />
            </button>
          </div>
          <pre>
            <code>
              <span className="c"># build Lacuna from source</span>
              {COMMANDS.map((cmd) => (
                <span key={cmd}>
                  {'\n'}
                  <span className="p">$</span> {cmd}
                </span>
              ))}
              {'\n'}
              <span className="ok">✓</span> Lacuna.app <span className="c">(6.6 MB)</span>
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="container faq">
        <header className="section-head">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title">Questions, answered.</h2>
        </header>
        <div className="faq-list">
          {FAQ.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>
                <h3>{item.q}</h3>
                <Icon name="plus" size={18} />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer({ cta = true }: { cta?: boolean }) {
  return (
    <>
      {cta && (
        <section className="cta" aria-labelledby="cta-title">
          <div className="container">
            <div className="cta-panel">
              <h2 id="cta-title">Get your space back.</h2>
              <p>Free, private and open source. Your first scan takes about a minute.</p>
              <div className="hero-actions">
                <a className="btn btn-paper btn-lg" href={DOWNLOAD_URL}>
                  <Icon name="apple" size={20} />
                  Download for Mac
                </a>
                <a className="btn btn-ghost-inv btn-lg" href={SITE.github} rel="noopener">
                  <Icon name="github" size={18} />
                  View source
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="footer">
        <div className="container footer-inner">
          <a className="brand" href="/" aria-label="Lacuna home">
            <Logo size={18} />
            <span>Lacuna</span>
          </a>
          <p>
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> Lacuna contributors ·{' '}
            <a href={`${SITE.github}/blob/main/LICENSE`} rel="noopener">
              MIT license
            </a>
          </p>
          <ul>
            <li>
              <a href={SITE.github} rel="noopener">
                GitHub
              </a>
            </li>
            <li>
              <a href={`${SITE.github}/releases`} rel="noopener">
                Releases
              </a>
            </li>
            <li>
              <a href={`${SITE.github}/issues`} rel="noopener">
                Report an issue
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </>
  );
}
