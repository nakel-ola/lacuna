import { formatBytes, formatCount, formatElapsed } from '../lib/format';
import { useTheme, type Theme } from '../lib/hooks';
import { useStore } from '../store';
import { Icon, type IconName } from './Icon';

const THEME_ICONS: Record<Theme, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

export function Topbar() {
  const summary = useStore((s) => s.summary);
  const query = useStore((s) => s.query);
  const { setQuery, clearSearch, cancelScan, rescan, chooseFolder } = useStore.getState();
  const { theme, cycle } = useTheme();
  const scanning = summary?.status === 'scanning';

  return (
    <header className="topbar" data-tauri-drag-region>
      <label className="search">
        <Icon name="search" />
        <input
          id="search"
          type="search"
          placeholder="Search files and folders…"
          autoComplete="off"
          spellCheck={false}
          disabled={!summary}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              clearSearch();
              e.currentTarget.blur();
            }
          }}
        />
        <kbd>⌘F</kbd>
      </label>
      <div className="scan-status" role="status" aria-live="polite" title={summary?.stats.current || ''} data-tauri-drag-region>
        <ScanStatus />
      </div>
      {scanning && (
        <button className="btn-ghost" type="button" onClick={cancelScan}>
          <Icon name="stop" />
          Stop
        </button>
      )}
      {summary && !scanning && (
        <button className="btn-ghost" type="button" title="Rescan (⌘R)" onClick={rescan}>
          <Icon name="refresh" />
          Rescan
        </button>
      )}
      <button className="icon-btn" type="button" title={`Appearance: ${theme[0].toUpperCase()}${theme.slice(1)}`} onClick={cycle}>
        <Icon name={THEME_ICONS[theme]} />
      </button>
      <button className="btn-dark" type="button" title="Scan a folder (⌘O)" onClick={chooseFolder}>
        <Icon name="plus" />
        Scan folder
      </button>
    </header>
  );
}

function ScanStatus() {
  const s = useStore((st) => st.summary);
  if (!s) return null;
  const st = s.stats;
  if (s.status === 'scanning') {
    return (
      <>
        <span className="spinner" />
        Scanning · {formatCount(st.files)} files · {formatBytes(st.bytes)} · {formatElapsed(s.elapsedMs)}
      </>
    );
  }
  const errors = st.errors ? ` · ${formatCount(st.errors)} unreadable` : '';
  return <>{`${s.status === 'cancelled' ? 'Stopped' : 'Scanned'} ${formatCount(st.files)} files in ${formatElapsed(s.elapsedMs)}${errors}`}</>;
}
