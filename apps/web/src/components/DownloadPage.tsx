import { useEffect } from 'react';
import { DOWNLOAD_FILE, SITE } from '../site';
import { Icon } from './Icon';

const INSTALL = [
  {
    title: 'Open Lacuna.dmg',
    body: 'Find it in your Downloads folder, or click it in your browser’s download list.',
  },
  {
    title: 'Drag Lacuna to Applications',
    body: 'Drop the Lacuna icon onto the Applications folder in the window that opens, then eject the disk image.',
  },
  {
    title: 'Open it',
    body: 'Double-click Lacuna in Applications. It’s signed and notarized by Apple, so it opens like any other app.',
  },
  {
    title: 'Optional: allow Full Disk Access',
    body: (
      <>
        For complete totals, enable Lacuna in <b>System Settings → Privacy &amp; Security → Full Disk Access</b>. Lacuna
        shows a shortcut to it.
      </>
    ),
  },
];

/** /download/: starts the download straight away and walks through installing. */
export function DownloadPage() {
  // The DMG is served as an attachment, so the browser downloads it and stays on this page.
  useEffect(() => {
    const timer = setTimeout(() => window.location.assign(DOWNLOAD_FILE), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="download" aria-labelledby="download-title">
      <div className="container download-inner">
        <img className="download-icon" src="/favicon.svg" width={112} height={112} alt="" />
        <p className="eyebrow">Download</p>
        <h1 id="download-title">Your download is starting…</h1>
        <p className="lede">
          Lacuna for macOS {SITE.minimumMacOS} or later. One app for Apple silicon and Intel Macs. If nothing happens,{' '}
          <a className="text-link" href={DOWNLOAD_FILE}>
            download it directly
          </a>
          .
        </p>
        <div className="hero-actions">
          <a className="btn btn-ink btn-lg" href={DOWNLOAD_FILE}>
            <Icon name="apple" size={20} />
            Download Lacuna.dmg
          </a>
          <a className="btn btn-line btn-lg" href={`${SITE.github}/releases`} rel="noopener">
            All versions &amp; release notes
          </a>
        </div>

        <h2 className="install-title">Install in a minute</h2>
        <ol className="install">
          {INSTALL.map((step, i) => (
            <li key={step.title}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
