import type { ReactNode } from 'react';
import { DOWNLOAD_URL } from '../site';
import { Icon } from './Icon';

/** One place where space commonly hides, with how to clear it safely. */
interface Culprit {
  id: string;
  title: string;
  where: string[];
  body: ReactNode;
}

const CULPRITS: Culprit[] = [
  {
    id: 'xcode',
    title: 'Xcode build data and simulators',
    where: ['~/Library/Developer/Xcode/DerivedData', '~/Library/Developer/Xcode/iOS DeviceSupport', '~/Library/Developer/CoreSimulator'],
    body: (
      <>
        <code>DerivedData</code> holds build caches that Xcode recreates the next time you build, so it is safe to remove.
        Old device support files and simulators for iOS versions you no longer test against can take tens of gigabytes;
        remove simulators you don’t need with <code>xcrun simctl delete unavailable</code>.
      </>
    ),
  },
  {
    id: 'node-modules',
    title: 'node_modules and other dependency folders',
    where: ['~/Projects/*/node_modules', '~/.npm', '~/.cache'],
    body: (
      <>
        Every JavaScript project keeps its own <code>node_modules</code>, and old projects add up quickly. Delete them in
        projects you aren’t working on; your package manager reinstalls them when you need them again. Rust{' '}
        <code>target</code> folders and Python virtual environments behave the same way.
      </>
    ),
  },
  {
    id: 'docker',
    title: 'Docker images and volumes',
    where: ['~/Library/Containers/com.docker.docker'],
    body: (
      <>
        Docker Desktop stores everything in one large disk image that only grows. Remove unused images, containers and
        build cache with <code>docker system prune</code>, or use the cleanup options in Docker Desktop.
      </>
    ),
  },
  {
    id: 'backups',
    title: 'iPhone and iPad backups',
    where: ['~/Library/Application Support/MobileSync/Backup'],
    body: (
      <>
        Local device backups are often 10–100 GB each. Manage them from Finder: select your device in the sidebar, then{' '}
        <b>Manage Backups…</b>, and delete the ones you no longer need.
      </>
    ),
  },
  {
    id: 'downloads',
    title: 'Downloads, installers and disk images',
    where: ['~/Downloads', '~/Desktop'],
    body: (
      <>
        Installers (<code>.dmg</code>, <code>.pkg</code>, <code>.xip</code>), ISOs, virtual machine disks and old screen
        recordings are usually the largest single files on a Mac. Lacuna’s <b>Large files</b> view lists them biggest
        first.
      </>
    ),
  },
  {
    id: 'caches',
    title: 'App caches',
    where: ['~/Library/Caches'],
    body: (
      <>
        Apps keep caches to load faster and recreate them when needed. Clearing a large cache is usually safe; quit the
        app first. Leave folders you don’t recognise alone if you aren’t sure what they belong to.
      </>
    ),
  },
  {
    id: 'system-data',
    title: '“System Data” and purgeable space',
    where: ['/private/var', 'Time Machine local snapshots'],
    body: (
      <>
        macOS groups caches, logs, local Time Machine snapshots and virtual memory under <b>System Data</b>. Snapshots are
        removed automatically when space runs low, which is why macOS calls some space “purgeable”. You can list them with{' '}
        <code>tmutil listlocalsnapshots /</code>. A folder scan shows which of these folders are actually large on your
        Mac.
      </>
    ),
  },
];

/** /guides/free-up-space-on-mac/: a practical guide that answers the search people actually make. */
export function GuidePage() {
  return (
    <article className="article" aria-labelledby="guide-title">
      <div className="container article-inner">
        <p className="eyebrow">Guide · macOS storage</p>
        <h1 id="guide-title">What’s taking up space on your Mac, and how to free it</h1>
        <p className="lede">
          When your Mac says the disk is almost full, the built-in Storage settings only show broad categories like
          “System Data” or “Documents”. Here’s how to find the folders and files that are really using the space, and
          which of them are safe to remove.
        </p>

        <nav className="toc" aria-label="On this page">
          <b>On this page</b>
          <ol>
            <li>
              <a href="#check-storage">Check storage in System Settings</a>
            </li>
            <li>
              <a href="#scan">See every folder with a disk space analyzer</a>
            </li>
            <li>
              <a href="#culprits">The usual space hogs</a>
            </li>
            <li>
              <a href="#trash">Empty the Trash</a>
            </li>
          </ol>
        </nav>

        <section id="check-storage">
          <h2>1. Check storage in System Settings</h2>
          <p>
            Open <b>System Settings → General → Storage</b> (on macOS Monterey and earlier: <b>Apple menu → About This Mac
            → Storage</b>). You’ll see how much space is used and a coloured bar split into categories, plus a few
            recommendations like emptying the Trash automatically.
          </p>
          <p>
            It’s a good overview, but it doesn’t tell you <em>which</em> folders are big. “System Data” in particular can
            be tens of gigabytes with no way to see what’s inside.
          </p>
        </section>

        <section id="scan">
          <h2>2. See every folder with a disk space analyzer</h2>
          <p>
            A disk space analyzer scans the whole disk and shows the size of every folder, so you can follow the space
            down to the exact files. <a className="text-link" href="/">Lacuna</a> is a free, open-source one for Mac:
          </p>
          <ol className="steps-list">
            <li>
              <b>Pick your disk.</b> Open Lacuna and choose <b>Macintosh HD</b>, or scan a single folder with{' '}
              <kbd>⌘</kbd>
              <kbd>O</kbd>. Millions of files take seconds.
            </li>
            <li>
              <b>Follow the biggest bars.</b> The <b>Space by folder</b> chart shows the largest folders first. Click one
              to open it and keep going until you reach what’s using the space.
            </li>
            <li>
              <b>Check Large files and File types.</b> <b>Large files</b> lists the 200 biggest files, and{' '}
              <b>File types</b> shows how much is apps, developer files, video, photos and documents.
            </li>
            <li>
              <b>Collect what you don’t need.</b> Press <b>+</b> on any row, review the exact list of paths, then move them
              to the Trash.
            </li>
          </ol>
          <p className="note">
            For the most complete picture, allow Lacuna in <b>System Settings → Privacy &amp; Security → Full Disk
            Access</b>. Without it, macOS hides the size of protected folders such as Mail and Safari data.
          </p>
          <a className="btn btn-ink" href={DOWNLOAD_URL}>
            <Icon name="apple" size={18} />
            Download Lacuna, free
          </a>
        </section>

        <section id="culprits">
          <h2>3. The usual space hogs</h2>
          <p>These are the places that most often turn out to be large. Check them in your scan before anything else.</p>
          <div className="culprits">
            {CULPRITS.map((c) => (
              <div className="culprit" id={c.id} key={c.id}>
                <h3>{c.title}</h3>
                <ul className="paths">
                  {c.where.map((w) => (
                    <li key={w}>
                      <code>{w}</code>
                    </li>
                  ))}
                </ul>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="trash">
          <h2>4. Empty the Trash</h2>
          <p>
            Files you move to the Trash still use space until you empty it. Lacuna always moves items to the Trash rather
            than deleting them, so you can put anything back. When you’re sure, Control-click the Trash in the Dock and
            choose <b>Empty Trash</b>.
          </p>
          <p>
            A good rule: only remove things you recognise. Build caches, downloads and old backups are safe to clear;
            folders inside <code>/System</code> and <code>/Library</code> that you don’t recognise are best left alone.
          </p>
        </section>
      </div>
    </article>
  );
}
