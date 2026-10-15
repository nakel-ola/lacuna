import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect } from 'react';
import { api } from './lib/api';
import type { Summary } from './lib/types';
import { useStore } from './store';
import { Content } from './components/Content';
import { DisksView } from './components/DisksView';
import { Hero } from './components/Hero';
import { DropOverlay, Toast, Tooltip, TrashDialog } from './components/Overlays';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

let booted = false;

export function App() {
  const tab = useStore((s) => s.tab);

  // Reopen a scan that is still in memory (e.g. after a webview reload), otherwise show the disks.
  useEffect(() => {
    if (booted) return;
    booted = true;
    const { onSummary, setTab } = useStore.getState();
    api
      .currentScan()
      .then((current) => {
        if (!current) return setTab('disks');
        onSummary(current);
        setTab('overview');
      })
      .catch(() => setTab('disks'));
  }, []);

  // Scan progress and completion from the Rust side.
  useEffect(() => {
    const { onProgress } = useStore.getState();
    const unlisten = [
      listen<Summary>('scan-progress', ({ payload }) => onProgress(payload)),
      listen<Summary>('scan-done', ({ payload }) => {
        if (payload.scanId === useStore.getState().summary?.scanId) useStore.getState().onSummary(payload);
      }),
      listen<[number, number]>('duplicates-progress', ({ payload }) => useStore.getState().onDuplicatesProgress(...payload)),
      // "Scan Startup Disk" in the menu bar item.
      listen('scan-startup-disk', async () => {
        const { startScan, showError } = useStore.getState();
        try {
          const boot = (await api.listVolumes()).find((v) => v.isBoot);
          if (boot) startScan(boot.scanPath, boot.name);
        } catch (err) {
          showError(err);
        }
      }),
    ];
    return () => unlisten.forEach((p) => p.then((off) => off()));
  }, []);

  // Folders dropped from Finder.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent(({ payload }) => {
      const { dragging, setDropActive, startScan } = useStore.getState();
      if (dragging) return;
      setDropActive(payload.type === 'enter' || payload.type === 'over');
      if (payload.type === 'drop' && payload.paths.length) startScan(payload.paths[0]);
    });
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      // Space previews the hovered row with Quick Look, like Finder.
      if (e.key === ' ' && !e.metaKey && s.summary && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        s.quickLook();
        return;
      }
      if (!e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 'o') {
        e.preventDefault();
        s.chooseFolder();
      } else if (key === 'f' && s.summary) {
        e.preventDefault();
        document.getElementById('search')?.focus();
      } else if (key === 'r' && s.summary) {
        e.preventDefault();
        s.rescan();
      } else if (key === 'arrowup' && s.summary) {
        e.preventDefault();
        s.goUp();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Topbar />
        {tab === 'disks' ? (
          <DisksView />
        ) : (
          <>
            {/* Changes has its own chart: the folder's size over time. */}
            {tab !== 'changes' && <Hero />}
            <Content />
          </>
        )}
      </main>
      <TrashDialog />
      <Tooltip />
      <Toast />
      <DropOverlay />
    </div>
  );
}
