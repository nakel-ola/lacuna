import { useEffect, useLayoutEffect, useRef } from 'react';
import { formatBytes } from '../lib/format';
import { useStore } from '../store';

/** "Move to Trash?" — lists exactly what the dry run resolved before anything is moved. */
export function TrashDialog() {
  const trash = useStore((s) => s.trash);
  const { confirmTrash, closeTrash } = useStore.getState();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (trash && !dialog.open) dialog.showModal();
    if (!trash && dialog.open) dialog.close();
  }, [trash]);

  const n = trash?.preview.items.length ?? 0;
  return (
    <dialog ref={ref} onClose={closeTrash}>
      {trash && (
        <form method="dialog">
          <h2>Move to Trash?</h2>
          <p>
            {n} item{n === 1 ? '' : 's'} totalling {formatBytes(trash.preview.total)} will be moved to the Trash. You can restore them from there.
          </p>
          <ul className="confirm-list">
            {trash.preview.items.map((i) => (
              <li key={i.id}>
                <span>{i.path}</span>
                <span>{formatBytes(i.size)}</span>
              </li>
            ))}
          </ul>
          {trash.error && <p className="error">{trash.error}</p>}
          <div className="dialog-actions">
            <button className="btn-ghost" value="cancel">
              Cancel
            </button>
            <button
              className="btn-dark"
              value="ok"
              disabled={trash.busy}
              onClick={(e) => {
                e.preventDefault();
                confirmTrash();
              }}
            >
              Move to Trash
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export function Tooltip() {
  const tip = useStore((s) => s.tip);
  const ref = useRef<HTMLDivElement>(null);
  // Keep it on screen once its width is known.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !tip) return;
    node.style.left = `${Math.min(tip.x + 14, innerWidth - node.offsetWidth - 8)}px`;
    node.style.top = `${tip.y + 16}px`;
  }, [tip]);
  if (!tip) return null;
  return (
    <div className="tooltip" ref={ref}>
      {tip.text}
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="alert">
      {toast}
    </div>
  );
}

export function DropOverlay() {
  const active = useStore((s) => s.dropActive);
  if (!active) return null;
  return <div className="drop-overlay">Drop a folder to scan it</div>;
}
