import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

// Small illustrations of the app's views, shared by the home page and /features/.
// They're decorative (aria-hidden): the card copy carries the meaning.

export function CardCopy({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
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

// Bar heights for the "Space by folder" chart (share of the largest folder).
const BARS = [100, 59, 35, 20, 12, 7, 4, 2.5, 1.5, 1];

export function MiniBars() {
  return (
    <div className="mini-bars" aria-hidden="true">
      {BARS.map((h, i) => (
        <span key={i} className={i === 0 ? 'on' : undefined} style={{ height: `${Math.max(h, 2)}%` }} />
      ))}
    </div>
  );
}

// Treemap tiles: grid areas on a 6×4 grid, largest first.
const TILES = [
  { area: '1 / 1 / 5 / 4', name: 'Users', size: '512 GB', on: true },
  { area: '1 / 4 / 3 / 6', name: 'Applications', size: '96 GB' },
  { area: '1 / 6 / 3 / 7', name: 'opt', size: '6 GB' },
  { area: '3 / 4 / 5 / 6', name: 'Library', size: '54 GB' },
  { area: '3 / 6 / 5 / 7', name: 'var', size: '21 GB' },
];

export function MiniMap() {
  return (
    <div className="mini-map" aria-hidden="true">
      {TILES.map((t) => (
        <span key={t.name} className={t.on ? 'on' : undefined} style={{ gridArea: t.area }}>
          <b>{t.name}</b>
          <small>{t.size}</small>
        </span>
      ))}
    </div>
  );
}

const TYPES = [
  { name: 'Developer', share: 38, shade: 'var(--g0)' },
  { name: 'Apps', share: 25, shade: 'var(--g1)' },
  { name: 'Video', share: 17, shade: 'var(--g2)' },
  { name: 'Photos', share: 12, shade: 'var(--g3)' },
  { name: 'Other', share: 8, shade: 'var(--g4)' },
];

export function MiniTypes() {
  return (
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
  );
}

export function MiniSearch() {
  return (
    <div className="mini-search" aria-hidden="true">
      <Icon name="search" size={16} />
      <span>DerivedData</span>
      <kbd>⌘F</kbd>
    </div>
  );
}

type Row = { name: string; where: string; size: string; tag?: string };

function MiniList({ rows }: { rows: Row[] }) {
  return (
    <ul className="mini-list" aria-hidden="true">
      {rows.map((f) => (
        <li key={f.name + f.where}>
          <span>
            <b>{f.name}</b>
            <small>{f.where}</small>
          </span>
          {f.tag && <i className={`tag tag-${f.tag.toLowerCase().replace(/\s+/g, '-')}`}>{f.tag}</i>}
          <em>{f.size}</em>
        </li>
      ))}
    </ul>
  );
}

export function MiniLarge() {
  return (
    <MiniList
      rows={[
        { name: 'Xcode_16.xip', where: 'Downloads', size: '11.2 GB' },
        { name: 'Ubuntu-24.04.iso', where: 'Downloads/VMs · 3 years', size: '6.1 GB' },
        { name: 'Screen Recording.mov', where: 'Desktop · 14 months', size: '3.4 GB' },
      ]}
    />
  );
}

export function MiniSuggestions() {
  return (
    <MiniList
      rows={[
        { name: 'Rust build folders', where: '38 projects', size: '165 GB', tag: 'Safe' },
        { name: 'node_modules', where: '112 projects', size: '74 GB', tag: 'Review' },
        { name: 'Xcode build data', where: 'DerivedData', size: '23 GB', tag: 'Safe' },
      ]}
    />
  );
}

export function MiniWorktrees() {
  return (
    <MiniList
      rows={[
        { name: 'fix-login', where: 'lacuna · Claude Code', size: '2.1 GB', tag: 'Active' },
        { name: 'agent-7', where: 'api · Codex · 2 months', size: '4.8 GB', tag: 'Not tracked' },
        { name: 'old-spike', where: 'web · folder deleted', size: '0 B', tag: 'Missing' },
      ]}
    />
  );
}

export function MiniDuplicates() {
  return (
    <div className="mini-group" aria-hidden="true">
      <div className="mini-group-head">
        <b>raw-footage.mov</b>
        <span>3 copies · 8.4 GB to free</span>
      </div>
      <ul>
        <li>
          <code>~/Movies</code>
          <i className="tag tag-safe">Keep</i>
        </li>
        <li>
          <code>~/Desktop/backup</code>
          <span>4.2 GB</span>
        </li>
        <li>
          <code>~/Downloads</code>
          <span>4.2 GB</span>
        </li>
      </ul>
    </div>
  );
}

// Size of one folder across saved scans, oldest first, and the change since the scan before.
const HISTORY = [
  { h: 62, d: '' },
  { h: 64, d: '+4' },
  { h: 63, d: '−1' },
  { h: 71, d: '+15' },
  { h: 70, d: '−2' },
  { h: 79, d: '+18' },
];

export function MiniHistory() {
  return (
    <div className="mini-history" aria-hidden="true">
      {HISTORY.map((b, i) => (
        <span key={i} className={i === HISTORY.length - 1 ? 'on' : undefined}>
          <small>{b.d && `${b.d} GB`}</small>
          <i style={{ height: `${b.h}%` }} />
        </span>
      ))}
    </div>
  );
}

const HIDDEN = [
  { name: 'Your files', share: 69, shade: 'var(--g0)' },
  { name: 'macOS & swap', share: 5, shade: 'var(--g2)' },
  { name: 'Snapshots', share: 4, shade: 'var(--g3)' },
  { name: 'Unreadable', share: 2, shade: 'var(--g4)' },
  { name: 'Free', share: 20, shade: 'var(--g5)' },
];

export function MiniHidden() {
  return (
    <div className="mini-types" aria-hidden="true">
      <div className="type-bar">
        {HIDDEN.map((t) => (
          <span key={t.name} style={{ flex: t.share, background: t.shade }} />
        ))}
      </div>
      <ul className="wrap">
        {HIDDEN.slice(1, 4).map((t) => (
          <li key={t.name}>
            <i style={{ background: t.shade }} />
            {t.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MiniCleanup() {
  return (
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
  );
}

export function MiniNotification() {
  return (
    <div className="mini-note" aria-hidden="true">
      <span className="mini-note-icon">
        <Icon name="disk" size={18} />
      </span>
      <span>
        <b>Macintosh HD is almost full</b>
        <small>Only 8.2 GB left. Open Lacuna to see what's using the space.</small>
      </span>
    </div>
  );
}

export function MiniCli() {
  return (
    <pre className="mini-cli" aria-hidden="true">
      <span className="p">$</span> lacuna scan ~ --top 3{'\n'}
      <span className="c">/Users/you  412 GB · 2841220 files · 9.8s</span>
      {'\n\n'}
      {'     165 GB   40.0%  Projects/\n      74 GB   18.0%  Library/\n      41 GB   10.0%  Movies/'}
    </pre>
  );
}

export function MiniKeys() {
  return (
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
  );
}

export function MiniQuickLook() {
  return (
    <div className="mini-progress" aria-hidden="true">
      <kbd>Space</kbd>
      <span>Previewing raw-footage.mov · 4.2 GB</span>
    </div>
  );
}

export function MiniPrivate() {
  return (
    <div className="mini-private" aria-hidden="true">
      <span>Network requests</span>
      <b>0</b>
    </div>
  );
}

export function MiniProgress() {
  return (
    <div className="mini-progress" aria-hidden="true">
      <span className="spin" />
      <span>Scanning · 6,224,272 files · 32.0s</span>
    </div>
  );
}
