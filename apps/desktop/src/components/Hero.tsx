import { Fragment, useMemo, useRef, type CSSProperties } from 'react';
import { baseName, formatBytes, formatPct, truncate } from '../lib/format';
import { useSize } from '../lib/hooks';
import type { ViewNode } from '../lib/types';
import { useStore } from '../store';
import { Icon } from './Icon';

/** File-type shades, darkest first (CSS tokens, so they follow the theme). */
export const CATEGORY_SHADES = ['var(--g0)', 'var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)'];

export function Hero() {
  const folder = useStore((s) => s.folder);
  const { navigate, goUp, reveal } = useStore.getState();
  const chain = folder?.ancestors ?? [];

  return (
    <section className="hero">
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Space by folder</h2>
            <nav className="crumbs" aria-label="Folder path">
              {chain.map((a, i) => (
                <Fragment key={a.id}>
                  {i > 0 && <span>/</span>}
                  <button type="button" title={a.name} onClick={() => navigate(a.id)}>
                    {i ? a.name : baseName(a.name)}
                  </button>
                </Fragment>
              ))}
            </nav>
          </div>
          <div className="icon-btns">
            <button className="icon-btn" type="button" title="Up one level (⌘↑)" disabled={chain.length < 2} onClick={goUp}>
              <Icon name="up" />
            </button>
            <button className="icon-btn" type="button" title="Reveal in Finder" onClick={() => folder?.tree.id != null && reveal(folder.tree.id)}>
              <Icon name="external" />
            </button>
          </div>
        </div>
        <SpaceBars />
      </div>
      <div className="panel">
        <StorageOverview />
      </div>
    </section>
  );
}

// ---- Space by folder (bars) ----

const MAX_BARS = 32;

function barItems(kids: ViewNode[]): ViewNode[] {
  if (kids.length <= MAX_BARS) return kids;
  const shown = kids.slice(0, MAX_BARS - 1);
  const rest = kids.slice(MAX_BARS - 1);
  return [
    ...shown,
    {
      id: null,
      name: `${rest.length} more items`,
      kind: 'other',
      size: rest.reduce((a, c) => a + c.size, 0),
      count: rest.reduce((a, c) => a + c.count, 0),
    },
  ];
}

function SpaceBars() {
  const ref = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = useSize(ref);
  const folder = useStore((s) => s.folder);
  const hot = useStore((s) => s.hot);
  const pinnedBar = useStore((s) => s.pinnedBar);
  const scanning = useStore((s) => s.summary?.status === 'scanning');
  const { setHot, setPinnedBar, navigate, showTip, moveTip, hideTip } = useStore.getState();
  const items = useMemo(() => barItems(folder?.tree.children ?? []), [folder]);

  let chart = null;
  if (W && H && !items.length) {
    chart = (
      <text x={W / 2} y={H / 2} textAnchor="middle" className="axis-label">
        {scanning ? 'Scanning…' : 'This folder is empty'}
      </text>
    );
  } else if (W && H) {
    const top = 30;
    const bottom = H - 4;
    const right = W - 40;
    const max = items[0].size || 1;
    const y = (v: number) => bottom - (v / max) * (bottom - top);
    const slot = right / items.length;
    const barW = Math.max(3, Math.min(64, slot * (items.length < 12 ? 0.62 : 1) - 2));
    const hotIndex = items.findIndex((it) => it.id != null && it.id === hot);
    const active = hotIndex >= 0 ? hotIndex : Math.min(pinnedBar, items.length - 1);

    // Label over the active bar, like a date marker.
    const it = items[active];
    const cx = active * slot + slot / 2;
    const anchor = cx < 90 ? 'start' : cx > right - 90 ? 'end' : 'middle';

    chart = (
      <>
        <defs>
          <linearGradient id="barfade" x1={0} y1={0} x2={0} y2={1}>
            <stop offset={0} style={{ stopColor: 'var(--bar)' }} />
            <stop offset={1} style={{ stopColor: 'var(--bar)', stopOpacity: 0.45 }} />
          </linearGradient>
        </defs>
        {([[1, '100%'], [0.5, '50%'], [0, '0%']] as const).map(([frac, label]) => {
          const yy = y(max * frac);
          return (
            <g key={label}>
              <line x1={0} x2={right} y1={yy} y2={yy} className="gridline" />
              <text x={W - 2} y={yy + 4} textAnchor="end" className="axis-label">
                {label}
              </text>
            </g>
          );
        })}
        {items.map((item, i) => {
          const x = i * slot + (slot - barW) / 2;
          const yy = Math.min(y(item.size), bottom - 2);
          const isActive = i === active;
          return (
            <g key={item.id ?? `more-${i}`}>
              <rect x={x} y={yy} width={barW} height={bottom - yy} rx={1.5} style={{ fill: isActive ? 'var(--ink)' : 'url(#barfade)' }} />
              {!isActive && <rect x={x} y={yy} width={barW} height={2} rx={1} style={{ fill: 'var(--bar-top)' }} />}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                className={item.id != null ? 'bar-hit' : ''}
                onMouseEnter={(e) => {
                  setHot(item.id);
                  showTip(`${item.name} — ${formatBytes(item.size)}`, e.clientX, e.clientY);
                }}
                onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
                onMouseLeave={() => {
                  setHot(null);
                  hideTip();
                }}
                onClick={() => {
                  if (item.kind === 'dir') navigate(item.id);
                  else if (item.id != null) setPinnedBar(i);
                }}
              />
            </g>
          );
        })}
        <text
          x={anchor === 'start' ? cx - barW / 2 : anchor === 'end' ? cx + barW / 2 : cx}
          y={Math.max(14, y(it.size) - 10)}
          textAnchor={anchor}
          className="bar-label"
        >
          {truncate(it.name, 22)} · {formatBytes(it.size)}
        </text>
      </>
    );
  }

  return (
    <div className="bars" ref={ref}>
      <svg viewBox={`0 0 ${W || 1} ${H || 1}`} role="img" aria-label="Space by folder">
        {chart}
      </svg>
    </div>
  );
}

// ---- Storage overview (stacks) ----

function StorageOverview() {
  const ref = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = useSize(ref);
  const tree = useStore((s) => s.folder?.tree);
  const space = useStore((s) => s.summary?.space);
  const allTypes = useStore((s) => s.types);

  const types = allTypes.slice(0, 4).map((t, i) => ({ category: t.category, size: t.size, color: CATEGORY_SHADES[i] }));
  const restTypes = allTypes.slice(4).reduce((a, t) => a + t.size, 0);
  if (restTypes) types.push({ category: 'Other types', size: restTypes, color: CATEGORY_SHADES[4] });
  const elsewhereShade = 'var(--g3)';
  const freeShade = 'var(--g5)';

  const folderSize = tree?.size ?? 0;
  const used = space ? space.total - space.free : folderSize;
  const elsewhere = Math.max(0, used - folderSize);
  const free = space?.free ?? 0;
  const columns = [
    { value: folderSize, parts: types.length ? types : [{ size: folderSize, color: CATEGORY_SHADES[0] }] },
    { value: elsewhere, parts: [{ size: elsewhere, color: elsewhereShade }] },
    { value: free, parts: [{ size: free, color: freeShade }] },
  ];

  let chart = null;
  if (W && H) {
    const max = Math.max(...columns.map((c) => c.value), 1);
    const top = 26;
    const bottom = H - 2;
    const colW = Math.min(96, W / 4.2);
    const gap = (W - colW * 3) / 2;
    // Heights aren't strictly proportional (a folder is often <1% of a disk): the folder column
    // keeps enough height to show its type breakdown, and the labels carry the real numbers.
    const avail = bottom - top;
    const heights = columns.map((c, i) => Math.max(i === 0 ? avail * 0.55 : avail * 0.12, (c.value / max) * avail));
    const GAP = 3;
    const MIN_PART = 5;

    chart = (
      <>
        {/* Soft bands connecting the column tops. */}
        {[0, 1].map((i) => {
          const x1 = i * (colW + gap) + colW;
          const x2 = x1 + gap;
          return (
            <path
              key={`band-${i}`}
              d={`M${x1} ${bottom - heights[i]}L${x2} ${bottom - heights[i + 1]}L${x2} ${bottom}L${x1} ${bottom}Z`}
              style={{ fill: 'var(--text)' }}
              opacity={0.045}
            />
          );
        })}
        {columns.map((col, i) => {
          const x = i * (colW + gap);
          const h = heights[i];
          const parts = col.parts.filter((p) => p.size > 0);
          if (!parts.length) parts.push({ size: 1, color: col.parts[0]?.color ?? freeShade });
          const total = parts.reduce((a, p) => a + p.size, 0);
          const usable = h - GAP * (parts.length - 1) - MIN_PART * parts.length;
          // Largest (darkest) part at the bottom.
          let yy = bottom;
          const rects = parts.map((p, j) => {
            const ph = MIN_PART + Math.max(0, usable) * (p.size / total);
            yy -= ph;
            const rect = <rect key={j} x={x} y={yy} width={colW} height={ph} rx={5} style={{ fill: p.color }} />;
            yy -= GAP;
            return rect;
          });
          return (
            <g key={`col-${i}`}>
              {rects}
              <text x={x + colW / 2} y={bottom - h - 10} textAnchor="middle" className="stack-value">
                {formatBytes(col.value)}
              </text>
            </g>
          );
        })}
      </>
    );
  }

  return (
    <>
      <div className="panel-head">
        <div className="panel-title">
          <h2>Storage overview</h2>
        </div>
      </div>
      <div className="big">
        <span className="big-size">{tree ? formatBytes(tree.size) : '—'}</span>
        {tree && space && <span className="chip">{formatPct(tree.size, space.total)} of disk</span>}
      </div>
      <div className="stacks" ref={ref}>
        <svg viewBox={`0 0 ${W || 1} ${H || 1}`} role="img" aria-label="Storage overview">
          {chart}
        </svg>
      </div>
      <ul className="legend">
        {types.map((t) => (
          <li key={t.category} style={{ '--c': t.color } as CSSProperties}>
            {t.category}
          </li>
        ))}
        <li style={{ '--c': elsewhereShade } as CSSProperties}>Elsewhere on disk</li>
        <li style={{ '--c': freeShade } as CSSProperties}>Free</li>
      </ul>
    </>
  );
}
