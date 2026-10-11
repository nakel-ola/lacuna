import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { baseName, formatBytes, usedPct } from '../lib/format';
import { useStore } from '../store';
import { Icon } from './Icon';

/** The disk card at the top of the sidebar, and its dropdown of disks. */
export function DiskPicker() {
  const summary = useStore((s) => s.summary);
  const volumes = useStore((s) => s.volumes);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (focusCard = false) => {
    setOpen(false);
    if (focusCard) cardRef.current?.focus();
  };
  const show = () => {
    setOpen(true);
    useStore.getState().loadVolumes();
  };

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('.menu-item')?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!open) return show();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('.menu-item') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const pick = (fn: () => void) => () => {
    close();
    fn();
  };
  const { setTab, startScan, chooseFolder } = useStore.getState();
  const scannedRoot = summary?.root;
  const folderScan = scannedRoot && !volumes.some((v) => v.scanPath === scannedRoot);

  return (
    <div className="disk-picker" ref={pickerRef} onKeyDown={onKeyDown}>
      <button
        ref={cardRef}
        className="disk-card"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
      >
        <Icon name="disk" className="disk-card-icon" />
        <span className="disk-card-text">
          <strong>{summary ? (summary.label.startsWith('/') ? baseName(summary.label) : summary.label) : 'No disk selected'}</strong>
          <small>
            {summary
              ? summary.space
                ? `${formatBytes(summary.space.free)} free · ${formatBytes(summary.space.total)}`
                : summary.root
              : 'Pick a disk to scan'}
          </small>
        </span>
        <Icon name="chevrons" className="disk-card-chev" />
      </button>

      {open && (
        <div
          className="disk-menu"
          role="menu"
          ref={menuRef}
          // Tabbing out closes the menu. WebKit doesn't focus buttons on click, so a mouse press
          // leaves relatedTarget null; clicks outside are handled by the mousedown listener.
          onBlur={(e) => {
            if (e.relatedTarget && !pickerRef.current?.contains(e.relatedTarget)) close();
          }}
        >
          <div className="menu-label">Disks</div>
          {volumes.map((v) => {
            const current = scannedRoot === v.scanPath;
            return (
              <MenuItem
                key={v.scanPath}
                className="menu-disk"
                onClick={pick(() => (current ? setTab('overview') : startScan(v.scanPath, v.name)))}
                icon={<Icon name="disk" className="menu-icon" />}
                check={current}
              >
                <strong>{v.name}</strong>
                <small>
                  {formatBytes(v.free)} free · {formatBytes(v.total)}
                </small>
                <span className="capacity">
                  <i style={{ width: usedPct(v.total, v.free) }} />
                </span>
              </MenuItem>
            );
          })}
          {folderScan && (
            // A scanned folder that isn't a whole disk.
            <MenuItem className="menu-disk" title={scannedRoot} onClick={pick(() => setTab('overview'))} icon={<Icon name="folder" className="menu-icon" />} check>
              <strong>{baseName(scannedRoot)}</strong>
              <small>{scannedRoot}</small>
            </MenuItem>
          )}
          <hr />
          <MenuItem onClick={pick(chooseFolder)} icon={<Icon name="plus" className="menu-icon" />} trailing={<kbd>⌘O</kbd>}>
            Scan a folder…
          </MenuItem>
          <MenuItem onClick={pick(() => setTab('disks'))} icon={<Icon name="grid" className="menu-icon" />}>
            All disks
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem(props: {
  className?: string;
  title?: string;
  onClick: () => void;
  icon: ReactNode;
  check?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${props.className ?? ''}`} title={props.title} onClick={props.onClick}>
      {props.icon}
      <span className="menu-text">{props.children}</span>
      {props.check && <Icon name="check" className="menu-check" />}
      {props.trailing}
    </button>
  );
}
