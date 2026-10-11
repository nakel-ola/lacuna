import type { CSSProperties, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { describeError, formatBytes, formatCount, formatPct, kindLabel } from '../lib/format';
import type { Collected, Item } from '../lib/types';
import { collectedTotal, useStore, type Filter } from '../store';
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
      types: st.types,
      collector: st.collector,
      filter: st.filter,
      sortByName: st.sortByName,
      clearSearch: st.clearSearch,
      setFilter: st.setFilter,
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
    title = 'Large files';
    count = formatCount(s.large.length);
    table = <FilesTable items={sorted(s.large)} locationLabel="Folder" />;
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
  const navigate = useStore((s) => s.navigate);
  return (
    <>
      <Header cols="cols-contents" labels={['Name', 'Kind', 'Size', 'Share', 'Files', 'Status', '']} classes={['', 'c-kind', '', '', '', 'c-status', '']} />
      {!items.length && <Empty>{scanning ? 'Scanning…' : 'Nothing here.'}</Empty>}
      {items.map((item, i) => (
        <Row key={item.id ?? `other-${i}`} item={item} cols="cols-contents" onClick={item.kind === 'dir' ? () => navigate(item.id) : undefined}>
          <NameCell item={item} />
          <div className="cell muted c-kind">{kindLabel(item)}</div>
          <div className="cell num">{formatBytes(item.size)}</div>
          <ShareCell part={item.size} whole={total} />
          <div className="cell num muted">{item.kind === 'file' ? '—' : formatCount(item.count)}</div>
          <StatusCell item={item} />
          <ActionsCell item={item} />
        </Row>
      ))}
    </>
  );
}

function FilesTable({ items, locationLabel }: { items: Item[]; locationLabel: string }) {
  const total = useStore((s) => s.folder?.tree.size ?? 0);
  const searching = useStore((s) => s.results != null);
  return (
    <>
      <Header cols="cols-files" labels={['Name', locationLabel, 'Size', 'Share', '']} />
      {!items.length && <Empty>{searching ? 'No matches.' : 'No files yet.'}</Empty>}
      {items.map((item) => (
        <Row key={item.id} item={item} cols="cols-files">
          <NameCell item={item} />
          <div className="cell muted" title={item.location}>
            {item.location}
          </div>
          <div className="cell num">{formatBytes(item.size)}</div>
          <ShareCell part={item.size} whole={total} />
          <ActionsCell item={item} />
        </Row>
      ))}
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
