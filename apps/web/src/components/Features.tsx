import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

// Bar heights for the mini "Space by folder" chart (share of the largest folder).
const BARS = [100, 59, 35, 20, 12, 7, 4, 2.5, 1.5, 1];
const TYPES = [
  { name: 'Developer', share: 38, shade: 'var(--g0)' },
  { name: 'Apps', share: 25, shade: 'var(--g1)' },
  { name: 'Video', share: 17, shade: 'var(--g2)' },
  { name: 'Photos', share: 12, shade: 'var(--g3)' },
  { name: 'Other', share: 8, shade: 'var(--g4)' },
];
const LARGE = [
  { name: 'Xcode_16.xip', where: 'Downloads', size: '11.2 GB' },
  { name: 'Ubuntu-24.04.iso', where: 'Downloads/VMs', size: '6.1 GB' },
  { name: 'Screen Recording.mov', where: 'Desktop', size: '3.4 GB' },
];

function CardCopy({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="card-copy">
      <span className="card-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">Features</p>
          <h2 id="features-title">Everything you need to get your space back.</h2>
          <p>
            One scan answers the question every Mac owner eventually asks: <em>where did all my storage go?</em>
          </p>
        </header>

        <div className="bento">
          <article className="card card-wide">
            <CardCopy icon="bars" title="Space by folder">
              See which folders take the most space at a glance. Click a bar to open that folder; the chart and table follow
              you down.
            </CardCopy>
            <div className="mini-bars" aria-hidden="true">
              {BARS.map((h, i) => (
                <span key={i} className={i === 0 ? 'on' : undefined} style={{ height: `${Math.max(h, 2)}%` }} />
              ))}
            </div>
          </article>

          <article className="card">
            <CardCopy icon="file" title="Find the big files">
              The 200 largest files under any folder, biggest first.
            </CardCopy>
            <ul className="mini-list" aria-hidden="true">
              {LARGE.map((f) => (
                <li key={f.name}>
                  <span>
                    <b>{f.name}</b>
                    <small>{f.where}</small>
                  </span>
                  <em>{f.size}</em>
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <CardCopy icon="layers" title="Know what kind of space">
              Apps, developer files, video, photos, audio and documents. <code>node_modules</code> and <code>.git</code> count
              as Developer.
            </CardCopy>
            <div className="mini-types" aria-hidden="true">
              <div className="type-bar">
                {TYPES.map((t) => (
                  <span key={t.name} style={{ flex: t.share, background: t.shade }} />
                ))}
              </div>
              <ul>
                {TYPES.slice(0, 3).map((t) => (
                  <li key={t.name}>
                    <i style={{ background: t.shade }} />
                    {t.name}
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="card">
            <CardCopy icon="search" title="Search everything">
              Find any file or folder by name across the whole scan, largest first.
            </CardCopy>
            <div className="mini-search" aria-hidden="true">
              <Icon name="search" size={16} />
              <span>DerivedData</span>
              <kbd>⌘F</kbd>
            </div>
          </article>

          <article className="card">
            <CardCopy icon="lock" title="Private by design">
              No network access, no account, no analytics. Your file list never leaves your Mac.
            </CardCopy>
            <div className="mini-private" aria-hidden="true">
              <span>Network requests</span>
              <b>0</b>
            </div>
          </article>

          <article className="card card-wide card-sage">
            <CardCopy icon="restore" title="Clean up without the fear">
              Collect folders and files with <b>+</b> or drag them onto the Cleanup card. Before anything moves you see every
              path and the total. Everything goes to the Trash, so you can always put it back.
            </CardCopy>
            <div className="mini-dialog" aria-hidden="true">
              <b>Move to Trash?</b>
              <small>2 items totalling 390 GB will be moved to the Trash.</small>
              <ul>
                <li>
                  <code>~/Library/Developer/Xcode/DerivedData</code>
                  <span>212 GB</span>
                </li>
                <li>
                  <code>~/Downloads/VMs</code>
                  <span>178 GB</span>
                </li>
              </ul>
              <div className="mini-dialog-actions">
                <span>Cancel</span>
                <span className="ink">Move to Trash</span>
              </div>
            </div>
          </article>

          <article className="card">
            <CardCopy icon="zap" title="Seriously fast">
              A Rust scanner reads whole folders per system call across 16 threads. Millions of files in seconds.
            </CardCopy>
            <div className="mini-progress" aria-hidden="true">
              <span className="spin" />
              <span>Scanning · 6,224,272 files · 32.0s</span>
            </div>
          </article>

          <article className="card card-wide card-full">
            <CardCopy icon="moon" title="Feels at home on your Mac">
              A native window with a clean custom title bar, light and dark themes that follow your system, and keyboard
              shortcuts for everything.
            </CardCopy>
            <div className="mini-keys" aria-hidden="true">
              <span>
                <kbd>⌘</kbd>
                <kbd>O</kbd> Scan folder
              </span>
              <span>
                <kbd>⌘</kbd>
                <kbd>F</kbd> Search
              </span>
              <span>
                <kbd>⌘</kbd>
                <kbd>R</kbd> Rescan
              </span>
              <span>
                <kbd>⌘</kbd>
                <kbd>↑</kbd> Up a folder
              </span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
