import type { ReactNode } from 'react';
import type { IconName } from './Icon';
import {
  CardCopy,
  MiniBars,
  MiniCleanup,
  MiniCli,
  MiniDuplicates,
  MiniHidden,
  MiniHistory,
  MiniKeys,
  MiniLarge,
  MiniMap,
  MiniNotification,
  MiniPrivate,
  MiniProgress,
  MiniQuickLook,
  MiniSearch,
  MiniSuggestions,
  MiniTypes,
  MiniWorktrees,
} from './Minis';

interface Feature {
  id: string;
  icon: IconName;
  title: string;
  body: ReactNode;
  mini?: ReactNode;
  /** Wide cards span two columns and sit the illustration beside the copy. */
  wide?: boolean;
  sage?: boolean;
}

interface Group {
  id: string;
  title: string;
  intro: string;
  features: Feature[];
}

const GROUPS: Group[] = [
  {
    id: 'see',
    title: 'See where the space went',
    intro: 'Scan your startup disk, an external drive or any folder. Charts and tables fill in while the scan runs.',
    features: [
      {
        id: 'space-by-folder',
        icon: 'bars',
        title: 'Space by folder',
        body: 'The biggest folders first, as a bar chart. Click a bar to open that folder; the chart and the table follow you down.',
        mini: <MiniBars />,
        wide: true,
      },
      {
        id: 'treemap',
        icon: 'map',
        title: 'Treemap',
        body: 'Switch the chart to a map, two levels deep, where every rectangle is sized by what it holds.',
        mini: <MiniMap />,
      },
      {
        id: 'file-types',
        icon: 'layers',
        title: 'File types',
        body: (
          <>
            Apps, developer files, video, photos, audio, documents and archives. <code>node_modules</code>,{' '}
            <code>.git</code> and <code>target</code> count as Developer.
          </>
        ),
        mini: <MiniTypes />,
      },
      {
        id: 'search',
        icon: 'search',
        title: 'Search',
        body: 'Find any file or folder by name across the whole scan, largest first.',
        mini: <MiniSearch />,
      },
      {
        id: 'disks',
        icon: 'disk',
        title: 'Every disk',
        body: 'Each mounted disk with its free space. Scan one, pick a folder with ⌘O, or drop a folder on the window.',
        mini: <MiniProgress />,
      },
    ],
  },
  {
    id: 'find',
    title: 'Find what you can remove',
    intro: 'Lacuna points out what’s safe to clear, so you don’t have to know where every tool hides its files.',
    features: [
      {
        id: 'suggestions',
        icon: 'spark',
        title: 'Suggestions',
        body: (
          <>
            Space Lacuna recognises as rebuildable: Xcode build data and simulators, Homebrew and package caches, Rust{' '}
            <code>target</code> and JavaScript build folders, <code>node_modules</code>, Docker’s disk image, local AI
            models, iPhone backups and old macOS installers. Each one says why it’s safe, is marked <b>Safe</b> or{' '}
            <b>Review</b>, and names the tool’s own cleanup command where there is one.
          </>
        ),
        mini: <MiniSuggestions />,
        wide: true,
      },
      {
        id: 'large-files',
        icon: 'file',
        title: 'Large and untouched files',
        body: 'The 200 biggest files in any folder, or the biggest files and folders nobody has changed or opened in one or two years.',
        mini: <MiniLarge />,
      },
      {
        id: 'duplicates',
        icon: 'copy',
        title: 'Duplicates',
        body: 'Files of 1 MB or more with exactly the same content, checked by reading every byte. APFS clones and hard links share their storage, so they count once and never inflate the total.',
        mini: <MiniDuplicates />,
      },
      {
        id: 'worktrees',
        icon: 'branch',
        title: 'Git worktrees',
        body: 'Every worktree in every repository, with its size, branch, last activity and the coding agent that made it: Claude Code, Codex, Cursor, Conductor or T3 Code. Leftover and missing worktrees are flagged, with the git command to tidy up.',
        mini: <MiniWorktrees />,
        wide: true,
      },
    ],
  },
  {
    id: 'understand',
    title: 'Understand your disk over time',
    intro: 'Disks fill up slowly. Lacuna remembers past scans so you can see what changed and where the rest of the space is.',
    features: [
      {
        id: 'changes',
        icon: 'history',
        title: 'Changes',
        body: 'Each full scan is summarised on your Mac. The next one shows what grew or shrank, down to the exact folder or file, with a chart of the folder’s size across scans. Click a bar to compare with that scan.',
        mini: <MiniHistory />,
        wide: true,
      },
      {
        id: 'hidden-space',
        icon: 'eye',
        title: 'Hidden space',
        body: 'Why “used” is more than the files you can see: the macOS system volume, swap, local snapshots, folders it couldn’t read, and what macOS calls purgeable.',
        mini: <MiniHidden />,
      },
    ],
  },
  {
    id: 'clean',
    title: 'Clean up safely',
    intro: 'Nothing is ever deleted outright, and nothing moves until you’ve seen the list.',
    features: [
      {
        id: 'cleanup',
        icon: 'restore',
        title: 'Review, then move to the Trash',
        body: (
          <>
            Collect folders and files with <b>+</b> or drag them onto the Cleanup card. Before anything moves you see every
            path and the total. Everything goes to the Trash, so you can always put it back, and the folder you scanned
            can never be removed.
          </>
        ),
        mini: <MiniCleanup />,
        wide: true,
        sage: true,
      },
      {
        id: 'quick-look',
        icon: 'key',
        title: 'Quick Look',
        body: 'Press Space on any row to preview it before you decide, just like in Finder.',
        mini: <MiniQuickLook />,
      },
    ],
  },
  {
    id: 'stay',
    title: 'Stay on top of it',
    intro: 'Catch a full disk before it slows you down, and take your numbers anywhere.',
    features: [
      {
        id: 'menu-bar',
        icon: 'bell',
        title: 'Menu bar and low-space alerts',
        body: 'Free space on your startup disk at a glance, and a notification when it runs low (under 10 GB, or 5% of the disk). Lacuna can stay in the menu bar when you close the window.',
        mini: <MiniNotification />,
      },
      {
        id: 'command-line',
        icon: 'terminal',
        title: 'Command line',
        body: (
          <>
            <code>lacuna scan</code> prints the biggest folders in your terminal, or as JSON for scripts. It only reads;
            it never deletes.
          </>
        ),
        mini: <MiniCli />,
      },
      {
        id: 'export',
        icon: 'download',
        title: 'CSV export',
        body: 'Save any folder to a spreadsheet: every item of 1 MB or more, with its size, file count and last-used date.',
      },
    ],
  },
  {
    id: 'built',
    title: 'Built right',
    intro: 'A small native app that respects your Mac and your privacy.',
    features: [
      {
        id: 'fast',
        icon: 'zap',
        title: 'Seriously fast',
        body: 'A Rust scanner reads a whole folder per system call across 16 threads. 6.2 million files took 32 seconds.',
      },
      {
        id: 'exact',
        icon: 'check',
        title: 'Exact',
        body: (
          <>
            Totals match <code>du</code> to the kilobyte. Hard links count once, symlinks aren’t followed, and other
            disks aren’t entered.
          </>
        ),
      },
      {
        id: 'private',
        icon: 'lock',
        title: 'Private by design',
        body: 'No network access, no account, no analytics. Your file list and scan history never leave your Mac.',
        mini: <MiniPrivate />,
      },
      {
        id: 'notarized',
        icon: 'badge',
        title: 'Signed and notarized',
        body: 'Signed with a Developer ID and checked by Apple, so it opens like any other app.',
      },
      {
        id: 'native',
        icon: 'moon',
        title: 'At home on your Mac',
        body: 'Light and dark themes that follow your system, a clean title bar and keyboard shortcuts for everything. One app for Apple silicon and Intel.',
        mini: <MiniKeys />,
      },
      {
        id: 'open-source',
        icon: 'github',
        title: 'Open source',
        body: 'MIT licensed. Read exactly what it does with your files, or build it yourself.',
      },
    ],
  },
];

function FeatureCard({ f }: { f: Feature }) {
  const cls = ['card', f.wide && 'card-wide', f.sage && 'card-sage', !f.mini && 'card-plain'].filter(Boolean).join(' ');
  return (
    <article className={cls} id={f.id}>
      <CardCopy icon={f.icon} title={f.title}>
        {f.body}
      </CardCopy>
      {f.mini}
    </article>
  );
}

/** /features/: everything Lacuna does, grouped by what you're trying to do. */
export function FeaturesPage() {
  return (
    <div className="features-page">
      <header className="container features-intro">
        <p className="eyebrow">Features</p>
        <h1 id="features-title">Everything Lacuna does.</h1>
        <p className="lede">
          A free, open-source disk space analyzer for Mac. It shows where your space went, points out what’s safe to
          remove, and moves only what you choose to the Trash.
        </p>
        <nav className="chips" aria-label="Feature groups">
          {GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`}>
              {g.title}
            </a>
          ))}
        </nav>
      </header>

      {GROUPS.map((g) => (
        <section className="section feature-group" id={g.id} key={g.id} aria-labelledby={`${g.id}-title`}>
          <div className="container">
            <header className="section-head">
              <h2 id={`${g.id}-title`}>{g.title}</h2>
              <p>{g.intro}</p>
            </header>
            <div className="bento">
              {g.features.map((f) => (
                <FeatureCard f={f} key={f.id} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Feature names for the page's structured data. */
export const FEATURE_LIST = GROUPS.flatMap((g) => g.features.map((f) => f.title));
