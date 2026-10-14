import { create } from 'zustand';
import { api } from './lib/api';
import type {
  Changes,
  Collected,
  DuplicateGroup,
  FolderView,
  HiddenSpace,
  Hit,
  Item,
  SnapshotInfo,
  Suggestion,
  Summary,
  TrashResult,
  TypeTotal,
  Volume,
} from './lib/types';

export type Tab = 'overview' | 'large' | 'types' | 'suggestions' | 'duplicates' | 'changes' | 'hidden' | 'cleanup' | 'disks';
export type Filter = 'all' | 'dirs' | 'files' | 'large';
/** Large files: biggest overall, or biggest untouched for 1 or 2 years. */
export type LargeMode = 'largest' | 'year' | 'twoYears';
export type Chart = 'bars' | 'map';

const CHART_KEY = 'lacuna-chart';
const storedChart = (): Chart => {
  try {
    return localStorage.getItem(CHART_KEY) === 'map' ? 'map' : 'bars';
  } catch {
    return 'bars';
  }
};

interface State {
  tab: Tab;
  volumes: Volume[];
  fullDiskAccess: boolean;
  summary: Summary | null;
  /** Folder being explored (null = scan root). */
  viewId: number | null;
  /** The explored folder with its direct children. */
  folder: FolderView | null;
  types: TypeTotal[];
  large: Hit[];
  largeMode: LargeMode;
  chart: Chart;
  suggestions: Suggestion[] | null;
  /** Duplicate search for the folder `scope`; null until started. */
  duplicates: { scope: number | null; busy: boolean; groups: DuplicateGroup[]; done: number; total: number } | null;
  changes: Changes | null;
  snapshots: SnapshotInfo[];
  hidden: HiddenSpace | null;
  /** Search hits, or null when not searching. */
  results: Hit[] | null;
  query: string;
  filter: Filter;
  sortByName: boolean;
  /** Item highlighted across the chart and the table. */
  hot: number | null;
  /** Bar labelled when nothing is hovered. */
  pinnedBar: number;
  collector: Map<number, Collected>;
  /** Row being dragged towards the Cleanup card. */
  dragging: Collected | null;
  dropActive: boolean;
  trash: { preview: TrashResult; busy: boolean; error: string | null } | null;
  tip: { text: string; x: number; y: number } | null;
  toast: string | null;

  setTab(tab: Tab): void;
  loadVolumes(): Promise<void>;
  chooseFolder(): Promise<void>;
  startScan(path: string, label?: string): Promise<void>;
  rescan(): void;
  cancelScan(): void;
  onSummary(summary: Summary): void;
  onProgress(summary: Summary): void;
  refresh(withInsights: boolean): Promise<void>;
  navigate(id: number | null): void;
  goUp(): void;
  loadLarge(): Promise<void>;
  setLargeMode(mode: LargeMode): void;
  setChart(chart: Chart): void;
  loadTab(): void;
  loadSuggestions(): Promise<void>;
  findDuplicates(): Promise<void>;
  cancelDuplicates(): void;
  onDuplicatesProgress(done: number, total: number): void;
  loadChanges(): Promise<void>;
  setBaseline(snapshot: string | null): Promise<void>;
  clearHistory(): Promise<void>;
  loadHidden(): Promise<void>;
  quickLook(id?: number | null): void;
  exportCsv(): Promise<void>;
  collectMany(items: Item[]): void;
  setQuery(query: string): void;
  clearSearch(): void;
  setFilter(filter: Filter): void;
  toggleSort(): void;
  setHot(id: number | null): void;
  setPinnedBar(index: number): void;
  openItem(item: Item): void;
  reveal(id: number): void;
  toggleCollect(item: Item | Collected): void;
  setDragging(item: Collected | null): void;
  setDropActive(active: boolean): void;
  reviewTrash(): Promise<void>;
  confirmTrash(): Promise<void>;
  closeTrash(): void;
  showTip(text: string, x: number, y: number): void;
  moveTip(x: number, y: number): void;
  hideTip(): void;
  showError(err: unknown): void;
  notify(message: string): void;
}

let liveTimer: ReturnType<typeof setInterval> | undefined;
let liveTick = 0;
let folderReq = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>()((set, get) => ({
  tab: 'disks',
  volumes: [],
  fullDiskAccess: true,
  summary: null,
  viewId: null,
  folder: null,
  types: [],
  large: [],
  largeMode: 'largest',
  chart: storedChart(),
  suggestions: null,
  duplicates: null,
  changes: null,
  snapshots: [],
  hidden: null,
  results: null,
  query: '',
  filter: 'all',
  sortByName: false,
  hot: null,
  pinnedBar: 0,
  collector: new Map(),
  dragging: null,
  dropActive: false,
  trash: null,
  tip: null,
  toast: null,

  // ---- Navigation ----

  setTab(tab) {
    const s = get();
    if (tab !== 'disks' && !s.summary) return;
    set({ tab });
    if (tab !== 'overview' && s.results) get().clearSearch();
    if (tab === 'disks') get().loadVolumes();
    else get().loadTab();
  },

  async loadVolumes() {
    try {
      const [volumes, fullDiskAccess] = await Promise.all([api.listVolumes(), api.hasFullDiskAccess()]);
      set({ volumes, fullDiskAccess });
    } catch (err) {
      get().showError(err);
    }
  },

  // ---- Scanning ----

  async chooseFolder() {
    try {
      const path = await api.chooseFolder();
      if (path) get().startScan(path);
    } catch (err) {
      get().showError(err);
    }
  },

  async startScan(path, label) {
    try {
      const summary = await api.startScan(path, label);
      set({
        viewId: null,
        folder: null,
        types: [],
        large: [],
        suggestions: null,
        duplicates: null,
        changes: null,
        snapshots: [],
        hidden: null,
        results: null,
        query: '',
        collector: new Map(),
        pinnedBar: 0,
        hot: null,
      });
      get().onSummary(summary);
      get().setTab('overview');
    } catch (err) {
      get().showError(err);
    }
  },

  rescan() {
    const s = get().summary;
    if (s && s.status !== 'scanning') get().startScan(s.root, s.label);
  },

  cancelScan() {
    api.cancelScan().catch(get().showError);
  },

  onSummary(summary) {
    set({ summary });
    get().refresh(true);
    clearInterval(liveTimer);
    // Redraw the partially built tree while scanning; insights every third tick.
    if (summary.status === 'scanning') {
      liveTimer = setInterval(() => get().refresh(++liveTick % 3 === 0), 1000);
    }
  },

  onProgress(summary) {
    if (summary.scanId === get().summary?.scanId) set({ summary });
  },

  // ---- Data ----

  async refresh(withInsights) {
    if (!get().summary) return;
    const id = get().viewId;
    const req = ++folderReq;
    try {
      // The treemap draws two levels; the bars only need one.
      const folder = await api.getTree(id, get().chart === 'map' ? 2 : 1);
      if (req !== folderReq) return;
      set({ folder });
    } catch {
      if (req !== folderReq) return;
      // The folder may have been deleted; fall back to the scan root.
      if (id != null) get().navigate(null);
      return;
    }
    if (withInsights) {
      try {
        set({ types: await api.typeBreakdown(id) });
      } catch {}
      get().loadTab();
    }
  },

  navigate(id) {
    // Duplicates are slow to find, so they're searched again only on request.
    if (get().duplicates?.busy) api.cancelDuplicates().catch(() => {});
    set({ viewId: id, pinnedBar: 0, hot: null, duplicates: null });
    get().refresh(true);
  },

  goUp() {
    const chain = get().folder?.ancestors ?? [];
    if (chain.length > 1) get().navigate(chain[chain.length - 2].id);
  },

  async loadLarge() {
    const { viewId, largeMode } = get();
    try {
      const large =
        largeMode === 'largest' ? await api.largestFiles(viewId, 200) : await api.untouchedItems(viewId, largeMode === 'year' ? 365 : 730, 200);
      if (get().largeMode === largeMode && get().viewId === viewId) set({ large });
    } catch {
      set({ large: [] });
    }
  },

  setLargeMode(largeMode) {
    set({ largeMode, large: [] });
    get().loadLarge();
  },

  setChart(chart) {
    set({ chart });
    try {
      localStorage.setItem(CHART_KEY, chart);
    } catch {}
    get().refresh(false);
  },

  /** Loads what the current tab shows, for the current folder. */
  loadTab() {
    const tab = get().tab;
    if (tab === 'large') get().loadLarge();
    else if (tab === 'suggestions') get().loadSuggestions();
    else if (tab === 'changes') get().loadChanges();
    else if (tab === 'hidden') get().loadHidden();
  },

  async loadSuggestions() {
    const viewId = get().viewId;
    try {
      const suggestions = await api.suggestions(viewId);
      if (get().viewId === viewId) set({ suggestions });
    } catch (err) {
      get().showError(err);
    }
  },

  async findDuplicates() {
    const scope = get().viewId;
    set({ duplicates: { scope, busy: true, groups: [], done: 0, total: 0 } });
    try {
      const groups = await api.findDuplicates(scope);
      const current = get().duplicates;
      // A stopped search returns nothing; leave the start screen up instead.
      if (current?.scope === scope && current.busy) set({ duplicates: { ...current, busy: false, groups } });
    } catch (err) {
      set({ duplicates: null });
      get().showError(err);
    }
  },

  cancelDuplicates() {
    set({ duplicates: null });
    api.cancelDuplicates().catch(get().showError);
  },

  onDuplicatesProgress(done, total) {
    const current = get().duplicates;
    if (current?.busy) set({ duplicates: { ...current, done, total } });
  },

  async loadChanges() {
    const viewId = get().viewId;
    try {
      const [changes, snapshots] = await Promise.all([api.getChanges(viewId), api.listSnapshots()]);
      if (get().viewId === viewId) set({ changes, snapshots });
    } catch (err) {
      get().showError(err);
    }
  },

  async setBaseline(snapshot) {
    try {
      set({ summary: await api.setBaseline(snapshot) });
      get().refresh(true);
    } catch (err) {
      get().showError(err);
    }
  },

  async clearHistory() {
    try {
      set({ summary: await api.clearHistory(), changes: null, snapshots: [] });
      get().refresh(true);
    } catch (err) {
      get().showError(err);
    }
  },

  async loadHidden() {
    try {
      set({ hidden: await api.hiddenSpace() });
    } catch (err) {
      get().showError(err);
    }
  },

  quickLook(id) {
    api.quickLook(id === undefined ? get().hot : id).catch(get().showError);
  },

  async exportCsv() {
    try {
      const path = await api.exportCsv(get().viewId);
      if (path) get().notify(`Exported to ${path}`);
    } catch (err) {
      get().showError(err);
    }
  },

  // ---- Search, filters ----

  setQuery(raw) {
    set({ query: raw });
    const query = raw.trim();
    clearTimeout(searchTimer);
    if (!query) return set({ results: null });
    searchTimer = setTimeout(async () => {
      try {
        const results = await api.searchItems(query, 300);
        if (get().query.trim() !== query) return;
        set({ results });
        if (get().tab !== 'overview') get().setTab('overview');
      } catch (err) {
        get().showError(err);
      }
    }, 180);
  },

  clearSearch() {
    clearTimeout(searchTimer);
    set({ query: '', results: null });
  },

  setFilter: (filter) => set({ filter }),
  toggleSort: () => set((s) => ({ sortByName: !s.sortByName })),
  setHot: (hot) => {
    if (get().hot !== hot) set({ hot });
  },
  setPinnedBar: (pinnedBar) => set({ pinnedBar }),

  // ---- Items ----

  openItem(item) {
    if (item.id == null) return;
    if (item.kind !== 'dir') return get().reveal(item.id);
    if (get().results) get().clearSearch();
    get().setTab('overview');
    get().navigate(item.id);
  },

  reveal(id) {
    api.reveal(id).catch(get().showError);
  },

  toggleCollect(item) {
    if (item.id == null) return;
    const collector = new Map(get().collector);
    if (collector.has(item.id)) collector.delete(item.id);
    else {
      const chain = get().folder?.ancestors ?? [];
      const location = item.location ?? (chain.slice(1).map((a) => a.name).join('/') || '.');
      collector.set(item.id, { id: item.id, name: item.name, size: item.size, kind: item.kind, location });
    }
    set({ collector });
  },

  collectMany(items) {
    const collector = new Map(get().collector);
    for (const item of items) {
      if (item.id == null) continue;
      collector.set(item.id, { id: item.id, name: item.name, size: item.size, kind: item.kind, location: item.location ?? '.' });
    }
    set({ collector });
  },

  setDragging: (dragging) => set({ dragging }),
  setDropActive: (dropActive) => {
    if (get().dropActive !== dropActive) set({ dropActive });
  },

  // ---- Trash ----

  async reviewTrash() {
    const s = get();
    if (!s.summary) return;
    try {
      const preview = await api.trashItems(s.summary.scanId, [...s.collector.keys()], true);
      set({ trash: { preview, busy: false, error: null } });
    } catch (err) {
      get().showError(err);
    }
  },

  async confirmTrash() {
    const { summary, collector, trash } = get();
    if (!summary || !trash) return;
    set({ trash: { ...trash, busy: true, error: null } });
    try {
      const result = await api.trashItems(summary.scanId, [...collector.keys()], false);
      const next = new Map(get().collector);
      for (const id of result.trashed) next.delete(id);
      set({ collector: next });
      get().refresh(true);
      if (result.failed.length) {
        set({ trash: { ...trash, busy: false, error: `Couldn't move ${result.failed.length} item(s): ${result.failed.join('; ')}` } });
        return;
      }
      set({ trash: null });
    } catch (err) {
      set({ trash: { ...trash, busy: false, error: String(err) } });
    }
  },

  closeTrash: () => set({ trash: null }),

  // ---- Feedback ----

  showTip: (text, x, y) => set({ tip: { text, x, y } }),
  moveTip: (x, y) => {
    const tip = get().tip;
    if (tip) set({ tip: { ...tip, x, y } });
  },
  hideTip: () => set({ tip: null }),

  showError(err) {
    get().notify(String((err as Error)?.message ?? err));
  },

  notify(message) {
    set({ toast: message });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 6000);
  },
}));

export const collectedTotal = (collector: Map<number, Collected>) => [...collector.values()].reduce((a, i) => a + i.size, 0);
