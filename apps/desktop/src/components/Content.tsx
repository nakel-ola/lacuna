import { useState, type CSSProperties, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../lib/api';
import { describeError, formatAge, formatBytes, formatCount, formatDate, formatDelta, formatPct, kindLabel } from '../lib/format';
import type { Collected, Item, Repo, Suggestion, Worktree } from '../lib/types';
import { collectedTotal, useStore, type Filter, type LargeMode } from '../store';
import { CATEGORY_SHADES } from './Hero';
import { Icon } from './Icon';

interface Pill {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['dirs', 'Folders'],
  ['files', 'Files'],
  ['large', 'Over 1 GB'],
];

const LARGE_MODES: [LargeMode, string][] = [
  ['largest', 'Largest'],
  ['year', 'Untouched 1 year+'],
  ['twoYears', '2 years+'],
];

const matchesFilter = (filter: Filter, k: Item) =>
  filter === 'all' ? true : filter === 'dirs' ? k.kind === 'dir' : filter === 'files' ? k.kind === 'file' : k.size >= 1e9;

/** The table under the charts: folder contents, search results, large files, types or cleanup. */
export function Content() {
  const s = useStore(
    useShallow((st) => ({
      summary: st.summary,
      tab: st.tab,
      folder: st.folder,
      results: st.results,
      query: st.query,
      large: st.large,
      largeMode: st.largeMode,
      types: st.types,
      suggestions: st.suggestions,
      worktrees: st.worktrees,
      duplicates: st.duplicates,
      changes: st.changes,
      collector: st.collector,
      filter: st.filter,
      sortByName: st.sortByName,
      clearSearch: st.clearSearch,
      setFilter: st.setFilter,
      setLargeMode: st.setLargeMode,
      toggleSort: st.toggleSort,
    })),
  );
  if (!s.summary) return null;

  const sorted = <T extends { name: string }>(items: T[]) =>
    s.sortByName ? [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) : items;

  let title = 'Contents';
  let count = '';
  let pills: Pill[] = [];
  let sortable = true;
  let table: ReactNode = null;

  if (s.results) {
    title = `Results for “${s.query.trim()}”`;
    count = formatCount(s.results.length);
    pills = [{ label: 'Clear search', onClick: s.clearSearch }];
    table = <FilesTable items={sorted(s.results)} locationLabel="Location" />;
  } else if (s.tab === 'overview') {
    const kids = s.folder?.tree.children ?? [];
    count = `${formatCount(s.folder?.tree.count ?? 0)} files`;
    pills = FILTERS.map(([key, label]) => ({
      label,
      count: kids.filter((k) => matchesFilter(key, k)).length,
      active: s.filter === key,
      onClick: () => s.setFilter(key),
    }));
    table = <ContentsTable items={sorted(kids.filter((k) => matchesFilter(s.filter, k)))} />;
  } else if (s.tab === 'large') {
    const untouched = s.largeMode !== 'largest';
    title = untouched ? 'Untouched' : 'Large files';
    count = formatCount(s.large.length);
    pills = LARGE_MODES.map(([key, label]) => ({ label, active: s.largeMode === key, onClick: () => s.setLargeMode(key) }));
    table = (
      <>
        {untouched && (
          <p className="note">
            Files and folders nothing has changed or opened in {s.largeMode === 'year' ? 'a year' : 'two years'}, going by their modified, accessed
            and “last opened” dates. Folders with anything Lacuna couldn’t read are left out.
          </p>
        )}
        <FilesTable items={sorted(s.large)} locationLabel="Folder" showAge />
      </>
    );
  } else if (s.tab === 'suggestions') {
    title = 'Suggestions';
    count = s.suggestions ? formatBytes(s.suggestions.reduce((a, x) => a + x.size, 0)) : '';
    sortable = false;
    table = <SuggestionsList />;
  } else if (s.tab === 'worktrees') {
    title = 'Git worktrees';
    count = s.worktrees ? formatBytes(s.worktrees.reduce((a, r) => a + r.size, 0)) : '';
    sortable = false;
    table = <WorktreesList />;
  } else if (s.tab === 'duplicates') {
    title = 'Duplicates';
    const groups = s.duplicates?.groups ?? [];
    count = groups.length ? `${formatBytes(groups.reduce((a, g) => a + g.reclaimable, 0))} extra` : '';
    sortable = false;
    table = <DuplicatesList />;
  } else if (s.tab === 'changes') {
    title = 'Changes';
    count = s.changes ? formatDelta(s.changes.after - s.changes.before) || 'No change' : '';
    sortable = false;
    table = <ChangesView />;
  } else if (s.tab === 'hidden') {
    title = 'Hidden space';
    sortable = false;
    table = <HiddenSpaceView />;
  } else if (s.tab === 'types') {
    title = 'File types';
    count = formatCount(s.types.length);
    sortable = false;
    table = <TypesTable />;
  } else if (s.tab === 'cleanup') {
    title = 'Cleanup';
    count = formatCount(s.collector.size);
    sortable = false;
    table = <CleanupTable />;
  }

  return (
    <section className="content">
      <div className="content-head">
        <h2>{title}</h2>
        {count && <span className="count">{count}</span>}
        <div className="pills">
          {pills.map((p) => (
            <button key={p.label} type="button" className={`pill${p.active ? ' active' : ''}`} onClick={p.onClick}>
              {p.label}
              {p.count != null && <em>{formatCount(p.count)}</em>}
            </button>
          ))}
        </div>
        {sortable && (
          <button className="icon-btn" type="button" title={s.sortByName ? 'Sorted by name' : 'Sorted by size'} onClick={s.toggleSort}>
            <Icon name="sort" />
          </button>
        )}
      </div>
      <div className="table" role="table">
        {table}
      </div>
    </section>
  );
}

// ---- Rows and cells ----

function Header({ cols, labels, classes = [] }: { cols: string; labels: string[]; classes?: string[] }) {
  return (
    <div className={`thead ${cols}`}>
      {labels.map((t, i) => (
        <div key={i} className={`cell ${classes[i] ?? ''}`}>
          {t}
        </div>
      ))}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <div className="empty-state">{children}</div>;

function Row({ item, cols, onClick, children }: { item: Item; cols: string; onClick?: () => void; children: ReactNode }) {
  const hot = useStore((s) => item.id != null && s.hot === item.id);
  const { setHot, setDragging } = useStore.getState();
  const id = item.id;
  return (
    <div
      className={`trow ${cols}${hot ? ' hot' : ''}${onClick ? ' clickable' : ''}`}
      draggable={id != null}
      onDragStart={(e) => {
        if (id == null) return;
        setDragging({ id, name: item.name, size: item.size, kind: item.kind, location: item.location ?? '' });
        e.dataTransfer.setData('text/plain', item.name);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setDragging(null)}
      onMouseEnter={() => id != null && setHot(id)}
      onMouseLeave={() => id != null && setHot(null)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function NameCell({ item }: { item: Pick<Item, 'kind' | 'name'> }) {
  return (
    <div className="cell name" title={item.name}>
      <Icon name={item.kind === 'dir' ? 'folder' : item.kind === 'other' ? 'layers' : 'file'} className="kind-icon" />
      <span>{item.name}</span>
    </div>
  );
}

function ShareCell({ part, whole }: { part: number; whole: number }) {
  const pct = whole ? (part / whole) * 100 : 0;
  return (
    <div className="cell share">
      <div className="share-track">
        <i style={{ width: `${Math.min(100, pct).toFixed(2)}%` }} />
      </div>
      <span>{formatPct(part, whole)}</span>
    </div>
  );
}

function StatusCell({ item }: { item: Item }) {
  const collected = useStore((s) => item.id != null && s.collector.has(item.id));
  if (collected)
    return (
      <div className="cell c-status">
        <span className="status" style={{ '--c': 'var(--ink)' } as CSSProperties}>
          In cleanup
        </span>
      </div>
    );
  if (item.error)
    return (
      <div className="cell c-status">
        <span className="status" style={{ '--c': 'var(--warn)' } as CSSProperties}>
          {describeError(item.error)}
        </span>
      </div>
    );
  return <div className="cell muted c-status" />;
}

function ActionsCell({ item }: { item: Item }) {
  const collected = useStore((s) => item.id != null && s.collector.has(item.id));
  const { openItem, reveal, toggleCollect } = useStore.getState();
  const id = item.id;
  if (id == null) return <div className="cell actions" />;
  return (
    <div className="cell actions">
      <button
        type="button"
        className="btn-ghost"
        onClick={(e) => {
          e.stopPropagation();
          if (item.kind === 'dir') openItem(item);
          else reveal(id);
        }}
      >
        {item.kind === 'dir' ? 'Open' : 'Reveal'}
      </button>
      <button
        type="button"
        className={`icon-btn${collected ? ' on' : ''}`}
        title={collected ? 'Remove from cleanup' : 'Add to cleanup'}
        onClick={(e) => {
          e.stopPropagation();
          toggleCollect(item);
        }}
      >
        <Icon name={collected ? 'check' : 'plus'} />
      </button>
    </div>
  );
}

// ---- Tables ----

function ContentsTable({ items }: { items: Item[] }) {
  const total = useStore((s) => s.folder?.tree.size ?? 0);
  const scanning = useStore((s) => s.summary?.status === 'scanning');
  const comparing = useStore((s) => s.summary?.baseline != null);
  const navigate = useStore((s) => s.navigate);
  return (
    <>
      <Header
        cols="cols-contents"
        labels={['Name', 'Kind', 'Size', 'Share', comparing ? 'Change' : 'Files', 'Status', '']}
        classes={['', 'c-kind', '', '', '', 'c-status', '']}
      />
      {!items.length && <Empty>{scanning ? 'Scanning…' : 'Nothing here.'}</Empty>}
      {items.map((item, i) => (
        <Row key={item.id ?? `other-${i}`} item={item} cols="cols-contents" onClick={item.kind === 'dir' ? () => navigate(item.id) : undefined}>
          <NameCell item={item} />
          <div className="cell muted c-kind">{kindLabel(item)}</div>
          <div className="cell num">{formatBytes(item.size)}</div>
          <ShareCell part={item.size} whole={total} />
          {comparing ? (
            <DeltaCell delta={'delta' in item ? item.delta : undefined} />
          ) : (
            <div className="cell num muted">{item.kind === 'file' ? '—' : formatCount(item.count)}</div>
          )}
          <StatusCell item={item} />
          <ActionsCell item={item} />
        </Row>
      ))}
    </>
  );
}

function FilesTable({ items, locationLabel, showAge }: { items: Item[]; locationLabel: string; showAge?: boolean }) {
  const total = useStore((s) => s.folder?.tree.size ?? 0);
  const searching = useStore((s) => s.results != null);
  const cols = showAge ? 'cols-files-age' : 'cols-files';
  return (
    <>
      <Header cols={cols} labels={showAge ? ['Name', locationLabel, 'Size', 'Last used', ''] : ['Name', locationLabel, 'Size', 'Share', '']} />
      {!items.length && <Empty>{searching ? 'No matches.' : showAge ? 'Nothing untouched that long.' : 'No files yet.'}</Empty>}
      {items.map((item) => (
        <FileRow key={item.id} item={item} cols={cols} total={total} showAge={showAge} />
      ))}
    </>
  );
}

function FileRow({ item, cols, total, showAge }: { item: Item; cols: string; total: number; showAge?: boolean }) {
  return (
    <Row item={item} cols={cols}>
      <NameCell item={item} />
      <div className="cell muted" title={item.location}>
        {item.location}
      </div>
      <div className="cell num">{formatBytes(item.size)}</div>
      {showAge ? <div className="cell muted">{formatAge('time' in item ? item.time : 0)}</div> : <ShareCell part={item.size} whole={total} />}
      <ActionsCell item={item} />
    </Row>
  );
}

function DeltaCell({ delta }: { delta?: number }) {
  if (delta == null) return <div className="cell num muted">—</div>;
  return <div className={`cell num delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`}>{formatDelta(delta) || 'No change'}</div>;
}

const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;

/** Text with `backticked` commands shown as code. */
const Inline = ({ text }: { text: string }) => (
  <>{text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</>
);

// ---- Suggestions ----

const PREVIEW_ROWS = 5;

function SuggestionsList() {
  const suggestions = useStore((s) => s.suggestions);
  if (!suggestions) return <Empty>Looking for things you can safely remove…</Empty>;
  if (!suggestions.length) return <Empty>No suggestions for this folder. Lacuna knows about developer caches, app caches, old installers, device backups and more.</Empty>;
  return (
    <>
      <Note>
        Things Lacuna recognises that can be rebuilt or downloaded again. <b>Safe</b> items come back on their own when needed. <b>Review</b> items
        are recoverable, but check them first. Nothing is removed until you confirm in Cleanup, and then it goes to the Trash.
      </Note>
      {suggestions.map((sg) => (
        <SuggestionCard key={sg.id} sg={sg} />
      ))}
    </>
  );
}

function SuggestionCard({ sg }: { sg: Suggestion }) {
  const [open, setOpen] = useState(false);
  const total = useStore((s) => s.folder?.tree.size ?? 0);
  const allIn = useStore((s) => sg.items.every((i) => s.collector.has(i.id)));
  const { collectMany } = useStore.getState();
  const shown = open ? sg.items : sg.items.slice(0, PREVIEW_ROWS);
  const showAge = sg.items.length > 1;
  const cols = showAge ? 'cols-files-age' : 'cols-files';
  return (
    <section className="group">
      <div className="group-head">
        <div className="group-title">
          <strong>{sg.label}</strong>
          <span className={`risk ${sg.risk}`}>{sg.risk === 'safe' ? 'Safe' : 'Review'}</span>
        </div>
        <span className="group-size">{formatBytes(sg.size)}</span>
        <button type="button" className="btn-ghost group-btn" disabled={allIn} onClick={() => collectMany(sg.items)}>
          {allIn ? 'All in cleanup' : sg.items.length === 1 ? 'Add to cleanup' : `Add all ${sg.items.length}`}
        </button>
      </div>
      <p className="group-why">
        <Inline text={sg.why} />
        {sg.command && (
          <>
            {' '}
            Or run <code>{sg.command}</code>.
          </>
        )}
      </p>
      {shown.map((item) => (
        <FileRow key={item.id} item={item} cols={cols} total={total} showAge={showAge} />
      ))}
      {sg.items.length > PREVIEW_ROWS && (
        <button type="button" className="btn-ghost more" onClick={() => setOpen(!open)}>
          {open ? 'Show fewer' : `Show all ${sg.items.length}`}
        </button>
      )}
    </section>
  );
}

// ---- Git worktrees ----

const STATE_LABEL: Record<Worktree['state'], string> = {
  active: '',
  locked: 'Locked',
  missing: 'Already deleted',
  orphaned: 'Repository gone',
  untracked: 'Not tracked by git',
};

function WorktreesList() {
  const repos = useStore((s) => s.worktrees);
  if (!repos) return <Empty>Looking for git worktrees…</Empty>;
  if (!repos.length) return <Empty>No git worktrees here. Lacuna lists every linked checkout of the repositories it finds in this folder.</Empty>;
  return (
    <>
      <Note>
        Coding agents and <code>git worktree add</code> create a full checkout for each task, often with its own <code>node_modules</code> and build
        folders, and don’t always remove it. Removing a worktree keeps its branch and commits in the repository; only uncommitted changes in it are
        lost, so check those first. “Not tracked by git” folders are leftovers git has already forgotten, usually safe to remove. Locked
        worktrees are left out of “Add all”.
      </Note>
      {repos.map((r) => (
        <RepoCard key={r.path} repo={r} />
      ))}
    </>
  );
}

function RepoCard({ repo }: { repo: Repo }) {
  const [open, setOpen] = useState(false);
  const removable = repo.worktrees.filter((w) => w.item && w.state !== 'locked').map((w) => w.item!);
  const allIn = useStore((s) => removable.every((i) => s.collector.has(i.id)));
  const { collectMany } = useStore.getState();
  const shown = open ? repo.worktrees : repo.worktrees.slice(0, PREVIEW_ROWS);
  const missing = repo.worktrees.filter((w) => w.state === 'missing').length;
  const prune = `git -C "${repo.path}" worktree prune`;
  return (
    <section className="group">
      <div className="group-head">
        <div className="group-title">
          <strong>{repo.name}</strong>
          <span className="group-path" title={repo.path}>
            {repo.path}
          </span>
        </div>
        <span className="group-size">{formatBytes(repo.size)}</span>
        {removable.length > 0 && (
          <button type="button" className="btn-ghost group-btn" disabled={allIn} onClick={() => collectMany(removable)}>
            {allIn ? 'All in cleanup' : removable.length === 1 ? 'Add to cleanup' : `Add all ${removable.length}`}
          </button>
        )}
      </div>
      <p className="group-why">
        {repo.exists ? (
          <>
            {repo.worktrees.length} worktree{repo.worktrees.length === 1 ? '' : 's'}
            {missing > 0 && `, ${missing} already deleted`}. After moving worktrees to the Trash, run <code>{prune}</code> so git forgets them, or
            remove them with <code>git worktree remove</code> instead.
          </>
        ) : (
          <>These checkouts belong to a repository that no longer exists, so they can’t be updated or merged anymore.</>
        )}
      </p>
      {shown.map((w) => (
        <WorktreeRow key={w.path} wt={w} />
      ))}
      {repo.worktrees.length > PREVIEW_ROWS && (
        <button type="button" className="btn-ghost more" onClick={() => setOpen(!open)}>
          {open ? 'Show fewer' : `Show all ${repo.worktrees.length}`}
        </button>
      )}
    </section>
  );
}

function WorktreeRow({ wt }: { wt: Worktree }) {
  const state = STATE_LABEL[wt.state];
  const cells = (
    <>
      <div className="cell name" title={wt.path}>
        <Icon name="branch" className="kind-icon" />
        <div className="wt-name">
          <span>{wt.name}</span>
          {(wt.agent || state) && (
            <span className="wt-tags">
              {wt.agent && <span className="tag">{wt.agent}</span>}
              {state && <span className="tag">{state}</span>}
            </span>
          )}
        </div>
      </div>
      <div className="cell muted" title={wt.branch}>
        {wt.branch ?? '—'}
      </div>
      <div className="cell num">{wt.item ? formatBytes(wt.item.size) : '—'}</div>
      <div className="cell muted">{wt.item ? formatAge(wt.item.time) : wt.state === 'missing' ? '' : 'Not in this scan'}</div>
    </>
  );
  if (!wt.item)
    return (
      <div className="trow cols-worktrees gone" title={wt.path}>
        {cells}
        <div className="cell actions" />
      </div>
    );
  const item = { ...wt.item, location: wt.path };
  return (
    <Row item={item} cols="cols-worktrees">
      {cells}
      <ActionsCell item={item} />
    </Row>
  );
}

// ---- Duplicates ----

function DuplicatesList() {
  const duplicates = useStore((s) => s.duplicates);
  const scanning = useStore((s) => s.summary?.status === 'scanning');
  const folderName = useStore((s) => s.folder?.ancestors.at(-1)?.name ?? 'this folder');
  const total = useStore((s) => s.folder?.tree.size ?? 0);
  const { findDuplicates, cancelDuplicates, collectMany } = useStore.getState();
  const collector = useStore((s) => s.collector);

  if (!duplicates)
    return (
      <div className="empty-state">
        <p>Find files with exactly the same content (1 MB and up) in {folderName}. Lacuna reads them to compare, which can take a while on a big disk.</p>
        <button type="button" className="btn-dark" disabled={scanning} onClick={findDuplicates}>
          <Icon name="copy" />
          Find duplicates
        </button>
      </div>
    );
  if (duplicates.busy) {
    const { done, total } = duplicates;
    return (
      <div className="empty-state busy">
        <span className="spinner" />
        <span>{total ? `Comparing files… ${formatBytes(done)} of ${formatBytes(total)}` : 'Looking for files that might match…'}</span>
        {total > 0 && (
          <div className="progress">
            <i style={{ width: `${Math.min(100, (done / total) * 100).toFixed(1)}%` }} />
          </div>
        )}
        <button type="button" className="btn-ghost" onClick={cancelDuplicates}>
          Stop
        </button>
      </div>
    );
  }
  if (!duplicates.groups.length) return <Empty>No duplicate files of 1 MB or more here.</Empty>;
  return (
    <>
      <Note>
        Same content, byte for byte. Copies that share storage (hard links and APFS clones) count once, since removing them frees nothing. “Keep one”
        collects every copy but the first.
      </Note>
      {duplicates.groups.map((g) => {
        const extras = g.items.slice(1);
        const done = extras.every((i) => collector.has(i.id));
        return (
          <section className="group" key={g.items[0].id}>
            <div className="group-head">
              <div className="group-title">
                <strong title={g.items[0].name}>{g.items[0].name}</strong>
                <span className="cell muted">
                  {g.copies} copies · {formatBytes(g.size)} each
                </span>
              </div>
              <span className="group-size">{formatBytes(g.reclaimable)}</span>
              <button type="button" className="btn-ghost group-btn" disabled={done} onClick={() => collectMany(extras)}>
                {done ? 'Extras in cleanup' : 'Keep one'}
              </button>
            </div>
            {g.items.map((item) => (
              <FileRow key={item.id} item={item} cols="cols-files" total={total} />
            ))}
          </section>
        );
      })}
    </>
  );
}

// ---- Changes ----

const shortDate = (secs: number) =>
  new Date(secs * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Most scans shown as bars; older ones still count in the summary. */
const TREND_BARS = 12;

/** The explored folder's size in each saved scan, as bars ending with this scan. Click one to compare with it. */
function TrendChart() {
  const trend = useStore((s) => s.trend);
  const now = useStore((s) => s.folder?.tree.size ?? 0);
  const name = useStore((s) => s.folder?.ancestors.at(-1)?.name ?? '');
  const baseline = useStore((s) => s.summary?.baseline?.id);
  const canGoUp = useStore((s) => (s.folder?.ancestors.length ?? 0) > 1);
  const { setBaseline, clearHistory, goUp, showTip, moveTip, hideTip } = useStore.getState();
  if (!trend.length) return null;

  const all = [...trend.map((p) => ({ ...p, now: false })), { taken: Math.floor(Date.now() / 1000), bytes: now, snapshot: undefined, now: true }];
  const first = all[0];
  const shown = all.slice(-TREND_BARS);
  const lo = Math.min(...shown.map((p) => p.bytes));
  const hi = Math.max(...shown.map((p) => p.bytes));
  // Sizes of one folder sit close together, so bars start from the smallest
  // shown size; the change labels carry the real differences.
  const height = (b: number) => `${hi > lo ? 22 + ((b - lo) / (hi - lo)) * 78 : 100}%`;

  return (
    <section className="trend" aria-label={`${name} over time`}>
      <div className="trend-head">
        <div>
          <h3>
            {canGoUp && (
              <button type="button" className="icon-btn" title="Up one folder" onClick={goUp}>
                <Icon name="up" />
              </button>
            )}
            {name} over time
          </h3>
          <p>
            {formatDelta(now - first.bytes) || 'No change'} since {formatDate(first.taken)} · {all.length} scans. Click a scan to compare with it.
          </p>
        </div>
        <button type="button" className="btn-ghost group-btn" onClick={clearHistory}>
          Forget saved scans
        </button>
      </div>
      <div className="trend-bars">
        {shown.map((p) => {
          const prev = all[all.indexOf(p) - 1];
          const diff = prev ? p.bytes - prev.bytes : 0;
          const base = p.snapshot != null && p.snapshot === baseline;
          const label = p.now ? 'Now' : shortDate(p.taken);
          return (
            <button
              key={p.taken}
              type="button"
              className={`trend-col${p.now ? ' now' : ''}${base ? ' base' : ''}`}
              disabled={!p.snapshot}
              aria-pressed={base}
              onClick={() => p.snapshot && setBaseline(base ? null : p.snapshot)}
              onMouseEnter={(e) =>
                showTip(
                  `${p.now ? 'This scan' : formatDate(p.taken)} — ${formatBytes(p.bytes)}${base ? ' · compared' : p.snapshot ? ' · click to compare' : ''}`,
                  e.clientX,
                  e.clientY,
                )
              }
              onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
              onMouseLeave={hideTip}
            >
              <span className={`trend-delta delta${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>{prev ? formatDelta(diff) || '±0' : ''}</span>
              <span className="trend-track">
                <i style={{ height: height(p.bytes) }} />
              </span>
              <span className="trend-size">{formatBytes(p.bytes)}</span>
              <span className="trend-date">{label}</span>
              {base && <span className="tag">Compared</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ChangesView() {
  const changes = useStore((s) => s.changes);
  const snapshots = useStore((s) => s.snapshots);
  const baseline = useStore((s) => s.summary?.baseline);
  const status = useStore((s) => s.summary?.status);
  const { setBaseline, clearHistory, openItem, reveal, toggleCollect } = useStore.getState();
  const collector = useStore((s) => s.collector);

  const trend = useStore((s) => s.trend);
  const picker = snapshots.length > 0 && !trend.length && (
    <div className="changes-bar">
      <label>
        Compared with
        <select value={baseline?.id ?? ''} onChange={(e) => setBaseline(e.target.value || null)}>
          <option value="">Nothing</option>
          {snapshots.map((sn) => (
            <option key={sn.id} value={sn.id}>
              {formatDate(sn.taken)} · {formatBytes(sn.bytes)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn-ghost" onClick={clearHistory}>
        Forget saved scans
      </button>
    </div>
  );

  if (status === 'scanning') return <Empty>Changes appear once the scan finishes.</Empty>;
  if (!snapshots.length)
    return (
      <Empty>
        {status === 'cancelled'
          ? 'Stopped scans aren’t saved. Run a full scan to start tracking changes.'
          : 'This is the first scan of this folder. Scan it again another day to see what grew. Lacuna keeps a small summary of each scan on this Mac.'}
      </Empty>
    );
  return (
    <>
      <TrendChart />
      {picker}
      {!changes ? (
        <Empty>Pick an earlier scan to compare with.</Empty>
      ) : (
        <>
          <Note>
            {formatBytes(changes.before)} on {formatDate(changes.baseline.taken)} → {formatBytes(changes.after)} now. Below are the most specific folders
            and files that changed by 50 MB or more.
          </Note>
          <Header cols="cols-changes" labels={['Name', 'Location', 'Before', 'Now', 'Change', '']} />
          {!changes.hotspots.length && <Empty>Nothing changed by more than 50 MB.</Empty>}
          {changes.hotspots.map((c, i) => {
            const delta = c.after - c.before;
            const id = c.id;
            const row = id == null ? null : { id, name: c.name, location: c.location, kind: c.kind, size: c.after, count: 0, time: 0 };
            return (
              <div key={`${c.location}/${c.name}-${i}`} className="trow cols-changes">
                <NameCell item={c} />
                <div className="cell muted" title={c.location}>
                  {c.location}
                </div>
                <div className="cell num muted">{formatBytes(c.before)}</div>
                <div className="cell num">{c.after ? formatBytes(c.after) : 'Gone'}</div>
                <DeltaCell delta={delta} />
                <div className="cell actions">
                  {row && (
                    <>
                      <button type="button" className="btn-ghost" onClick={() => (row.kind === 'dir' ? openItem(row) : reveal(row.id))}>
                        {row.kind === 'dir' ? 'Open' : 'Reveal'}
                      </button>
                      <button
                        type="button"
                        className={`icon-btn${collector.has(row.id) ? ' on' : ''}`}
                        title={collector.has(row.id) ? 'Remove from cleanup' : 'Add to cleanup'}
                        onClick={() => toggleCollect(row)}
                      >
                        <Icon name={collector.has(row.id) ? 'check' : 'plus'} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

// ---- Hidden space ----

const ROLE_INFO: Record<string, [string, string]> = {
  System: ['macOS', 'The sealed, read-only system volume. It can’t be changed or cleaned.'],
  VM: ['Swap and sleep image', 'Memory macOS has paged out to disk. It shrinks after a restart or when apps quit.'],
  Preboot: ['Preboot', 'Files needed to start up, including Safari and system components (cryptexes).'],
  Recovery: ['Recovery', 'macOS Recovery, for repairing or reinstalling macOS.'],
  Update: ['Software updates', 'Staged macOS updates.'],
};

function HiddenSpaceView() {
  const hidden = useStore((s) => s.hidden);
  const scanning = useStore((s) => s.summary?.status === 'scanning');
  const { loadHidden } = useStore.getState();
  if (!hidden) return <Empty>{scanning ? 'Available once the scan finishes.' : 'Measuring…'}</Empty>;
  const used = hidden.total - hidden.free;

  type Line = { label: string; size: number | null; why: ReactNode; strong?: boolean };
  const lines: Line[] = [{ label: 'Files Lacuna found', size: hidden.scanned, why: 'Everything in this scan. Explore it in Overview.', strong: true }];
  if (hidden.wholeVolume) {
    const snaps = hidden.snapshots.length;
    lines.push({
      label: 'Not found by the scan',
      size: hidden.unaccounted,
      strong: true,
      why: (
        <>
          Used by this volume but not visible as files:
          {snaps > 0 && ` ${snaps} local snapshot${snaps === 1 ? '' : 's'} (Time Machine or system updates),`}
          {hidden.unreadable > 0 && ` ${formatCount(hidden.unreadable)} folder${hidden.unreadable === 1 ? '' : 's'} Lacuna couldn’t read,`} and filesystem
          metadata.
          {hidden.unreadable > 0 && ' Allowing Full Disk Access and rescanning makes this smaller.'}
        </>
      ),
    });
  }
  for (const v of hidden.volumes.filter((v) => !v.scanned && v.used > 0)) {
    const [label, why] = ROLE_INFO[v.role] ?? [v.name || 'Other volume', 'Another volume sharing this disk’s space.'];
    lines.push({ label, size: v.used, why });
  }
  const accounted = lines.reduce((a, l) => a + (l.size ?? 0), 0);
  // Rounding and unlisted volumes.
  if (hidden.volumes.length && used > accounted + 1e9) lines.push({ label: 'Other', size: used - accounted, why: 'Space the volumes don’t itemise (APFS overhead).' });

  const shades = ['var(--g0)', 'var(--g2)', 'var(--g1)', 'var(--g3)', 'var(--g4)', 'var(--g3)', 'var(--g4)'];
  return (
    <>
      {!hidden.wholeVolume && (
        <Note>This scan covers one folder, so space outside it can’t be broken down. Scan the whole disk from Disks to see everything.</Note>
      )}
      <div className="hidden-bar" role="img" aria-label="How the disk is used">
        {lines.map((l, i) =>
          l.size ? <i key={l.label} title={`${l.label}: ${formatBytes(l.size)}`} style={{ flexGrow: l.size, background: shades[i % shades.length] }} /> : null,
        )}
        <i title={`Free: ${formatBytes(hidden.free)}`} style={{ flexGrow: hidden.free, background: 'var(--g5)' }} />
      </div>
      <p className="note">
        {formatBytes(used)} used of {formatBytes(hidden.total)} · {formatBytes(hidden.free)} free
        {hidden.purgeable ? ` · macOS can free about ${formatBytes(hidden.purgeable)} more on its own (purgeable space)` : ''}
      </p>
      <Header cols="cols-hidden" labels={['Where', 'Size', 'What it is']} />
      {lines.map((l, i) => (
        <div key={l.label} className="trow cols-hidden">
          <div className="cell name">
            <span className="kind-icon swatch" style={{ background: shades[i % shades.length] }} />
            <span>{l.label}</span>
          </div>
          <div className={`cell num${l.strong ? '' : ' muted'}`}>{l.size == null ? '—' : formatBytes(l.size)}</div>
          <div className="cell wrap muted">{l.why}</div>
        </div>
      ))}
      {hidden.snapshots.length > 0 && (
        <section className="group">
          <div className="group-head">
            <div className="group-title">
              <strong>Local snapshots</strong>
            </div>
          </div>
          <p className="group-why">
            macOS deletes these on its own as space runs low, so they rarely need attention. To remove Time Machine’s now, run{' '}
            <code>tmutil thinlocalsnapshots / 999999999999</code> in Terminal.
          </p>
          <ul className="plain-list">
            {hidden.snapshots.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
      {hidden.unreadable > 0 && (
        <div className="fda">
          <Icon name="lock" />
          <div>
            <strong>{formatCount(hidden.unreadable)} folders couldn’t be read</strong>
            <small>Their size is unknown. Allow Full Disk Access, then rescan.</small>
          </div>
          <button className="btn-ghost" type="button" onClick={loadHidden}>
            Refresh
          </button>
          <button className="btn-dark" type="button" onClick={() => api.openFullDiskAccessSettings()}>
            Open Settings
          </button>
        </div>
      )}
    </>
  );
}

function TypesTable() {
  const types = useStore((s) => s.types);
  const total = types.reduce((a, t) => a + t.size, 0);
  return (
    <>
      <Header cols="cols-types" labels={['Type', 'Files', 'Size', 'Share']} />
      {!types.length && <Empty>No files yet.</Empty>}
      {types.map((t, i) => (
        <div key={t.category} className="trow cols-types">
          <div className="cell name">
            <span className="kind-icon" style={{ background: CATEGORY_SHADES[Math.min(i, 4)] }} />
            <span>{t.category}</span>
          </div>
          <div className="cell num muted">{formatCount(t.count)}</div>
          <div className="cell num">{formatBytes(t.size)}</div>
          <ShareCell part={t.size} whole={total} />
        </div>
      ))}
    </>
  );
}

function CleanupTable() {
  const collector = useStore((s) => s.collector);
  const scanning = useStore((s) => s.summary?.status === 'scanning');
  const { toggleCollect, reviewTrash } = useStore.getState();
  const items: Collected[] = [...collector.values()];
  return (
    <>
      <Header cols="cols-cleanup" labels={['Name', 'Location', 'Size', '']} />
      {!items.length && <Empty>Nothing collected yet. Use + on any folder or file, or drag rows onto the Cleanup card.</Empty>}
      {items.map((item) => (
        <div key={item.id} className="trow cols-cleanup">
          <NameCell item={item} />
          <div className="cell muted" title={item.location}>
            {item.location}
          </div>
          <div className="cell num">{formatBytes(item.size)}</div>
          <div className="cell actions">
            <button type="button" className="btn-ghost" onClick={() => toggleCollect(item)}>
              Remove
            </button>
          </div>
        </div>
      ))}
      {items.length > 0 && (
        <div className="table-foot">
          <span className="cell muted">Up to</span>
          <strong>{formatBytes(collectedTotal(collector))}</strong>
          <button type="button" className="btn-dark" disabled={scanning} onClick={reviewTrash}>
            <Icon name="trash" />
            Move to Trash…
          </button>
        </div>
      )}
    </>
  );
}
