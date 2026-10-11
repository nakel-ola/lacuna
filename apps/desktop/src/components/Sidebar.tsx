import { useState } from 'react';
import { formatBytes } from '../lib/format';
import { collectedTotal, useStore, type Tab } from '../store';
import { DiskPicker } from './DiskPicker';
import { Glyph, Icon, type IconName } from './Icon';

export function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Custom title bar: the traffic lights sit in this row's left padding. */}
      <div className="brand" data-tauri-drag-region>
        <Glyph />
        Lacuna
      </div>
      <DiskPicker />
      <Tiles />
      <CleanupCard />
    </aside>
  );
}

function Tiles() {
  const tab = useStore((s) => s.tab);
  const hasScan = useStore((s) => s.summary != null);
  const collected = useStore((s) => s.collector.size);
  const setTab = useStore((s) => s.setTab);

  const tile = (view: Tab, icon: IconName, label: string, extra?: string) => (
    <button
      className={`tile${extra ? ` ${extra}` : ''}${tab === view ? ' active' : ''}`}
      type="button"
      disabled={!hasScan && view !== 'disks'}
      onClick={() => setTab(view)}
    >
      <Icon name={icon} />
      {label}
      {view === 'cleanup' && collected > 0 && <em className="tile-badge">{collected}</em>}
    </button>
  );

  return (
    <nav className="tiles" aria-label="Views">
      {tile('overview', 'grid', 'Overview', 'tile-hero')}
      <div className="tile-grid">
        {tile('large', 'file', 'Large files')}
        {tile('types', 'layers', 'File types')}
        {tile('cleanup', 'trash', 'Cleanup')}
        {tile('disks', 'disk', 'Disks')}
      </div>
    </nav>
  );
}

function CleanupCard() {
  const collector = useStore((s) => s.collector);
  const setTab = useStore((s) => s.setTab);
  const [over, setOver] = useState(false);
  const n = collector.size;

  return (
    <section
      className={`cleanup-card${over ? ' drag-over' : ''}`}
      aria-label="Cleanup"
      onDragOver={(e) => {
        if (!useStore.getState().dragging) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const { dragging, collector, toggleCollect, setDragging } = useStore.getState();
        if (dragging && !collector.has(dragging.id)) toggleCollect(dragging);
        setDragging(null);
      }}
    >
      <div className="cleanup-art" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="cleanup-amount">{formatBytes(collectedTotal(collector))}</div>
      <p className="cleanup-text">
        {n ? (
          `${n} item${n === 1 ? '' : 's'} ready to move to the Trash.`
        ) : (
          <>
            Collect folders and files with <b>+</b>, or drag them here.
          </>
        )}
      </p>
      <button className="btn-dark btn-wide" type="button" disabled={!n} onClick={() => setTab('cleanup')}>
        <span>Review cleanup</span>
        <Icon name="arrow" />
      </button>
    </section>
  );
}
